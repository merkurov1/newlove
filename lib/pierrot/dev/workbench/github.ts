import { assertServerOnly } from '@/lib/serverOnly';
import { Octokit } from '@octokit/rest';
import { getGitHubToken } from '@/lib/github';
import { getDevRepositoryConfig, isDevRepositoryKey } from '../repositories';
import type { DevRepositoryKey } from '../types';
import type { DevDeploymentStatus } from './types';

assertServerOnly('lib/pierrot/dev/workbench/github');

const REQUEST_TIMEOUT_MS = Number(process.env.PIERROT_DEV_GITHUB_TIMEOUT_MS || 15_000);

export class WorkbenchGitHubError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(code: string, message: string, status: number | null = null) {
    super(message);
    this.name = 'WorkbenchGitHubError';
    this.code = code;
    this.status = status;
  }
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
  if (error && typeof error === 'object' && 'status' in error) {
    const value = (error as { status?: unknown }).status;
    return typeof value === 'number' ? value : null;
  }
  return null;
}

function toError(error: unknown, fallbackCode = 'GITHUB_API_ERROR'): WorkbenchGitHubError {
  if (error instanceof WorkbenchGitHubError) return error;
  const status = statusOf(error);
  const message =
    status === 401
      ? 'GitHub token was rejected (401).'
      : status === 403
        ? 'GitHub API access denied or rate-limited (403). Check the token permissions.'
        : status === 404
          ? 'GitHub resource not found (404).'
          : status === 422
            ? 'GitHub rejected the request parameters (422).'
            : error instanceof Error
              ? error.message.slice(0, 500)
              : 'GitHub API request failed.';
  return new WorkbenchGitHubError(fallbackCode, message, status);
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
    const response = await client().rest.pulls.create({
      owner: config.owner,
      repo: config.repo,
      head,
      base,
      title: input.title.slice(0, 240),
      body: input.body.slice(0, 20_000),
      draft: false,
    });
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
    throw toError(error, 'GITHUB_PR_CREATE_FAILED');
  }
}

export async function findPullRequestForBranch(
  repository: DevRepositoryKey | string,
  head: string
): Promise<{ number: number; url: string; state: string } | null> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const response = await client().rest.pulls.list({
      owner: config.owner,
      repo: config.repo,
      head: `${config.owner}:${safeBranch(head)}`,
      state: 'open',
      per_page: 1,
    });
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
  headSha: string;
  baseBranch: string;
} | null> {
  const config = getDevRepositoryConfig(repoKey(repository));
  try {
    const response = await client().rest.pulls.get({
      owner: config.owner,
      repo: config.repo,
      pull_number: number,
    });
    return {
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
      merged: Boolean(response.data.merged),
      mergeable: response.data.mergeable ?? null,
      headSha: response.data.head.sha,
      baseBranch: response.data.base.ref,
    };
  } catch {
    return null;
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
    throw new WorkbenchGitHubError('GITHUB_INVALID_SHA', 'A full 40-character head SHA is required.');
  }

  try {
    const pr = await client().rest.pulls.get({
      owner: config.owner,
      repo: config.repo,
      pull_number: input.number,
    });

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

    const response = await client().rest.pulls.merge({
      owner: config.owner,
      repo: config.repo,
      pull_number: input.number,
      sha: input.expectedHeadSha,
      merge_method: 'squash',
    });

    return {
      merged: Boolean(response.data.merged),
      sha: response.data.sha || null,
      message: response.data.message || '',
    };
  } catch (error) {
    throw toError(error, 'GITHUB_MERGE_FAILED');
  }
}

// ---------------------------------------------------------------------------
// Repository permissions
// ---------------------------------------------------------------------------

export async function getRepositoryPermission(
  repository: DevRepositoryKey | string
): Promise<{
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
  };
}

export async function listUserCodespaces(): Promise<CodespaceInfo[]> {
  try {
    const response = await client().request('GET /user/codespaces', { per_page: 100 });
    const items = (response.data as { codespaces?: Array<Record<string, unknown>> }).codespaces || [];
    return items.map(mapCodespace);
  } catch (error) {
    throw toError(error, 'CODESPACE_LIST_FAILED');
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
    throw toError(error, 'CODESPACE_READ_FAILED');
  }
}

export async function startCodespace(name: string): Promise<CodespaceInfo> {
  try {
    const response = await client().request('POST /user/codespaces/{codespace_name}/start', {
      codespace_name: name,
    });
    return mapCodespace(response.data as Record<string, unknown>);
  } catch (error) {
    const status = statusOf(error);
    throw new WorkbenchGitHubError(
      'CODESPACE_START_FAILED',
      status === 403 || status === 401
        ? 'The GitHub token cannot start Codespaces. Grant the fine-grained token the "Codespaces" write permission for this repository.'
        : toError(error, 'CODESPACE_START_FAILED').message,
      status
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
    const status = statusOf(error);
    throw new WorkbenchGitHubError(
      'CODESPACE_STOP_FAILED',
      status === 403 || status === 401
        ? 'The GitHub token cannot stop Codespaces. Grant the fine-grained token the "Codespaces" write permission.'
        : toError(error, 'CODESPACE_STOP_FAILED').message,
      status
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
    throw toError(error, 'CODESPACE_CREATE_FAILED');
  }
}

// ---------------------------------------------------------------------------
// Vercel deployment status (read-only)
// ---------------------------------------------------------------------------

let vercelProjectCache: { id: string | null; expiresAt: number } | null = null;

async function resolveVercelProjectId(repository: DevRepositoryKey | string): Promise<string | null> {
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
