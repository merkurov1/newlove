import { assertServerOnly } from '@/lib/serverOnly';
import { Octokit } from '@octokit/rest';

assertServerOnly('lib/github');

const DEFAULT_OWNER = 'merkurov1';
const DEFAULT_REPO = 'newlove';
const DEFAULT_BRANCH = 'main';
const MAX_READ_CHARS = 200_000;
const MAX_WRITE_CHARS = 200_000;
const MAX_TREE_ENTRIES = 300;
const AUTH_CACHE_MS = 5 * 60 * 1000;

export type GitHubRepository = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
};

export type GitHubAuthStatus = {
  configured: boolean;
  authenticated: boolean;
  login: string | null;
  name: string | null;
  status: number | null;
  error: string | null;
  checkedAt: string;
};

export type GitHubStructureEntry = {
  name: string;
  path: string;
  type: string;
  size: number | null;
  sha: string;
};

export type GitHubStructureResult = {
  path: string;
  ref: string;
  entries: GitHubStructureEntry[];
  truncated: boolean;
};

export type GitHubFileResult = {
  path: string;
  sha: string;
  size: number;
  ref: string;
  content: string;
  truncated: boolean;
};

export type GitHubCommitResult = {
  path: string;
  branch: string;
  commitSha: string;
  commitUrl: string;
  contentSha: string | null;
};

export type GitHubPullRequestResult = {
  number: number;
  url: string;
  state: string;
  head: string;
  base: string;
};

export class GitHubError extends Error {
  readonly code:
    | 'GITHUB_TOKEN_MISSING'
    | 'GITHUB_AUTH_FAILED'
    | 'GITHUB_WRITES_DISABLED'
    | 'GITHUB_INVALID_PATH'
    | 'GITHUB_INVALID_BRANCH'
    | 'GITHUB_NOT_A_FILE'
    | 'GITHUB_FILE_TOO_LARGE'
    | 'GITHUB_API_ERROR';
  readonly status: number | null;

  constructor(
    code: GitHubError['code'],
    message: string,
    status: number | null = null
  ) {
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status;
  }
}

type RepoEnv = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

function envValue(...names: string[]): string | null {
  for (const name of names) {
    const value = (process.env[name] || '').trim();
    if (value) return value;
  }
  return null;
}

function splitRepo(value: string | null): { owner: string | null; repo: string | null } {
  if (!value) return { owner: null, repo: null };
  const [owner, repo] = value.split('/');
  return {
    owner: owner?.trim() || null,
    repo: repo?.trim() || null,
  };
}

function resolveRepoEnv(): RepoEnv {
  const explicit = splitRepo(envValue('PIERROT_GITHUB_REPO'));
  const repositoryFallback = splitRepo(envValue('GITHUB_REPOSITORY'));
  const githubRepo = envValue('GITHUB_REPO');
  const githubRepoParts = splitRepo(githubRepo);
  const plainGithubRepo =
    githubRepo && !githubRepo.includes('/') ? githubRepo : null;
  const defaultBranch = envValue('GITHUB_DEFAULT_BRANCH') || DEFAULT_BRANCH;

  if (explicit.owner && explicit.repo) {
    return {
      owner: explicit.owner,
      repo: explicit.repo,
      defaultBranch,
    };
  }

  return {
    owner:
      envValue('GITHUB_OWNER') ||
      githubRepoParts.owner ||
      repositoryFallback.owner ||
      envValue('GITHUB_REPO_OWNER', 'VERCEL_GIT_REPO_OWNER') ||
      DEFAULT_OWNER,
    repo:
      githubRepoParts.repo ||
      plainGithubRepo ||
      repositoryFallback.repo ||
      envValue('GITHUB_REPO_NAME', 'VERCEL_GIT_REPO_SLUG') ||
      DEFAULT_REPO,
    defaultBranch,
  };
}

export function getGitHubToken(): string | null {
  return envValue('GITHUB_TOKEN');
}

export function isGitHubConfigured(): boolean {
  return Boolean(getGitHubToken());
}

export function isGitHubWriteEnabled(): boolean {
  return envValue('PIERROT_DEV_WRITE_ENABLED') !== 'false';
}

