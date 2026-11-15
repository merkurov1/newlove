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
 *   PIERROT_DEV_IDLE_STOP_MINUTES  stop the Codespace after N idle minutes (0 = off)
 *   PIERROT_DEV_OPENCODE_MODEL / PIERROT_DEV_OPENCODE_AGENT
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

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
const IDLE_STOP_MINUTES = Math.max(0, Number(process.env.PIERROT_DEV_IDLE_STOP_MINUTES || 0));
const OPENCODE_MODEL =
  (process.env.PIERROT_DEV_OPENCODE_MODEL || 'deepseek/deepseek-flash').trim();
const OPENCODE_AGENT = (process.env.PIERROT_DEV_OPENCODE_AGENT || '').trim();
const LOG_DIR = path.join(WORK_ROOT, 'logs');
const OUTBOX_DIR = path.join(WORK_ROOT, 'outbox');
const WORKTREE_ROOT = path.join(WORK_ROOT, 'work');
const RUN_LOG = path.join(LOG_DIR, 'worker.log');
const WORKER_VERSION = '1.0.0';

let shuttingDown = false;
let activeAttempt = null;
let activeChildPid = null;
let idleSince = Date.now();
let consecutiveErrors = 0;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitize(value) {
  let text = typeof value === 'string' ? value : String(value ?? '');
  if (TOKEN && TOKEN.length >= 8) text = text.split(TOKEN).join('[redacted]');
  const github = (process.env.GITHUB_TOKEN || '').trim();
  if (github && github.length >= 8) text = text.split(github).join('[redacted]');
  return text;
}

async function ensureDirs() {
  for (const dir of [WORK_ROOT, LOG_DIR, OUTBOX_DIR, WORKTREE_ROOT]) {
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
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-MAX_LOG_BYTES);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-MAX_LOG_BYTES);
    });
    child.on('error', (error) => {
      finished = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr });
    });
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

async function readCapabilities() {
  const capabilities = {
    opencodeAvailable: false,
    opencodeVersion: null,
    opencodeAuthenticated: false,
    opencodeModel: OPENCODE_MODEL || null,
    nodeVersion: process.version,
    lastCheckedAt: nowIso(),
    hostname: os.hostname(),
  };
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
  try {
    const auth = await run('opencode', ['auth', 'list'], {
      env: opencodeEnv(),
      timeoutMs: 20000,
    });
    capabilities.opencodeAuthenticated =
      auth.code === 0 && /stored/i.test(auth.stdout);
  } catch {}
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

  const child = spawn('opencode', args, {
    cwd: worktree,
    env: opencodeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  activeChildPid = child.pid;

  let stdout = '';
  let stderr = '';
  let truncated = false;
  const startedAt = Date.now();
  let timedOut = false;
  let cancelled = false;

  const capture = (chunk, target) => {
    if (target === 'out') {
      if (stdout.length < MAX_LOG_BYTES) stdout += chunk.toString();
      else truncated = true;
    } else if (stderr.length < MAX_LOG_BYTES) stderr += chunk.toString();
    else truncated = true;
  };
  child.stdout.on('data', (chunk) => capture(chunk, 'out'));
  child.stderr.on('data', (chunk) => capture(chunk, 'err'));

  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 10000);
    } catch {}
  }, TASK_TIMEOUT_MS);

  const heartbeat = setInterval(async () => {
    if (shuttingDown) {
      cancelled = true;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      return;
    }
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
      if (response.cancelled) {
        cancelled = true;
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
      }
    } catch {
      // Network failures during execution are tolerated; the lease is long.
    }
  }, 25000);

  const result = await new Promise((resolve) => {
    child.on('error', (error) =>
      resolve({ code: -1, stdout, stderr: `${stderr}\n${error.message}` })
    );
    child.on('close', (code) => resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr }));
  });

  clearTimeout(timeout);
  clearInterval(heartbeat);
  activeChildPid = null;

  return {
    ...result,
    durationMs: Date.now() - startedAt,
    timedOut,
    cancelled,
    truncated,
  };
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

