#!/usr/bin/env node
/**
 * Non-secret preflight for the Pierrot GitHub Actions executor.
 *
 * This script never prints secret values. It verifies:
 *   * the executor selection is DeepSeek-primary (provider and model id);
 *   * OpenCode has a stored DeepSeek login or an explicitly allowed
 *     DEEPSEEK_API_KEY (presence only);
 *   * the installed OpenCode CLI is new enough;
 *   * the exact configured DeepSeek model is offered by the CLI;
 *   * the worker API and its Supabase path are reachable;
 *   * optionally, a tiny live model call succeeds with the configured model.
 *
 * Missing authentication stops the workflow with setup instructions. There is
 * no OpenAI or other provider/model fallback in this executor path.
 */

import process from 'node:process';
import {
  isVersionAtLeast,
  parseStoredAuth,
  resolveDevProviderSelection,
  resolveExecutorAuth,
} from './dev-worker-lib.mjs';
import { runProcess } from './dev-worker-process.mjs';

const API_BASE = (
  process.env.PIERROT_DEV_API_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  // Production redirects the apex host to www; a POST to the apex would lose
  // its body on the 301, so the canonical host is the default.
  'https://www.merkurov.love'
).replace(/\/+$/, '');
const WORKER_TOKEN = (process.env.PIERROT_DEV_WORKER_TOKEN || '').trim();
const SELECTION = resolveDevProviderSelection({
  provider: process.env.PIERROT_DEV_OPENCODE_PROVIDER,
  model: process.env.PIERROT_DEV_OPENCODE_MODEL,
});
const PROVIDER = SELECTION.provider;
const MODEL = SELECTION.model;
const MIN_VERSION = (process.env.PIERROT_DEV_OPENCODE_MIN_VERSION || '2.1.4').trim();
const PROVIDER_ENV_NAME = SELECTION.envName;
const PROVIDER_KEY = (process.env[PROVIDER_ENV_NAME] || '').trim();
const ALLOW_PROVIDER_ENV = process.env.PIERROT_DEV_ALLOW_PROVIDER_ENV === 'true';
const PREFLIGHT_MARKER = SELECTION.preflightMarker;
const RUN_MODEL_CALL = process.env.PIERROT_DEV_MODEL_SMOKE_TEST !== 'false';

function fail(code, message) {
  // Every preflight failure gets its own non-secret diagnostic code. This lets
  // the owner distinguish a missing worker token from an OpenAI/model problem
  // in the Actions annotation without reading logs or exposing values.
  process.stdout.write(`[preflight] failed=${code}\n`);
  process.stderr.write(`::error title=Pierrot preflight (${code})::${message}\n`);
  process.exit(1);
}

function note(key, value) {
  process.stdout.write(`[preflight] ${key}=${value}\n`);
}

function opencodeEnv(includeProviderKey = false) {
  const allowed = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL'];
  const env = {};
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key];
  }
  // A stored login is preferred. The environment credential is forwarded only
  // when it is the resolved auth source and the operator explicitly allowed it.
  if (includeProviderKey && PROVIDER_KEY) env[PROVIDER_ENV_NAME] = PROVIDER_KEY;
  env.CI = '1';
  env.NO_COLOR = '1';
  env.OPENCODE_DISABLE_AUTOUPDATE = '1';
  env.NODE_OPTIONS = process.env.PIERROT_DEV_OPENCODE_NODE_OPTIONS || '--max-old-space-size=2560';
  // The preflight model call needs no tools. Deny every action so a smoke test
  // can never read files, run shell commands or reach external directories.
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    permissions: [{ action: '*', resource: '*', effect: 'deny' }],
  });
  return env;
}

