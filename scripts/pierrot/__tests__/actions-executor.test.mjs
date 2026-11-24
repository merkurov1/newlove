import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIONS_EXIT,
  DEFAULT_DEV_OPENCODE_MODEL,
  DEV_PREFLIGHT_MARKER,
  REQUIRED_DEV_PROVIDER,
  actionsExitCode,
  activeAttemptOwnership,
  assertHostedActionsRunner,
  buildExecutionId,
  classifyClaimOutcome,
  isClaimForRequestedTask,
  isVersionAtLeast,
  parseStoredAuth,
  resolveCommitPolicy,
  resolveDevProviderSelection,
  resolveExecutorAuth,
} from '../dev-worker-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

test('commit signing fails closed unless the Actions pilot opts in', () => {
  assert.equal(
    resolveCommitPolicy({ actionsMode: false, allowUnsigned: true }),
    'gpg',
    'Codespaces must keep mandatory GPG signing'
  );
  assert.equal(resolveCommitPolicy({ actionsMode: true, allowUnsigned: false }), 'refuse');
  assert.equal(
    resolveCommitPolicy({ actionsMode: true, allowUnsigned: true }),
    'unsigned',
    'Actions may use the explicit unsigned override'
  );
  assert.equal(
    resolveCommitPolicy({ actionsMode: true, allowUnsigned: true, hasSigningKey: true }),
    'gpg'
  );
});

test('execution ids are unique per run attempt and bounded', () => {
  assert.equal(buildExecutionId({ runId: '12345', runAttempt: '1' }), 'gha:12345:1');
  assert.equal(buildExecutionId({ runId: '12345', runAttempt: '2' }), 'gha:12345:2');
  assert.match(buildExecutionId({ fallback: 'local:test:1' }), /^local:test:1$/);
  assert.ok(buildExecutionId({ runId: '9'.repeat(400) }).length <= 160);
});

test('single-shot exit codes distinguish no task, setup and execution failures', () => {
  assert.equal(actionsExitCode({ ok: true }), ACTIONS_EXIT.success);
  assert.equal(actionsExitCode({ permanent: true, claimed: false }), ACTIONS_EXIT.permanent);
  assert.equal(actionsExitCode({ claimed: false }), ACTIONS_EXIT.success);
  assert.equal(actionsExitCode({ claimed: true }), ACTIONS_EXIT.executionFailed);
  // Losing a claim is a no-op, never a legacy failing exit code.
  assert.equal(ACTIONS_EXIT.noTask, 0);
  assert.equal(
    Object.values(ACTIONS_EXIT).includes(3),
    false,
    'no executor path may use exit code 3 for a lost claim'
  );
});

test('claim race outcomes are idempotent no-ops only when ownership is lost', () => {
  const duplicate = classifyClaimOutcome({
    claimed: false,
    failure: {
      code: 'TASK_ALREADY_CLAIMED',
      idempotent: true,
      reason: 'Task is already owned by another runner.',
    },
  });
  assert.equal(duplicate.outcome, 'no_op');
  assert.equal(duplicate.exitCode, ACTIONS_EXIT.success);
  assert.equal(duplicate.reasonCode, 'TASK_ALREADY_CLAIMED');

  const noLongerQueued = classifyClaimOutcome({
    claimed: false,
    failure: { code: 'TASK_NOT_QUEUED', idempotent: true },
  });
  assert.equal(noLongerQueued.outcome, 'no_op');
  assert.equal(noLongerQueued.exitCode, ACTIONS_EXIT.success);

  const paused = classifyClaimOutcome({
    claimed: false,
    failure: { code: 'QUEUE_PAUSED', idempotent: true },
  });
  assert.equal(paused.exitCode, ACTIONS_EXIT.success);

  const notClaimable = classifyClaimOutcome({
    claimed: false,
    failure: { code: 'WORKER_NOT_CLAIMABLE', idempotent: false, reason: 'worker stale' },
  });
  assert.equal(notClaimable.outcome, 'failed');
  assert.equal(notClaimable.exitCode, ACTIONS_EXIT.permanent);

  const claimed = classifyClaimOutcome({ claimed: true });
  assert.equal(claimed.outcome, 'claimed');
  assert.equal(claimed.exitCode, null);
});

