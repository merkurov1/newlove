import { assertServerOnly } from '@/lib/serverOnly';
import { Octokit } from '@octokit/rest';
import {
  getGitHubToken,
  isGitHubWriteEnabled,
  normalizeGitHubBranch,
  normalizeGitHubPath,
} from '@/lib/github';
import { getDevRepositoryConfig, getDevRepositoryConfigs, resolveDevRepository } from './repositories';
import type { DevRepositoryConfig, DevRepositoryKey } from './types';

assertServerOnly('lib/pierrot/dev/write');

const MAX_FILE_CHARS = 200_000;
const MAX_ISSUE_BODY = 20_000;
const MAX_COMMENT_CHARS = 10_000;
const GITHUB_TIMEOUT_MS = Number(process.env.PIERROT_DEV_GITHUB_TIMEOUT_MS || 15_000);

export type DevWriteErrorCode =
  | 'GITHUB_TOKEN_MISSING'
  | 'GITHUB_WRITES_DISABLED'
  | 'GITHUB_WRITE_CONFIRMATION_REQUIRED'
  | 'GITHUB_WRITE_PERMISSION_DENIED'
  | 'GITHUB_WRITE_PERMISSION_UNKNOWN'
  | 'GITHUB_DEFAULT_BRANCH_PROTECTED'
  | 'GITHUB_INVALID_BRANCH'
  | 'GITHUB_INVALID_PATH'
  | 'GITHUB_INVALID_INPUT'
  | 'GITHUB_API_ERROR';

export class DevWriteError extends Error {
  readonly code: DevWriteErrorCode;
  readonly status: number | null;
  readonly repository: string | null;

  constructor(
    code: DevWriteErrorCode,
    message: string,
    options: { status?: number | null; repository?: string | null } = {}
  ) {
    super(message);
    this.name = 'DevWriteError';
    this.code = code;
    this.status = options.status ?? null;
    this.repository = options.repository ?? null;
  }
}

export type GitHubWriteCapability = {
  repository: string;
  repositoryKey: DevRepositoryKey;
  configured: boolean;
  writesEnabled: boolean;
  authenticated: boolean;
  login: string | null;
  canPush: boolean;
  permissions: Record<string, boolean> | null;
  reason: string | null;
};

let clientCache: { token: string; client: Octokit } | null = null;

function getClient(): Octokit {
  const token = getGitHubToken();
  if (!token) {
    throw new DevWriteError('GITHUB_TOKEN_MISSING', 'GITHUB_TOKEN is not configured.');
  }
  if (clientCache?.token === token) return clientCache.client;

  const client = new Octokit({
    auth: token,
    userAgent: 'pierrot-dev-writer/1.0',
    request: { timeout: GITHUB_TIMEOUT_MS },
  });
  clientCache = { token, client };
  return client;
}

function statusFrom(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const value = (error as { status?: unknown }).status;
    return typeof value === 'number' ? value : null;
  }
  return null;
}

function safeMessage(error: unknown, repository: string): string {
  const status = statusFrom(error);
  if (status === 401) return 'GitHub token was rejected (401).';
  if (status === 403) return `GitHub denied the write (403) in ${repository}.`;
  if (status === 404) return `Repository, branch, file or issue was not found (404) in ${repository}.`;
  if (status === 422) return 'GitHub rejected the write parameters (422).';
  if (status === 429) return 'GitHub API rate limit reached (429).';
  return error instanceof Error ? error.message : 'GitHub write failed.';
}

function repoConfig(value: unknown): DevRepositoryConfig {
  try {
    return resolveDevRepository(value);
  } catch (error) {
    throw new DevWriteError(
      'GITHUB_INVALID_INPUT',
      error instanceof Error ? error.message : 'Unknown repository.'
    );
  }
}

/**
 * Write access is opt-in twice: the server flag must be true and the token
 * must actually have push permission on the target repository. Missing
 * permission data fails closed.
 */