export function getGitHubRepository(): GitHubRepository {
  const env = resolveRepoEnv();

  return {
    owner: env.owner,
    repo: env.repo,
    fullName: `${env.owner}/${env.repo}`,
    defaultBranch: env.defaultBranch,
  };
}

let cachedClient: { token: string; client: Octokit } | null = null;
let authCache: { status: GitHubAuthStatus; expiresAt: number } | null = null;
let missingTokenLogged = false;

/**
 * Returns an Octokit client authenticated by GITHUB_TOKEN.
 * No OAuth, user login, browser token or per-user credential is involved.
 */
export function getGitHubClient(): Octokit | null {
  const token = getGitHubToken();

  if (!token) {
    if (!missingTokenLogged) {
      missingTokenLogged = true;
      console.error(
        '[github] GITHUB_TOKEN is not configured. GitHub API calls are disabled.'
      );
    }
    return null;
  }

  if (cachedClient?.token === token) return cachedClient.client;

  const client = new Octokit({
    auth: token,
    userAgent: 'pierrot-server/1.0',
    request: { timeout: 8_000 },
  });

  cachedClient = { token, client };
  return client;
}

function requireClient(): Octokit {
  const client = getGitHubClient();
  if (!client) {
    throw new GitHubError(
      'GITHUB_TOKEN_MISSING',
      'GITHUB_TOKEN is not configured.'
    );
  }
  return client;
}

function statusFrom(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const value = (error as { status?: unknown }).status;
    return typeof value === 'number' ? value : null;
  }
  return null;
}

function safeErrorMessage(error: unknown): string {
  const status = statusFrom(error);

  if (status === 401) return 'GitHub token was rejected (401).';
  if (status === 403) return 'GitHub API access was denied (403).';
  if (status === 404) return 'Repository or path was not found (404).';
  if (status === 429) return 'GitHub API rate limit reached (429).';

  return error instanceof Error ? error.message : 'GitHub API request failed.';
}

/**
 * Lightweight startup/readiness check. Calls users.getAuthenticated() once and
 * memoizes the result for five minutes to avoid a GitHub request per render.
 * Tokens and request headers are never logged.
 */
export async function verifyGitHubAuth(
  options: { force?: boolean } = {}
): Promise<GitHubAuthStatus> {
  const now = Date.now();

  if (!options.force && authCache && authCache.expiresAt > now) {
    return authCache.status;
  }

  if (!getGitHubToken()) {
    const status: GitHubAuthStatus = {
      configured: false,
      authenticated: false,
      login: null,
      name: null,
      status: null,
      error: 'GITHUB_TOKEN is not configured.',
      checkedAt: new Date().toISOString(),
    };

    if (!missingTokenLogged) {
      missingTokenLogged = true;
      console.error(
        '[github] GITHUB_TOKEN is not configured. GitHub API calls are disabled.'
      );
    }

    authCache = { status, expiresAt: now + 60_000 };
    return status;
  }

  const client = requireClient();

  try {
    const response = await client.rest.users.getAuthenticated();
    const status: GitHubAuthStatus = {
      configured: true,
      authenticated: true,
      login: response.data.login,
      name: response.data.name ?? null,
      status: 200,
      error: null,
      checkedAt: new Date().toISOString(),
    };

    authCache = { status, expiresAt: now + AUTH_CACHE_MS };
    return status;
  } catch (error) {
    const httpStatus = statusFrom(error);
    const message = safeErrorMessage(error);

    console.error('[github] authentication failed', {
      status: httpStatus,
      message,
    });

    const status: GitHubAuthStatus = {
      configured: true,
      authenticated: false,
      login: null,
      name: null,
      status: httpStatus,
      error: message,
      checkedAt: new Date().toISOString(),
    };

    authCache = { status, expiresAt: now + 60_000 };
    return status;
  }
}

export function normalizeGitHubPath(value: unknown): string {
  const path =
    typeof value === 'string' ? value.replace(/^\/+/, '').replace(/\/+$/, '').trim() : '';

  if (!path) return '';
  if (path.length > 500 || path.includes('\0') || path.split('/').includes('..')) {
    throw new GitHubError('GITHUB_INVALID_PATH', 'Invalid repository path.');
  }

  return path;
}