test('cleanup releases only the attempt recorded for this exact worker', () => {
  const record = {
    attemptId: 'aaaaaaaa-1111-4111-8111-111111111111',
    workerId: 'actions:100:1',
  };
  assert.deepEqual(activeAttemptOwnership(record, 'actions:100:1'), {
    owned: true,
    reason: null,
  });
  assert.deepEqual(activeAttemptOwnership(record, 'actions:101:1'), {
    owned: false,
    reason: 'other_worker',
  });
  assert.equal(activeAttemptOwnership({ ...record, workerId: '' }, 'actions:100:1').owned, false);
  assert.equal(activeAttemptOwnership({ workerId: 'actions:100:1' }, 'actions:100:1').owned, false);
  assert.equal(
    activeAttemptOwnership({ attemptId: record.attemptId, workerId: '' }, 'actions:100:1').owned,
    false
  );
});

test('a targeted dispatch never executes a different claimed task', () => {
  const claim = { task: { id: '11111111-1111-4111-8111-111111111111' } };
  assert.equal(isClaimForRequestedTask(claim, ''), true);
  assert.equal(isClaimForRequestedTask(claim, '11111111-1111-4111-8111-111111111111'), true);
  assert.equal(isClaimForRequestedTask(claim, '22222222-2222-4222-8222-222222222222'), false);
});

test('environment credentials are not reported as stored Codespace login', () => {
  const output = 'DeepSeek  DEEPSEEK_API_KEY  environment';
  assert.equal(parseStoredAuth(output, 'deepseek').authenticated, false);
  assert.ok(isVersionAtLeast('opencode v2.1.4', '2.1.4'));
});

function workflowText() {
  return fs.readFileSync(
    path.join(repoRoot, '.github/workflows/pierrot-actions-executor.yml'),
    'utf8'
  );
}

test('Actions workflow is not exposed to fork or untrusted pull requests', () => {
  const workflow = workflowText();
  assert.doesNotMatch(workflow, /^\s*pull_request(_target)?:/m);
  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /types:\s*\[pierrot-dev-task\]/);
});

test('workflow-level env never references the runner context', () => {
  const workflow = workflowText();
  const beforeJobs = workflow.split('\njobs:')[0];
  assert.doesNotMatch(
    beforeJobs,
    /runner\./,
    'runner.* is unavailable in workflow-level env and makes GitHub fail before creating jobs'
  );
  assert.match(workflow, /PIERROT_DEV_WORK_ROOT:\s*\$\{\{\s*runner\.temp\s*\}\}/);
});

test('the dispatcher task id is used for one-run-per-task concurrency', () => {
  const workflow = workflowText();
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /github\.event\.client_payload\.task_id/);
  assert.match(workflow, /PIERROT_DEV_TASK_ID:/);
});

test('repository_dispatch runs the executor even though inputs are undefined', () => {
  const workflow = workflowText();
  assert.match(workflow, /github\.event_name == 'repository_dispatch'/);
  assert.doesNotMatch(workflow, /github\.event_name != 'workflow_dispatch'/);
});

