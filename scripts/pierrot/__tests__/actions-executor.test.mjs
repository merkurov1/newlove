import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTIONS_EXIT,
  actionsExitCode,
  assertHostedActionsRunner,
  buildExecutionId,
  isClaimForRequestedTask,
  isVersionAtLeast,
  parseStoredAuth,
  resolveCommitPolicy,
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

test('single-shot exit codes distinguish no task and permanent setup errors', () => {
  assert.equal(actionsExitCode({ ok: true }), ACTIONS_EXIT.success);
  assert.equal(actionsExitCode({ permanent: true, claimed: false }), ACTIONS_EXIT.permanent);
  assert.equal(actionsExitCode({ claimed: false }), ACTIONS_EXIT.noTask);
  assert.equal(actionsExitCode({ claimed: true }), ACTIONS_EXIT.executionFailed);
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
  assert.doesNotMatch(workflow, /DEEPSEEK_API_KEY\s*[:=]\s*['"]?sk-/i);
  assert.doesNotMatch(workflow, /sk-[A-Za-z0-9]{12,}/);
  // The runner cannot merge or deploy; those remain owner-only server actions.
  assert.doesNotMatch(workflow, /\bgh\s+pr\s+merge\b/i);
  assert.doesNotMatch(workflow, /\bvercel\s+--prod\b/i);
  assert.doesNotMatch(workflow, /\bsupabase\s+db\s+push\b/i);
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

test('executor configuration pins the documented DeepSeek model', () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'opencode.json'), 'utf8'));
  assert.equal(config.model, 'deepseek/deepseek-flash');
  assert.match(workflowText(), /PIERROT_DEV_OPENCODE_MODEL:\s*deepseek\/deepseek-flash/);
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
  assert.match(worker, /ACTIONS_EXIT\.noTask/);
  assert.doesNotMatch(worker, /sk-[A-Za-z0-9]{12,}/);
});

test('DeepSeek preflight failures have separate non-secret diagnostics', () => {
  const preflight = fs.readFileSync(
    path.join(repoRoot, 'scripts/pierrot/actions-preflight.mjs'),
    'utf8'
  );
  for (const code of [
    'WORKER_TOKEN_MISSING',
    'PROVIDER_KEY_MISSING',
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
  assert.match(preflight, /::error title=Pierrot preflight/);
  assert.doesNotMatch(preflight, /sk-[A-Za-z0-9]{12,}/);
});
