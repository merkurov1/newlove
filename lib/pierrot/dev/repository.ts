import { assertServerOnly } from '@/lib/serverOnly';
import { Octokit } from '@octokit/rest';
import {
  GitHubError,
  getGitHubToken,
  normalizeGitHubBranch,
  normalizeGitHubPath,
} from '@/lib/github';
import {
  getDevRepositoryConfigs,
  resolveDevRepository,
} from './repositories';
import type {
  DevRepositoryConfig,
  DevRepositoryKey,
  DevRepositoryStatus,
} from './types';

assertServerOnly('lib/pierrot/dev/repository');

const MAX_TREE_ENTRIES = 500;
const MAX_FILE_CHARS = 200_000;
const MAX_RANGE_LINES = 400;
const MAX_SEARCH_RESULTS = 30;
const MAX_DIFF_FILES = 60;
const MAX_PATCH_CHARS = 12_000;
const CACHE_TTL_MS = 60_000;
const STATUS_TTL_MS = 5 * 60_000;
const GITHUB_TIMEOUT_MS = Number(process.env.PIERROT_DEV_GITHUB_TIMEOUT_MS || 15_000);

type CacheEntry = { expiresAt: number; value: unknown };
const cache = new Map<string, CacheEntry>();

type ClientCache = { token: string; client: Octokit } | null;
let clientCache: ClientCache = null;
let missingTokenLogged = false;

export class DevRepoError extends Error {
  readonly code:
    | 'GITHUB_TOKEN_MISSING'
    | 'GITHUB_AUTH_FAILED'
    | 'GITHUB_REPO_NOT_ACCESSIBLE'
    | 'GITHUB_INVALID_PATH'
    | 'GITHUB_INVALID_BRANCH'
    | 'GITHUB_NOT_A_FILE'
    | 'GITHUB_NOT_TEXT'
    | 'GITHUB_NOT_FOUND'
    | 'GITHUB_RATE_LIMITED'
    | 'GITHUB_API_ERROR';
  readonly status: number | null;
  readonly repository: string | null;

  constructor(
    code: DevRepoError['code'],
    message: string,
    options: { status?: number | null; repository?: string | null } = {}
  ) {
    super(message);
    this.name = 'DevRepoError';
    this.code = code;
    this.status = options.status ?? null;
    this.repository = options.repository ?? null;
  }
}

export type DevRepoResult<T> = T & {
  repository: string;
  repositoryKey: DevRepositoryKey;
  branch: string;
  commitSha: string | null;
  complete: boolean;
  warnings: string[];
  source: 'github';
};

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
  if (status === 403) return 'GitHub API access was denied or rate-limited (403).';
  if (status === 404) return `Repository, branch or path was not found (404) in ${repository}.`;
  if (status === 422) return 'GitHub rejected the request parameters (422).';
  if (status === 429) return 'GitHub API rate limit reached (429).';
  return error instanceof Error ? error.message : 'GitHub API request failed.';
}

function getClient(): Octokit {
  const token = getGitHubToken();
  if (!token) {
    if (!missingTokenLogged) {
      missingTokenLogged = true;
      console.error('[pierrot-dev] GITHUB_TOKEN is not configured. Read tools are disabled.');
    }
    throw new DevRepoError('GITHUB_TOKEN_MISSING', 'GITHUB_TOKEN is not configured.');
  }

  if (clientCache?.token === token) return clientCache.client;

  const client = new Octokit({
    auth: token,
    userAgent: 'pierrot-dev/2.0',
    request: { timeout: GITHUB_TIMEOUT_MS },
  });
  clientCache = { token, client };
  return client;
}

function cacheKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((part) => part ?? '').join('|');
}

async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;
  const value = await load();
  cache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

function wrap<T>(
  config: DevRepositoryConfig,
  branch: string,
  commitSha: string | null,
  data: T,
  complete = true,
  warnings: string[] = []
): DevRepoResult<T> {
  return {
    ...(data as object),
    repository: config.fullName,
    repositoryKey: config.key,
    branch,
    commitSha,
    complete,
    warnings,
    source: 'github',
  } as DevRepoResult<T>;
}