test('Actions workflow has least-privilege permissions and no secret literals', () => {
  const workflow = workflowText();
  assert.match(workflow, /permissions:[\s\S]{0,300}?contents:\s*write/);
  assert.doesNotMatch(workflow, /pull-requests:\s*write/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /packages:\s*write/);
  assert.doesNotMatch(workflow, /deployments:\s*write/);
  // Secrets may only be referenced through the GitHub secrets context.
  assert.match(workflow, /DEEPSEEK_API_KEY:\s*\$\{\{\s*secrets\.DEEPSEEK_API_KEY\s*\}\}/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
  assert.doesNotMatch(workflow, /DEEPSEEK_API_KEY\s*[:=]\s*['"]?sk-/i);
  assert.doesNotMatch(workflow, /sk-[A-Za-z0-9]{12,}/);
  // The runner cannot merge or deploy; those remain owner-only server actions.
  assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/i);
  assert.doesNotMatch(workflow, /\bvercel\s+--prod\b/i);
  assert.doesNotMatch(workflow, /\bsupabase\s+db\s+push\b/i);
});

test('executor provider selection is DeepSeek-primary and fails closed otherwise', () => {
  const defaults = resolveDevProviderSelection({});
  assert.equal(defaults.provider, REQUIRED_DEV_PROVIDER);
  assert.equal(defaults.provider, 'deepseek');
  assert.equal(defaults.model, DEFAULT_DEV_OPENCODE_MODEL);
  assert.equal(defaults.model, 'deepseek/deepseek-flash');
  assert.equal(defaults.envName, 'DEEPSEEK_API_KEY');
  assert.equal(defaults.preflightMarker, DEV_PREFLIGHT_MARKER);
  assert.equal(defaults.preflightMarker, 'DEEPSEEK_PREFLIGHT_OK');
  assert.equal(defaults.ok, true);

  const explicit = resolveDevProviderSelection({
    provider: 'deepseek',
    model: 'deepseek/deepseek-flash',
  });
  assert.equal(explicit.ok, true);
  assert.equal(explicit.reasonCode, null);

  const openaiProvider = resolveDevProviderSelection({
    provider: 'openai',
    model: 'openai/gpt-5.6',
  });
  assert.equal(openaiProvider.ok, false);
  assert.equal(openaiProvider.reasonCode, 'PROVIDER_NOT_DEEPSEEK');

  const openaiModel = resolveDevProviderSelection({
    provider: 'deepseek',
    model: 'openai/gpt-5.6',
  });
  assert.equal(openaiModel.ok, false);
  assert.equal(openaiModel.reasonCode, 'MODEL_NOT_DEEPSEEK');

  const deepseekModelOnly = resolveDevProviderSelection({ model: 'deepseek/deepseek-flash' });
  assert.equal(deepseekModelOnly.provider, 'deepseek');
  assert.equal(deepseekModelOnly.ok, true);
});

test('DeepSeek auth prefers the stored login and never falls back to OpenAI', () => {
  const stored = resolveExecutorAuth({
    provider: 'deepseek',
    storedAuth: true,
    envKey: '',
    allowProviderEnv: true,
  });
  assert.equal(stored.ok, true);
  assert.equal(stored.source, 'stored');

  const environment = resolveExecutorAuth({
    provider: 'deepseek',
    storedAuth: false,
    envKey: 'present',
    allowProviderEnv: true,
  });
  assert.equal(environment.ok, true);
  assert.equal(environment.source, 'environment');

  const notAllowed = resolveExecutorAuth({
    provider: 'deepseek',
    storedAuth: false,
    envKey: 'present',
    allowProviderEnv: false,
  });
  assert.equal(notAllowed.ok, false);
  assert.equal(notAllowed.reasonCode, 'PROVIDER_AUTH_MISSING');
  assert.equal(notAllowed.envName, 'DEEPSEEK_API_KEY');

  const missing = resolveExecutorAuth({
    provider: 'deepseek',
    storedAuth: false,
    envKey: '',
    allowProviderEnv: true,
    authProbeOk: true,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reasonCode, 'PROVIDER_AUTH_MISSING');
  assert.match(missing.reason, /DEEPSEEK_API_KEY/);
  assert.doesNotMatch(missing.reason, /OpenAI/i);

  const unverified = resolveExecutorAuth({
    provider: 'deepseek',
    storedAuth: false,
    envKey: '',
    allowProviderEnv: true,
    authProbeOk: false,
  });
  assert.equal(unverified.ok, false);
  assert.equal(unverified.reasonCode, 'PROVIDER_AUTH_UNVERIFIED');
  assert.equal(unverified.source, 'unverified');
});

test('the executor refuses any hidden Codespaces fallback', () => {
  assert.equal(
    assertHostedActionsRunner({
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_NAME: 'GitHub Actions 12',
    }).ok,
    true
  );
  assert.equal(
    assertHostedActionsRunner({
      RUNNER_ENVIRONMENT: 'self-hosted',
      RUNNER_NAME: 'codespace-abc',
    }).ok,
    false
  );
  assert.equal(
    assertHostedActionsRunner({
      RUNNER_ENVIRONMENT: 'github-hosted',
      RUNNER_NAME: 'hosted',
      CODESPACE_NAME: 'suspicious',
    }).ok,
    false
  );

  const workflow = workflowText();
  assert.match(workflow, /Assert GitHub-hosted runner \(no Codespaces fallback\)/);
  assert.match(workflow, /RUNNER_ENVIRONMENT/);
  assert.match(workflow, /CODESPACE_NAME/);
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.doesNotMatch(workflow, /runs-on:\s*self-hosted/);
});

test('executor configuration pins the available DeepSeek model', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'opencode.json'), 'utf8'));
  assert.equal(config.model, DEFAULT_DEV_OPENCODE_MODEL);
  assert.equal(config.model, 'deepseek/deepseek-flash');
  assert.match(workflowText(), /PIERROT_DEV_OPENCODE_PROVIDER:\s*deepseek\b/);
  assert.match(workflowText(), /PIERROT_DEV_OPENCODE_MODEL:\s*deepseek\/deepseek-flash\b/);
});