export async function getGitHubWriteCapability(
  repository: unknown
): Promise<GitHubWriteCapability> {
  const config = repoConfig(repository);
  const base: GitHubWriteCapability = {
    repository: config.fullName,
    repositoryKey: config.key,
    configured: config.configured,
    writesEnabled: isGitHubWriteEnabled(),
    authenticated: false,
    login: null,
    canPush: false,
    permissions: null,
    reason: null,
  };

  if (!config.configured) {
    return { ...base, reason: 'GITHUB_TOKEN is not configured.' };
  }
  if (!isGitHubWriteEnabled()) {
    return { ...base, reason: 'PIERROT_DEV_WRITE_ENABLED is not true.' };
  }

  const client = getClient();

  try {
    const [auth, repo] = await Promise.all([
      client.rest.users.getAuthenticated(),
      client.rest.repos.get({ owner: config.owner, repo: config.repo }),
    ]);
    const permissions =
      (repo.data.permissions as Record<string, boolean> | undefined) ?? null;
    const canPush = Boolean(
      permissions?.push || permissions?.admin || permissions?.maintain
    );

    return {
      ...base,
      authenticated: true,
      login: auth.data.login,
      canPush,
      permissions,
      reason: canPush ? null : 'The token has no push permission on this repository.',
    };
  } catch (error) {
    return {
      ...base,
      authenticated: statusFrom(error) !== 401,
      reason: safeMessage(error, config.fullName),
    };
  }
}

async function assertWriteAllowed(
  config: DevRepositoryConfig,
  input: { confirmed: unknown }
): Promise<Octokit> {
  if (!isGitHubWriteEnabled()) {
    throw new DevWriteError(
      'GITHUB_WRITES_DISABLED',
      'GitHub writes are disabled. Set PIERROT_DEV_WRITE_ENABLED=true only after review.',
      { repository: config.fullName }
    );
  }

  if (input.confirmed !== true) {
    throw new DevWriteError(
      'GITHUB_WRITE_CONFIRMATION_REQUIRED',
      'GitHub writes require an explicit owner confirmation.',
      { repository: config.fullName }
    );
  }

  const capability = await getGitHubWriteCapability(config.key);
  if (!capability.authenticated) {
    throw new DevWriteError(
      'GITHUB_TOKEN_MISSING',
      capability.reason || 'GitHub token is not authenticated.',
      { repository: config.fullName }
    );
  }
  if (!capability.canPush) {
    throw new DevWriteError(
      capability.permissions ? 'GITHUB_WRITE_PERMISSION_DENIED' : 'GITHUB_WRITE_PERMISSION_UNKNOWN',
      capability.reason || 'The token cannot push to this repository.',
      { repository: config.fullName }
    );
  }

  return getClient();
}

async function branchSha(
  client: Octokit,
  config: DevRepositoryConfig,
  branch: string
): Promise<string> {
  const response = await client.rest.repos.getBranch({
    owner: config.owner,
    repo: config.repo,
    branch,
  });
  return response.data.commit.sha;
}

export async function createDevBranch(input: {
  repository?: unknown;
  branch: unknown;
  fromRef?: unknown;
  confirmed?: unknown;
}): Promise<{
  repository: string;
  branch: string;
  baseRef: string;
  commitSha: string;
  url: string;
  sideEffect: true;
}> {
  const config = repoConfig(input.repository);
  const client = await assertWriteAllowed(config, { confirmed: input.confirmed });
  const branch = normalizeGitHubBranch(input.branch, '');
  if (!branch) {
    throw new DevWriteError('GITHUB_INVALID_BRANCH', 'Branch name is required.', {
      repository: config.fullName,
    });
  }
  if (branch === config.defaultBranch) {
    throw new DevWriteError(
      'GITHUB_DEFAULT_BRANCH_PROTECTED',
      `Refusing to create or write the protected branch ${config.defaultBranch}.`,
      { repository: config.fullName }
    );
  }
  const baseRef = normalizeGitHubBranch(input.fromRef, config.defaultBranch);

  try {
    const baseSha = await branchSha(client, config, baseRef);
    try {
      const existing = await branchSha(client, config, branch);
      return {
        repository: config.fullName,
        branch,
        baseRef,
        commitSha: existing,
        url: `https://github.com/${config.fullName}/tree/${encodeURIComponent(branch)}`,
        sideEffect: true,
      };
    } catch (error) {
      if (statusFrom(error) !== 404) throw error;
    }

    await client.rest.git.createRef({
      owner: config.owner,
      repo: config.repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });

    return {
      repository: config.fullName,
      branch,
      baseRef,
      commitSha: baseSha,
      url: `https://github.com/${config.fullName}/tree/${encodeURIComponent(branch)}`,
      sideEffect: true,
    };
  } catch (error) {
    if (error instanceof DevWriteError) throw error;
    throw new DevWriteError('GITHUB_API_ERROR', safeMessage(error, config.fullName), {
      status: statusFrom(error),
      repository: config.fullName,
    });
  }
}

