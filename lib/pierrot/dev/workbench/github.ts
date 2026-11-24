import { assertServerOnly } from '@/lib/serverOnly';
import { Octokit } from '@octokit/rest';
import { getGitHubToken } from '@/lib/github';
import { getDevRepositoryConfig, isDevRepositoryKey } from '../repositories';
import type { DevRepositoryKey } from '../types';
import type { DevDeploymentStatus } from './types';

assertServerOnly('lib/pierrot/dev/workbench/github');

const REQUEST_TIMEOUT_MS = Number(process.env.PIERROT_DEV_GITHUB_TIMEOUT_MS || 15_000);
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_RETRY_MAX_DELAY_MS = 8_000;
const DEFAULT_RETRY_MAX_TOTAL_MS = 20_000;
const MAX_JITTER_MS = 250;

export type GitHubApiOperation = {
  endpoint: string;
  requiredPermission: string;
  fallbackCode?: string;
};

export type GitHubRateLimitInfo = {
  remaining: number | null;
  limit: number | null;
  resetAt: string | null;
  retryAfterMs: number | null;
  retryAt: string | null;
};

export type WorkbenchGitHubErrorOptions = {
  endpoint?: string | null;
  requiredPermission?: string | null;
  retryAfterMs?: number | null;
  retryAt?: string | null;
  resetAt?: string | null;
  remaining?: number | null;
  limit?: number | null;
  requestId?: string | null;
  rateLimited?: boolean;
  permissionDenied?: boolean;
};

export class WorkbenchGitHubError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly endpoint: string | null;
  readonly requiredPermission: string | null;
  readonly retryAfterMs: number | null;
  readonly retryAt: string | null;
  readonly resetAt: string | null;
  readonly remaining: number | null;
  readonly limit: number | null;
  readonly requestId: string | null;
  readonly rateLimited: boolean;
  readonly permissionDenied: boolean;

  constructor(
    code: string,
    message: string,
    status: number | null = null,
    options: WorkbenchGitHubErrorOptions = {}
  ) {
    super(message);
    this.name = 'WorkbenchGitHubError';
    this.code = code;
    this.status = status;
    this.endpoint = options.endpoint ?? null;
    this.requiredPermission = options.requiredPermission ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.retryAt = options.retryAt ?? null;
    this.resetAt = options.resetAt ?? null;
    this.remaining = options.remaining ?? null;
    this.limit = options.limit ?? null;
    this.requestId = options.requestId ?? null;
    this.rateLimited = options.rateLimited ?? code === 'GITHUB_RATE_LIMITED';
    this.permissionDenied =
      options.permissionDenied ??
      (code === 'GITHUB_PERMISSION_DENIED' || code === 'GITHUB_AUTH_FAILED');
  }
}

export type GitHubRetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxTotalWaitMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
};

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), min), max);
}

export function getGitHubRetryOptions(
  overrides: Partial<GitHubRetryOptions> = {}
): GitHubRetryOptions {
  return {
    maxAttempts:
      overrides.maxAttempts ??
      envNumber('PIERROT_DEV_GITHUB_MAX_ATTEMPTS', DEFAULT_RETRY_ATTEMPTS, 1, 5),
    baseDelayMs:
      overrides.baseDelayMs ??
      envNumber('PIERROT_DEV_GITHUB_RETRY_BASE_MS', DEFAULT_RETRY_BASE_MS, 0, 30_000),
    maxDelayMs:
      overrides.maxDelayMs ??
      envNumber('PIERROT_DEV_GITHUB_RETRY_MAX_DELAY_MS', DEFAULT_RETRY_MAX_DELAY_MS, 0, 60_000),
    maxTotalWaitMs:
      overrides.maxTotalWaitMs ??
      envNumber('PIERROT_DEV_GITHUB_RETRY_MAX_TOTAL_MS', DEFAULT_RETRY_MAX_TOTAL_MS, 0, 120_000),
    sleep: overrides.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    now: overrides.now ?? (() => Date.now()),
    random: overrides.random ?? Math.random,
  };
}

let cached: { token: string; client: Octokit } | null = null;

function client(): Octokit {
  const token = getGitHubToken();
  if (!token) {
    throw new WorkbenchGitHubError(
      'GITHUB_TOKEN_MISSING',
      'GITHUB_TOKEN is not configured on the server.'
    );
  }
  if (cached?.token === token) return cached.client;
  const instance = new Octokit({
    auth: token,
    userAgent: 'pierrot-dev-workbench/1.0',
    request: { timeout: REQUEST_TIMEOUT_MS },
  });
  cached = { token, client: instance };
  return instance;
}

function statusOf(error: unknown): number | null {
  if (error && typeof error === 'object') {
    const direct = (error as { status?: unknown }).status;
    if (typeof direct === 'number') return direct;
    const response = (error as { response?: { status?: unknown } }).response;
    if (response && typeof response.status === 'number') return response.status;
  }
  return null;
}

function headersOf(error: unknown): unknown {
  if (!error || typeof error !== 'object') return null;
  const response = (error as { response?: { headers?: unknown } }).response;
  if (response?.headers) return response.headers;
  const headers = (error as { headers?: unknown }).headers;
  return headers || null;
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const wanted = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== wanted) continue;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.map((item) => String(item)).join(', ');
    if (raw !== null && raw !== undefined) return String(raw);
  }
  return null;
}

