import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOT_PHASES,
  checkCommitIdentity,
  compareModelIdentity,
  computeReadiness,
  describeOpenCodeFailure,
  extractExecutorReport,
  isAllowedWorkerBranch,
  isOrphanExecutorProcess,
  isVersionAtLeast,
  normalizeBootPhase,
  parseOpenCodeCost,
  parseStoredAuth,
  providerFromModel,
  resolveConfiguredModel,
  resolveGitIdentity,
  verifyConfiguredModel,
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

test('extracts a report from a fenced block, plain final JSON or event text', () => {
  const report = {
    summary: 'done',
    changedFiles: ['lib/a.ts'],
    commands: [{ name: 'pnpm typecheck', status: 'passed' }],
    acceptanceCriteria: [{ criterion: 'works', status: 'satisfied', evidence: 'test' }],
  };
  const fenced = `narrative\n\`\`\`json\n${JSON.stringify(report)}\n\`\`\``;
  assert.equal(extractExecutorReport(fenced).summary, 'done');

  const plain = `narrative\n${JSON.stringify(report)}`;
  assert.equal(extractExecutorReport(plain).summary, 'done');

  const event = JSON.stringify({ type: 'text', part: { text: JSON.stringify(report) } });
  assert.equal(extractExecutorReport(event).summary, 'done');
});