function toDevError(error: unknown, config: DevRepositoryConfig): DevRepoError {
  if (error instanceof DevRepoError) return error;
  if (error instanceof GitHubError) {
    return new DevRepoError(
      error.code === 'GITHUB_TOKEN_MISSING'
        ? 'GITHUB_TOKEN_MISSING'
        : error.code === 'GITHUB_INVALID_PATH'
          ? 'GITHUB_INVALID_PATH'
          : error.code === 'GITHUB_INVALID_BRANCH'
            ? 'GITHUB_INVALID_BRANCH'
            : error.code === 'GITHUB_NOT_A_FILE'
              ? 'GITHUB_NOT_A_FILE'
              : 'GITHUB_API_ERROR',
      error.message,
      { status: error.status, repository: config.fullName }
    );
  }
  const status = statusFrom(error);
  return new DevRepoError(
    status === 401
      ? 'GITHUB_AUTH_FAILED'
      : status === 404
        ? 'GITHUB_NOT_FOUND'
        : status === 429
          ? 'GITHUB_RATE_LIMITED'
          : 'GITHUB_API_ERROR',
    safeMessage(error, config.fullName),
    { status, repository: config.fullName }
  );
}

async function resolveBranch(config: DevRepositoryConfig, ref?: unknown): Promise<string> {
  return normalizeGitHubBranch(ref, config.workBranch);
}

async function resolveCommitSha(
  client: Octokit,
  config: DevRepositoryConfig,
  branch: string
): Promise<string | null> {
  if (/^[0-9a-f]{7,40}$/i.test(branch)) {
    const full = branch.length === 40 ? branch : null;
    if (full) return full;
    const response = await client.rest.repos.getCommit({
      owner: config.owner,
      repo: config.repo,
      ref: branch,
    });
    return response.data.sha;
  }

  return cached(
    cacheKey(['branch-sha', config.fullName, branch]),
    CACHE_TTL_MS,
    async () => {
      const response = await client.rest.repos.getBranch({
        owner: config.owner,
        repo: config.repo,
        branch,
      });
      return response.data.commit.sha;
    }
  );
}