function numberHeader(headers: unknown, name: string): number | null {
  const raw = headerValue(headers, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseRetryAfterMs(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.trunc(seconds * 1000));
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return null;
}

function isoFromEpochSeconds(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const ms = value * 1000;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function readGitHubRateLimitInfo(headers: unknown, now = Date.now()): GitHubRateLimitInfo {
  const remaining = numberHeader(headers, 'x-ratelimit-remaining');
  const limit = numberHeader(headers, 'x-ratelimit-limit');
  const resetAt = isoFromEpochSeconds(numberHeader(headers, 'x-ratelimit-reset'));
  const retryAfterMs = parseRetryAfterMs(headerValue(headers, 'retry-after'), now);
  const resetMs = resetAt ? Date.parse(resetAt) : Number.NaN;
  const retryCandidates = [
    retryAfterMs,
    Number.isFinite(resetMs) ? Math.max(0, resetMs - now) : null,
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  const retryMs = retryCandidates.length > 0 ? Math.max(...retryCandidates) : null;
  return {
    remaining,
    limit,
    resetAt,
    retryAfterMs,
    retryAt: retryMs === null ? null : new Date(now + retryMs).toISOString(),
  };
}

function messageOf(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const response = (error as { response?: { data?: { message?: unknown } } }).response;
  const responseMessage = response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage.trim().slice(0, 500);
  }
  return error instanceof Error ? error.message.slice(0, 500) : '';
}

function isRateLimited(
  status: number | null,
  message: string,
  headers: unknown,
  rate: GitHubRateLimitInfo
): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  if (rate.remaining !== null && rate.remaining <= 0) return true;
  if (rate.retryAfterMs !== null) return true;
  return /rate limit|secondary rate|abuse detection|too many requests/i.test(message);
}

function toError(
  error: unknown,
  operation: GitHubApiOperation,
  fallbackCode = operation.fallbackCode || 'GITHUB_API_ERROR'
): WorkbenchGitHubError {
  if (error instanceof WorkbenchGitHubError) return error;
  const status = statusOf(error);
  const headers = headersOf(error);
  const bodyMessage = messageOf(error);
  const rate = readGitHubRateLimitInfo(headers, Date.now());
  const accepted = headerValue(headers, 'x-accepted-github-permissions');
  const requiredPermission = (accepted || operation.requiredPermission).slice(0, 300);
  const requestId = headerValue(headers, 'x-github-request-id');
  const rateLimited = isRateLimited(status, bodyMessage, headers, rate);
  let code = fallbackCode;
  let message: string;

  if (status === 401) {
    code = 'GITHUB_AUTH_FAILED';
    message = `GitHub rejected the token (401) for ${operation.endpoint}. Re-authenticate GITHUB_TOKEN before retrying.`;
  } else if (rateLimited) {
    code = 'GITHUB_RATE_LIMITED';
    const when = rate.retryAt
      ? ` Retry after ${rate.retryAt}.`
      : ' Retry after the rate-limit window resets.';
    message = `GitHub rate limit reached for ${operation.endpoint} (${status ?? 403}).${when} Remaining: ${
      rate.remaining ?? 'unknown'
    }/${rate.limit ?? 'unknown'}.`;
  } else if (status === 403) {
    code = 'GITHUB_PERMISSION_DENIED';
    message = `GitHub denied ${operation.endpoint} (403). Required permission: ${requiredPermission}.${
      bodyMessage ? ` GitHub says: ${bodyMessage}.` : ''
    } Automatic retries are disabled until the token is updated.`;
  } else if (status === 404) {
    code = 'GITHUB_NOT_FOUND';
    message = `GitHub did not find ${operation.endpoint} (404). Verify the repository and ${requiredPermission}.`;
  } else if (status === 422) {
    code = 'GITHUB_INVALID_REQUEST';
    message = `GitHub rejected ${operation.endpoint} (422).${bodyMessage ? ` ${bodyMessage}.` : ''}`;
  } else {
    message =
      bodyMessage ||
      (error instanceof Error
        ? error.message.slice(0, 500)
        : `GitHub request to ${operation.endpoint} failed.`);
  }

  return new WorkbenchGitHubError(code, message, status, {
    endpoint: operation.endpoint,
    requiredPermission,
    retryAfterMs: rate.retryAfterMs,
    retryAt: rate.retryAt,
    resetAt: rate.resetAt,
    remaining: rate.remaining,
    limit: rate.limit,
    requestId,
    rateLimited,
    permissionDenied: code === 'GITHUB_PERMISSION_DENIED' || code === 'GITHUB_AUTH_FAILED',
  });
}

/**
 * Compute the wait before a rate-limit retry. An explicit Retry-After or
 * X-RateLimit-Reset is always honoured. When it is farther away than the
 * configured cap, return null: the caller reports the reset time instead of
 * holding the request open.
 */
export function githubRetryDelayMs(
  error: WorkbenchGitHubError,
  attempt: number,
  options: GitHubRetryOptions
): number | null {
  const now = options.now();
  const resetMs = error.resetAt ? Date.parse(error.resetAt) : Number.NaN;
  const explicit = Math.max(
    error.retryAfterMs ?? 0,
    Number.isFinite(resetMs) ? Math.max(0, resetMs - now) : 0
  );
  if (explicit > options.maxDelayMs) return null;

  const exponential = Math.min(
    options.maxDelayMs,
    Math.max(0, options.baseDelayMs) * 2 ** Math.max(0, attempt)
  );
  const base = explicit > 0 ? explicit : exponential;
  const jitter = Math.max(0, Math.floor(options.random() * MAX_JITTER_MS));
  const delay = Math.min(options.maxDelayMs, base + (base > 0 ? jitter : 0));
  return Math.max(0, delay);
}

/** Run one GitHub call with bounded, jittered retries for rate-limit responses. */
export async function requestGitHubWithRetry<T>(
  operation: GitHubApiOperation,
  request: () => Promise<T>,
  overrides: Partial<GitHubRetryOptions> = {}
): Promise<T> {
  const options = getGitHubRetryOptions(overrides);
  let waitedMs = 0;
  let lastError: WorkbenchGitHubError | null = null;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const normalized = toError(error, operation);
      lastError = normalized;
      if (!normalized.rateLimited) throw normalized;
      if (attempt + 1 >= options.maxAttempts) throw normalized;
      const delay = githubRetryDelayMs(normalized, attempt, options);
      if (delay === null) throw normalized;
      if (waitedMs + delay > options.maxTotalWaitMs) throw normalized;
      await options.sleep(delay);
      waitedMs += delay;
    }
  }

  throw (
    lastError ||
    new WorkbenchGitHubError(
      'GITHUB_RATE_LIMITED',
      `GitHub rate limit persisted for ${operation.endpoint}.`,
      null,
      { endpoint: operation.endpoint, requiredPermission: operation.requiredPermission }
    )
  );
}

