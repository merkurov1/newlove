import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOT_PHASES,
  computeReadiness,
  isAllowedWorkerBranch,
  isVersionAtLeast,
  parseOpenCodeCost,
  parseStoredAuth,
  providerFromModel,
  resolveGitIdentity,
} from '../dev-worker-lib.mjs';

test('requires OpenCode 2.1.4 or newer', () => {
  assert.equal(isVersionAtLeast('opencode v2.1.4', '2.1.4'), true);
  assert.equal(isVersionAtLeast('2.1.3', '2.1.4'), false);
  assert.equal(isVersionAtLeast('2.10.0', '2.9.9'), true);
  assert.equal(isVersionAtLeast('unknown', '2.1.4'), false);
});

test('parses only stored provider authentication', () => {
  const output = [
    'DeepSeek        DeepSeek 2                  stored',
    'DeepSeek        DEEPSEEK_API_KEY            environment',
    'GitHub Copilot  GITHUB_TOKEN                environment',
  ].join('\n');
  assert.deepEqual(parseStoredAuth(output, 'deepseek'), {
    authenticated: true,
    providers: ['deepseek'],
  });
  assert.equal(parseStoredAuth(output, 'openai').authenticated, false);
});

test('parses the real auth list format even with ANSI colour and duplicates', () => {
  const output = [
    '\u001b[32mDeepSeek\u001b[0m  DeepSeek 3                  stored',
    '\u001b[32mDeepSeek\u001b[0m  DeepSeek 2                  stored',
    '\u001b[32mDeepSeek\u001b[0m  DeepSeek                    stored',
    'GitHub Copilot  GITHUB_TOKEN                environment',
  ].join('\r\n');
  assert.deepEqual(parseStoredAuth(output, 'deepseek'), {
    authenticated: true,
    providers: ['deepseek'],
  });
});

test('a failed auth probe is reported as unverified, not as missing credentials', () => {
  const readiness = computeReadiness({
    configOk: true,
    apiOk: true,
    supabaseOk: true,
    opencodeAvailable: true,
    opencodeVersion: '2.1.4',
    minimumVersion: '2.1.4',
    authenticated: false,
    authProbeOk: false,
    authProbeError: 'timeout',
    provider: 'deepseek',
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.authOk, false);
  assert.equal(readiness.authProbeOk, false);
  const reasons = readiness.reasons.join(' ');
  assert.match(reasons, /auth store could not be read \(timeout\)/i);
  assert.doesNotMatch(reasons, /No stored deepseek authentication was found/i);
});

test('readiness fails closed and reports the actual reason', () => {
  const readiness = computeReadiness({
    configOk: true,
    apiOk: true,
    supabaseOk: true,
    opencodeAvailable: true,
    opencodeVersion: '2.1.3',
    minimumVersion: '2.1.4',
    authenticated: false,
    provider: 'deepseek',
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.versionOk, false);
  assert.equal(readiness.authOk, false);
  assert.match(readiness.reasons.join(' '), /older than the required 2\.1\.4/);
  assert.match(readiness.reasons.join(' '), /stored deepseek authentication/i);
});

test('parses actual OpenCode step_finish cost and tokens', () => {
  const output = [
    JSON.stringify({
      type: 'step_finish',
      part: {
        cost: 0.0015,
        tokens: { input: 100, output: 50, reasoning: 10, cache: { read: 20, write: 5 } },
        providerID: 'deepseek',
        modelID: 'deepseek-flash',
      },
    }),
    JSON.stringify({
      type: 'step_finish',
      part: {
        cost: 0.0005,
        tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 0, write: 0 } },
      },
    }),
    'not json',
  ].join('\n');
  const usage = parseOpenCodeCost(output);
  assert.equal(usage.steps, 2);
  assert.equal(usage.costUsd, 0.002);
  assert.equal(usage.inputTokens, 110);
  assert.equal(usage.outputTokens, 55);
  assert.equal(usage.reasoningTokens, 11);
  assert.equal(usage.cacheReadTokens, 20);
  assert.equal(usage.provider, 'deepseek');
  assert.equal(usage.model, 'deepseek-flash');
});

test('does not invent a zero cost when OpenCode reports no cost', () => {
  const usage = parseOpenCodeCost(
    JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 2 } } })
  );
  assert.equal(usage.steps, 1);
  assert.equal(usage.costUsd, null);
  assert.equal(usage.provenance, 'unavailable:opencode-did-not-report-cost');
});

test('derives the provider from the configured model', () => {
  assert.equal(providerFromModel('deepseek/deepseek-flash'), 'deepseek');
  assert.equal(providerFromModel('deepseek-flash'), null);
});

test('uses the configured GitHub identity for automatic commits', () => {
  assert.deepEqual(
    resolveGitIdentity({
      configuredName: 'Anton Merkurov',
      configuredEmail: '97518066+merkurov1@users.noreply.github.com',
    }),
    {
      name: 'Anton Merkurov',
      email: '97518066+merkurov1@users.noreply.github.com',
    }
  );
  const fallback = resolveGitIdentity({ configuredName: '', configuredEmail: '' });
  assert.equal(fallback.name, 'Anton Merkurov');
  assert.equal(fallback.email, '97518066+merkurov1@users.noreply.github.com');
});

test('automatic pushes are restricted to attempt branches', () => {
  assert.equal(
    isAllowedWorkerBranch('pierrot/dev/11111111-1111-4111-8111-111111111111/1'),
    true
  );
  assert.equal(isAllowedWorkerBranch('main'), false);
  assert.equal(isAllowedWorkerBranch('pierrot/dev/task/1'), false);
  assert.equal(isAllowedWorkerBranch('feature/x'), false);
});

test('boot telemetry exposes a closed set of phases', () => {
  for (const phase of [
    'starting',
    'checking_config',
    'checking_opencode',
    'checking_auth',
    'connecting_api',
    'api_connected',
    'registering',
    'registered',
    'ready',
    'failed',
    'stopping',
  ]) {
    assert.equal(BOOT_PHASES.includes(phase), true);
  }
});