export async function getRepoInfo(input: {
  repository?: unknown;
  ref?: unknown;
}): Promise<DevRepoResult<{
  info: {
    fullName: string;
    description: string | null;
    defaultBranch: string;
    private: boolean;
    language: string | null;
    pushedAt: string | null;
    htmlUrl: string;
    permissions: Record<string, boolean> | null;
  };
  latestCommit: {
    sha: string;
    message: string;
    author: string | null;
    date: string | null;
    url: string | null;
  } | null;
  requestedRef: string;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);

  try {
    const result = await cached(
      cacheKey(['repo-info', config.fullName, branch]),
      CACHE_TTL_MS,
      async () => {
        const repo = await client.rest.repos.get({
          owner: config.owner,
          repo: config.repo,
        });
        const commit = await client.rest.repos.getCommit({
          owner: config.owner,
          repo: config.repo,
          ref: branch,
        });

        return {
          info: {
            fullName: repo.data.full_name,
            description: repo.data.description,
            defaultBranch: repo.data.default_branch,
            private: repo.data.private,
            language: repo.data.language ?? null,
            pushedAt: repo.data.pushed_at ?? null,
            htmlUrl: repo.data.html_url,
            permissions: (repo.data.permissions as Record<string, boolean> | undefined) ?? null,
          },
          latestCommit: {
            sha: commit.data.sha,
            message: commit.data.commit.message?.split('\n')[0] || '',
            author: commit.data.commit.author?.name ?? null,
            date: commit.data.commit.author?.date ?? null,
            url: commit.data.html_url ?? null,
          },
          requestedRef: branch,
        };
      }
    );

    return wrap(config, branch, result.latestCommit.sha, result);
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function getRepoTree(input: {
  repository?: unknown;
  path?: unknown;
  ref?: unknown;
  recursive?: unknown;
}): Promise<DevRepoResult<{
  path: string;
  entries: Array<{
    name: string;
    path: string;
    type: string;
    size: number | null;
    sha: string;
  }>;
  truncated: boolean;
  totalEntries: number | null;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);
  const commitSha = await resolveCommitSha(client, config, branch);
  const path = normalizeGitHubPath(input.path);
  const recursive = input.recursive === true;

  try {
    if (recursive) {
      const tree = await client.rest.git.getTree({
        owner: config.owner,
        repo: config.repo,
        tree_sha: commitSha || branch,
        recursive: '1',
      });
      const all = tree.data.tree.filter((entry) => entry.type === 'blob' || entry.type === 'tree');
      const filtered = path
        ? all.filter((entry) => entry.path === path || entry.path?.startsWith(`${path}/`))
        : all;
      const entries = filtered.slice(0, MAX_TREE_ENTRIES).map((entry) => ({
        name: (entry.path || '').split('/').pop() || entry.path || '',
        path: entry.path || '',
        type: entry.type || 'unknown',
        size: entry.size ?? null,
        sha: entry.sha || '',
      }));
      const truncated = Boolean(tree.data.truncated) || filtered.length > MAX_TREE_ENTRIES;
      const warnings = truncated
        ? [`Tree limited to ${MAX_TREE_ENTRIES} entries${tree.data.truncated ? '; GitHub also truncated the tree' : ''}.`]
        : [];
      return wrap(
        config,
        branch,
        commitSha,
        {
          path: path || '/',
          entries,
          truncated,
          totalEntries: tree.data.truncated ? null : filtered.length,
        },
        !truncated,
        warnings
      );
    }

    const response = await client.rest.repos.getContent({
      owner: config.owner,
      repo: config.repo,
      path,
      ref: branch,
    });

    if (!Array.isArray(response.data)) {
      const entry = response.data;
      return wrap(
        config,
        branch,
        commitSha,
        {
          path: entry.path,
          entries: [
            {
              name: entry.name,
              path: entry.path,
              type: entry.type,
              size: entry.size ?? null,
              sha: entry.sha,
            },
          ],
          truncated: false,
          totalEntries: 1,
        },
        true
      );
    }

    const entries = response.data.slice(0, MAX_TREE_ENTRIES).map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size ?? null,
      sha: entry.sha,
    }));
    const truncated = response.data.length > MAX_TREE_ENTRIES;
    return wrap(
      config,
      branch,
      commitSha,
      {
        path: path || '/',
        entries,
        truncated,
        totalEntries: response.data.length,
      },
      !truncated,
      truncated ? [`Directory limited to ${MAX_TREE_ENTRIES} entries.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function searchRepo(input: {
  repository?: unknown;
  query?: unknown;
  mode?: unknown;
  path?: unknown;
  filename?: unknown;
  ref?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  query: string;
  mode: 'code' | 'filename';
  matches: Array<{
    path: string;
    name: string;
    sha: string;
    url: string | null;
    fragments: string[];
  }>;
  totalCount: number;
  incomplete: boolean;
  note: string;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);
  const commitSha = await resolveCommitSha(client, config, branch);
  const mode = input.mode === 'filename' ? 'filename' : 'code';
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const filename = typeof input.filename === 'string' ? input.filename.trim() : '';
  const path = input.path ? normalizeGitHubPath(input.path) : '';
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 15, 1),
    MAX_SEARCH_RESULTS
  );

  const term = mode === 'filename' ? filename || query : query;
  if (!term) {
    throw new DevRepoError('GITHUB_INVALID_PATH', 'Search query is required.', {
      repository: config.fullName,
    });
  }

  const qualifiers = [`repo:${config.fullName}`];
  if (mode === 'filename') qualifiers.push(`filename:${term}`);
  else qualifiers.push(term);
  if (filename && mode === 'code') qualifiers.push(`filename:${filename}`);
  if (path) qualifiers.push(`path:${path}`);

  try {
    const response = await client.rest.search.code({
      q: qualifiers.join(' '),
      per_page: limit,
    });

    const matches = (response.data.items || []).slice(0, limit).map((item) => ({
      path: item.path,
      name: item.name,
      sha: item.sha,
      url: item.html_url ?? null,
      fragments: Array.isArray(item.text_matches)
        ? item.text_matches
            .map((match) => (typeof match.fragment === 'string' ? match.fragment : ''))
            .filter(Boolean)
            .slice(0, 3)
        : [],
    }));

    const warnings: string[] = [];
    if (branch !== config.defaultBranch) {
      warnings.push(
        'GitHub code search indexes the default branch. Results may not match the requested ref.'
      );
    }
    if (response.data.incomplete_results) {
      warnings.push('GitHub reported incomplete search results.');
    }
    if (response.data.total_count > matches.length) {
      warnings.push(`Showing ${matches.length} of ${response.data.total_count} matches.`);
    }

    return wrap(
      config,
      branch,
      commitSha,
      {
        query: term,
        mode,
        matches,
        totalCount: response.data.total_count,
        incomplete: Boolean(response.data.incomplete_results),
        note:
          mode === 'filename'
            ? 'Filename search through GitHub code search.'
            : 'Content search through GitHub code search; snippets may be absent.',
      },
      !response.data.incomplete_results && branch === config.defaultBranch,
      warnings
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

async function readFileInternal(
  client: Octokit,
  config: DevRepositoryConfig,
  path: string,
  branch: string
): Promise<{
  path: string;
  sha: string;
  size: number;
  content: string;
  truncated: boolean;
  totalChars: number;
}> {
  const response = await client.rest.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path,
    ref: branch,
  });

  if (Array.isArray(response.data) || response.data.type !== 'file') {
    throw new DevRepoError('GITHUB_NOT_A_FILE', 'Path is not a file.', {
      repository: config.fullName,
    });
  }

  const file = response.data;
  let content = '';
  if (typeof file.content === 'string' && file.content) {
    content = Buffer.from(file.content, 'base64').toString('utf8');
  } else {
    const blob = await client.rest.git.getBlob({
      owner: config.owner,
      repo: config.repo,
      file_sha: file.sha,
    });
    content = Buffer.from(blob.data.content, 'base64').toString('utf8');
  }

  if (content.includes('\u0000')) {
    throw new DevRepoError('GITHUB_NOT_TEXT', 'File is binary.', {
      repository: config.fullName,
    });
  }

  const totalChars = content.length;
  const truncated = totalChars > MAX_FILE_CHARS;
  if (truncated) content = content.slice(0, MAX_FILE_CHARS);

  return {
    path: file.path,
    sha: file.sha,
    size: file.size,
    content,
    truncated,
    totalChars,
  };
}

export async function readFile(input: {
  repository?: unknown;
  path?: unknown;
  ref?: unknown;
}): Promise<DevRepoResult<{
  path: string;
  sha: string;
  size: number;
  content: string;
  lineCount: number;
  truncated: boolean;
  totalChars: number;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);
  const commitSha = await resolveCommitSha(client, config, branch);
  const path = normalizeGitHubPath(input.path);

  if (!path) {
    throw new DevRepoError('GITHUB_INVALID_PATH', 'File path is required.', {
      repository: config.fullName,
    });
  }

  try {
    const file = await cached(
      cacheKey(['file', config.fullName, commitSha || branch, path]),
      CACHE_TTL_MS,
      () => readFileInternal(client, config, path, branch)
    );
    return wrap(
      config,
      branch,
      commitSha,
      {
        ...file,
        lineCount: file.content.split('\n').length,
      },
      !file.truncated,
      file.truncated
        ? [`File truncated to ${MAX_FILE_CHARS} of ${file.totalChars} characters.`]
        : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function readFileRange(input: {
  repository?: unknown;
  path?: unknown;
  ref?: unknown;
  startLine?: unknown;
  endLine?: unknown;
}): Promise<DevRepoResult<{
  path: string;
  sha: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);
  const commitSha = await resolveCommitSha(client, config, branch);
  const path = normalizeGitHubPath(input.path);

  if (!path) {
    throw new DevRepoError('GITHUB_INVALID_PATH', 'File path is required.', {
      repository: config.fullName,
    });
  }

  const startLine = Math.max(
    1,
    typeof input.startLine === 'number' && Number.isFinite(input.startLine)
      ? Math.floor(input.startLine)
      : 1
  );
  const requestedEnd =
    typeof input.endLine === 'number' && Number.isFinite(input.endLine)
      ? Math.floor(input.endLine)
      : startLine + 199;
  const endLine = Math.max(startLine, Math.min(requestedEnd, startLine + MAX_RANGE_LINES - 1));

  try {
    const file = await cached(
      cacheKey(['file', config.fullName, commitSha || branch, path]),
      CACHE_TTL_MS,
      () => readFileInternal(client, config, path, branch)
    );
    const lines = file.content.split('\n');
    const totalLines = lines.length;
    const actualStart = Math.min(startLine, totalLines);
    const actualEnd = Math.min(endLine, totalLines);
    const content = lines.slice(actualStart - 1, actualEnd).join('\n');
    const truncated = file.truncated || actualEnd < endLine || requestedEnd > actualEnd;

    return wrap(
      config,
      branch,
      commitSha,
      {
        path: file.path,
        sha: file.sha,
        startLine: actualStart,
        endLine: actualEnd,
        totalLines,
        content,
        truncated,
      },
      !file.truncated,
      file.truncated
        ? [`File was truncated at ${MAX_FILE_CHARS} characters before the range completed.`]
        : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function listBranches(input: {
  repository?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  branches: Array<{
    name: string;
    commitSha: string;
    protected: boolean;
  }>;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 50, 1),
    100
  );

  try {
    const response = await client.rest.repos.listBranches({
      owner: config.owner,
      repo: config.repo,
      per_page: limit,
    });
    const branches = response.data.map((branch) => ({
      name: branch.name,
      commitSha: branch.commit.sha,
      protected: Boolean(branch.protected),
    }));
    const truncated = branches.length >= limit;
    return wrap(
      config,
      config.workBranch,
      branches.find((branch) => branch.name === config.workBranch)?.commitSha ?? null,
      { branches, truncated },
      !truncated,
      truncated ? [`Branch list limited to ${limit}.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function listCommits(input: {
  repository?: unknown;
  ref?: unknown;
  path?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  commits: Array<{
    sha: string;
    message: string;
    author: string | null;
    date: string | null;
    url: string | null;
  }>;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 10, 1),
    50
  );
  const path = input.path ? normalizeGitHubPath(input.path) : undefined;

  try {
    const response = await client.rest.repos.listCommits({
      owner: config.owner,
      repo: config.repo,
      sha: branch,
      ...(path ? { path } : {}),
      per_page: limit,
    });
    const commits = response.data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message?.split('\n')[0] || '',
      author: commit.commit.author?.name ?? commit.author?.login ?? null,
      date: commit.commit.author?.date ?? null,
      url: commit.html_url ?? null,
    }));
    return wrap(
      config,
      branch,
      commits[0]?.sha || (await resolveCommitSha(client, config, branch)),
      { commits, truncated: commits.length >= limit },
      commits.length < limit,
      commits.length >= limit ? [`Commit list limited to ${limit}.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function getCommit(input: {
  repository?: unknown;
  ref?: unknown;
}): Promise<DevRepoResult<{
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string | null;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string | null;
    patchTruncated: boolean;
  }>;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);

  try {
    const response = await client.rest.repos.getCommit({
      owner: config.owner,
      repo: config.repo,
      ref: branch,
    });
    const files = (response.data.files || []).slice(0, MAX_DIFF_FILES).map((file) => {
      const patch = typeof file.patch === 'string' ? file.patch : null;
      return {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: patch ? patch.slice(0, MAX_PATCH_CHARS) : null,
        patchTruncated: Boolean(patch && patch.length > MAX_PATCH_CHARS),
      };
    });
    return wrap(
      config,
      branch,
      response.data.sha,
      {
        sha: response.data.sha,
        message: response.data.commit.message || '',
        author: response.data.commit.author?.name ?? null,
        date: response.data.commit.author?.date ?? null,
        url: response.data.html_url ?? null,
        files,
      },
      files.length < MAX_DIFF_FILES,
      files.length >= MAX_DIFF_FILES
        ? [`Diff limited to ${MAX_DIFF_FILES} files.`]
        : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function compareRefs(input: {
  repository?: unknown;
  base?: unknown;
  head?: unknown;
}): Promise<DevRepoResult<{
  base: string;
  head: string;
  status: string | null;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  commits: Array<{ sha: string; message: string; author: string | null; date: string | null }>;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string | null;
    patchTruncated: boolean;
  }>;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const base = await resolveBranch(config, input.base);
  const head = await resolveBranch(config, input.head);

  if (!input.head) {
    throw new DevRepoError('GITHUB_INVALID_BRANCH', 'head ref is required.', {
      repository: config.fullName,
    });
  }

  try {
    const response = await client.rest.repos.compareCommitsWithBasehead({
      owner: config.owner,
      repo: config.repo,
      basehead: `${base}...${head}`,
    });
    const files = (response.data.files || []).slice(0, MAX_DIFF_FILES).map((file) => {
      const patch = typeof file.patch === 'string' ? file.patch : null;
      return {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: patch ? patch.slice(0, MAX_PATCH_CHARS) : null,
        patchTruncated: Boolean(patch && patch.length > MAX_PATCH_CHARS),
      };
    });
    const commits = (response.data.commits || []).map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message?.split('\n')[0] || '',
      author: commit.commit.author?.name ?? null,
      date: commit.commit.author?.date ?? null,
    }));
    const truncated = files.length >= MAX_DIFF_FILES;
    return wrap(
      config,
      `${base}...${head}`,
      response.data.commits?.[response.data.commits.length - 1]?.sha ?? null,
      {
        base,
        head,
        status: response.data.status ?? null,
        aheadBy: response.data.ahead_by,
        behindBy: response.data.behind_by,
        totalCommits: response.data.total_commits,
        commits,
        files,
        truncated,
      },
      !truncated,
      truncated ? [`Diff limited to ${MAX_DIFF_FILES} files.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function listPullRequests(input: {
  repository?: unknown;
  state?: unknown;
  base?: unknown;
  head?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  pullRequests: Array<{
    number: number;
    title: string;
    state: string;
    draft: boolean;
    merged: boolean;
    mergedAt: string | null;
    head: string;
    base: string;
    author: string | null;
    url: string;
    updatedAt: string | null;
  }>;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const state = input.state === 'closed' || input.state === 'all' ? input.state : 'open';
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 20, 1),
    50
  );
  const base = input.base ? await resolveBranch(config, input.base) : undefined;
  const head = input.head ? await resolveBranch(config, input.head) : undefined;

  try {
    const response = await client.rest.pulls.list({
      owner: config.owner,
      repo: config.repo,
      state,
      ...(base ? { base } : {}),
      ...(head ? { head: `${config.owner}:${head}` } : {}),
      sort: 'updated',
      direction: 'desc',
      per_page: limit,
    });
    const pullRequests = response.data.map((pull) => ({
      number: pull.number,
      title: pull.title,
      state: pull.state,
      draft: Boolean(pull.draft),
      merged: Boolean(pull.merged_at),
      mergedAt: pull.merged_at ?? null,
      head: pull.head.ref,
      base: pull.base.ref,
      author: pull.user?.login ?? null,
      url: pull.html_url,
      updatedAt: pull.updated_at ?? null,
    }));
    return wrap(
      config,
      config.workBranch,
      null,
      { pullRequests, truncated: pullRequests.length >= limit },
      pullRequests.length < limit,
      pullRequests.length >= limit ? [`Pull request list limited to ${limit}.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function getPullRequest(input: {
  repository?: unknown;
  number?: unknown;
  includeFiles?: unknown;
}): Promise<DevRepoResult<{
  number: number;
  title: string;
  body: string;
  state: string;
  draft: boolean;
  merged: boolean;
  mergedAt: string | null;
  head: string;
  base: string;
  author: string | null;
  url: string;
  createdAt: string | null;
  updatedAt: string | null;
  mergeable: boolean | null;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string | null;
    patchTruncated: boolean;
  }>;
  filesTruncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const number = typeof input.number === 'number' ? Math.floor(input.number) : Number(input.number);

  if (!Number.isFinite(number) || number <= 0) {
    throw new DevRepoError('GITHUB_API_ERROR', 'A positive pull request number is required.', {
      repository: config.fullName,
    });
  }

  try {
    const response = await client.rest.pulls.get({
      owner: config.owner,
      repo: config.repo,
      pull_number: number,
    });
    let files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch: string | null;
      patchTruncated: boolean;
    }> = [];
    let filesTruncated = false;

    if (input.includeFiles !== false) {
      const fileResponse = await client.rest.pulls.listFiles({
        owner: config.owner,
        repo: config.repo,
        pull_number: number,
        per_page: MAX_DIFF_FILES,
      });
      files = fileResponse.data.map((file) => {
        const patch = typeof file.patch === 'string' ? file.patch : null;
        return {
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: patch ? patch.slice(0, MAX_PATCH_CHARS) : null,
          patchTruncated: Boolean(patch && patch.length > MAX_PATCH_CHARS),
        };
      });
      filesTruncated = fileResponse.data.length >= MAX_DIFF_FILES;
    }

    return wrap(
      config,
      response.data.head.ref,
      response.data.head.sha,
      {
        number: response.data.number,
        title: response.data.title,
        body: response.data.body || '',
        state: response.data.state,
        draft: Boolean(response.data.draft),
        merged: Boolean(response.data.merged_at),
        mergedAt: response.data.merged_at ?? null,
        head: response.data.head.ref,
        base: response.data.base.ref,
        author: response.data.user?.login ?? null,
        url: response.data.html_url,
        createdAt: response.data.created_at ?? null,
        updatedAt: response.data.updated_at ?? null,
        mergeable: response.data.mergeable ?? null,
        files,
        filesTruncated,
      },
      !filesTruncated,
      filesTruncated ? [`Pull request files limited to ${MAX_DIFF_FILES}.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function listIssues(input: {
  repository?: unknown;
  state?: unknown;
  labels?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  issues: Array<{
    number: number;
    title: string;
    state: string;
    author: string | null;
    labels: string[];
    comments: number;
    url: string;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const state = input.state === 'closed' || input.state === 'all' ? input.state : 'open';
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 20, 1),
    50
  );
  const labels =
    typeof input.labels === 'string' && input.labels.trim()
      ? input.labels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean)
          .join(',')
      : undefined;

  try {
    const response = await client.rest.issues.listForRepo({
      owner: config.owner,
      repo: config.repo,
      state,
      ...(labels ? { labels } : {}),
      sort: 'updated',
      direction: 'desc',
      per_page: limit,
    });
    const issues = response.data
      // GitHub returns pull requests through the issues endpoint; they are not
      // issues and must not be presented as such.
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? null,
        labels: (issue.labels || [])
          .map((label) => (typeof label === 'string' ? label : label.name || ''))
          .filter(Boolean),
        comments: issue.comments,
        url: issue.html_url,
        createdAt: issue.created_at ?? null,
        updatedAt: issue.updated_at ?? null,
      }));
    return wrap(
      config,
      config.workBranch,
      null,
      { issues, truncated: issues.length >= limit },
      issues.length < limit,
      issues.length >= limit ? [`Issue list limited to ${limit}.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function getIssue(input: {
  repository?: unknown;
  number?: unknown;
  includeComments?: unknown;
}): Promise<DevRepoResult<{
  number: number;
  title: string;
  body: string;
  state: string;
  /** GitHub state_reason: completed / not_planned / reopened, when present. */
  stateReason: string | null;
  author: string | null;
  labels: string[];
  url: string;
  createdAt: string | null;
  updatedAt: string | null;
  comments: Array<{ author: string | null; body: string; url: string; createdAt: string | null }>;
  commentsTruncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const number = typeof input.number === 'number' ? Math.floor(input.number) : Number(input.number);

  if (!Number.isFinite(number) || number <= 0) {
    throw new DevRepoError('GITHUB_API_ERROR', 'A positive issue number is required.', {
      repository: config.fullName,
    });
  }

  try {
    const response = await client.rest.issues.get({
      owner: config.owner,
      repo: config.repo,
      issue_number: number,
    });
    let comments: Array<{
      author: string | null;
      body: string;
      url: string;
      createdAt: string | null;
    }> = [];
    let commentsTruncated = false;

    if (input.includeComments !== false) {
      const commentResponse = await client.rest.issues.listComments({
        owner: config.owner,
        repo: config.repo,
        issue_number: number,
        per_page: 30,
      });
      comments = commentResponse.data.slice(0, 30).map((comment) => ({
        author: comment.user?.login ?? null,
        body: typeof comment.body === 'string' ? comment.body.slice(0, 4_000) : '',
        url: comment.html_url,
        createdAt: comment.created_at ?? null,
      }));
      commentsTruncated = commentResponse.data.length >= 30;
    }

    return wrap(
      config,
      config.workBranch,
      null,
      {
        number: response.data.number,
        title: response.data.title,
        body: typeof response.data.body === 'string' ? response.data.body.slice(0, 8_000) : '',
        state: response.data.state,
        stateReason:
          typeof (response.data as { state_reason?: unknown }).state_reason === 'string'
            ? String((response.data as { state_reason?: string }).state_reason)
            : null,
        author: response.data.user?.login ?? null,
        labels: (response.data.labels || [])
          .map((label) => (typeof label === 'string' ? label : label.name || ''))
          .filter(Boolean),
        url: response.data.html_url,
        createdAt: response.data.created_at ?? null,
        updatedAt: response.data.updated_at ?? null,
        comments,
        commentsTruncated,
      },
      !commentsTruncated,
      commentsTruncated ? ['Issue comments limited to 30.'] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function getWorkflowRuns(input: {
  repository?: unknown;
  branch?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  runs: Array<{
    id: number;
    name: string;
    event: string;
    status: string | null;
    conclusion: string | null;
    branch: string | null;
    sha: string;
    url: string;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  truncated: boolean;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = input.branch ? await resolveBranch(config, input.branch) : undefined;
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 10, 1),
    50
  );

  try {
    const response = await client.rest.actions.listWorkflowRunsForRepo({
      owner: config.owner,
      repo: config.repo,
      ...(branch ? { branch } : {}),
      per_page: limit,
    });
    const runs = response.data.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name || run.display_title || 'workflow',
      event: run.event,
      status: run.status,
      conclusion: run.conclusion ?? null,
      branch: run.head_branch ?? null,
      sha: run.head_sha,
      url: run.html_url,
      createdAt: run.created_at ?? null,
      updatedAt: run.updated_at ?? null,
    }));
    return wrap(
      config,
      branch || config.workBranch,
      runs[0]?.sha || null,
      { runs, truncated: runs.length >= limit },
      runs.length < limit,
      runs.length >= limit ? [`Workflow run list limited to ${limit}.`] : []
    );
  } catch (error) {
    throw toDevError(error, config);
  }
}

export async function getCheckRuns(input: {
  repository?: unknown;
  ref?: unknown;
  limit?: unknown;
}): Promise<DevRepoResult<{
  ref: string;
  checks: Array<{
    name: string;
    status: string | null;
    conclusion: string | null;
    url: string | null;
    app: string | null;
  }>;
  combinedStatus: {
    state: string;
    totalCount: number;
  } | null;
  note: string;
}>> {
  const config = resolveDevRepository(input.repository);
  const client = getClient();
  const branch = await resolveBranch(config, input.ref);
  const commitSha = await resolveCommitSha(client, config, branch);
  const limit = Math.min(
    Math.max(typeof input.limit === 'number' ? Math.floor(input.limit) : 20, 1),
    50
  );

  if (!commitSha) {
    throw new DevRepoError('GITHUB_API_ERROR', 'Unable to resolve commit SHA.', {
      repository: config.fullName,
    });
  }

  const checks: Array<{
    name: string;
    status: string | null;
    conclusion: string | null;
    url: string | null;
    app: string | null;
  }> = [];
  let checksAvailable = true;
  let checksError: string | null = null;

  try {
    const response = await client.rest.checks.listForRef({
      owner: config.owner,
      repo: config.repo,
      ref: commitSha,
      per_page: limit,
    });
    for (const check of response.data.check_runs) {
      checks.push({
        name: check.name,
        status: check.status ?? null,
        conclusion: check.conclusion ?? null,
        url: check.html_url ?? null,
        app: check.app?.name ?? null,
      });
    }
  } catch (error) {
    checksAvailable = false;
    checksError = safeMessage(error, config.fullName);
  }

  let combinedStatus: { state: string; totalCount: number } | null = null;
  try {
    const status = await client.rest.repos.getCombinedStatusForRef({
      owner: config.owner,
      repo: config.repo,
      ref: commitSha,
      per_page: limit,
    });
    combinedStatus = {
      state: status.data.state,
      totalCount: status.data.total_count,
    };
  } catch {
    combinedStatus = null;
  }

  const warnings: string[] = [];
  if (!checksAvailable) warnings.push(`Check runs unavailable: ${checksError}`);
  if (!combinedStatus) warnings.push('Combined commit status unavailable.');

  return wrap(
    config,
    branch,
    commitSha,
    {
      ref: commitSha,
      checks,
      combinedStatus,
      note:
        checks.length === 0 && !combinedStatus
          ? 'No check runs or commit statuses were returned. Tests were not verified.'
          : 'Check runs reflect CI only; they do not prove the task acceptance criteria.',
    },
    checksAvailable && Boolean(combinedStatus),
    warnings
  );
}

/**
 * On-demand repository status. Results are cached for five minutes; no
 * background index, cron or persistent mirror is created.
 */
export async function getDevRepositoryStatuses(
  options: { force?: boolean } = {}
): Promise<DevRepositoryStatus[]> {
  const now = new Date().toISOString();
  const configs = getDevRepositoryConfigs();

  return Promise.all(
    configs.map(async (config) => {
      if (!config.configured) {
        return {
          key: config.key,
          fullName: config.fullName,
          defaultBranch: config.defaultBranch,
          workBranch: config.workBranch,
          accessible: false,
          authenticated: false,
          lastCommitSha: null,
          lastCommitAt: null,
          checkedAt: now,
          error: 'GITHUB_TOKEN is not configured.',
        };
      }

      try {
        const info = options.force
          ? await (async () => {
              cache.delete(cacheKey(['repo-info', config.fullName, config.workBranch]));
              return getRepoInfo({ repository: config.key, ref: config.workBranch });
            })()
          : await getRepoInfo({ repository: config.key, ref: config.workBranch });

        return {
          key: config.key,
          fullName: config.fullName,
          defaultBranch: info.info.defaultBranch || config.defaultBranch,
          workBranch: config.workBranch,
          accessible: true,
          authenticated: true,
          lastCommitSha: info.latestCommit?.sha ?? info.commitSha,
          lastCommitAt: info.latestCommit?.date ?? null,
          checkedAt: now,
          error: null,
        };
      } catch (error) {
        return {
          key: config.key,
          fullName: config.fullName,
          defaultBranch: config.defaultBranch,
          workBranch: config.workBranch,
          accessible: false,
          authenticated: statusFrom(error) !== 401,
          lastCommitSha: null,
          lastCommitAt: null,
          checkedAt: now,
          error: error instanceof Error ? error.message : 'Repository is not accessible.',
        };
      }
    })
  );
}

export function clearDevRepositoryCache(): void {
  cache.clear();
}

export function getDevRepositoryLimits() {
  return {
    maxTreeEntries: MAX_TREE_ENTRIES,
    maxFileChars: MAX_FILE_CHARS,
    maxRangeLines: MAX_RANGE_LINES,
    maxSearchResults: MAX_SEARCH_RESULTS,
    cacheTtlMs: CACHE_TTL_MS,
    statusTtlMs: STATUS_TTL_MS,
  };
}