function repoKey(value: unknown): DevRepositoryKey {
  if (isDevRepositoryKey(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized.includes('pierrot')) return 'pierrot';
  }
  return 'newlove';
}

function safeBranch(value: unknown): string {
  const branch = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9._\-/]{1,200}$/.test(branch) || branch.includes('..')) {
    throw new WorkbenchGitHubError('GITHUB_INVALID_BRANCH', 'Invalid branch name.');
  }
  return branch;
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

const OPERATIONS = {
  listPullRequests: {
    endpoint: 'GET /repos/{owner}/{repo}/pulls',
    requiredPermission: 'Pull requests: read',
    fallbackCode: 'GITHUB_PR_LIST_FAILED',
  },
  getPullRequest: {
    endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
    requiredPermission: 'Pull requests: read',
    fallbackCode: 'GITHUB_PR_STATUS_FAILED',
  },
  listPullRequestFiles: {
    endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
    requiredPermission: 'Pull requests: read',
    fallbackCode: 'GITHUB_PR_FILES_FAILED',
  },
  createPullRequest: {
    endpoint: 'POST /repos/{owner}/{repo}/pulls',
    requiredPermission: 'Pull requests: write',
    fallbackCode: 'GITHUB_PR_CREATE_FAILED',
  },
  listCheckRuns: {
    endpoint: 'GET /repos/{owner}/{repo}/commits/{ref}/check-runs',
    requiredPermission: 'Checks: read',
    fallbackCode: 'GITHUB_CHECKS_FAILED',
  },
  combinedStatus: {
    endpoint: 'GET /repos/{owner}/{repo}/commits/{ref}/status',
    requiredPermission: 'Commit statuses: read',
    fallbackCode: 'GITHUB_CHECKS_FAILED',
  },
  getBranch: {
    endpoint: 'GET /repos/{owner}/{repo}/branches/{branch}',
    requiredPermission: 'Contents: read',
    fallbackCode: 'GITHUB_BRANCH_READ_FAILED',
  },
  compareCommits: {
    endpoint: 'GET /repos/{owner}/{repo}/compare/{basehead}',
    requiredPermission: 'Contents: read',
    fallbackCode: 'GITHUB_COMPARE_FAILED',
  },
  mergePullRequest: {
    endpoint: 'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
    requiredPermission: 'Contents: write',
    fallbackCode: 'GITHUB_MERGE_FAILED',
  },
  mergeBranch: {
    endpoint: 'POST /repos/{owner}/{repo}/merges',
    requiredPermission: 'Contents: write',
    fallbackCode: 'GITHUB_BRANCH_MERGE_FAILED',
  },
  updatePullRequest: {
    endpoint: 'PATCH /repos/{owner}/{repo}/pulls/{pull_number}',
    requiredPermission: 'Pull requests: write',
    fallbackCode: 'GITHUB_PR_UPDATE_FAILED',
  },
  commentPullRequest: {
    endpoint: 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
    requiredPermission: 'Pull requests: write',
    fallbackCode: 'GITHUB_PR_COMMENT_FAILED',
  },
  getRepository: {
    endpoint: 'GET /repos/{owner}/{repo}',
    requiredPermission: 'Metadata: read',
    fallbackCode: 'GITHUB_REPOSITORY_READ_FAILED',
  },
  rateLimit: {
    endpoint: 'GET /rate_limit',
    requiredPermission: 'Metadata: read',
    fallbackCode: 'GITHUB_RATE_LIMIT_READ_FAILED',
  },
  listCodespaces: {
    endpoint: 'GET /user/codespaces',
    requiredPermission: 'Codespaces: read',
    fallbackCode: 'CODESPACE_LIST_FAILED',
  },
  getCodespace: {
    endpoint: 'GET /user/codespaces/{codespace_name}',
    requiredPermission: 'Codespaces: read',
    fallbackCode: 'CODESPACE_READ_FAILED',
  },
  startCodespace: {
    endpoint: 'POST /user/codespaces/{codespace_name}/start',
    requiredPermission: 'Codespaces: write',
    fallbackCode: 'CODESPACE_START_FAILED',
  },
  stopCodespace: {
    endpoint: 'POST /user/codespaces/{codespace_name}/stop',
    requiredPermission: 'Codespaces: write',
    fallbackCode: 'CODESPACE_STOP_FAILED',
  },
  createCodespace: {
    endpoint: 'POST /repos/{owner}/{repo}/codespaces',
    requiredPermission: 'Codespaces: write',
    fallbackCode: 'CODESPACE_CREATE_FAILED',
  },
  dispatchTask: {
    endpoint: 'POST /repos/{owner}/{repo}/dispatches',
    requiredPermission: 'Contents: write',
    fallbackCode: 'ACTIONS_DISPATCH_FAILED',
  },
} satisfies Record<string, GitHubApiOperation>;

/**
 * Send a repository_dispatch event to the Actions executor.
 *
 * The GitHub API returns 204 with no run id. Callers must record the request as
 * "dispatched" only after this call succeeds and must treat a thrown error as an
 * execution failure, never as a successful launch.
 */
export async function dispatchRepositoryEvent(input: {
  repository: DevRepositoryKey | string;
  eventType: string;
  clientPayload: Record<string, unknown>;
}): Promise<void> {
  const config = getDevRepositoryConfig(repoKey(input.repository));
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.eventType)) {
    throw new WorkbenchGitHubError('GITHUB_INVALID_REQUEST', 'Invalid repository event type.');
  }
  await requestGitHubWithRetry(OPERATIONS.dispatchTask, () =>
    client().rest.repos.createDispatchEvent({
      owner: config.owner,
      repo: config.repo,
      event_type: input.eventType,
      client_payload: input.clientPayload,
    })
  );
}