export async function createOrUpdateDevFile(input: {
  repository?: unknown;
  path: unknown;
  content: unknown;
  message?: unknown;
  branch: unknown;
  confirmed?: unknown;
}): Promise<{
  repository: string;
  path: string;
  branch: string;
  commitSha: string;
  commitUrl: string;
  contentSha: string | null;
  sideEffect: true;
}> {
  const config = repoConfig(input.repository);
  const client = await assertWriteAllowed(config, { confirmed: input.confirmed });
  const path = normalizeGitHubPath(input.path);
  if (!path) {
    throw new DevWriteError('GITHUB_INVALID_PATH', 'File path is required.', {
      repository: config.fullName,
    });
  }
  if (typeof input.content !== 'string') {
    throw new DevWriteError('GITHUB_INVALID_INPUT', 'File content is required.', {
      repository: config.fullName,
    });
  }
  if (input.content.length > MAX_FILE_CHARS) {
    throw new DevWriteError(
      'GITHUB_INVALID_INPUT',
      `File exceeds ${MAX_FILE_CHARS} characters.`,
      { repository: config.fullName }
    );
  }
  const branch = normalizeGitHubBranch(input.branch, '');
  if (!branch || branch === config.defaultBranch) {
    throw new DevWriteError(
      'GITHUB_DEFAULT_BRANCH_PROTECTED',
      `Writes to the default branch ${config.defaultBranch} are forbidden. Use a working branch.`,
      { repository: config.fullName }
    );
  }
  const message =
    typeof input.message === 'string' && input.message.trim()
      ? input.message.trim().slice(0, 500)
      : 'Pierrot Dev update';

  try {
    const baseSha = await branchSha(client, config, config.defaultBranch);
    try {
      await branchSha(client, config, branch);
    } catch (error) {
      if (statusFrom(error) !== 404) throw error;
      await client.rest.git.createRef({
        owner: config.owner,
        repo: config.repo,
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      });
    }

    let sha: string | undefined;
    try {
      const existing = await client.rest.repos.getContent({
        owner: config.owner,
        repo: config.repo,
        path,
        ref: branch,
      });
      if (Array.isArray(existing.data) || existing.data.type !== 'file') {
        throw new DevWriteError('GITHUB_INVALID_PATH', 'Path exists but is not a file.', {
          repository: config.fullName,
        });
      }
      sha = existing.data.sha;
    } catch (error) {
      if (error instanceof DevWriteError) throw error;
      if (statusFrom(error) !== 404) throw error;
    }

    const response = await client.rest.repos.createOrUpdateFileContents({
      owner: config.owner,
      repo: config.repo,
      path,
      message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    });

    const commitSha =
      typeof response.data.commit?.sha === 'string' ? response.data.commit.sha : '';
    const commitUrl =
      typeof response.data.commit?.html_url === 'string'
        ? response.data.commit.html_url
        : '';

    if (!commitSha || !commitUrl) {
      throw new DevWriteError(
        'GITHUB_API_ERROR',
        'GitHub returned an incomplete commit response.',
        { repository: config.fullName }
      );
    }

    return {
      repository: config.fullName,
      path,
      branch,
      commitSha,
      commitUrl,
      contentSha: response.data.content?.sha ?? null,
      sideEffect: true,
    };
  } catch (error) {
    if (error instanceof DevWriteError) throw error;
    throw new DevWriteError('GITHUB_API_ERROR', safeMessage(error, config.fullName), {
      status: statusFrom(error),
      repository: config.fullName,
    });
  }
}

export async function createDevPullRequest(input: {
  repository?: unknown;
  title: unknown;
  head: unknown;
  base?: unknown;
  body?: unknown;
  confirmed?: unknown;
}): Promise<{
  repository: string;
  number: number;
  url: string;
  state: string;
  head: string;
  base: string;
  sideEffect: true;
}> {
  const config = repoConfig(input.repository);
  const client = await assertWriteAllowed(config, { confirmed: input.confirmed });
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 240) : '';
  const head = normalizeGitHubBranch(input.head, '');
  const base = normalizeGitHubBranch(input.base, config.defaultBranch);
  const body = typeof input.body === 'string' ? input.body.slice(0, MAX_ISSUE_BODY) : '';

  if (!title) {
    throw new DevWriteError('GITHUB_INVALID_INPUT', 'Pull request title is required.', {
      repository: config.fullName,
    });
  }
  if (!head || head === config.defaultBranch || head === base) {
    throw new DevWriteError(
      'GITHUB_INVALID_BRANCH',
      'A working head branch different from the base is required.',
      { repository: config.fullName }
    );
  }

  try {
    const response = await client.rest.pulls.create({
      owner: config.owner,
      repo: config.repo,
      title,
      head,
      base,
      body,
    });
    return {
      repository: config.fullName,
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
      head: response.data.head.ref,
      base: response.data.base.ref,
      sideEffect: true,
    };
  } catch (error) {
    throw new DevWriteError('GITHUB_API_ERROR', safeMessage(error, config.fullName), {
      status: statusFrom(error),
      repository: config.fullName,
    });
  }
}