export function normalizeGitHubBranch(value: unknown, fallback: string): string {
  const branch =
    typeof value === 'string' && value.trim() ? value.trim() : fallback;

  if (
    branch.length > 200 ||
    branch.includes('..') ||
    branch.includes('\0') ||
    !/^[A-Za-z0-9._/-]+$/.test(branch)
  ) {
    throw new GitHubError('GITHUB_INVALID_BRANCH', 'Invalid branch name.');
  }

  return branch;
}

async function getBranchSha(client: Octokit, branch: string): Promise<string> {
  const repo = getGitHubRepository();
  const response = await client.rest.repos.getBranch({
    owner: repo.owner,
    repo: repo.repo,
    branch,
  });

  return response.data.commit.sha;
}

async function ensureBranch(client: Octokit, branch: string): Promise<void> {
  const repo = getGitHubRepository();

  try {
    await getBranchSha(client, branch);
    return;
  } catch (error) {
    if (statusFrom(error) !== 404) throw error;
    if (branch === repo.defaultBranch) {
      throw new GitHubError(
        'GITHUB_API_ERROR',
        `Default branch ${branch} was not found.`,
        404
      );
    }
  }

  const baseSha = await getBranchSha(client, repo.defaultBranch);
  await client.rest.git.createRef({
    owner: repo.owner,
    repo: repo.repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
}

export async function getRepoStructure(
  path: unknown = '',
  ref?: string
): Promise<GitHubStructureResult> {
  const client = requireClient();
  const repo = getGitHubRepository();
  const normalizedPath = normalizeGitHubPath(path);
  const branch = normalizeGitHubBranch(ref, repo.defaultBranch);

  try {
    const response = await client.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path: normalizedPath,
      ref: branch,
    });

    if (Array.isArray(response.data)) {
      return {
        path: normalizedPath || '/',
        ref: branch,
        entries: response.data.slice(0, MAX_TREE_ENTRIES).map((entry) => ({
          name: entry.name,
          path: entry.path,
          type: entry.type,
          size: entry.size ?? null,
          sha: entry.sha,
        })),
        truncated: response.data.length > MAX_TREE_ENTRIES,
      };
    }

    return {
      path: response.data.path,
      ref: branch,
      entries: [
        {
          name: response.data.name,
          path: response.data.path,
          type: response.data.type,
          size: response.data.size,
          sha: response.data.sha,
        },
      ],
      truncated: false,
    };
  } catch (error) {
    throw new GitHubError(
      'GITHUB_API_ERROR',
      safeErrorMessage(error),
      statusFrom(error)
    );
  }
}

export async function readFileContent(
  path: unknown,
  ref?: string
): Promise<GitHubFileResult> {
  const client = requireClient();
  const repo = getGitHubRepository();
  const normalizedPath = normalizeGitHubPath(path);

  if (!normalizedPath) {
    throw new GitHubError('GITHUB_INVALID_PATH', 'File path is required.');
  }

  const branch = normalizeGitHubBranch(ref, repo.defaultBranch);

  try {
    const response = await client.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path: normalizedPath,
      ref: branch,
    });

    if (Array.isArray(response.data) || response.data.type !== 'file') {
      throw new GitHubError('GITHUB_NOT_A_FILE', 'Path is not a file.');
    }

    if (!response.data.content) {
      throw new GitHubError(
        'GITHUB_API_ERROR',
        'GitHub returned no file content.'
      );
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    const truncated = content.length > MAX_READ_CHARS;

    if (truncated) {
      throw new GitHubError(
        'GITHUB_FILE_TOO_LARGE',
        `File exceeds ${MAX_READ_CHARS} characters.`
      );
    }

    return {
      path: response.data.path,
      sha: response.data.sha,
      size: response.data.size,
      ref: branch,
      content,
      truncated: false,
    };
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError(
      'GITHUB_API_ERROR',
      safeErrorMessage(error),
      statusFrom(error)
    );
  }
}