export async function createPullRequestForAttempt(input: {
  repository: DevRepositoryKey | string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<{ number: number; url: string; state: string }> {
  const config = getDevRepositoryConfig(repoKey(input.repository));
  const head = safeBranch(input.head);
  const base = safeBranch(input.base || config.defaultBranch);

  if (head === config.defaultBranch) {
    throw new WorkbenchGitHubError(
      'GITHUB_DEFAULT_BRANCH_PROTECTED',
      'The working branch must differ from the default branch.'
    );
  }
  if (base !== config.defaultBranch) {
    throw new WorkbenchGitHubError(
      'GITHUB_INVALID_BASE',
      `Pull requests must target ${config.defaultBranch}.`
    );
  }
  if (head === base) {
    throw new WorkbenchGitHubError('GITHUB_INVALID_BRANCH', 'Head and base must differ.');
  }

  try {
    const response = await requestGitHubWithRetry(OPERATIONS.createPullRequest, () =>
      client().rest.pulls.create({
        owner: config.owner,
        repo: config.repo,
        head,
        base,
        title: input.title.slice(0, 240),
        body: input.body.slice(0, 20_000),
        draft: false,
      })
    );
    return {
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
    };
  } catch (error) {
    // An existing PR for the same head is not a failure.
    if (statusOf(error) === 422) {
      const existing = await findPullRequestForBranch(config.key, head);
      if (existing) return existing;
    }
    throw toError(error, OPERATIONS.createPullRequest);
  }
}

export async function findPullRequestForBranch(
  repository: DevRepositoryKey | string,
  head: string
): Promise<{ number: number; url: string; state: string } | null> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const response = await requestGitHubWithRetry(OPERATIONS.listPullRequests, () =>
      client().rest.pulls.list({
        owner: config.owner,
        repo: config.repo,
        head: `${config.owner}:${safeBranch(head)}`,
        state: 'open',
        per_page: 1,
      })
    );
    const pr = response.data[0];
    if (!pr) return null;
    return { number: pr.number, url: pr.html_url, state: pr.state };
  } catch {
    return null;
  }
}

export async function getPullRequestStatus(
  repository: DevRepositoryKey | string,
  number: number
): Promise<{
  number: number;
  url: string;
  state: string;
  merged: boolean;
  mergeable: boolean | null;
  mergeableState: string | null;
  headSha: string;
  /** Exact merge commit reported by GitHub (null until merged). */
  mergeCommitSha: string | null;
  mergedAt: string | null;
  /** Exact head branch and base branch/SHA observed on the PR. */
  headBranch: string;
  baseBranch: string;
  baseSha: string;
  createdAt: string | null;
  updatedAt: string | null;
} | null> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const response = await requestGitHubWithRetry(OPERATIONS.getPullRequest, () =>
      client().rest.pulls.get({
        owner: config.owner,
        repo: config.repo,
        pull_number: number,
      })
    );
    return {
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
      merged: Boolean(response.data.merged),
      mergeable: response.data.mergeable ?? null,
      mergeableState: response.data.mergeable_state ?? null,
      headSha: response.data.head.sha,
      headBranch: response.data.head.ref,
      baseBranch: response.data.base.ref,
      baseSha: response.data.base.sha,
      mergeCommitSha: response.data.merge_commit_sha || null,
      mergedAt: response.data.merged_at || null,
      createdAt: response.data.created_at || null,
      updatedAt: response.data.updated_at || null,
    };
  } catch (error) {
    const normalized = toError(error, OPERATIONS.getPullRequest);
    // A genuinely missing PR is reported as null. Auth and rate-limit errors
    // must never be mistaken for a missing PR.
    if (normalized.status === 404) return null;
    throw normalized;
  }
}

export type GitHubPullRequestFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
};

/** Read the file list a PR actually changes. Used for the pre-merge safety gate. */
export async function getPullRequestFiles(
  repository: DevRepositoryKey | string,
  number: number
): Promise<GitHubPullRequestFile[]> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const files: GitHubPullRequestFile[] = [];
    // The safety gate must see the whole PR. Read bounded pages instead of
    // silently trusting the first 100 files.
    for (let page = 1; page <= 3; page += 1) {
      const response = await requestGitHubWithRetry(OPERATIONS.listPullRequestFiles, () =>
        client().rest.pulls.listFiles({
          owner: config.owner,
          repo: config.repo,
          pull_number: number,
          per_page: 100,
          page,
        })
      );
      files.push(
        ...response.data.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: Number(file.additions || 0),
          deletions: Number(file.deletions || 0),
          patch: typeof file.patch === 'string' ? file.patch : null,
        }))
      );
      if (response.data.length < 100) break;
    }
    return files;
  } catch (error) {
    throw toError(error, OPERATIONS.listPullRequestFiles);
  }
}

export type GitHubChecksSummary = {
  status: 'passed' | 'failed' | 'pending' | 'none' | 'unknown';
  detail: string;
  checks: Array<{
    name: string;
    status: string | null;
    conclusion: string | null;
    url: string | null;
  }>;
};

const FAILED_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
]);

/**
 * Read the real CI state for a commit. Check runs and legacy commit statuses
 * are both considered; a repository with neither is reported as `none`, never
 * as a silent pass.
 */