export async function createDevIssue(input: {
  repository?: unknown;
  title: unknown;
  body?: unknown;
  labels?: unknown;
  confirmed?: unknown;
}): Promise<{
  repository: string;
  number: number;
  url: string;
  state: string;
  title: string;
  sideEffect: true;
}> {
  const config = repoConfig(input.repository);
  const client = await assertWriteAllowed(config, { confirmed: input.confirmed });
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 240) : '';
  const body = typeof input.body === 'string' ? input.body.slice(0, MAX_ISSUE_BODY) : '';
  const labels = Array.isArray(input.labels)
    ? input.labels.filter((label): label is string => typeof label === 'string').slice(0, 10)
    : [];

  if (!title) {
    throw new DevWriteError('GITHUB_INVALID_INPUT', 'Issue title is required.', {
      repository: config.fullName,
    });
  }

  try {
    const response = await client.rest.issues.create({
      owner: config.owner,
      repo: config.repo,
      title,
      body,
      ...(labels.length ? { labels } : {}),
    });
    return {
      repository: config.fullName,
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
      title: response.data.title,
      sideEffect: true,
    };
  } catch (error) {
    throw new DevWriteError('GITHUB_API_ERROR', safeMessage(error, config.fullName), {
      status: statusFrom(error),
      repository: config.fullName,
    });
  }
}

export async function updateDevIssueState(input: {
  repository?: unknown;
  number: unknown;
  state: unknown;
  confirmed?: unknown;
}): Promise<{
  repository: string;
  number: number;
  url: string;
  state: string;
  sideEffect: true;
}> {
  const config = repoConfig(input.repository);
  const client = await assertWriteAllowed(config, { confirmed: input.confirmed });
  const number = typeof input.number === 'number' ? Math.floor(input.number) : Number(input.number);
  const state = input.state === 'closed' ? 'closed' : input.state === 'open' ? 'open' : null;

  if (!Number.isFinite(number) || number <= 0 || !state) {
    throw new DevWriteError('GITHUB_INVALID_INPUT', 'A positive issue number and state are required.', {
      repository: config.fullName,
    });
  }

  try {
    const response = await client.rest.issues.update({
      owner: config.owner,
      repo: config.repo,
      issue_number: number,
      state,
    });
    return {
      repository: config.fullName,
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
      sideEffect: true,
    };
  } catch (error) {
    throw new DevWriteError('GITHUB_API_ERROR', safeMessage(error, config.fullName), {
      status: statusFrom(error),
      repository: config.fullName,
    });
  }
}

export async function addDevIssueComment(input: {
  repository?: unknown;
  number: unknown;
  body: unknown;
  confirmed?: unknown;
}): Promise<{
  repository: string;
  issueNumber: number;
  commentUrl: string;
  sideEffect: true;
}> {
  const config = repoConfig(input.repository);
  const client = await assertWriteAllowed(config, { confirmed: input.confirmed });
  const number = typeof input.number === 'number' ? Math.floor(input.number) : Number(input.number);
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, MAX_COMMENT_CHARS) : '';

  if (!Number.isFinite(number) || number <= 0 || !body) {
    throw new DevWriteError('GITHUB_INVALID_INPUT', 'A positive issue number and comment body are required.', {
      repository: config.fullName,
    });
  }

  try {
    const response = await client.rest.issues.createComment({
      owner: config.owner,
      repo: config.repo,
      issue_number: number,
      body,
    });
    return {
      repository: config.fullName,
      issueNumber: number,
      commentUrl: response.data.html_url,
      sideEffect: true,
    };
  } catch (error) {
    throw new DevWriteError('GITHUB_API_ERROR', safeMessage(error, config.fullName), {
      status: statusFrom(error),
      repository: config.fullName,
    });
  }
}

export function getWriteEnabledRepositories(): Array<{
  key: DevRepositoryKey;
  repository: string;
  writesEnabled: boolean;
  configured: boolean;
}> {
  return getDevRepositoryConfigs().map((config) => ({
    key: config.key,
    repository: config.fullName,
    writesEnabled: isGitHubWriteEnabled(),
    configured: config.configured,
  }));
}

export function getPrimaryWriteRepository(): DevRepositoryConfig {
  return getDevRepositoryConfig('newlove');
}