test('executor workflow has no other-provider fallback', () => {
  const raw = workflowText();
  const workflow = raw.toLowerCase();
  assert.doesNotMatch(workflow, /openai/);
  assert.doesNotMatch(workflow, /openrouter/);
  assert.doesNotMatch(workflow, /anthropic/);
  assert.match(workflow, /pierrot_dev_opencode_provider:\s*deepseek\b/);
  assert.match(workflow, /pierrot_dev_opencode_model:\s*deepseek\/deepseek-flash\b/);
  // The preflight is a hard gate before the executor step.
  const preflightIndex = raw.indexOf('actions-preflight.mjs');
  const executeIndex = raw.indexOf('node scripts/pierrot/dev-worker.mjs');
  assert.ok(preflightIndex > 0 && executeIndex > preflightIndex);
  assert.match(
    raw,
    /name: Execute task\s+if: \$\{\{ github\.event_name == 'repository_dispatch' \|\| inputs\.dry_run != true \}\}/
  );
  // The live OpenAI call is mandatory whenever a task may execute; it can only
  // be skipped for a dry run that does not claim or run anything.
  assert.match(
    raw,
    /PIERROT_DEV_MODEL_SMOKE_TEST:.*inputs\.dry_run == true.*inputs\.model_smoke_test == false/
  );
});

test('executor test file never prints a provider key', () => {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.doesNotMatch(self, /sk-[A-Za-z0-9]{12,}/);
});

test('workflows use Node 24-capable action runtimes', () => {
  const ci = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  const executor = workflowText();
  for (const workflow of [ci, executor]) {
    // v4 actions still declare the deprecated Node 20 runtime; v7/v6 are the
    // current Node 24 action majors and remove the forced-runtime warning.
    assert.match(workflow, /actions\/checkout@v[7-9]/);
    assert.match(workflow, /actions\/setup-node@v[7-9]/);
    assert.match(workflow, /pnpm\/action-setup@v[6-9]/);
    assert.doesNotMatch(workflow, /actions\/(checkout|setup-node)@v[1-4]/);
    assert.doesNotMatch(workflow, /pnpm\/action-setup@v[1-5]/);
  }
  assert.match(executor, /actions\/upload-artifact@v[7-9]/);
  assert.doesNotMatch(executor, /actions\/upload-artifact@v[1-4]/);
});

test('a no-claim Actions run records an explainable non-secret reason', () => {
  const worker = fs.readFileSync(path.join(repoRoot, 'scripts/pierrot/dev-worker.mjs'), 'utf8');
  assert.match(worker, /created no attempt/);
  assert.match(worker, /actions-no-claim:/);
  assert.match(worker, /source:\s*'actions:no_claim'/);
  assert.match(worker, /classifyClaimOutcome/);
  assert.match(worker, /writeActionsOutcome/);
  assert.doesNotMatch(worker, /sk-[A-Za-z0-9]{12,}/);
});