export async function getCommitChecks(
  repository: DevRepositoryKey | string,
  ref: string
): Promise<GitHubChecksSummary> {
  const config = getDevRepositoryConfig(repoKey(repository));
  const sha = String(ref || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    return { status: 'unknown', detail: 'A valid commit SHA is required.', checks: [] };
  }
  try {
    const [runs, statuses] = await Promise.all([
      requestGitHubWithRetry(OPERATIONS.listCheckRuns, () =>
        client().rest.checks.listForRef({
          owner: config.owner,
          repo: config.repo,
          ref: sha,
          per_page: 100,
        })
      ),
      requestGitHubWithRetry(OPERATIONS.combinedStatus, () =>
        client().rest.repos.getCombinedStatusForRef({
          owner: config.owner,
          repo: config.repo,
          ref: sha,
          per_page: 100,
        })
      ),
    ]);

    const checks = (runs.data.check_runs || []).map((run) => ({
      name: run.name,
      status: run.status || null,
      conclusion: run.conclusion || null,
      url: run.html_url || run.details_url || null,
    }));
    const statusChecks = (statuses?.data.statuses || []).map((status) => ({
      name: status.context,
      status: status.state === 'pending' ? 'in_progress' : 'completed',
      conclusion:
        status.state === 'success'
          ? 'success'
          : status.state === 'failure' || status.state === 'error'
            ? 'failure'
            : null,
      url: status.target_url || null,
    }));
    const all = [...checks, ...statusChecks];
    if (all.length === 0) {
      return { status: 'none', detail: 'No CI checks are attached to this commit.', checks: [] };
    }
    const failed = all.filter(
      (check) => check.conclusion && FAILED_CONCLUSIONS.has(check.conclusion)
    );
    if (failed.length > 0) {
      return {
        status: 'failed',
        detail: `${failed.length} CI check(s) failed: ${failed
          .map((check) => check.name)
          .slice(0, 5)
          .join(', ')}`,
        checks: all,
      };
    }
    const pending = all.filter((check) => check.status !== 'completed' || !check.conclusion);
    const combinedPending =
      statuses?.data.state === 'pending' || statuses?.data.state === 'expected';
    if (pending.length > 0 || combinedPending) {
      return {
        status: 'pending',
        detail: `${pending.length || 1} CI check(s) are still running.`,
        checks: all,
      };
    }
    return {
      status: 'passed',
      detail: `${all.length} CI check(s) completed successfully.`,
      checks: all,
    };
  } catch (error) {
    const normalized = toError(error, OPERATIONS.listCheckRuns);
    // Permission, authentication and rate-limit failures must reach the
    // finalizer so it can name the endpoint/permission instead of masking them
    // as an unknown CI result.
    if (
      normalized.status === 401 ||
      normalized.status === 403 ||
      normalized.status === 429 ||
      normalized.rateLimited
    ) {
      throw normalized;
    }
    return {
      status: 'unknown',
      detail: normalized.message,
      checks: [],
    };
  }
}

export async function getBranchHead(
  repository: DevRepositoryKey | string,
  branch: string
): Promise<string | null> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const response = await requestGitHubWithRetry(OPERATIONS.getBranch, () =>
      client().rest.repos.getBranch({
        owner: config.owner,
        repo: config.repo,
        branch: safeBranch(branch),
      })
    );
    return response.data.commit.sha;
  } catch (error) {
    const normalized = toError(error, OPERATIONS.getBranch);
    if (normalized.status === 404) return null;
    throw normalized;
  }
}

export function commitUrl(repository: DevRepositoryKey | string, sha: string): string {
  const config = getDevRepositoryConfig(repoKey(repository));
  return `https://github.com/${config.owner}/${config.repo}/commit/${sha}`;
}

export type CommitRange = {
  status: string;
  aheadBy: number;
  behindBy: number;
  commits: Array<{
    sha: string;
    message: string;
    author: string | null;
    committedAt: string | null;
  }>;
};

/**
 * Compare two commits using GitHub's compare API. `aheadBy` is the number of
 * commits reachable from `head` but not from `base`, so comparing
 * `production...main` is exactly "what landed in main since the release".
 */
export async function getCommitRange(
  repository: DevRepositoryKey | string,
  base: string,
  head: string
): Promise<CommitRange> {
  const config = getDevRepositoryConfig(repoKey(repository));
  if (!/^[0-9a-f]{7,40}$/i.test(base) || !/^[0-9a-f]{7,40}$/i.test(head)) {
    throw new WorkbenchGitHubError('GITHUB_INVALID_SHA', 'Valid base and head SHAs are required.');
  }
  try {
    const response = await requestGitHubWithRetry(OPERATIONS.compareCommits, () =>
      client().rest.repos.compareCommitsWithBasehead({
        owner: config.owner,
        repo: config.repo,
        basehead: `${base}...${head}`,
      })
    );
    return {
      status: response.data.status || 'unknown',
      aheadBy: Number(response.data.ahead_by || 0),
      behindBy: Number(response.data.behind_by || 0),
      commits: (response.data.commits || []).map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message || '',
        author: commit.commit.author?.name || commit.author?.login || null,
        committedAt: commit.commit.author?.date || null,
      })),
    };
  } catch (error) {
    throw toError(error, OPERATIONS.compareCommits);
  }
}

/**
 * Merge one branch into another without rewriting history. This is used only
 * to synchronise an already-open task PR branch with the current base branch.
 * A conflict is returned as a structured error; no force push or reset is ever
 * used, so user work cannot be discarded.
 */
export async function mergeBranchInto(input: {
  repository: DevRepositoryKey | string;
  base: string;
  head: string;
  commitMessage?: string;
}): Promise<{ merged: boolean; sha: string | null; message: string }> {
  const config = getDevRepositoryConfig(repoKey(input.repository));
  const base = safeBranch(input.base);
  const head = safeBranch(input.head);
  if (base === head) return { merged: true, sha: null, message: 'Already up to date.' };
  try {
    const response = await requestGitHubWithRetry(OPERATIONS.mergeBranch, () =>
      client().rest.repos.merge({
        owner: config.owner,
        repo: config.repo,
        base,
        head,
        commit_message:
          input.commitMessage?.slice(0, 240) ||
          `Merge ${head} into ${base} to synchronise with the current base branch.`,
      })
    );
    const data = response.data as { sha?: string; message?: string } | undefined;
    return {
      merged: true,
      sha: data?.sha || null,
      message: data?.message || 'Already up to date.',
    };
  } catch (error) {
    if (statusOf(error) === 409) {
      throw new WorkbenchGitHubError(
        'GITHUB_MERGE_CONFLICT',
        `Branch ${head} has conflicts with ${base}. No force push was performed; resolve the conflict in a reviewed commit and retry.`,
        409,
        { endpoint: OPERATIONS.mergeBranch.endpoint, requiredPermission: 'Contents: write' }
      );
    }
    throw toError(error, OPERATIONS.mergeBranch);
  }
}