async function commitAndPush({ worktree, branch, taskId, attemptNumber }) {
  const add = await git(['add', '-A'], worktree, 60000);
  if (add.code !== 0) throw new Error('git add failed.');
  const staged = await git(['diff', '--cached', '--name-only'], worktree, 30000);
  const files = staged.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  if (files.length === 0) return { commitSha: null, files: [] };

  const commit = await git(
    [
      '-c',
      'user.name=Pierrot Dev',
      '-c',
      'user.email=pierrot-dev@merkurov.love',
      'commit',
      '-m',
      `pierrot(dev): task ${taskId} attempt ${attemptNumber}`,
    ],
    worktree,
    60000
  );
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr.slice(-400)}`);
  const sha = await git(['rev-parse', 'HEAD'], worktree, 30000);
  if (sha.code !== 0) throw new Error('Unable to read the commit SHA.');

  const push = await git(['push', 'origin', `HEAD:refs/heads/${branch}`], worktree, 300000);
  if (push.code !== 0) {
    const error = new Error(`git push failed: ${push.stderr.slice(-500)}`);
    error.code = /rejected|non-fast-forward/i.test(push.stderr)
      ? 'BRANCH_CONFLICT'
      : 'PUSH_FAILED';
    throw error;
  }

  return { commitSha: sha.stdout.trim(), files };
}

async function executeClaim(claim) {
  const { task, attempt, prompt } = claim;
  activeAttempt = attempt;
  idleSince = null;
  await log(`Claimed task ${task.id} attempt ${attempt.attemptNumber}`, {
    branch: attempt.branch,
  });

  let workspace = null;
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

    const runResult = await runOpenCode({
      worktree: prepared.worktree,
      prompt,
      attemptId: attempt.id,
      title: `Pierrot dev: ${task.title}`,
    });
    const output = `${runResult.stdout}\n${runResult.stderr}`;
    const sessionId = extractSessionId(runResult.stdout);
    const report = extractExecutorReport(output) || {};
    const changedFiles = await collectChangedFiles(prepared.worktree);
    const logExcerpt = sanitize(output.slice(-60000));

    if (runResult.cancelled) {
      await api('fail', {
        attemptId: attempt.id,
        errorCode: 'CANCELLED_BY_OWNER',
        errorMessage: 'Cancelled during execution.',
        exitCode: runResult.code,
        logExcerpt,
      });
      return;
    }

    if (runResult.timedOut) {
      await api('fail', {
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
      await api('fail', {
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
      await api('fail', {
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
      await api('fail', {
        attemptId: attempt.id,
        errorCode: 'OPENCODE_FAILED',
        errorMessage: `OpenCode exited with code ${runResult.code}.`,
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

    let commitSha = null;
    let pushedFiles = [];
    if (changedFiles.length > 0) {
      try {
        const pushed = await commitAndPush({
          worktree: prepared.worktree,
          branch: prepared.branch,
          taskId: task.id,
          attemptNumber: attempt.attemptNumber,
        });
        commitSha = pushed.commitSha;
        pushedFiles = pushed.files;
      } catch (error) {
        await api('fail', {
          attemptId: attempt.id,
          errorCode: error.code || 'COMMIT_FAILED',
          errorMessage: error.message,
          exitCode: runResult.code,
          logExcerpt,
          changedFiles,
        });
        return;
      }
    }

    const payload = {
      exitCode: runResult.code,
      opencodeSessionId: sessionId,
      headSha: commitSha,
      changedFiles: pushedFiles.length > 0 ? pushedFiles : changedFiles,
      commands: Array.isArray(report.commands) ? report.commands.slice(0, 30) : [],
      summary:
        typeof report.summary === 'string'
          ? report.summary
          : `OpenCode finished in ${Math.round(runResult.durationMs / 1000)}s.`,
      warnings: Array.isArray(report.warnings) ? report.warnings.slice(0, 40) : [],
      criteria: Array.isArray(report.acceptanceCriteria)
        ? report.acceptanceCriteria.slice(0, 40)
        : [],
      logExcerpt: runResult.truncated ? `${logExcerpt}\n[log truncated]` : logExcerpt,
      verification: {
        durationMs: runResult.durationMs,
        runner: 'pierrot-dev-worker',
        workerVersion: WORKER_VERSION,
        selfReported: true,
        unverified: Array.isArray(report.unverified) ? report.unverified.slice(0, 40) : [],
      },
    };

    // Durable outbox: if the network drops after the work is done, retry the
    // exact same completion later instead of losing the result.
    await submitCompletion(attempt.id, payload);
  } catch (error) {
    // Workspace, git or transport failure: never leave the attempt hanging.
    await api(
      'fail',
      {
        attemptId: attempt.id,
        errorCode: error.code || 'EXECUTION_SETUP_FAILED',
        errorMessage: String(error.message || error).slice(0, 2000),
        logExcerpt: sanitize(String(error.stack || error)).slice(0, 60000),
      },
      30000
    ).catch(() => {});
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
    JSON.stringify({ attemptId, payload, createdAt: nowIso() }, null, 2),
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
      await api('complete', { attemptId: record.attemptId, result: record.payload }, 60000);
      await fs.unlink(file).catch(() => {});
      await log(`Outbox delivered for ${record.attemptId}`);
    } catch (error) {
      if (error.status && error.status >= 400 && error.status < 500) {
        await fs.unlink(file).catch(() => {});
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function maybeStopIdleCodespace() {
  if (!IDLE_STOP_MINUTES || !idleSince || !CODESPACE_NAME) return;
  if (Date.now() - idleSince < IDLE_STOP_MINUTES * 60000) return;
  const token = (process.env.GITHUB_TOKEN || '').trim();
  if (!token) return;
  await log(`Idle for ${IDLE_STOP_MINUTES} minutes; requesting Codespace stop.`);
  try {
    await fetch(
      `${process.env.GITHUB_API_URL || 'https://api.github.com'}/user/codespaces/${encodeURIComponent(
        CODESPACE_NAME
      )}/stop`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': `pierrot-dev-worker/${WORKER_VERSION}`,
        },
        signal: AbortSignal.timeout(20000),
      }
    );
  } catch {}
  idleSince = null;
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  await log(`Received ${signal}; shutting down.`);
  if (activeChildPid) {
    try {
      process.kill(-activeChildPid, 'SIGTERM');
    } catch {}
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

  if (!TOKEN || TOKEN.length < 32) {
    await log(
      'PIERROT_DEV_WORKER_TOKEN is missing or shorter than 32 characters. Worker will not start.'
    );
    process.exit(2);
  }
  if (!/^https?:\/\//.test(API_BASE)) {
    await log('PIERROT_DEV_API_URL is not a valid http(s) URL. Worker will not start.');
    process.exit(2);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await log(`Starting Pierrot worker ${WORKER_ID}`, {
    api: API_BASE,
    version: WORKER_VERSION,
    pollMs: POLL_MS,
  });

  let capabilities = await readCapabilities();
  let registered = false;
  let lastCapabilitiesAt = Date.now();

  while (!shuttingDown) {
    try {
      if (!registered) {
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
        await log('Registered', { opencode: capabilities.opencodeVersion });
        try {
          const recovered = await api('recover', {}, 30000);
          if (recovered.released) {
            await log(`Recovered ${recovered.released} unfinished attempt(s) from a previous run.`);
          }
        } catch (error) {
          await log('Recovery check failed', { status: error.status || null });
        }
      }

      if (Date.now() - lastCapabilitiesAt > 10 * 60 * 1000) {
        capabilities = await readCapabilities();
        lastCapabilitiesAt = Date.now();
      }

      await flushOutbox();
      const beat = await api('heartbeat', {
        status: activeAttempt ? 'busy' : 'idle',
        capabilities,
        lastError: consecutiveErrors > 0 ? 'Worker had transient API errors.' : null,
      });

      if (beat.stopRequested) {
        if (!activeAttempt) {
          await log('Owner requested a worker stop; exiting.');
          process.exit(0);
        }
      }

      if (activeAttempt) {
        await sleep(POLL_MS);
        continue;
      }

      const claimed = await api('claim', {}, 40000);
      consecutiveErrors = 0;
      if (claimed.claim) {
        await executeClaim(claimed.claim);
        idleSince = Date.now();
        continue;
      }

      idleSince = idleSince || Date.now();
      await maybeStopIdleCodespace();
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
      await sleep(backoff);
    }
  }
}

main().catch(async (error) => {
  await log('Fatal worker error', { message: String(error.message || error).slice(0, 500) });
  process.exit(1);
});
