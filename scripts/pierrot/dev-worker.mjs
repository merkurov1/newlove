#!/usr/bin/env node
/**
 * Pierrot Dev Workbench worker.
 *
 * One Codespace, one sequential executor. The worker never talks to Supabase
 * directly and never receives the service-role key. It authenticates to the
 * internal worker API with PIERROT_DEV_WORKER_TOKEN and runs OpenCode in a
 * scrubbed child environment.
 *
 * Required env:
 *   PIERROT_DEV_WORKER_TOKEN   shared worker secret (>= 32 chars)
 *   PIERROT_DEV_API_URL        production admin API origin (or NEXT_PUBLIC_BASE_URL)
 *
 * Optional env:
 *   PIERROT_DEV_WORKER_ID      stable worker id (default codespace:<name>)
 *   PIERROT_DEV_REPO_DIR       primary newlove checkout (default: this repo)
 *   PIERROT_DEV_PIERROT_DIR    Pierrot checkout (auto-cloned when missing)
 *   PIERROT_DEV_WORK_ROOT      worktrees/outbox root
 *   PIERROT_DEV_TASK_TIMEOUT_MS
 *   PIERROT_DEV_IDLE_GRACE_SECONDS  idle grace before requesting a backend stop (default 120)
 *   PIERROT_DEV_IDLE_STOP_MINUTES   alternative idle grace in minutes (default 2, minimum 1)
 *   PIERROT_DEV_OPENCODE_MODEL / PIERROT_DEV_OPENCODE_AGENT
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { runProcess, terminateProcessGroup } from './dev-worker-process.mjs';
import {
  BOOT_PHASES,
  computeReadiness,
  isAllowedWorkerBranch,
  isVersionAtLeast,
  parseOpenCodeCost,
  parseStoredAuth,
  providerFromModel,
  resolveGitIdentity,
} from './dev-worker-lib.mjs';

const API_BASE = (
  process.env.PIERROT_DEV_API_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://127.0.0.1:3000'
).replace(/\/+$/, '');
const TOKEN = (process.env.PIERROT_DEV_WORKER_TOKEN || '').trim();
const CODESPACE_NAME = (process.env.CODESPACE_NAME || '').trim();
const WORKER_ID = (
  process.env.PIERROT_DEV_WORKER_ID ||
  (CODESPACE_NAME ? `codespace:${CODESPACE_NAME}` : `codespace:${os.hostname()}`)
).slice(0, 120);
const WORK_ROOT =
  process.env.PIERROT_DEV_WORK_ROOT || path.join(os.homedir(), '.pierrot-dev-work');
const REPO_DIR = process.env.PIERROT_DEV_REPO_DIR || process.cwd();
const PIERROT_REPO_DIR = process.env.PIERROT_DEV_PIERROT_DIR || '';
const POLL_MS = clamp(Number(process.env.PIERROT_DEV_POLL_MS || 20000), 15000, 30000);
const MAX_BACKOFF_MS = 120000;
const TASK_TIMEOUT_MS = Math.max(60000, Number(process.env.PIERROT_DEV_TASK_TIMEOUT_MS || 45 * 60 * 1000));
const MAX_LOG_BYTES = Math.max(100000, Number(process.env.PIERROT_DEV_MAX_LOG_BYTES || 2000000));
const IDLE_GRACE_SECONDS = (() => {
  // Automatic shutdown is mandatory. A stale `0` from the old documentation
  // must not leave the Codespace running forever; clamp to the same minimum as
  // the backend.
  const seconds = process.env.PIERROT_DEV_IDLE_GRACE_SECONDS;
  if (seconds !== undefined && seconds.trim() !== '') {
    const value = Number(seconds);
    if (Number.isFinite(value)) return Math.min(Math.max(Math.trunc(value), 30), 3600);
  }
  const raw = process.env.PIERROT_DEV_IDLE_STOP_MINUTES;
  if (raw === undefined || raw.trim() === '') return 120;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value * 60), 60), 3600) : 120;
})();
const MIN_OPENCODE_VERSION = (process.env.PIERROT_DEV_OPENCODE_MIN_VERSION || '2.1.4').trim();
const OPENCODE_MODEL =
  (process.env.PIERROT_DEV_OPENCODE_MODEL || 'deepseek/deepseek-flash').trim();
const OPENCODE_PROVIDER = (
  process.env.PIERROT_DEV_OPENCODE_PROVIDER ||
  providerFromModel(OPENCODE_MODEL) ||
  'deepseek'
).trim();
const OPENCODE_AGENT = (process.env.PIERROT_DEV_OPENCODE_AGENT || '').trim();
const LOG_DIR = path.join(WORK_ROOT, 'logs');
const OUTBOX_DIR = path.join(WORK_ROOT, 'outbox');
const PUSH_FAILURE_DIR = path.join(WORK_ROOT, 'push-failures');
const WORKTREE_ROOT = path.join(WORK_ROOT, 'work');
const RUN_LOG = path.join(LOG_DIR, 'worker.log');
const BOOT_LOG = path.join(LOG_DIR, 'worker-boot.log');
const WORKER_VERSION = '1.1.0';

let shuttingDown = false;
let activeAttempt = null;
let activeChildPid = null;
let idleSince = Date.now();
let consecutiveErrors = 0;
let serverIdleGraceSeconds = IDLE_GRACE_SECONDS;
let readiness = null;
let bootApiReachable = true;
const bootedPhases = new Set();

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function nowIso() {
  return new Date().toISOString();
}

const SECRET_ENV_NAMES = [
  'PIERROT_DEV_WORKER_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_CODESPACE_TOKEN',
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_KEY',
  'VERCEL_TOKEN',
  'CRON_SECRET',
];

function sanitize(value) {
  let text = typeof value === 'string' ? value : String(value ?? '');
  for (const name of SECRET_ENV_NAMES) {
    const secret = (process.env[name] || '').trim();
    if (secret.length >= 8) text = text.split(secret).join('[redacted]');
  }
  if (TOKEN && TOKEN.length >= 8) text = text.split(TOKEN).join('[redacted]');
  return text;
}

async function ensureDirs() {
  for (const dir of [WORK_ROOT, LOG_DIR, OUTBOX_DIR, PUSH_FAILURE_DIR, WORKTREE_ROOT]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function log(message, extra) {
  const line = `${nowIso()} ${sanitize(message)}${extra ? ` ${sanitize(JSON.stringify(extra))}` : ''}\n`;
  process.stdout.write(line);
  try {
    await fs.appendFile(RUN_LOG, line);
    const stat = await fs.stat(RUN_LOG);
    if (stat.size > 5_000_000) {
      await fs.rename(RUN_LOG, `${RUN_LOG}.1`).catch(() => {});
    }
  } catch {
    // Logging must never stop execution.
  }
}

/**
 * Report a boot phase locally first, then to the API when reachable. A local
 * boot log is always written, so a temporary API outage never hides the
 * reason a worker did not start.
 */