/**
 * Close an obsolete PR after the caller has proved it is redundant or
 * superseded. Closing is reversible and never deletes commits or history.
 */
export async function closePullRequest(input: {
  repository: DevRepositoryKey | string;
  number: number;
  comment?: string;
}): Promise<{ closed: boolean }> {
  const config = getDevRepositoryConfig(repoKey(input.repository));
  try {
    const response = await requestGitHubWithRetry(OPERATIONS.updatePullRequest, () =>
      client().rest.pulls.update({
        owner: config.owner,
        repo: config.repo,
        pull_number: input.number,
        state: 'closed',
      })
    );
    if (input.comment) {
      await requestGitHubWithRetry(OPERATIONS.commentPullRequest, () =>
        client().rest.issues.createComment({
          owner: config.owner,
          repo: config.repo,
          issue_number: input.number,
          body: input.comment!.slice(0, 8000),
        })
      ).catch(() => undefined);
    }
    return { closed: response.data.state === 'closed' };
  } catch (error) {
    throw toError(error, OPERATIONS.updatePullRequest);
  }
}

/**
 * Merge is only callable by an explicit owner action in Admin and only for an
 * already verified task. The expected head SHA prevents stale merges.
 */
export async function mergeVerifiedPullRequest(input: {
  repository: DevRepositoryKey | string;
  number: number;
  expectedHeadSha: string;
}): Promise<{ merged: boolean; sha: string | null; message: string }> {
  const config = getDevRepositoryConfig(repoKey(input.repository));
  if (!/^[0-9a-f]{40}$/i.test(input.expectedHeadSha)) {
    throw new WorkbenchGitHubError(
      'GITHUB_INVALID_SHA',
      'A full 40-character head SHA is required.'
    );
  }

  try {
    const pr = await requestGitHubWithRetry(OPERATIONS.getPullRequest, () =>
      client().rest.pulls.get({
        owner: config.owner,
        repo: config.repo,
        pull_number: input.number,
      })
    );

    if (pr.data.merged) {
      // A previous attempt may have merged the PR without persisting the
      // result. Treat that as success instead of merging twice.
      return {
        merged: true,
        sha: pr.data.merge_commit_sha || null,
        message: 'Already merged.',
      };
    }
    if (pr.data.state !== 'open') {
      throw new WorkbenchGitHubError('GITHUB_PR_NOT_OPEN', 'The pull request is not open.');
    }
    if (pr.data.base.ref === config.defaultBranch) {
      // This is expected: PRs merge into the default branch only after owner approval.
    } else {
      throw new WorkbenchGitHubError(
        'GITHUB_PR_BASE_MISMATCH',
        `The pull request base is ${pr.data.base.ref}, expected ${config.defaultBranch}.`
      );
    }
    if (pr.data.head.sha.toLowerCase() !== input.expectedHeadSha.toLowerCase()) {
      throw new WorkbenchGitHubError(
        'GITHUB_PR_STALE',
        'The pull request head moved since review. Re-run review before merging.'
      );
    }

    const response = await requestGitHubWithRetry(OPERATIONS.mergePullRequest, () =>
      client().rest.pulls.merge({
        owner: config.owner,
        repo: config.repo,
        pull_number: input.number,
        sha: input.expectedHeadSha,
        merge_method: 'squash',
      })
    );

    return {
      merged: Boolean(response.data.merged),
      sha: response.data.sha || null,
      message: response.data.message || '',
    };
  } catch (error) {
    throw toError(error, OPERATIONS.mergePullRequest);
  }
}

// ---------------------------------------------------------------------------
// Repository permissions
// ---------------------------------------------------------------------------

export async function getRepositoryPermission(repository: DevRepositoryKey | string): Promise<{
  fullName: string;
  admin: boolean;
  push: boolean;
  pull: boolean;
  defaultBranch: string;
} | null> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const response = await client().rest.repos.get({
      owner: config.owner,
      repo: config.repo,
    });
    return {
      fullName: response.data.full_name,
      admin: Boolean(response.data.permissions?.admin),
      push: Boolean(response.data.permissions?.push),
      pull: Boolean(response.data.permissions?.pull),
      defaultBranch: response.data.default_branch,
    };
  } catch {
    return null;
  }
}