test('the workflow treats a lost claim as success but keeps real failures red', () => {
  const workflow = workflowText();
  // No legacy exit-code-3 failure branch remains.
  assert.doesNotMatch(workflow, /3\)\s*echo "::warning::No claimable task/);
  assert.match(
    workflow,
    /0\) echo "::notice::Executor completed, or finished as an idempotent no-op/
  );
  assert.match(workflow, /2\) echo "::error::Executor stopped on a permanent/);
  assert.match(workflow, /4\) echo "::error::Execution failed/);
  assert.match(workflow, /\*\) echo "::error::Executor exited with code \$code\."/);
  assert.match(workflow, /exit "\$code"/);
  assert.match(workflow, /executorOutcome/);
  assert.match(workflow, /claimFailureCode/);
  assert.match(workflow, /actions-outcome\.json/);
});

test('cleanup cannot release another runner lease from a stale active-attempt file', () => {
  const worker = fs.readFileSync(path.join(repoRoot, 'scripts/pierrot/dev-worker.mjs'), 'utf8');
  const release = worker.slice(
    worker.indexOf('async function runActionsRelease'),
    worker.indexOf('async function runActionsOnce')
  );
  assert.match(release, /activeAttemptOwnership\(record, WORKER_ID\)/);
  assert.match(release, /not owned by this runner; leaving it untouched/);
  // The ownership guard must run before any release API call.
  assert.ok(release.indexOf('ownership.owned') < release.indexOf("api(\n      'release'"));
});