async function bootPhase(phase, message, options = {}) {
  const safePhase = BOOT_PHASES.includes(phase) ? phase : 'failed';
  const safeMessage = sanitize(message).slice(0, 800);
  const line = `${nowIso()} [boot:${safePhase}] ${safeMessage}\n`;
  process.stdout.write(line);
  try {
    await fs.appendFile(BOOT_LOG, line);
  } catch {}
  const dedupeKey = `${safePhase}:${safeMessage}`;
  if (!options.force && bootedPhases.has(dedupeKey)) return;
  bootedPhases.add(dedupeKey);
  if (!TOKEN || TOKEN.length < 32 || !/^https?:\/\//.test(API_BASE)) return;
  if (!bootApiReachable && !['connecting_api', 'registering', 'ready', 'failed'].includes(safePhase)) {
    return;
  }
  try {
    await api('boot', { phase: safePhase, message: safeMessage }, 8_000);
    bootApiReachable = true;
  } catch {
    // The local boot log above is the durable record while the API is down.
    bootApiReachable = false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

async function api(action, payload = {}, timeoutMs = 30000) {
  const response = await fetch(`${API_BASE}/api/internal/pierrot/dev/worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pierrot-worker-token': TOKEN,
      'User-Agent': `pierrot-dev-worker/${WORKER_VERSION}`,
    },
    body: JSON.stringify({ action, workerId: WORKER_ID, ...payload }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text.slice(0, 300) };
  }
  if (!response.ok) {
    const error = new Error(body.error || `Worker API returned ${response.status}`);
    error.status = response.status;
    error.code = body.code;
    error.body = body;
    throw error;
  }
  return body;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

function run(command, args, options = {}) {
  const { cwd, env, timeoutMs = 120000 } = options;
  return runProcess(command, args, {
    cwd,
    env,
    timeoutMs,
    maxCaptureBytes: MAX_LOG_BYTES,
  });
}

function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  const token = (process.env.GITHUB_TOKEN || '').trim();
  if (token) {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    // Token stays in the environment, never in argv or a git config file.
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
  }
  return env;
}

async function git(args, cwd, timeoutMs = 120000) {
  const result = await run('git', args, { cwd, env: gitEnv(), timeoutMs });
  return result;
}

/**
 * Working environment for OpenCode. Only non-secret values are forwarded:
 * the secret store stays in the parent process. Provider credentials are read
 * by OpenCode from its own login store under HOME.
 */
function opencodeEnv() {
  const allowed = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL'];
  const env = {};
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.CI = '1';
  env.NO_COLOR = '1';
  env.OPENCODE_DISABLE_AUTOUPDATE = '1';
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(permissionConfig());
  return env;
}

function permissionConfig() {
  return {
    $schema: 'https://opencode.ai/config.json',
    permissions: [
      { action: '*', resource: '*', effect: 'allow' },
      { action: 'read', resource: '*.env', effect: 'deny' },
      { action: 'read', resource: '*.env.*', effect: 'deny' },
      { action: 'read', resource: '*.env.example', effect: 'allow' },
      { action: 'read', resource: '*credentials*', effect: 'deny' },
      { action: 'read', resource: '*secret*', effect: 'deny' },
      { action: 'read', resource: '*id_rsa*', effect: 'deny' },
      { action: 'read', resource: '*.pem', effect: 'deny' },
      { action: 'edit', resource: '*.env*', effect: 'deny' },
      { action: 'external_directory', resource: '*', effect: 'deny' },
      { action: 'shell', resource: 'sudo *', effect: 'deny' },
      { action: 'shell', resource: 'git push*', effect: 'deny' },
      { action: 'shell', resource: 'git remote *', effect: 'deny' },
      { action: 'shell', resource: 'git checkout *', effect: 'deny' },
      { action: 'shell', resource: 'git switch *', effect: 'deny' },
      { action: 'shell', resource: 'git reset --hard*', effect: 'deny' },
      { action: 'shell', resource: 'git merge *', effect: 'deny' },
      { action: 'shell', resource: 'gh *', effect: 'deny' },
      { action: 'shell', resource: 'vercel *', effect: 'deny' },
      { action: 'shell', resource: 'supabase *', effect: 'deny' },
      { action: 'shell', resource: 'env', effect: 'deny' },
      { action: 'shell', resource: 'printenv*', effect: 'deny' },
      { action: 'shell', resource: 'cat*env*', effect: 'deny' },
      { action: 'shell', resource: 'rm -rf /*', effect: 'deny' },
      { action: 'shell', resource: 'curl *', effect: 'deny' },
      { action: 'shell', resource: 'wget *', effect: 'deny' },
      { action: 'shell', resource: 'npm publish*', effect: 'deny' },
      { action: 'shell', resource: 'pnpm publish*', effect: 'deny' },
      { action: 'shell', resource: 'pnpm deploy*', effect: 'deny' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

function applyReadiness(capabilities, context) {
  const next = computeReadiness({
    configOk: context.configOk !== false,
    apiOk: context.apiOk === true,
    supabaseOk: context.supabaseOk === true,
    opencodeAvailable: capabilities.opencodeAvailable === true,
    opencodeVersion: capabilities.opencodeVersion,
    minimumVersion: MIN_OPENCODE_VERSION,
    authenticated: capabilities.opencodeAuthenticated === true,
    provider: OPENCODE_PROVIDER,
  });
  readiness = next;
  capabilities.ready = next.ready;
  capabilities.readiness = next;
  capabilities.configOk = next.configOk;
  return capabilities;
}

async function readCapabilities(context = {}) {
  const capabilities = {
    opencodeAvailable: false,
    opencodeVersion: null,
    opencodeAuthenticated: false,
    opencodeModel: OPENCODE_MODEL || null,
    opencodeProvider: OPENCODE_PROVIDER,
    minimumOpencodeVersion: MIN_OPENCODE_VERSION,
    nodeVersion: process.version,
    lastCheckedAt: nowIso(),
    hostname: os.hostname(),
  };
  await bootPhase('checking_opencode', `Checking OpenCode CLI (minimum ${MIN_OPENCODE_VERSION}).`);
  try {
    const version = await run('opencode', ['--version'], {
      env: opencodeEnv(),
      timeoutMs: 20000,
    });
    if (version.code === 0) {
      capabilities.opencodeAvailable = true;
      capabilities.opencodeVersion = sanitize(version.stdout.trim()).slice(0, 80);
    }
  } catch {}
  if (!capabilities.opencodeAvailable) {
    await bootPhase('failed', 'OPENCODE_CLI_MISSING: OpenCode CLI is not available on PATH.', {
      force: true,
    });
  }
  await bootPhase('checking_auth', `Checking stored ${OPENCODE_PROVIDER} authentication.`);
  try {
    const auth = await run('opencode', ['auth', 'list'], {
      env: opencodeEnv(),
      timeoutMs: 20000,
    });
    if (auth.code === 0) {
      const stored = parseStoredAuth(auth.stdout, OPENCODE_PROVIDER);
      capabilities.opencodeAuthenticated = stored.authenticated;
      capabilities.authProviders = stored.providers.slice(0, 12);
    }
  } catch {}
  capabilities.versionOk = Boolean(
    capabilities.opencodeAvailable &&
      isVersionAtLeast(capabilities.opencodeVersion, MIN_OPENCODE_VERSION)
  );
  applyReadiness(capabilities, context);
  if (capabilities.opencodeAvailable && !capabilities.versionOk) {
    await bootPhase(
      'failed',
      `OPENCODE_VERSION_UNSUPPORTED: ${capabilities.opencodeVersion || 'unknown'} is older than ${MIN_OPENCODE_VERSION}.`,
      { force: true }
    );
  } else if (!capabilities.opencodeAuthenticated) {
    await bootPhase(
      'failed',
      `OPENCODE_AUTH_MISSING: No stored ${OPENCODE_PROVIDER} authentication was found.`,
      { force: true }
    );
  }
  return capabilities;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

function repoDirFor(repository) {
  if (repository === 'pierrot') {
    if (PIERROT_REPO_DIR) return PIERROT_REPO_DIR;
    return path.join(WORK_ROOT, 'repos', 'Pierrot');
  }
  return REPO_DIR;
}

async function ensureRepoCheckout(repository) {
  const dir = repoDirFor(repository);
  if (repository === 'pierrot' && !PIERROT_REPO_DIR) {
    const exists = await fs
      .access(path.join(dir, '.git'))
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await fs.mkdir(path.dirname(dir), { recursive: true });
      const clone = await git(
        ['clone', '--depth', '1', 'https://github.com/merkurov1/Pierrot.git', dir],
        path.dirname(dir),
        600000
      );
      if (clone.code !== 0) {
        throw new Error(`Unable to clone the Pierrot repository: ${clone.stderr.slice(-400)}`);
      }
    }
  }
  return dir;
}

async function prepareWorktree({ task, attempt }) {
  const repository = String(task.repository || 'newlove').toLowerCase().includes('pierrot')
    ? 'pierrot'
    : 'newlove';
  const repoDir = await ensureRepoCheckout(repository);
  const baseRef = attempt.baseRef || 'main';
  const branch = attempt.branch;

  const fetch = await git(['fetch', '--prune', 'origin'], repoDir, 300000);
  if (fetch.code !== 0) {
    throw new Error(`git fetch failed: ${fetch.stderr.slice(-500)}`);
  }

  const worktree = path.join(WORKTREE_ROOT, task.id, String(attempt.attemptNumber));
  await fs.rm(worktree, { recursive: true, force: true });
  await git(['worktree', 'prune'], repoDir, 60000);

  const pinned =
    typeof attempt.baseCommit === 'string' && /^[0-9a-f]{40}$/i.test(attempt.baseCommit)
      ? attempt.baseCommit
      : null;
  const startPoint = pinned || `origin/${baseRef}`;

  const add = await git(
    ['worktree', 'add', '-B', branch, worktree, startPoint],
    repoDir,
    120000
  );
  if (add.code !== 0) {
    throw new Error(`Unable to create the working branch: ${add.stderr.slice(-500)}`);
  }

  const head = await git(['rev-parse', 'HEAD'], worktree, 30000);
  return {
    repository,
    repoDir,
    worktree,
    branch,
    baseRef,
    baseCommit: head.code === 0 ? head.stdout.trim() : null,
  };
}

async function cleanupWorktree(repoDir, worktree) {
  try {
    await git(['worktree', 'remove', '--force', worktree], repoDir, 60000);
  } catch {}
}

const SENSITIVE_PATTERN =
  /(^|\/)(\.env(\.|$)|.*\.pem$|id_rsa|id_ed25519|credentials|secrets?\/)/i;

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function extractSessionId(output) {
  for (const line of output.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const event = JSON.parse(line);
      const candidate =
        event.sessionID || event.session_id || event.session?.id || event.sessionId;
      if (typeof candidate === 'string' && candidate.length >= 8) return candidate.slice(0, 200);
    } catch {}
  }
  return null;
}

function decodeEscapes(value) {
  let text = value;
  if (!text.includes('\n') && text.includes('\\n')) {
    text = text.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return text;
}

function extractExecutorReport(output) {
  const decoded = decodeEscapes(output);
  const candidates = [];
  const direct = [...output.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (direct.length > 0) candidates.push(direct[direct.length - 1][1]);
  const expanded = [...decoded.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (expanded.length > 0) candidates.push(expanded[expanded.length - 1][1]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate; malformed blocks are not trusted.
    }
  }
  return null;
}

async function runOpenCode({ worktree, prompt, attemptId, title }) {
  const args = ['run', '--standalone', '--format', 'json', '--title', title.slice(0, 180)];
  if (OPENCODE_MODEL) args.push('--model', OPENCODE_MODEL);
  if (OPENCODE_AGENT) args.push('--agent', OPENCODE_AGENT);
  args.push(prompt);

  await log('OpenCode started', { attemptId, model: OPENCODE_MODEL || null });

  const result = await runProcess('opencode', args, {
    cwd: worktree,
    env: opencodeEnv(),
    timeoutMs: TASK_TIMEOUT_MS,
    maxCaptureBytes: MAX_LOG_BYTES,
    heartbeatMs: 25000,
    onSpawn: (child) => {
      activeChildPid = child.pid ?? null;
    },
    onHeartbeat: async ({ stdout }) => {
      if (shuttingDown) return true;
      try {
        const response = await api(
          'progress',
          {
            attemptId,
            stage: 'opencode_running',
            logExcerpt: sanitize(stdout.slice(-20000)),
          },
          20000
        );
        return response.cancelled === true;
      } catch {
        // Network failures during execution are tolerated; the lease is long.
        return false;
      }
    },
  });

  activeChildPid = null;
  await log('OpenCode finished', {
    attemptId,
    code: result.code,
    signal: result.signal,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    truncated: result.truncated,
  });

  return result;
}

async function collectChangedFiles(worktree) {
  const status = await git(['status', '--porcelain'], worktree, 30000);
  const files = status.stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((file) => file.split(' -> ').pop())
    .filter(Boolean);
  return [...new Set(files)].slice(0, 200);
}

async function writePushFailure(attemptId, record) {
  const file = path.join(PUSH_FAILURE_DIR, `${attemptId}.json`);
  try {
    await fs.writeFile(
      file,
      JSON.stringify({ attemptId, createdAt: nowIso(), ...record }, null, 2),
      'utf8'
    );
  } catch {}
  return file;
}

async function commitIdentity(worktree) {
  const configuredName = await git(['config', 'user.name'], worktree, 15_000);
  const configuredEmail = await git(['config', 'user.email'], worktree, 15_000);
  return resolveGitIdentity({
    configuredName: configuredName.code === 0 ? configuredName.stdout : '',
    configuredEmail: configuredEmail.code === 0 ? configuredEmail.stdout : '',
    envName: process.env.PIERROT_DEV_GIT_NAME,
    envEmail: process.env.PIERROT_DEV_GIT_EMAIL,
  });
}

async function commitAndPush({ worktree, branch, taskId, attemptId, attemptNumber }) {
  if (!isAllowedWorkerBranch(branch)) {
    const error = new Error(
      `Refusing to push to ${branch || 'an unknown branch'}: only pierrot/dev/<task>/<attempt> is allowed.`
    );
    error.code = 'WORKER_BRANCH_FORBIDDEN';
    await writePushFailure(attemptId, {
      taskId,
      branch,
      commitSha: null,
      reason: error.message,
    });
    throw error;
  }

  const add = await git(['add', '-A'], worktree, 60000);
  if (add.code !== 0) throw new Error('git add failed.');
  const staged = await git(['diff', '--cached', '--name-only'], worktree, 30000);
  const files = staged.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  if (files.length === 0) return { commitSha: null, files: [] };

  // Use the Codespace's verified GitHub identity. Never invent an author.
  // Signing is disabled only for this worker commit (the repository does not
  // require signed commits). If signing becomes mandatory, set
  // PIERROT_DEV_GIT_SIGN_COMMITS=true and use the configured gh-gpgsign identity.
  const identity = await commitIdentity(worktree);
  const sign = process.env.PIERROT_DEV_GIT_SIGN_COMMITS === 'true' ? 'true' : 'false';
  const commit = await git(
    [
      '-c',
      `user.name=${identity.name}`,
      '-c',
      `user.email=${identity.email}`,
      '-c',
      `commit.gpgsign=${sign}`,
      'commit',
      '-m',
      `pierrot(dev): task ${taskId} attempt ${attemptNumber}`,
    ],
    worktree,
    60000
  );
  if (commit.code !== 0) {
    const message = `git commit failed: ${commit.stderr.slice(-400)}`;
    const error = new Error(message);
    error.code = /gpg|author is invalid/i.test(commit.stderr)
      ? 'COMMIT_SIGNING_FAILED'
      : 'COMMIT_FAILED';
    await writePushFailure(attemptId, {
      taskId,
      branch,
      commitSha: null,
      reason: message,
      identity: { name: identity.name, email: identity.email },
      signing: sign === 'true',
    });
    throw error;
  }
  const sha = await git(['rev-parse', 'HEAD'], worktree, 30000);
  if (sha.code !== 0) throw new Error('Unable to read the commit SHA.');
  const commitSha = sha.stdout.trim();

  const push = await git(['push', 'origin', `HEAD:refs/heads/${branch}`], worktree, 300000);
  if (push.code !== 0) {
    const error = new Error(`git push failed: ${push.stderr.slice(-500)}`);
    error.code = /rejected|non-fast-forward/i.test(push.stderr)
      ? 'BRANCH_CONFLICT'
      : 'PUSH_FAILED';
    error.commitSha = commitSha;
    await writePushFailure(attemptId, {
      taskId,
      branch,
      commitSha,
      reason: error.message,
      identity: { name: identity.name, email: identity.email },
      signing: sign === 'true',
    });
    throw error;
  }

  return { commitSha, files };
}

async function failWithLog(attemptId, payload) {
  await log(`Attempt failed: ${payload.errorCode || 'EXECUTION_FAILED'}`, {
    attemptId,
    exitCode: payload.exitCode ?? null,
    timedOut: Boolean(payload.timedOut),
  });
  try {
    await api('fail', payload);
  } catch (error) {
    if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
      await log('Failure result rejected by the API', {
        attemptId,
        status: error.status,
        code: error.code || null,
      });
      return;
    }
    const file = path.join(OUTBOX_DIR, `fail-${attemptId}.json`);
    try {
      await fs.writeFile(
        file,
        JSON.stringify({ kind: 'fail', attemptId, payload, createdAt: nowIso() }, null, 2),
        'utf8'
      );
      await log('Failure result kept in outbox for later delivery', { attemptId, file });
    } catch {}
  }
}

async function executeClaim(claim) {
  const { task, attempt, prompt } = claim;
  activeAttempt = attempt;
  idleSince = null;
  await log(`Claimed task ${task.id} attempt ${attempt.attemptNumber}`, {
    branch: attempt.branch,
  });

  let workspace = null;
  let modelStarted = false;
  let runResult = null;
  let usage = null;
  let commitSha = null;
  let attemptFailed = false;

  const failClaim = async (payload) => {
    attemptFailed = true;
    await failWithLog(attempt.id, {
      attemptId: attempt.id,
      usage,
      runtimeMs: runResult?.durationMs ?? null,
      modelStarted,
      headSha: payload.headSha ?? commitSha ?? null,
      ...payload,
    });
  };

  try {
    await api('start', { attemptId: attempt.id });
    const prepared = await prepareWorktree({ task, attempt });
    workspace = prepared;
    await api('progress', {
      attemptId: attempt.id,
      stage: 'workspace_ready',
      message: `Prepared ${prepared.repository} worktree at ${prepared.branch}.`,
      dedupeKey: `workspace:${attempt.id}`,
    });

    modelStarted = true;
    runResult = await runOpenCode({
      worktree: prepared.worktree,
      prompt,
      attemptId: attempt.id,
      title: `Pierrot dev: ${task.title}`,
    });
    const output = `${runResult.stdout}\n${runResult.stderr}`;
    const sessionId = extractSessionId(runResult.stdout);
    const report = extractExecutorReport(output);
    usage = parseOpenCodeCost(runResult.stdout);
    const changedFiles = await collectChangedFiles(prepared.worktree);
    const logExcerpt = sanitize(output.slice(-60000));

    await log('OpenCode result', {
      attemptId: attempt.id,
      exitCode: runResult.code,
      signal: runResult.signal,
      changedFiles: changedFiles.length,
      report: Boolean(report),
      modelCostUsd: usage.costUsd,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      steps: usage.steps,
    });

    if (runResult.cancelled) {
      await failClaim({
        attemptId: attempt.id,
        errorCode: 'CANCELLED_BY_OWNER',
        errorMessage: 'Cancelled during execution.',
        exitCode: runResult.code,
        logExcerpt,
      });
      return;
    }

    if (runResult.timedOut) {
      await failClaim({
        attemptId: attempt.id,
        errorCode: 'EXECUTION_TIMEOUT',
        errorMessage: `OpenCode exceeded the ${Math.round(TASK_TIMEOUT_MS / 60000)} minute limit.`,
        timedOut: true,
        exitCode: runResult.code,
        logExcerpt,
        changedFiles,
      });
      return;
    }

    if (changedFiles.length > 120) {
      await failClaim({
        attemptId: attempt.id,
        errorCode: 'TOO_MANY_FILES',
        errorMessage: `The executor changed ${changedFiles.length} files, above the 120 file limit.`,
        exitCode: runResult.code,
        logExcerpt,
        changedFiles,
      });
      return;
    }

    const sensitive = changedFiles.find((file) => SENSITIVE_PATTERN.test(file));
    if (sensitive) {
      await failClaim({
        attemptId: attempt.id,
        errorCode: 'SECURITY_SENSITIVE_FILE',
        errorMessage: `The executor modified a secret-like file: ${sensitive}. Changes were not pushed.`,
        exitCode: runResult.code,
        logExcerpt,
        changedFiles,
      });
      return;
    }

    if (runResult.code !== 0) {
      const interrupted =
        runResult.signal === 'SIGINT' ||
        runResult.signal === 'SIGTERM' ||
        runResult.code === 130 ||
        runResult.code === 143;
      await failClaim({
        attemptId: attempt.id,
        errorCode: interrupted ? 'OPENCODE_INTERRUPTED' : 'OPENCODE_FAILED',
        errorMessage: interrupted
          ? 'OpenCode was interrupted before completing the task.'
          : `OpenCode exited with code ${runResult.code}.`,
        exitCode: runResult.code,
        logExcerpt,
        changedFiles,
      });
      return;
    }

    if (!report && changedFiles.length === 0) {
      await failClaim({
        attemptId: attempt.id,
        errorCode: 'OPENCODE_REPORT_MISSING',
        errorMessage: 'OpenCode exited without a final report and without changing any files.',
        exitCode: runResult.code,
        logExcerpt,
        changedFiles,
      });
      return;
    }

    // Executor diagnostics are persisted before the runner commits.
    if (sessionId) {
      await api('event', {
        attemptId: attempt.id,
        type: 'worker.opencode_session',
        message: `OpenCode session ${sessionId}.`,
        payload: { sessionId },
        dedupeKey: `session:${attempt.id}`,
      }).catch(() => {});
    }

    let pushedFiles = [];
    if (changedFiles.length > 0) {
      try {
        const pushed = await commitAndPush({
          worktree: prepared.worktree,
          branch: prepared.branch,
          taskId: task.id,
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
        });
        commitSha = pushed.commitSha;
        pushedFiles = pushed.files;
      } catch (error) {
        await failClaim({
          attemptId: attempt.id,
          errorCode: error.code || 'COMMIT_FAILED',
          errorMessage: error.message,
          exitCode: runResult.code,
          headSha: error.commitSha || null,
          logExcerpt,
          changedFiles,
        });
        return;
      }
    }

    const parsedReport = report || {};
    const warnings = Array.isArray(parsedReport.warnings)
      ? parsedReport.warnings.slice(0, 40)
      : [];
    if (!report) {
      warnings.push('OpenCode finished without a structured final report.');
    }
    if (runResult.truncated) {
      warnings.push('OpenCode output exceeded the capture limit; only the tail was kept.');
    }

    const payload = {
      exitCode: runResult.code,
      opencodeSessionId: sessionId,
      headSha: commitSha,
      changedFiles: pushedFiles.length > 0 ? pushedFiles : changedFiles,
      commands: Array.isArray(parsedReport.commands) ? parsedReport.commands.slice(0, 30) : [],
      summary:
        typeof parsedReport.summary === 'string'
          ? parsedReport.summary
          : `OpenCode finished in ${Math.round(runResult.durationMs / 1000)}s.`,
      warnings,
      criteria: Array.isArray(parsedReport.acceptanceCriteria)
        ? parsedReport.acceptanceCriteria.slice(0, 40)
        : [],
      logExcerpt: runResult.truncated ? `${logExcerpt}\n[log truncated]` : logExcerpt,
      verification: {
        durationMs: runResult.durationMs,
        runner: 'pierrot-dev-worker',
        workerVersion: WORKER_VERSION,
        selfReported: true,
        unverified: Array.isArray(parsedReport.unverified) ? parsedReport.unverified.slice(0, 40) : [],
      },
      // Model usage is actual only when OpenCode reported step_finish events.
      // The server normalizes it and adds the measured Codespaces runtime cost.
      usage,
      runtimeMs: runResult.durationMs,
    };

    // Durable outbox: if the network drops after the work is done, retry the
    // exact same completion later instead of losing the result.
    await submitCompletion(attempt.id, payload);
  } catch (error) {
    // Workspace, git or transport failure: never leave the attempt hanging.
    // A failure that was already recorded above is not sent twice (the server
    // also treats terminal attempts idempotently).
    if (!attemptFailed) {
      await failClaim({
        attemptId: attempt.id,
        errorCode: error.code || 'EXECUTION_SETUP_FAILED',
        errorMessage: String(error.message || error).slice(0, 2000),
        headSha: error.commitSha || commitSha || null,
        logExcerpt: sanitize(String(error.stack || error)).slice(0, 60000),
      }).catch(() => {});
    }
    throw error;
  } finally {
    activeAttempt = null;
    if (workspace) {
      await cleanupWorktree(workspace.repoDir, workspace.worktree);
    }
  }
}

async function submitCompletion(attemptId, payload) {
  const file = path.join(OUTBOX_DIR, `${attemptId}.json`);
  await fs.writeFile(
    file,
    JSON.stringify({ kind: 'complete', attemptId, payload, createdAt: nowIso() }, null, 2),
    'utf8'
  );

  let delay = 5000;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await api('complete', { attemptId, result: payload }, 60000);
      await fs.unlink(file).catch(() => {});
      await log(`Result submitted for ${attemptId}`);
      return;
    } catch (error) {
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        await fs.unlink(file).catch(() => {});
        await log(`Result rejected for ${attemptId}`, { code: error.code });
        return;
      }
      await log(`Completion retry ${attempt}/6 failed`, { status: error.status || null });
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
    }
  }
  await log(`Result kept in outbox for later delivery: ${file}`);
}

async function flushOutbox() {
  let entries = [];
  try {
    entries = await fs.readdir(OUTBOX_DIR);
  } catch {
    return;
  }
  for (const entry of entries.filter((name) => name.endsWith('.json'))) {
    const file = path.join(OUTBOX_DIR, entry);
    try {
      const record = JSON.parse(await fs.readFile(file, 'utf8'));
      if (record.kind === 'fail') {
        await api('fail', { attemptId: record.attemptId, ...(record.payload || {}) }, 60000);
      } else {
        await api('complete', { attemptId: record.attemptId, result: record.payload }, 60000);
      }
      await fs.unlink(file).catch(() => {});
      await log(`Outbox delivered for ${record.attemptId}`, { kind: record.kind || 'complete' });
    } catch (error) {
      if (error.status && error.status >= 400 && error.status < 500) {
        await fs.unlink(file).catch(() => {});
        await log('Outbox entry rejected and removed', {
          file,
          status: error.status,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * The Codespace GITHUB_TOKEN only carries `codespaces=read` in this
 * environment. The worker therefore never calls the GitHub stop API itself.
 * It reports its idle time to the control plane, which owns the write-capable
 * token, rechecks the queue under a lock and performs the stop.
 */
async function maybeRequestIdleShutdown() {
  if (!IDLE_GRACE_SECONDS || !idleSince) return;
  const grace = serverIdleGraceSeconds || IDLE_GRACE_SECONDS;
  const idleForMs = Date.now() - idleSince;
  if (idleForMs < grace * 1000) return;

  let response;
  try {
    response = await api(
      'idle',
      {
        idleForMs,
        graceSeconds: grace,
        codespaceName: CODESPACE_NAME || undefined,
      },
      30000
    );
  } catch (error) {
    await log('Idle shutdown request failed', {
      status: error.status || null,
      message: String(error.message || error).slice(0, 200),
      retryAfterMs: 120000,
    });
    idleSince = Date.now() - Math.max(0, grace * 1000 - 60000);
    return;
  }

  if (response.action === 'stopping') {
    await log('Idle shutdown accepted by the backend; waiting for Codespace stop.', {
      idleForMs,
      grace,
    });
    // If the container does not receive SIGTERM, retry the safe request after
    // five minutes instead of silently keeping the Codespace alive forever.
    idleSince = Date.now() - Math.max(0, grace * 1000 - 300000);
    return;
  }
  if (response.action === 'stay') {
    await log('Idle shutdown stayed: workspace became busy.', { reason: response.reason });
    idleSince = Date.now();
    return;
  }
  if (response.action === 'disabled') {
    idleSince = null;
    return;
  }
  await log('Idle shutdown deferred by the backend.', {
    action: response.action,
    reason: response.reason,
    retryAfterMs: response.retryAfterMs || null,
  });
  const retryMs = Number(response.retryAfterMs) > 0 ? Number(response.retryAfterMs) : 120000;
  idleSince = Date.now() - Math.max(0, grace * 1000 - retryMs);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  await log(`Received ${signal}; shutting down.`);
  await bootPhase('stopping', `Worker received ${signal}; releasing any active attempt.`);
  if (activeChildPid) {
    await log('Stopping the active executor process group.', { pid: activeChildPid });
    await terminateProcessGroup(activeChildPid, 5000);
  }
  if (activeAttempt) {
    try {
      await api('release', {
        attemptId: activeAttempt.id,
        reason: `Worker stopped by ${signal}; the task will be requeued.`,
      });
    } catch {}
  }
  process.exit(0);
}

async function main() {
  await ensureDirs();
  await bootPhase('starting', `Pierrot worker ${WORKER_ID} starting.`);

  await bootPhase('checking_config', 'Checking required worker configuration.');
  if (!TOKEN || TOKEN.length < 32) {
    await bootPhase(
      'failed',
      'WORKER_CONFIG_INVALID: PIERROT_DEV_WORKER_TOKEN is missing or shorter than 32 characters. Worker will not start.',
      { force: true }
    );
    await log(
      'PIERROT_DEV_WORKER_TOKEN is missing or shorter than 32 characters. Worker will not start.'
    );
    process.exit(2);
  }
  if (!/^https?:\/\//.test(API_BASE)) {
    await bootPhase(
      'failed',
      'WORKER_CONFIG_INVALID: PIERROT_DEV_API_URL is not a valid http(s) URL. Worker will not start.',
      { force: true }
    );
    await log('PIERROT_DEV_API_URL is not a valid http(s) URL. Worker will not start.');
    process.exit(2);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (error) => {
    void log('Unhandled rejection', {
      message: String(error?.message || error).slice(0, 400),
    });
  });
  process.on('uncaughtException', (error) => {
    void log('Uncaught exception; exiting for supervisor restart', {
      message: String(error?.message || error).slice(0, 400),
    }).finally(() => process.exit(1));
  });

  await log(`Starting Pierrot worker ${WORKER_ID}`, {
    api: API_BASE,
    version: WORKER_VERSION,
    pollMs: POLL_MS,
    idleGraceSeconds: IDLE_GRACE_SECONDS,
    minimumOpencodeVersion: MIN_OPENCODE_VERSION,
    provider: OPENCODE_PROVIDER,
  });

  let capabilities = await readCapabilities({ configOk: true, apiOk: false, supabaseOk: false });
  let registered = false;
  let lastCapabilitiesAt = Date.now();

  while (!shuttingDown) {
    try {
      if (!registered) {
        await bootPhase('connecting_api', `Connecting to the worker API at ${API_BASE}.`);
        // Prove the API and its Supabase path before registration so the
        // stored capabilities do not claim apiOk=false/supabaseOk=false while
        // the worker is in fact able to reach both.
        let apiProven = false;
        try {
          await api('health', {}, 15000);
          apiProven = true;
          capabilities = applyReadiness(capabilities, {
            configOk: true,
            apiOk: true,
            supabaseOk: true,
          });
        } catch (error) {
          await log('API preflight failed', {
            status: error.status || null,
            message: String(error.message || error).slice(0, 200),
          });
        }
        await bootPhase('registering', 'Registering the worker with the Pierrot API.');
        await api('register', {
          name: CODESPACE_NAME || os.hostname(),
          version: WORKER_VERSION,
          hostname: os.hostname(),
          codespaceName: CODESPACE_NAME || undefined,
          repository: 'merkurov1/newlove',
          capabilities,
        });
        registered = true;
        consecutiveErrors = 0;
        // A successful register proves both the Pierrot API and its Supabase
        // client are reachable. This is the only "Supabase check" the worker
        // can perform without ever receiving the service-role key.
        capabilities = applyReadiness(capabilities, {
          configOk: true,
          apiOk: true,
          supabaseOk: true,
        });
        await log('Registered', {
          opencode: capabilities.opencodeVersion,
          ready: capabilities.ready,
          apiProven,
          reasons: capabilities.readiness?.reasons || [],
        });
        if (capabilities.ready) {
          await bootPhase(
            'ready',
            `Worker ${WORKER_ID} ready (OpenCode ${capabilities.opencodeVersion || 'unknown'}).`,
            { force: true }
          );
        } else {
          const reasons = Array.isArray(capabilities.readiness?.reasons)
            ? capabilities.readiness.reasons.join(' · ')
            : 'Readiness check failed.';
          await bootPhase('failed', `WORKER_NOT_READY: ${reasons}`, { force: true });
        }
        try {
          const recovered = await api('recover', {}, 30000);
          if (recovered.released) {
            await log(`Recovered ${recovered.released} unfinished attempt(s) from a previous run.`);
          }
        } catch (error) {
          await log('Recovery check failed', { status: error.status || null });
        }
      }

      const capabilityIntervalMs = readiness?.ready ? 10 * 60 * 1000 : 60 * 1000;
      if (Date.now() - lastCapabilitiesAt > capabilityIntervalMs) {
        const wasReady = readiness?.ready === true;
        capabilities = await readCapabilities({
          configOk: true,
          apiOk: readiness?.apiOk === true,
          supabaseOk: readiness?.supabaseOk === true,
        });
        lastCapabilitiesAt = Date.now();
        if (!wasReady && capabilities.ready) {
          await bootPhase(
            'ready',
            `Worker ${WORKER_ID} ready (OpenCode ${capabilities.opencodeVersion || 'unknown'}).`,
            { force: true }
          );
        } else if (wasReady && !capabilities.ready) {
          const reasons = Array.isArray(capabilities.readiness?.reasons)
            ? capabilities.readiness.reasons.join(' · ')
            : 'Readiness check failed.';
          await bootPhase('failed', `WORKER_NOT_READY: ${reasons}`, { force: true });
        }
      }

      await flushOutbox();
      const ready = readiness?.ready === true;
      const reasons = Array.isArray(readiness?.reasons) ? readiness.reasons : [];
      const beat = await api('heartbeat', {
        status: activeAttempt ? 'busy' : ready ? 'idle' : 'error',
        capabilities,
        idleSince: idleSince ? new Date(idleSince).toISOString() : undefined,
        lastError: activeAttempt
          ? consecutiveErrors > 0
            ? 'Worker had transient API errors during execution.'
            : null
          : ready
            ? null
            : reasons.join(' · ').slice(0, 1000) || 'Worker is not ready.',
      });

      if (Number.isFinite(beat.idleGraceSeconds) && Number(beat.idleGraceSeconds) >= 0) {
        serverIdleGraceSeconds = Math.trunc(Number(beat.idleGraceSeconds));
      }

      if (beat.stopRequested) {
        if (!activeAttempt) {
          await log('Owner requested a worker stop; exiting.');
          process.exit(0);
        }
      }

      if (!ready) {
        // Never claim work with a broken executor. Keep reporting the reason
        // through heartbeat so Admin can distinguish OpenCode, auth and API
        // failures without exposing secrets.
        await log('Worker not ready; not claiming tasks.', { reasons });
        await sleep(Math.min(60000, Math.max(15000, POLL_MS)));
        continue;
      }

      if (activeAttempt) {
        await sleep(POLL_MS);
        continue;
      }

      const claimed = await api('claim', {}, 40000);
      consecutiveErrors = 0;
      if (claimed.claim) {
        idleSince = Date.now();
        await executeClaim(claimed.claim);
        idleSince = Date.now();
        continue;
      }

      idleSince = idleSince || Date.now();
      await maybeRequestIdleShutdown();
      await sleep(POLL_MS);
    } catch (error) {
      consecutiveErrors += 1;
      const backoff = Math.min(POLL_MS * 2 ** Math.min(consecutiveErrors, 4), MAX_BACKOFF_MS);
      await log('Loop error', {
        status: error.status || null,
        code: error.code || null,
        message: String(error.message || error).slice(0, 300),
        backoff,
      });
      if (!registered) {
        const code =
          error.status === 401 || error.status === 403
            ? 'WORKER_API_UNAUTHORIZED'
            : 'WORKER_API_UNREACHABLE';
        await bootPhase(
          'failed',
          `${code}: ${String(error.message || error).slice(0, 300)}`,
          { force: true }
        );
      }
      await sleep(backoff);
    }
  }
}

main().catch(async (error) => {
  await bootPhase('failed', `WORKER_FATAL: ${String(error?.message || error).slice(0, 500)}`, {
    force: true,
  });
  await log('Fatal worker error', { message: String(error.message || error).slice(0, 500) });
  process.exit(1);
});