export async function getGitHubRateLimit(): Promise<{
  remaining: number;
  limit: number;
  resetAt: string | null;
} | null> {
  try {
    const response = await client().rest.rateLimit.get();
    const core = response.data.resources.core;
    return {
      remaining: core.remaining,
      limit: core.limit,
      resetAt: core.reset ? new Date(core.reset * 1000).toISOString() : null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Codespaces lifecycle
// ---------------------------------------------------------------------------

export type CodespaceInfo = {
  name: string;
  state: string;
  repository: string | null;
  machine: string | null;
  webUrl: string | null;
  idleTimeoutMinutes: number | null;
  lastUsedAt: string | null;
};

function mapCodespace(data: Record<string, unknown>): CodespaceInfo {
  const repository = data.repository as { full_name?: unknown } | undefined;
  const machine = data.machine as { name?: unknown } | undefined;
  return {
    name: String(data.name || ''),
    state: String(data.state || 'unknown'),
    repository: typeof repository?.full_name === 'string' ? repository.full_name : null,
    machine: typeof machine?.name === 'string' ? machine.name : null,
    webUrl: typeof data.web_url === 'string' ? data.web_url : null,
    idleTimeoutMinutes:
      typeof data.idle_timeout_minutes === 'number' && Number.isFinite(data.idle_timeout_minutes)
        ? data.idle_timeout_minutes
        : null,
    lastUsedAt: typeof data.last_used_at === 'string' ? data.last_used_at : null,
  };
}

export async function listUserCodespaces(): Promise<CodespaceInfo[]> {
  try {
    const response = await client().request('GET /user/codespaces', { per_page: 100 });
    const items =
      (response.data as { codespaces?: Array<Record<string, unknown>> }).codespaces || [];
    return items.map(mapCodespace);
  } catch (error) {
    throw toError(error, OPERATIONS.listCodespaces);
  }
}

export async function getCodespace(name: string): Promise<CodespaceInfo | null> {
  try {
    const response = await client().request('GET /user/codespaces/{codespace_name}', {
      codespace_name: name,
    });
    return mapCodespace(response.data as Record<string, unknown>);
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw toError(error, OPERATIONS.getCodespace);
  }
}

/**
 * Resolve the executor Codespace without trusting a single stale env value.
 *
 * `PIERROT_DEV_CODESPACE_NAME` is a Vercel environment variable and can point
 * at a deleted Codespace after it is recreated. If the exact name is missing,
 * discover the Codespace that belongs to the primary repository instead. The
 * caller still starts/stops by the real name, so a stale variable cannot break
 * the workflow.
 */
export async function resolveCodespace(name?: string | null): Promise<CodespaceInfo | null> {
  const configured = (name || '').trim();
  if (configured) {
    try {
      const exact = await getCodespace(configured);
      if (exact) return exact;
    } catch {
      // Fall through to discovery. A 404 is expected for a stale name; a
      // permission failure will surface again from listUserCodespaces().
    }
  }

  const primary = getDevRepositoryConfig('newlove').fullName.toLowerCase();
  const codespaces = await listUserCodespaces();
  return (
    codespaces.find(
      (codespace) =>
        codespace.repository?.toLowerCase() === primary && codespace.state !== 'Deleted'
    ) || null
  );
}

export async function startCodespace(name: string): Promise<CodespaceInfo> {
  try {
    const response = await client().request('POST /user/codespaces/{codespace_name}/start', {
      codespace_name: name,
    });
    return mapCodespace(response.data as Record<string, unknown>);
  } catch (error) {
    const normalized = toError(error, OPERATIONS.startCodespace);
    throw new WorkbenchGitHubError(
      'CODESPACE_START_FAILED',
      normalized.status === 403 || normalized.status === 401
        ? `${normalized.message} Grant the fine-grained token the Codespaces write permission for this repository.`
        : normalized.message,
      normalized.status,
      {
        endpoint: normalized.endpoint,
        requiredPermission: normalized.requiredPermission,
        retryAfterMs: normalized.retryAfterMs,
        retryAt: normalized.retryAt,
        resetAt: normalized.resetAt,
        remaining: normalized.remaining,
        limit: normalized.limit,
        requestId: normalized.requestId,
        rateLimited: normalized.rateLimited,
      }
    );
  }
}

export async function stopCodespace(name: string): Promise<CodespaceInfo> {
  try {
    const response = await client().request('POST /user/codespaces/{codespace_name}/stop', {
      codespace_name: name,
    });
    return mapCodespace(response.data as Record<string, unknown>);
  } catch (error) {
    const normalized = toError(error, OPERATIONS.stopCodespace);
    throw new WorkbenchGitHubError(
      'CODESPACE_STOP_FAILED',
      normalized.status === 403 || normalized.status === 401
        ? `${normalized.message} Grant the fine-grained token the Codespaces write permission.`
        : normalized.message,
      normalized.status,
      {
        endpoint: normalized.endpoint,
        requiredPermission: normalized.requiredPermission,
        retryAfterMs: normalized.retryAfterMs,
        retryAt: normalized.retryAt,
        resetAt: normalized.resetAt,
        remaining: normalized.remaining,
        limit: normalized.limit,
        requestId: normalized.requestId,
        rateLimited: normalized.rateLimited,
      }
    );
  }
}

export async function createCodespace(input: {
  repository: DevRepositoryKey | string;
  machine?: string;
}): Promise<CodespaceInfo> {
  if (process.env.PIERROT_DEV_ALLOW_CODESPACE_CREATE !== 'true') {
    throw new WorkbenchGitHubError(
      'CODESPACE_CREATE_DISABLED',
      'Creating a Codespace is disabled. Set PIERROT_DEV_ALLOW_CODESPACE_CREATE=true to allow it from Admin.'
    );
  }
  const config = getDevRepositoryConfig(repoKey(input.repository));
  try {
    const response = await client().request('POST /repos/{owner}/{repo}/codespaces', {
      owner: config.owner,
      repo: config.repo,
      machine: input.machine || undefined,
    });
    return mapCodespace(response.data as Record<string, unknown>);
  } catch (error) {
    throw toError(error, OPERATIONS.createCodespace);
  }
}

// ---------------------------------------------------------------------------
// Vercel deployment status (read-only)
// ---------------------------------------------------------------------------

let vercelProjectCache: { id: string | null; expiresAt: number } | null = null;

async function resolveVercelProjectId(
  repository: DevRepositoryKey | string
): Promise<string | null> {
  if (process.env.VERCEL_PROJECT_ID) return process.env.VERCEL_PROJECT_ID;
  if (vercelProjectCache && vercelProjectCache.expiresAt > Date.now()) {
    return vercelProjectCache.id;
  }

  const token = (process.env.VERCEL_TOKEN || '').trim();
  if (!token) return null;
  const config = getDevRepositoryConfig(repoKey(repository));

  try {
    const response = await fetch('https://api.vercel.com/v9/projects?limit=100', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      projects?: Array<{ id?: string; name?: string; link?: { repo?: string } }>;
    };
    const match = (body.projects || []).find(
      (project) =>
        project.link?.repo?.toLowerCase() === config.repo.toLowerCase() ||
        project.name?.toLowerCase() === config.repo.toLowerCase()
    );
    vercelProjectCache = { id: match?.id || null, expiresAt: Date.now() + 5 * 60_000 };
    return match?.id || null;
  } catch {
    return null;
  }
}

export async function getVercelIntegrationStatus(
  repository: DevRepositoryKey | string = 'newlove'
): Promise<{
  tokenConfigured: boolean;
  projectId: string | null;
  projectResolved: boolean;
  error: string | null;
}> {
  const token = (process.env.VERCEL_TOKEN || '').trim();
  if (!token) {
    return {
      tokenConfigured: false,
      projectId: null,
      projectResolved: false,
      error:
        'VERCEL_TOKEN is not configured. Deployments still run through the Git integration, but Admin cannot read their status.',
    };
  }
  const projectId = await resolveVercelProjectId(repository);
  return {
    tokenConfigured: true,
    projectId,
    projectResolved: Boolean(projectId),
    error: projectId ? null : 'No Vercel project matched this repository. Set VERCEL_PROJECT_ID.',
  };
}

export async function getVercelDeploymentStatus(input: {
  repository: DevRepositoryKey | string;
  commitSha: string | null;
}): Promise<DevDeploymentStatus> {
  const checkedAt = new Date().toISOString();
  const token = (process.env.VERCEL_TOKEN || '').trim();
  if (!token) {
    return {
      state: 'unavailable',
      url: null,
      target: null,
      commitSha: input.commitSha,
      checkedAt,
      reason:
        'VERCEL_TOKEN is not configured. Git-linked Vercel deployments still run, but their status cannot be read from Admin.',
    };
  }
  if (!input.commitSha) {
    return {
      state: 'unknown',
      url: null,
      target: null,
      commitSha: null,
      checkedAt,
      reason: 'No merged commit SHA is recorded yet.',
    };
  }

  const projectId = await resolveVercelProjectId(input.repository);
  if (!projectId) {
    return {
      state: 'unavailable',
      url: null,
      target: null,
      commitSha: input.commitSha,
      checkedAt,
      reason:
        'No Vercel project matches this repository. Set VERCEL_PROJECT_ID to read deployment status.',
    };
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=50`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      return {
        state: 'unknown',
        url: null,
        target: null,
        commitSha: input.commitSha,
        checkedAt,
        reason: `Vercel API returned ${response.status}.`,
      };
    }
    const body = (await response.json()) as {
      deployments?: Array<{
        url?: string;
        state?: string;
        target?: string | null;
        meta?: { githubCommitSha?: string };
      }>;
    };
    const deployment = (body.deployments || []).find(
      (item) => item.meta?.githubCommitSha?.toLowerCase() === input.commitSha?.toLowerCase()
    );
    if (!deployment) {
      return {
        state: 'queued',
        url: null,
        target: null,
        commitSha: input.commitSha,
        checkedAt,
        reason: 'Vercel has no deployment for this commit yet.',
      };
    }
    const state = String(deployment.state || '').toUpperCase();
    const mapped: DevDeploymentStatus['state'] =
      state === 'READY'
        ? 'ready'
        : state === 'ERROR' || state === 'CANCELED'
          ? 'error'
          : state === 'BUILDING'
            ? 'building'
            : 'queued';
    return {
      state: mapped,
      url: deployment.url ? `https://${deployment.url}` : null,
      target: deployment.target || null,
      commitSha: input.commitSha,
      checkedAt,
      reason: null,
    };
  } catch {
    return {
      state: 'unknown',
      url: null,
      target: null,
      commitSha: input.commitSha,
      checkedAt,
      reason: 'Vercel deployment request failed.',
    };
  }
}

/**
 * Latest Vercel production deployment. This is read-only and never triggers a
 * deployment. When the token is missing the caller must report unknown instead
 * of assuming production equals main.
 */
export async function getLatestProductionDeployment(
  repository: DevRepositoryKey | string = 'newlove'
): Promise<DevDeploymentStatus> {
  const checkedAt = new Date().toISOString();
  const token = (process.env.VERCEL_TOKEN || '').trim();
  if (!token) {
    return {
      state: 'unavailable',
      url: null,
      target: 'production',
      commitSha: null,
      checkedAt,
      reason:
        'VERCEL_TOKEN is not configured, so Admin cannot read the production deployment commit. Production may still be deployed by the Git integration.',
    };
  }

  const projectId = await resolveVercelProjectId(repository);
  if (!projectId) {
    return {
      state: 'unavailable',
      url: null,
      target: 'production',
      commitSha: null,
      checkedAt,
      reason:
        'No Vercel project matches this repository. Set VERCEL_PROJECT_ID to read the production deployment.',
    };
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=20`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      return {
        state: 'unknown',
        url: null,
        target: 'production',
        commitSha: null,
        checkedAt,
        reason: `Vercel API returned ${response.status} while reading the production deployment.`,
      };
    }
    const body = (await response.json()) as {
      deployments?: Array<{
        url?: string;
        state?: string;
        target?: string | null;
        meta?: { githubCommitSha?: string };
      }>;
    };
    const deployment = (body.deployments || []).find(
      (item) => item.target === 'production' || item.target === null || item.target === undefined
    );
    if (!deployment) {
      return {
        state: 'unknown',
        url: null,
        target: 'production',
        commitSha: null,
        checkedAt,
        reason: 'Vercel has no production deployment for this project yet.',
      };
    }
    const state = String(deployment.state || '').toUpperCase();
    const mapped: DevDeploymentStatus['state'] =
      state === 'READY'
        ? 'ready'
        : state === 'ERROR' || state === 'CANCELED'
          ? 'error'
          : state === 'BUILDING'
            ? 'building'
            : 'queued';
    return {
      state: mapped,
      url: deployment.url ? `https://${deployment.url}` : null,
      target: 'production',
      commitSha: deployment.meta?.githubCommitSha || null,
      checkedAt,
      reason: null,
    };
  } catch {
    return {
      state: 'unknown',
      url: null,
      target: 'production',
      commitSha: null,
      checkedAt,
      reason: 'Vercel production deployment request failed.',
    };
  }
}