export async function createOrUpdateFile(input: {
  path: unknown;
  content: unknown;
  message: unknown;
  branch?: unknown;
}): Promise<GitHubCommitResult> {
  if (!isGitHubWriteEnabled()) {
    throw new GitHubError(
      'GITHUB_WRITES_DISABLED',
      'GitHub writes are disabled by PIERROT_DEV_WRITE_ENABLED=false.'
    );
  }

  const client = requireClient();
  const repo = getGitHubRepository();
  const path = normalizeGitHubPath(input.path);

  if (!path) {
    throw new GitHubError('GITHUB_INVALID_PATH', 'File path is required.');
  }

  if (typeof input.content !== 'string') {
    throw new GitHubError('GITHUB_API_ERROR', 'File content is required.');
  }

  if (input.content.length > MAX_WRITE_CHARS) {
    throw new GitHubError(
      'GITHUB_FILE_TOO_LARGE',
      `File exceeds ${MAX_WRITE_CHARS} characters.`
    );
  }

  const message =
    typeof input.message === 'string' && input.message.trim()
      ? input.message.trim().slice(0, 500)
      : 'Pierrot Dev update';

  const branch = normalizeGitHubBranch(input.branch, repo.defaultBranch);

  try {
    await ensureBranch(client, branch);
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    throw new GitHubError(
      'GITHUB_API_ERROR',
      safeErrorMessage(error),
      statusFrom(error)
    );
  }

  let sha: string | undefined;

  try {
    const existing = await client.rest.repos.getContent({
      owner: repo.owner,
      repo: repo.repo,
      path,
      ref: branch,
    });

    if (Array.isArray(existing.data) || existing.data.type !== 'file') {
      throw new GitHubError('GITHUB_NOT_A_FILE', 'Path exists but is not a file.');
    }
    sha = existing.data.sha;
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    if (statusFrom(error) !== 404) {
      throw new GitHubError(
        'GITHUB_API_ERROR',
        safeErrorMessage(error),
        statusFrom(error)
      );
    }
  }

  try {
    const response = await client.rest.repos.createOrUpdateFileContents({
      owner: repo.owner,
      repo: repo.repo,
      path,
      message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    });

    const commitSha = response.data.commit.sha;
    const commitUrl = response.data.commit.html_url;

    if (!commitSha || !commitUrl) {
      throw new GitHubError(
        'GITHUB_API_ERROR',
        'GitHub returned an incomplete commit response.'
      );
    }

    return {
      path,
      branch,
      commitSha,
      commitUrl,
      contentSha: response.data.content?.sha ?? null,
    };
  } catch (error) {
    throw new GitHubError(
      'GITHUB_API_ERROR',
      safeErrorMessage(error),
      statusFrom(error)
    );
  }
}

export async function createPullRequest(input: {
  title: unknown;
  head: unknown;
  base?: unknown;
  body?: unknown;
}): Promise<GitHubPullRequestResult> {
  if (!isGitHubWriteEnabled()) {
    throw new GitHubError(
      'GITHUB_WRITES_DISABLED',
      'GitHub writes are disabled by PIERROT_DEV_WRITE_ENABLED=false.'
    );
  }

  const client = requireClient();
  const repo = getGitHubRepository();
  const title =
    typeof input.title === 'string' ? input.title.trim().slice(0, 240) : '';
  const head = normalizeGitHubBranch(input.head, '');
  const base = normalizeGitHubBranch(input.base, repo.defaultBranch);
  const body =
    typeof input.body === 'string' ? input.body.slice(0, 20_000) : '';

  if (!title) {
    throw new GitHubError('GITHUB_API_ERROR', 'Pull request title is required.');
  }
  if (!head) {
    throw new GitHubError('GITHUB_INVALID_BRANCH', 'Head branch is required.');
  }

  try {
    const response = await client.rest.pulls.create({
      owner: repo.owner,
      repo: repo.repo,
      title,
      head,
      base,
      body,
    });

    return {
      number: response.data.number,
      url: response.data.html_url,
      state: response.data.state,
      head: response.data.head.ref,
      base: response.data.base.ref,
    };
  } catch (error) {
    throw new GitHubError(
      'GITHUB_API_ERROR',
      safeErrorMessage(error),
      statusFrom(error)
    );
  }
}