test('DeepSeek preflight failures have separate non-secret diagnostics', () => {
  const preflight = fs.readFileSync(
    path.join(repoRoot, 'scripts/pierrot/actions-preflight.mjs'),
    'utf8'
  );
  for (const code of [
    'WORKER_TOKEN_MISSING',
    'OPENCODE_UNAVAILABLE',
    'OPENCODE_VERSION',
    'MODEL_LIST_FAILED',
    'MODEL_UNAVAILABLE',
    'MODEL_CALL_FAILED',
    'WORKER_API_UNAVAILABLE',
    'WORKER_API_UNREACHABLE',
  ]) {
    assert.match(preflight, new RegExp(`['"]${code}['"]`));
  }
  assert.match(preflight, /resolveDevProviderSelection/);
  assert.match(preflight, /resolveExecutorAuth/);
  assert.match(preflight, /if \(!SELECTION\.ok\)/);
  assert.match(preflight, /SELECTION\.reasonCode/);
  const lib = fs.readFileSync(path.join(repoRoot, 'scripts/pierrot/dev-worker-lib.mjs'), 'utf8');
  assert.match(lib, /PROVIDER_NOT_DEEPSEEK/);
  assert.match(lib, /MODEL_NOT_DEEPSEEK/);
  assert.match(lib, /PROVIDER_AUTH_MISSING/);
  assert.match(lib, /PROVIDER_AUTH_UNVERIFIED/);
  assert.match(preflight, /::error title=Pierrot preflight/);
  assert.match(preflight, /PREFLIGHT_MARKER/);
  assert.match(lib, /DEEPSEEK_PREFLIGHT_OK/);
  assert.match(preflight, /\[['"]models['"],\s*['"]--standalone['"]\]/);
  assert.doesNotMatch(preflight, /OPENAI_PREFLIGHT_OK/);
  assert.doesNotMatch(preflight, /OPENAI_API_KEY/);
  assert.doesNotMatch(preflight, /sk-[A-Za-z0-9]{12,}/);
});

function runPreflight(extraEnv) {
  const env = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    PIERROT_DEV_WORKER_TOKEN: '0'.repeat(32),
    PIERROT_DEV_MODEL_SMOKE_TEST: 'false',
    ...extraEnv,
  };
  return spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/pierrot/actions-preflight.mjs')],
    {
      env,
      encoding: 'utf8',
      timeout: 30_000,
    }
  );
}

test('preflight exits non-zero for an OpenAI selection before touching credentials', () => {
  const result = runPreflight({
    PIERROT_DEV_OPENCODE_PROVIDER: 'openai',
    PIERROT_DEV_OPENCODE_MODEL: 'openai/gpt-5.6',
    OPENAI_API_KEY: 'not-a-real-key',
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /failed=PROVIDER_NOT_DEEPSEEK/);
  assert.match(result.stderr, /Pierrot preflight \(PROVIDER_NOT_DEEPSEEK\)/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /not-a-real-key/);
});

test('preflight fails closed when DeepSeek auth is missing', () => {
  // An empty HOME makes `opencode auth list` deterministic: no stored login.
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pierrot-preflight-'));
  const resultPath = path.join(emptyHome, 'preflight-result.json');
  try {
    const result = runPreflight({
      HOME: emptyHome,
      PIERROT_DEV_OPENCODE_PROVIDER: 'deepseek',
      PIERROT_DEV_OPENCODE_MODEL: 'deepseek/deepseek-flash',
      PIERROT_DEV_ALLOW_PROVIDER_ENV: 'true',
      PIERROT_DEV_PREFLIGHT_RESULT: resultPath,
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /provider_key_present=false/);
    assert.match(result.stdout, /stored_auth_present=false/);
    assert.match(result.stdout, /failed=PROVIDER_AUTH_MISSING/);
    assert.match(result.stderr, /Pierrot preflight \(PROVIDER_AUTH_MISSING\)/);
    assert.match(result.stderr, /DEEPSEEK_API_KEY/);
    const evidence = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    assert.equal(evidence.passed, false);
    assert.equal(evidence.failureCode, 'PROVIDER_AUTH_MISSING');
    assert.equal(evidence.provider, 'deepseek');
    assert.doesNotMatch(JSON.stringify(evidence), /sk-[A-Za-z0-9]{12,}/);
  } finally {
    fs.rmSync(emptyHome, { recursive: true, force: true });
  }
});

test('Actions worker refuses a non-DeepSeek selection before claiming', () => {
  const worker = fs.readFileSync(path.join(repoRoot, 'scripts/pierrot/dev-worker.mjs'), 'utf8');
  assert.match(worker, /resolveDevProviderSelection/);
  assert.match(worker, /resolveExecutorAuth/);
  assert.match(worker, /if \(!PROVIDER_SELECTION\.ok\)/);
  assert.match(worker, /PROVIDER_SELECTION\.reasonCode/);
  assert.match(worker, /OPENCODE_AUTH_MISSING/);
  assert.doesNotMatch(worker, /PROVIDER_KEY_MISSING/);
  assert.match(worker, /\['models', '--standalone'\]/);
  // Fail before the claim RPC; a rejected provider must never reach the queue.
  const guardIndex = worker.indexOf('if (!PROVIDER_SELECTION.ok)');
  const claimIndex = worker.indexOf("api(\n      'claim'");
  assert.ok(guardIndex > 0 && claimIndex > guardIndex);
});

function runNodeAsync(script, env, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { env, cwd: repoRoot });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

async function startFakeWorkerApi(respond = () => ({ ok: true })) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {}
      requests.push({ action: body.action || null, raw });
      let payload;
      try {
        payload = respond(body, raw) || { ok: true };
      } catch {
        payload = { ok: true };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, url: `http://127.0.0.1:${port}`, requests };
}

/**
 * Deterministic stand-in for the OpenCode CLI. It records only a boolean
 * "key was present", never the value, so the test itself cannot leak a secret.
 */
function writeFakeOpenCode(binDir, recordPath) {
  fs.mkdirSync(binDir, { recursive: true });
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const record = ${JSON.stringify(recordPath)};
const key = process.env.DEEPSEEK_API_KEY || '';
try {
  const previous = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')) : {};
  previous.calls = (previous.calls || 0) + 1;
  previous.keyPresent = previous.keyPresent === true || key.length > 0;
  if (args.includes('--model')) previous.model = args[args.indexOf('--model') + 1];
  fs.writeFileSync(record, JSON.stringify(previous));
} catch {}
if (args.includes('--version')) { console.log('2.1.4'); process.exit(0); }
if (args[0] === 'auth' && args[1] === 'list') { process.exit(0); }
if (args[0] === 'models') { console.log('deepseek/deepseek-flash'); process.exit(0); }
if (args[0] === 'run') {
  console.log(JSON.stringify({ type: 'text', part: { text: 'DEEPSEEK_PREFLIGHT_OK' } }));
  process.exit(0);
}
process.exit(0);
`;
  const file = path.join(binDir, 'opencode');
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755);
  return file;
}

async function withTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('preflight accepts an allowed DeepSeek key, lists the pinned model and forwards the key to the child', async (t) => {
  const tmp = await withTempDir(t, 'pierrot-preflight-ok-');
  const record = path.join(tmp, 'opencode-child.json');
  writeFakeOpenCode(path.join(tmp, 'bin'), record);
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);
  const resultPath = path.join(tmp, 'preflight-result.json');
  const api = await startFakeWorkerApi();
  t.after(() => api.server.close());

  const secret = 'deepseek-test-secret-value-0123456789';
  const result = await runNodeAsync(path.join(repoRoot, 'scripts/pierrot/actions-preflight.mjs'), {
    PATH: `${path.join(tmp, 'bin')}:${process.env.PATH || ''}`,
    HOME: home,
    PIERROT_DEV_WORKER_TOKEN: '0'.repeat(32),
    PIERROT_DEV_API_URL: api.url,
    PIERROT_DEV_OPENCODE_PROVIDER: 'deepseek',
    PIERROT_DEV_OPENCODE_MODEL: 'deepseek/deepseek-flash',
    PIERROT_DEV_ALLOW_PROVIDER_ENV: 'true',
    PIERROT_DEV_MODEL_SMOKE_TEST: 'true',
    PIERROT_DEV_PREFLIGHT_RESULT: resultPath,
    DEEPSEEK_API_KEY: secret,
  });

  const evidence = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  assert.equal(evidence.passed, true);
  assert.equal(evidence.provider, 'deepseek');
  assert.equal(evidence.model, 'deepseek/deepseek-flash');
  assert.equal(evidence.authSource, 'environment');
  assert.equal(evidence.modelAvailable, true);
  assert.equal(evidence.modelCall, 'ok');
  assert.equal(evidence.workerApi, 'ok');
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(secret));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[preflight\] provider=deepseek/);
  assert.match(result.stdout, /\[preflight\] model=deepseek\/deepseek-flash/);
  assert.match(result.stdout, /\[preflight\] auth_source=environment/);
  assert.match(result.stdout, /\[preflight\] model_available=true/);
  assert.match(result.stdout, /\[preflight\] model_call=ok/);
  assert.match(result.stdout, /\[preflight\] preflight=passed/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
  assert.ok(api.requests.some((request) => request.action === 'health'));

  const child = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.equal(child.keyPresent, true, 'DEEPSEEK_API_KEY must reach the OpenCode child');
  assert.equal(child.model, 'deepseek/deepseek-flash');
});

test('Actions worker cannot claim when the provider policy rejects the selection', async (t) => {
  const tmp = await withTempDir(t, 'pierrot-worker-reject-');
  const record = path.join(tmp, 'opencode-child.json');
  writeFakeOpenCode(path.join(tmp, 'bin'), record);
  const api = await startFakeWorkerApi();
  t.after(() => api.server.close());

  const result = await runNodeAsync(path.join(repoRoot, 'scripts/pierrot/dev-worker.mjs'), {
    PATH: `${path.join(tmp, 'bin')}:${process.env.PATH || ''}`,
    HOME: tmp,
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_NAME: 'GitHub Actions 42',
    GITHUB_RUN_ID: '4242',
    GITHUB_RUN_ATTEMPT: '1',
    PIERROT_DEV_EXECUTOR_MODE: 'actions',
    PIERROT_DEV_WORK_ROOT: path.join(tmp, 'work'),
    PIERROT_DEV_SKIP_ORPHAN_CLEANUP: 'true',
    PIERROT_DEV_WORKER_TOKEN: '0'.repeat(32),
    PIERROT_DEV_API_URL: api.url,
    PIERROT_DEV_OPENCODE_PROVIDER: 'openai',
    PIERROT_DEV_OPENCODE_MODEL: 'openai/gpt-5.6',
    PIERROT_DEV_ALLOW_PROVIDER_ENV: 'true',
    DEEPSEEK_API_KEY: 'deepseek-test-secret-value-0123456789',
  });

  assert.equal(result.status, 2);
  assert.match(result.stdout, /PROVIDER_NOT_DEEPSEEK/);
  assert.equal(fs.existsSync(record), false, 'OpenCode must not start for a rejected provider');
  const actions = api.requests.map((request) => request.action);
  assert.equal(actions.includes('register'), false);
  assert.equal(
    actions.includes('claim'),
    false,
    'a rejected provider must never reach the claim RPC'
  );
});

test('Actions worker forwards the DeepSeek key to OpenCode and redacts it from logs and API payloads', async (t) => {
  const tmp = await withTempDir(t, 'pierrot-worker-key-');
  const record = path.join(tmp, 'opencode-child.json');
  writeFakeOpenCode(path.join(tmp, 'bin'), record);
  const api = await startFakeWorkerApi((body) => {
    if (body.action === 'claim') {
      return {
        claim: null,
        claimFailure: { code: 'NO_TASK', idempotent: true, reason: 'No queued task.' },
      };
    }
    return { ok: true };
  });
  t.after(() => api.server.close());

  const secret = 'deepseek-test-secret-value-9876543210';
  const result = await runNodeAsync(path.join(repoRoot, 'scripts/pierrot/dev-worker.mjs'), {
    PATH: `${path.join(tmp, 'bin')}:${process.env.PATH || ''}`,
    HOME: tmp,
    RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_NAME: 'GitHub Actions 43',
    GITHUB_RUN_ID: '4343',
    GITHUB_RUN_ATTEMPT: '1',
    PIERROT_DEV_EXECUTOR_MODE: 'actions',
    PIERROT_DEV_WORK_ROOT: path.join(tmp, 'work'),
    PIERROT_DEV_SKIP_ORPHAN_CLEANUP: 'true',
    PIERROT_DEV_WORKER_TOKEN: '0'.repeat(32),
    PIERROT_DEV_API_URL: api.url,
    PIERROT_DEV_OPENCODE_PROVIDER: 'deepseek',
    PIERROT_DEV_OPENCODE_MODEL: 'deepseek/deepseek-flash',
    PIERROT_DEV_ALLOW_PROVIDER_ENV: 'true',
    DEEPSEEK_API_KEY: secret,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No claimable task/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));

  const child = JSON.parse(fs.readFileSync(record, 'utf8'));
  assert.equal(child.keyPresent, true, 'the worker must forward DEEPSEEK_API_KEY to OpenCode');
  assert.ok(child.calls >= 2, 'the worker must probe OpenCode version/auth/models before claiming');

  const actions = api.requests.map((request) => request.action);
  assert.ok(actions.indexOf('health') >= 0);
  assert.ok(actions.indexOf('register') > actions.indexOf('health'));
  assert.ok(actions.indexOf('claim') > actions.indexOf('register'));
  assert.equal(
    api.requests.some((request) => request.raw.includes(secret)),
    false,
    'the provider key must never be sent to the worker API'
  );
});

test('preflight is a hard gate: no bypass and no claim before it succeeds', () => {
  const workflow = workflowText();
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  const preflight = workflow.slice(
    workflow.indexOf('- name: Preflight'),
    workflow.indexOf('- name: Execute task')
  );
  const execute = workflow.slice(
    workflow.indexOf('- name: Execute task'),
    workflow.indexOf('- name: Release an interrupted attempt')
  );
  assert.ok(preflight.includes('actions-preflight.mjs'));
  assert.match(preflight, /PIERROT_DEV_PREFLIGHT_RESULT:\s*\$\{\{\s*runner\.temp\s*\}\}/);
  assert.doesNotMatch(preflight, /if:\s*always\(\)/);
  assert.doesNotMatch(execute, /if:\s*always\(\)/);
  assert.doesNotMatch(execute, /continue-on-error/);
  // The run summary reports what preflight actually verified, not just env.
  assert.match(workflow, /pierrot-preflight\.json/);
  assert.match(workflow, /preflight,/);
});
