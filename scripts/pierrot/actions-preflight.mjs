#!/usr/bin/env node
/**
 * Non-secret preflight for the Pierrot GitHub Actions executor.
 *
 * This script never prints secret values. It verifies:
 *   * required repository secrets are present (presence only);
 *   * the installed OpenCode CLI is new enough;
 *   * the exact configured DeepSeek model is offered by the CLI;
 *   * the worker API and its Supabase path are reachable;
 *   * optionally, a tiny live model call succeeds with the configured model.
 *
 * A missing DEEPSEEK_API_KEY stops the workflow with setup instructions and
 * never falls back to another provider/model.
 */

import process from 'node:process';
import { isVersionAtLeast } from './dev-worker-lib.mjs';
import { runProcess } from './dev-worker-process.mjs';

const API_BASE = (
  process.env.PIERROT_DEV_API_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  'https://merkurov.love'
).replace(/\/+$/, '');
const WORKER_TOKEN = (process.env.PIERROT_DEV_WORKER_TOKEN || '').trim();
const PROVIDER = (process.env.PIERROT_DEV_OPENCODE_PROVIDER || 'deepseek').trim();
const MODEL = (process.env.PIERROT_DEV_OPENCODE_MODEL || 'deepseek/deepseek-flash').trim();
const MIN_VERSION = (process.env.PIERROT_DEV_OPENCODE_MIN_VERSION || '2.1.4').trim();
const PROVIDER_ENV_NAME = `${PROVIDER.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
const PROVIDER_KEY = (process.env[PROVIDER_ENV_NAME] || '').trim();
const RUN_MODEL_CALL = process.env.PIERROT_DEV_MODEL_SMOKE_TEST !== 'false';

function fail(message) {
  process.stderr.write(`::error::${message}\n`);
  process.exit(1);
}

function note(key, value) {
  process.stdout.write(`[preflight] ${key}=${value}\n`);
}

function opencodeEnv() {
  const allowed = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'SHELL'];
  const env = {};
  for (const key of allowed) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env[PROVIDER_ENV_NAME] = PROVIDER_KEY;
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

  if (!WORKER_TOKEN || WORKER_TOKEN.length < 32) {
    fail(
      'Repository secret PIERROT_DEV_WORKER_TOKEN is missing or shorter than 32 characters. Add it in GitHub repository Settings → Secrets and variables → Actions.'
    );
  }
  if (!PROVIDER_KEY) {
    fail(
      `Repository secret ${PROVIDER_ENV_NAME} is not set. In GitHub repository Settings → Secrets and variables → Actions add ${PROVIDER_ENV_NAME} with the replacement DeepSeek key. The key shared in chat must be revoked and rotated first. The executor will not fall back to another model.`
    );
  }

  const version = await runProcess('opencode', ['--version'], {
    env: opencodeEnv(),
    timeoutMs: 30000,
    maxCaptureBytes: 20000,
  });
  if (version.code !== 0) {
    fail(
      'OpenCode CLI is not installed or cannot run. Install the pinned version @opencode/cli@2.1.4.'
    );
  }
  const versionText = version.stdout.trim().split('\n')[0] || 'unknown';
  note('opencode_version', versionText);
  if (!isVersionAtLeast(versionText, MIN_VERSION)) {
    fail(`OpenCode ${versionText} is older than the required ${MIN_VERSION}.`);
  }

  const models = await runProcess('opencode', ['models'], {
    env: opencodeEnv(),
    timeoutMs: 60000,
    maxCaptureBytes: 200000,
  });
  if (models.code !== 0) {
    fail(
      'OpenCode could not list models. Check the pinned CLI installation and provider configuration.'
    );
  }
  const available = models.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!available.includes(MODEL)) {
    fail(
      `Configured model ${MODEL} is not offered by the installed OpenCode CLI. No fallback model will be used.`
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
        'Reply with exactly DEEPSEEK_PREFLIGHT_OK and do not use tools.',
      ],
      {
        env: opencodeEnv(),
        timeoutMs: 180000,
        maxCaptureBytes: 200000,
      }
    );
    const output = `${smoke.stdout}\n${smoke.stderr}`.toLowerCase();
    if (smoke.code !== 0 || !output.includes('deepseek_preflight_ok')) {
      fail(
        `Live model check failed for ${MODEL} (exit ${smoke.code}). Verify the ${PROVIDER_ENV_NAME} value in repository secrets and that the DeepSeek account is active. No fallback model will be used.`
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
        `Worker API health check failed with HTTP ${response.status}. Verify PIERROT_DEV_API_URL and the deployed PIERROT_DEV_WORKER_TOKEN.`
      );
    }
  } catch (error) {
    fail(
      `Worker API is unreachable at ${API_BASE} (${String(error?.message || error).slice(0, 160)}).`
    );
  }
  note('worker_api', 'ok');
  note('preflight', 'passed');
}

main().catch((error) => {
  fail(`Preflight crashed: ${String(error?.message || error).slice(0, 300)}`);
});