test('does not mistake unrelated JSON for the executor report', () => {
  assert.equal(extractExecutorReport('{"name":"package","version":"1.0.0"}'), null);
  assert.equal(extractExecutorReport('no report here'), null);
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

test('accepts GitHub as the committer only for signed helper commits', () => {
  const expected = {
    expectedName: 'Anton Merkurov',
    expectedEmail: '97518066+merkurov1@users.noreply.github.com',
  };
  const githubCommitter = checkCommitIdentity({
    ...expected,
    authorName: expected.expectedName,
    authorEmail: expected.expectedEmail,
    committerName: 'GitHub',
    committerEmail: 'noreply@github.com',
  });
  assert.equal(githubCommitter.authorOk, true);
  assert.equal(githubCommitter.committerOk, true);
  assert.equal(githubCommitter.committerIsGitHubSigner, true);

  const sameCommitter = checkCommitIdentity({
    ...expected,
    authorName: expected.expectedName,
    authorEmail: expected.expectedEmail,
    committerName: expected.expectedName,
    committerEmail: expected.expectedEmail,
  });
  assert.equal(sameCommitter.committerOk, true);

  const wrongAuthor = checkCommitIdentity({
    ...expected,
    authorName: 'Someone Else',
    authorEmail: expected.expectedEmail,
    committerName: 'GitHub',
    committerEmail: 'noreply@github.com',
  });
  assert.equal(wrongAuthor.authorOk, false);
  assert.equal(wrongAuthor.committerOk, true);

  const wrongCommitter = checkCommitIdentity({
    ...expected,
    authorName: expected.expectedName,
    authorEmail: expected.expectedEmail,
    committerName: 'Someone Else',
    committerEmail: 'noreply@example.com',
  });
  assert.equal(wrongCommitter.committerOk, false);
});

test('automatic pushes are restricted to attempt branches', () => {
  assert.equal(isAllowedWorkerBranch('pierrot/dev/11111111-1111-4111-8111-111111111111/1'), true);
  assert.equal(isAllowedWorkerBranch('main'), false);
  assert.equal(isAllowedWorkerBranch('pierrot/dev/task/1'), false);
  assert.equal(isAllowedWorkerBranch('feature/x'), false);
});

test('detects orphaned executors left inside attempt worktrees', () => {
  const root = '/home/vscode/.pierrot-dev-work/work';
  assert.equal(
    isOrphanExecutorProcess(
      {
        cwd: `${root}/11111111-1111-4111-8111-111111111111/2`,
        cmdline: 'node /usr/local/bin/opencode run --standalone',
      },
      root
    ),
    true
  );
  assert.equal(
    isOrphanExecutorProcess(
      { cwd: `${root}/11111111-1111-4111-8111-111111111111/2`, cmdline: 'node jest --runInBand' },
      root
    ),
    true
  );
  assert.equal(
    isOrphanExecutorProcess(
      {
        cwd: `${root}/11111111-1111-4111-8111-111111111111/2`,
        cmdline: 'next-build (v16.4.6)',
      },
      root
    ),
    true
  );
  assert.equal(
    isOrphanExecutorProcess(
      {
        cwd: `${root}/11111111-1111-4111-8111-111111111111/2`,
        cmdline: 'next-server (v16.4.6)',
      },
      root
    ),
    true
  );
  assert.equal(
    isOrphanExecutorProcess(
      { cwd: '/workspaces/newlove', cmdline: 'node /usr/local/bin/opencode serve --service' },
      root
    ),
    false
  );
  assert.equal(
    isOrphanExecutorProcess(
      { cwd: `${root}/11111111-1111-4111-8111-111111111111/2`, cmdline: 'vim notes.md' },
      root
    ),
    false
  );
  assert.equal(isOrphanExecutorProcess({ cwd: '', cmdline: 'opencode' }, root), false);
});

test('boot telemetry exposes a closed set of phases', () => {
  for (const phase of [
    'starting',
    'checking_config',
    'checking_opencode',
    'checking_auth',
    'checking_provider',
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

test('provider check is an info phase, never a synthetic failure', () => {
  assert.equal(BOOT_PHASES.includes('checking_provider'), true);
  assert.equal(normalizeBootPhase('checking_provider'), 'checking_provider');
  assert.equal(normalizeBootPhase('some-new-info-phase'), 'starting');
  assert.equal(normalizeBootPhase('FAILED'), 'failed');
  assert.equal(normalizeBootPhase(undefined), 'starting');
});

test('configured model identity is resolved from the shared registry and env', () => {
  const defaults = resolveConfiguredModel({});
  assert.equal(defaults.ok, true);
  assert.equal(defaults.provider, 'deepseek');
  assert.equal(defaults.model, 'deepseek/deepseek-flash');
  assert.equal(defaults.providerEnvName, 'DEEPSEEK_API_KEY');
  assert.equal(defaults.source, 'registry');

  const override = resolveConfiguredModel({
    PIERROT_DEV_OPENCODE_PROVIDER: 'deepseek',
    PIERROT_DEV_OPENCODE_MODEL: 'deepseek/deepseek-chat',
  });
  assert.equal(override.ok, true);
  assert.equal(override.model, 'deepseek/deepseek-chat');
  assert.equal(override.source, 'environment');
});

test('a provider/model mismatch is a hard configuration error', () => {
  const mismatch = resolveConfiguredModel({
    PIERROT_DEV_OPENCODE_PROVIDER: 'openrouter',
    PIERROT_DEV_OPENCODE_MODEL: 'deepseek/deepseek-flash',
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.errorCode, 'MODEL_PROVIDER_MISMATCH');
  assert.match(mismatch.errorMessage, /same provider/);

  const invalid = resolveConfiguredModel({ PIERROT_DEV_OPENCODE_MODEL: 'deepseek-flash' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errorCode, 'MODEL_ID_INVALID');
});

test('the model health check uses the same configured id the worker invokes', () => {
  const config = resolveConfiguredModel({
    PIERROT_DEV_OPENCODE_MODEL: 'deepseek/deepseek-flash',
  });
  const pass = verifyConfiguredModel({
    config,
    modelsStdout: 'deepseek/deepseek-chat\ndeepseek/deepseek-flash\n',
  });
  assert.equal(pass.ok, true);

  const fail = verifyConfiguredModel({
    config,
    modelsStdout: 'deepseek/deepseek-chat\nopenai/gpt-5\n',
  });
  assert.equal(fail.ok, false);
  assert.equal(fail.code, 'MODEL_UNAVAILABLE');
  assert.match(fail.message, /deepseek\/deepseek-chat/);
  assert.match(fail.message, /No fallback model/);
});

test('reported model identity is compared without inventing aliases', () => {
  assert.equal(
    compareModelIdentity({
      configuredModel: 'deepseek/deepseek-flash',
      reportedModel: 'deepseek-flash',
    }).verdict,
    'match'
  );
  assert.equal(
    compareModelIdentity({
      configuredModel: 'deepseek/deepseek-flash',
      reportedModel: 'deepseek/deepseek-chat',
    }).verdict,
    'mismatch'
  );
  assert.equal(
    compareModelIdentity({
      configuredModel: 'deepseek/deepseek-flash',
      reportedModel: null,
    }).verdict,
    'unreported'
  );
});

test('OpenCode failures get actionable categories without changing model', () => {
  assert.equal(describeOpenCodeFailure({ exitCode: 1 }).code, 'OPENCODE_FAILED');
  assert.equal(
    describeOpenCodeFailure({ exitCode: 1, stderr: 'Error 429: rate limit exceeded' }).code,
    'OPENCODE_RATE_LIMITED'
  );
  assert.equal(
    describeOpenCodeFailure({ exitCode: 1, stderr: 'invalid api key' }).code,
    'OPENCODE_AUTH_FAILED'
  );
  assert.equal(describeOpenCodeFailure({ exitCode: 1, timedOut: true }).code, 'EXECUTION_TIMEOUT');
  assert.equal(
    describeOpenCodeFailure({ exitCode: 130, signal: 'SIGINT' }).code,
    'OPENCODE_INTERRUPTED'
  );
  assert.equal(
    describeOpenCodeFailure({ exitCode: 1, stderr: 'maximum context length exceeded' }).code,
    'OPENCODE_CONTEXT_LIMIT'
  );
});
