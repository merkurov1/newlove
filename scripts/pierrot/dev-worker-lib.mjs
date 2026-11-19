/**
 * Pure helpers for the Pierrot Dev worker. Kept separate from the worker entry
 * point so readiness, version comparison and OpenCode cost parsing can be
 * tested without starting the polling loop.
 */

export function parseVersion(value) {
  const match = String(value || '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionAtLeast(actual, minimum) {
  const a = parseVersion(actual);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

export function providerFromModel(model) {
  const value = String(model || '').trim();
  if (!value || !value.includes('/')) return null;
  return value.split('/')[0].trim().toLowerCase() || null;
}

/**
 * OpenCode `--format json` emits step_finish events with the provider-reported
 * cost and token counts. Only those events are trusted as actual usage.
 */
export function parseOpenCodeCost(output) {
  const result = {
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    costUsd: null,
    steps: 0,
    provenance: 'unavailable:opencode-did-not-report-cost',
  };
  const text = String(output || '');
  if (!text) return result;

  let costSum = 0;
  let costSeen = false;
  let tokensSeen = false;
  const add = (current, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return current;
    return (current ?? 0) + value;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const type = String(event?.type || '')
      .toLowerCase()
      .replace(/-/g, '_');
    if (type !== 'step_finish') continue;
    const part = event.part && typeof event.part === 'object' ? event.part : event;
    result.steps += 1;

    if (typeof part.cost === 'number' && Number.isFinite(part.cost)) {
      costSeen = true;
      costSum += part.cost;
    }
    const tokens = part.tokens && typeof part.tokens === 'object' ? part.tokens : null;
    if (tokens) {
      tokensSeen = true;
      result.inputTokens = add(result.inputTokens, tokens.input);
      result.outputTokens = add(result.outputTokens, tokens.output);
      result.reasoningTokens = add(result.reasoningTokens, tokens.reasoning);
      if (tokens.cache && typeof tokens.cache === 'object') {
        result.cacheReadTokens = add(result.cacheReadTokens, tokens.cache.read);
        result.cacheWriteTokens = add(result.cacheWriteTokens, tokens.cache.write);
      }
    }
    if (!result.provider) {
      const provider =
        part.providerID || part.providerId || part.provider || event.providerID || event.provider;
      if (typeof provider === 'string' && provider.trim()) {
        result.provider = provider.trim().slice(0, 80);
      }
    }
    if (!result.model) {
      const model = part.modelID || part.modelId || part.model || event.modelID || event.model;
      if (typeof model === 'string' && model.trim()) {
        result.model = model.trim().slice(0, 120);
      }
    }
  }

  if (costSeen) {
    result.costUsd = Math.round(costSum * 1e9) / 1e9;
    result.provenance = 'opencode-step-finish';
  } else if (tokensSeen) {
    result.provenance = 'unavailable:opencode-did-not-report-cost';
  }
  return result;
}

/**
 * Parse `opencode auth list`. Environment credentials are intentionally not
 * accepted: the worker requires a stored login so no provider secret has to be
 * forwarded through the process environment.
 *
 * The real 2.1.x output is tabular:
 *   DeepSeek  DeepSeek 3                  stored
 *   DeepSeek  DeepSeek                    environment
 * Only `stored` rows count. Take the first plain token (the provider column)
 * and ignore ANSI decoration so a colourised terminal cannot produce a false
 * "auth missing" result.
 */
export function parseStoredAuth(output, expectedProvider) {
  const text = String(output || '').replace(/\x1b\[[0-9;]*m/g, '');
  const providers = [];
  for (const line of text.split('\n')) {
    if (!/\bstored\b/i.test(line)) continue;
    const name = line
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/^[^\w.-]+|[^\w.-]+$/g, ''))
      .find((token) => /^[a-z0-9][a-z0-9._-]*$/i.test(token));
    if (name) providers.push(name.toLowerCase());
  }
  const unique = [...new Set(providers)];
  const wanted = String(expectedProvider || '')
    .trim()
    .toLowerCase();
  const matched = wanted
    ? unique.some((provider) => provider.includes(wanted) || wanted.includes(provider))
    : unique.length > 0;
  return {
    authenticated: matched,
    providers: unique,
  };
}

export function computeReadiness(input) {
  const minimumVersion = String(input.minimumVersion || '2.1.4');
  const versionOk = Boolean(
    input.opencodeAvailable && isVersionAtLeast(input.opencodeVersion, minimumVersion)
  );
  const opencodeOk = Boolean(input.opencodeAvailable && versionOk);
  const authOk = input.authenticated === true;
  // A failed probe is not proof that credentials are missing. Keep it distinct
  // so Admin reports a transient store read error instead of sending the owner
  // to re-check GitHub Secrets.
  const authProbeOk = input.authProbeOk !== false;
  const reasons = [];
  if (!input.configOk) reasons.push('Worker configuration is incomplete.');
  if (!input.apiOk) reasons.push('Pierrot worker API is unreachable.');
  if (!input.supabaseOk) reasons.push('Supabase is unreachable through the worker API.');
  if (!input.opencodeAvailable) reasons.push('OpenCode CLI is missing.');
  else if (!versionOk) {
    reasons.push(
      `OpenCode ${input.opencodeVersion || 'unknown'} is older than the required ${minimumVersion}.`
    );
  }
  if (!authOk) {
    reasons.push(
      authProbeOk
        ? `No stored ${input.provider || 'provider'} authentication was found (run opencode auth login).`
        : `The OpenCode auth store could not be read (${input.authProbeError || 'probe failed'}); authentication is unverified, not necessarily absent. This is not a GitHub Secrets check.`
    );
  }
  return {
    ready: reasons.length === 0,
    configOk: Boolean(input.configOk),
    apiOk: Boolean(input.apiOk),
    supabaseOk: Boolean(input.supabaseOk),
    opencodeOk,
    versionOk,
    authOk,
    authProbeOk,
    minimumVersion,
    provider: input.provider || null,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Automatic commits must use the Codespace's configured GitHub identity when
 * it exists. A made-up address breaks Codespaces GPG signing with
 * "403 Author is invalid". The fallback is the repository owner's verified
 * GitHub noreply address, not an invented mailbox.
 */
export const DEFAULT_WORKER_GIT_NAME = 'Anton Merkurov';
export const DEFAULT_WORKER_GIT_EMAIL = '97518066+merkurov1@users.noreply.github.com';

export function resolveGitIdentity(input = {}) {
  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  const name =
    clean(input.configuredName) ||
    clean(input.envName) ||
    clean(input.fallbackName) ||
    DEFAULT_WORKER_GIT_NAME;
  const email =
    clean(input.configuredEmail) ||
    clean(input.envEmail) ||
    clean(input.fallbackEmail) ||
    DEFAULT_WORKER_GIT_EMAIL;
  return {
    name: name.slice(0, 120),
    email: email.slice(0, 200),
  };
}

/** Automatic pushes are only allowed to per-attempt branches. */
export function isAllowedWorkerBranch(branch) {
  const value = String(branch || '').trim();
  if (!value || value === 'main' || value === 'master') return false;
  return /^pierrot\/dev\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d+$/i.test(
    value
  );
}

/**
 * GitHub's GPG signing helper legitimately rewrites the committer to
 * `GitHub <noreply@github.com>` while keeping the requested author. Requiring
 * the committer to equal the author therefore rejected valid signed commits.
 * The author must always match the configured identity; the committer may be
 * either that identity or GitHub's signing service.
 */
export function checkCommitIdentity(input) {
  const expectedName = String(input?.expectedName || '').trim();
  const expectedEmail = String(input?.expectedEmail || '').trim();
  const authorName = String(input?.authorName || '').trim();
  const authorEmail = String(input?.authorEmail || '').trim();
  const committerName = String(input?.committerName || '').trim();
  const committerEmail = String(input?.committerEmail || '').trim();
  const authorOk =
    Boolean(expectedName) &&
    Boolean(expectedEmail) &&
    authorName === expectedName &&
    authorEmail === expectedEmail;
  const committerIsExpected = committerName === expectedName && committerEmail === expectedEmail;
  const committerIsGitHubSigner =
    /^github$/i.test(committerName) && /^noreply@github\.com$/i.test(committerEmail);
  return {
    authorOk,
    committerOk: committerIsExpected || committerIsGitHubSigner,
    committerIsGitHubSigner,
  };
}

/**
 * A process is an orphaned executor when it still runs inside a per-attempt
 * worktree after the owning attempt has been released. The worker itself runs
 * from the primary repository checkout, so only worktree cwds are considered.
 * This is intentionally limited to known executor/test commands: it must not
 * kill an unrelated process that merely happens to keep a worktree as cwd.
 */
export function isOrphanExecutorProcess(entry, workRoot) {
  const cwd = String(entry?.cwd || '');
  const cmdline = String(entry?.cmdline || '');
  const root = String(workRoot || '').replace(/\/+$/, '');
  if (!root || !cwd.startsWith(`${root}/`)) return false;
  if (/\bopencode(?:\.exe)?\b/i.test(cmdline)) return true;
  return /\b(?:jest|vitest|playwright|next-build|next-server|next\s+build|tsc)\b/i.test(cmdline);
}

/**
 * Commit signing policy.
 *
 * Codespaces keep the strict rule: every automatic commit must be GPG signed.
 * An ephemeral GitHub Actions runner has no `gh-gpgsign` helper and must opt in
 * explicitly before an unsigned commit is allowed. With neither a signing key
 * nor the explicit override the runner refuses to push, so an unsigned commit
 * is never produced silently.
 */
export function resolveCommitPolicy(input = {}) {
  if (input.hasSigningKey === true) return 'gpg';
  if (input.actionsMode === true) return input.allowUnsigned === true ? 'unsigned' : 'refuse';
  return 'gpg';
}

/** Unique execution id for one runner. The attempt UUID remains the lock id. */
export function buildExecutionId(input = {}) {
  const clean = (value) => (typeof value === 'string' ? value.trim() : '');
  const runId = clean(input.runId);
  const runAttempt = clean(input.runAttempt) || '1';
  if (runId) return `gha:${runId}:${runAttempt}`.slice(0, 160);
  const fallback = clean(input.fallback);
  return (fallback || `local:${Date.now()}`).slice(0, 160);
}

/**
 * Bounded, explicit exit codes for the single-shot Actions executor.
 * GitHub treats every non-zero code as a failed job; the distinction is for
 * the runbook and for the runner's own summary, not for automatic retries.
 */
export const ACTIONS_EXIT = Object.freeze({
  success: 0,
  permanent: 2,
  noTask: 3,
  executionFailed: 4,
});

export function actionsExitCode(input = {}) {
  if (input.ok === true) return ACTIONS_EXIT.success;
  if (input.permanent === true) return ACTIONS_EXIT.permanent;
  if (input.claimed === false) return ACTIONS_EXIT.noTask;
  return ACTIONS_EXIT.executionFailed;
}

/** A claim may only execute the task that was explicitly requested. */
export function isClaimForRequestedTask(claim, requestedTaskId) {
  const requested = String(requestedTaskId || '')
    .trim()
    .toLowerCase();
  if (!requested) return true;
  const actual = String(claim?.task?.id || '')
    .trim()
    .toLowerCase();
  return actual === requested;
}

/** Stable boot phases surfaced through the worker API and Admin. */
export const BOOT_PHASES = Object.freeze([
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
]);