async function main() {
  note('api_url', API_BASE);
  note('model', MODEL);
  note('provider', PROVIDER);
  note('worker_token_present', WORKER_TOKEN.length >= 32);
  note('provider_key_present', PROVIDER_KEY.length > 0);
  note('provider_env_allowed', ALLOW_PROVIDER_ENV);

  // Fail closed before any credential or network check when the workflow or a
  // repository variable selects a non-DeepSeek provider/model.
  if (!SELECTION.ok) {
    fail(
      SELECTION.reasonCode,
      `${SELECTION.reason} Set PIERROT_DEV_OPENCODE_PROVIDER=deepseek and PIERROT_DEV_OPENCODE_MODEL=deepseek/deepseek-flash.`
    );
  }
  if (!WORKER_TOKEN || WORKER_TOKEN.length < 32) {
    fail(
      'WORKER_TOKEN_MISSING',
      'Repository secret PIERROT_DEV_WORKER_TOKEN is missing or shorter than 32 characters. Add it in GitHub repository Settings → Secrets and variables → Actions.'
    );
  }

  const version = await runProcess('opencode', ['--version'], {
    env: opencodeEnv(),
    timeoutMs: 30000,
    maxCaptureBytes: 20000,
  });
  if (version.code !== 0) {
    fail(
      'OPENCODE_UNAVAILABLE',
      'OpenCode CLI is not installed or cannot run. Install the pinned version @opencode/cli@2.1.4.'
    );
  }
  const versionText = version.stdout.trim().split('\n')[0] || 'unknown';
  note('opencode_version', versionText);
  if (!isVersionAtLeast(versionText, MIN_VERSION)) {
    fail('OPENCODE_VERSION', `OpenCode ${versionText} is older than the required ${MIN_VERSION}.`);
  }

  // Prefer the stored `opencode auth login` credential. An environment key is
  // accepted only when the workflow explicitly allows it and the key is present.
  // A failed auth probe is reported as unverified, not as a missing secret.
  let storedAuth = false;
  let authProbeOk = true;
  let authProbeError = null;
  try {
    const authProbe = await runProcess('opencode', ['auth', 'list', '--standalone'], {
      env: opencodeEnv(),
      timeoutMs: 30000,
      maxCaptureBytes: 40000,
    });
    if (authProbe.code === 0) {
      storedAuth = parseStoredAuth(authProbe.stdout, PROVIDER).authenticated;
    } else {
      authProbeOk = false;
      authProbeError = authProbe.timedOut ? 'timeout' : `exit ${authProbe.code}`;
    }
  } catch (error) {
    authProbeOk = false;
    authProbeError = String(error?.message || error).slice(0, 120);
  }
  note('stored_auth_present', storedAuth);
  note('auth_probe_ok', authProbeOk);
  const auth = resolveExecutorAuth({
    provider: PROVIDER,
    envName: PROVIDER_ENV_NAME,
    storedAuth,
    envKey: PROVIDER_KEY,
    allowProviderEnv: ALLOW_PROVIDER_ENV,
    authProbeOk,
  });
  note('auth_source', auth.source);
  if (!auth.ok) {
    fail(
      auth.reasonCode,
      `${auth.reason} Run 'opencode auth login' for DeepSeek, or add the ${PROVIDER_ENV_NAME} repository secret and keep PIERROT_DEV_ALLOW_PROVIDER_ENV=true. The executor will not fall back to OpenAI or any other provider/model.${authProbeError ? ` Auth probe: ${authProbeError}.` : ''}`
    );
  }

  const models = await runProcess('opencode', ['models', '--standalone'], {
    env: opencodeEnv(auth.source === 'environment'),
    timeoutMs: 60000,
    maxCaptureBytes: 200000,
  });
  if (models.code !== 0) {
    fail(
      'MODEL_LIST_FAILED',
      'OpenCode could not list models. Check the pinned CLI installation and DeepSeek provider configuration.'
    );
  }
  const available = models.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!available.includes(MODEL)) {
    fail(
      'MODEL_UNAVAILABLE',
      `Configured model ${MODEL} is not offered by the installed OpenCode CLI for the DeepSeek provider. No fallback model will be used.`
    );
  }
  note('model_available', true);

  if (RUN_MODEL_CALL) {
    // A tiny real call proves provider selection and credentials. It has a
    // short deadline and a fixed non-secret prompt; the response must contain
    // the marker. Raw output is never printed because it could include
    // provider metadata; only a bounded sanitized tail is shown on failure.
    const smoke = await runProcess(
      'opencode',
      [
        'run',
        '--standalone',
        '--format',
        'json',
        '--model',
        MODEL,
        `Reply with exactly ${PREFLIGHT_MARKER} and do not use tools.`,
      ],
      {
        env: opencodeEnv(auth.source === 'environment'),
        timeoutMs: 180000,
        maxCaptureBytes: 200000,
      }
    );
    const output = `${smoke.stdout}\n${smoke.stderr}`.toLowerCase();
    if (smoke.code !== 0 || !output.includes(PREFLIGHT_MARKER.toLowerCase())) {
      fail(
        'MODEL_CALL_FAILED',
        `Live model check failed for ${MODEL} (exit ${smoke.code}). Verify the stored DeepSeek login or the ${PROVIDER_ENV_NAME} repository secret and that the DeepSeek account has access to this model. No fallback model will be used.`
      );
    }
    note('model_call', 'ok');
  } else {
    note('model_call', 'skipped');
  }

  let health;
  try {
    const response = await fetch(`${API_BASE}/api/internal/pierrot/dev/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pierrot-worker-token': WORKER_TOKEN,
        'User-Agent': 'pierrot-actions-preflight/1.0',
      },
      body: JSON.stringify({ action: 'health', workerId: 'actions:preflight' }),
      signal: AbortSignal.timeout(20000),
    });
    health = await response.json().catch(() => ({}));
    if (!response.ok || health?.ok !== true) {
      fail(
        'WORKER_API_UNAVAILABLE',
        `Worker API health check failed with HTTP ${response.status}. Verify PIERROT_DEV_API_URL and the deployed PIERROT_DEV_WORKER_TOKEN.`
      );
    }
  } catch (error) {
    fail(
      'WORKER_API_UNREACHABLE',
      `Worker API is unreachable at ${API_BASE} (${String(error?.message || error).slice(0, 160)}).`
    );
  }
  note('worker_api', 'ok');
  note('preflight', 'passed');
}

main().catch((error) => {
  fail('PREFLIGHT_CRASHED', `Preflight crashed: ${String(error?.message || error).slice(0, 300)}`);
});
