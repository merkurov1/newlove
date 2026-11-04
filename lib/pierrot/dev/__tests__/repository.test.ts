/** @jest-environment node */

jest.mock('@octokit/rest', () => {
  const rest = {
    repos: {
      get: jest.fn(),
      getCommit: jest.fn(),
      getBranch: jest.fn(),
      getContent: jest.fn(),
      listBranches: jest.fn(),
      listCommits: jest.fn(),
      compareCommitsWithBasehead: jest.fn(),
      getCombinedStatusForRef: jest.fn(),
    },
    git: {
      getTree: jest.fn(),
      getBlob: jest.fn(),
    },
    search: { code: jest.fn() },
    pulls: {
      list: jest.fn(),
      get: jest.fn(),
      listFiles: jest.fn(),
    },
    actions: { listWorkflowRunsForRepo: jest.fn() },
    checks: { listForRef: jest.fn() },
  };

  return {
    Octokit: class Octokit {
      rest = rest;
    },
  };
});

import { Octokit } from '@octokit/rest';
import {
  clearDevRepositoryCache,
  compareRefs,
  getCheckRuns,
  getRepoInfo,
  getRepoTree,
  listBranches,
  readFile,
  readFileRange,
  searchRepo,
} from '../repository';

const mockRest = (new Octokit() as unknown as {
  rest: Record<string, Record<string, jest.Mock>>;
}).rest;

const original = {
  token: process.env.GITHUB_TOKEN,
  newloveRepo: process.env.PIERROT_DEV_REPO_NEWLOVE,
  pierrotRepo: process.env.PIERROT_DEV_REPO_PIERROT,
  newloveBranch: process.env.PIERROT_DEV_BRANCH_NEWLOVE,
  pierrotBranch: process.env.PIERROT_DEV_BRANCH_PIERROT,
  defaultBranch: process.env.GITHUB_DEFAULT_BRANCH,
};

const COMMIT_SHA = 'a'.repeat(40);

beforeEach(() => {
  clearDevRepositoryCache();
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.PIERROT_DEV_REPO_NEWLOVE = 'merkurov1/newlove';
  process.env.PIERROT_DEV_REPO_PIERROT = 'merkurov1/Pierrot';
  process.env.PIERROT_DEV_BRANCH_NEWLOVE = 'main';
  process.env.PIERROT_DEV_BRANCH_PIERROT = 'main';
  process.env.GITHUB_DEFAULT_BRANCH = 'main';
  jest.clearAllMocks();

  mockRest.repos.getBranch.mockResolvedValue({
    data: { commit: { sha: COMMIT_SHA } },
  });
  mockRest.repos.getCommit.mockResolvedValue({
    data: {
      sha: COMMIT_SHA,
      html_url: `https://github.com/merkurov1/newlove/commit/${COMMIT_SHA}`,
      commit: {
        message: 'test commit',
        author: { name: 'Anton', date: '2026-11-04T10:00:00Z' },
      },
      files: [],
    },
  });
  mockRest.repos.get.mockImplementation(({ repo }: { repo: string }) =>
    Promise.resolve({
      data: {
        full_name: `merkurov1/${repo}`,
        description: 'test repo',
        default_branch: 'main',
        private: true,
        language: 'TypeScript',
        pushed_at: '2026-11-04T10:00:00Z',
        html_url: `https://github.com/merkurov1/${repo}`,
        permissions: { pull: true, push: false },
      },
    })
  );
  mockRest.repos.listBranches.mockResolvedValue({
    data: [
      { name: 'main', commit: { sha: COMMIT_SHA }, protected: true },
      { name: 'feature/dev', commit: { sha: 'b'.repeat(40) }, protected: false },
    ],
  });
  mockRest.repos.listCommits.mockResolvedValue({ data: [] });
  mockRest.repos.compareCommitsWithBasehead.mockResolvedValue({
    data: {
      status: 'ahead',
      ahead_by: 1,
      behind_by: 0,
      total_commits: 1,
      commits: [{ sha: COMMIT_SHA, commit: { message: 'change', author: { name: 'A', date: '2026-11-04' } } }],
      files: [
        {
          filename: 'app/api/test/route.ts',
          status: 'modified',
          additions: 2,
          deletions: 1,
          patch: '@@ -1 +1 @@',
        },
      ],
    },
  });
  mockRest.repos.getCombinedStatusForRef.mockResolvedValue({
    data: { state: 'success', total_count: 1 },
  });
  mockRest.checks.listForRef.mockResolvedValue({
    data: {
      check_runs: [
        {
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/check/1',
          app: { name: 'GitHub Actions' },
        },
      ],
    },
  });
});

afterAll(() => {
  for (const [key, value] of Object.entries({
    GITHUB_TOKEN: original.token,
    PIERROT_DEV_REPO_NEWLOVE: original.newloveRepo,
    PIERROT_DEV_REPO_PIERROT: original.pierrotRepo,
    PIERROT_DEV_BRANCH_NEWLOVE: original.newloveBranch,
    PIERROT_DEV_BRANCH_PIERROT: original.pierrotBranch,
    GITHUB_DEFAULT_BRANCH: original.defaultBranch,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('repository intelligence is scoped per repository', () => {
  it('reads newlove and Pierrot independently', async () => {
    const newlove = await getRepoInfo({ repository: 'newlove' });
    const pierrot = await getRepoInfo({ repository: 'pierrot' });

    expect(newlove.repository).toBe('merkurov1/newlove');
    expect(newlove.repositoryKey).toBe('newlove');
    expect(newlove.commitSha).toBe(COMMIT_SHA);
    expect(pierrot.repository).toBe('merkurov1/Pierrot');
    expect(pierrot.repositoryKey).toBe('pierrot');
    expect(mockRest.repos.get).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'merkurov1', repo: 'Pierrot' })
    );
  });

  it('rejects an unknown repository instead of falling back', async () => {
    await expect(getRepoInfo({ repository: 'merkurov1/other' })).rejects.toMatchObject({
      message: expect.stringContaining('Unknown repository'),
    });
  });

  it('reports an inaccessible repository without inventing data', async () => {
    mockRest.repos.get.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

    await expect(getRepoInfo({ repository: 'pierrot' })).rejects.toMatchObject({
      code: 'GITHUB_NOT_FOUND',
      repository: 'merkurov1/Pierrot',
    });
  });

  it('fails closed without a GitHub token', async () => {
    delete process.env.GITHUB_TOKEN;
    clearDevRepositoryCache();

    await expect(getRepoInfo({ repository: 'newlove' })).rejects.toMatchObject({
      code: 'GITHUB_TOKEN_MISSING',
    });
  });

  it('lists a tree recursively with a bounded result', async () => {
    mockRest.git.getTree.mockResolvedValue({
      data: {
        truncated: false,
        tree: [
          { path: 'app', type: 'tree', sha: '1' },
          { path: 'app/page.tsx', type: 'blob', size: 100, sha: '2' },
        ],
      },
    });

    const tree = await getRepoTree({
      repository: 'newlove',
      recursive: true,
      path: 'app',
    });
    expect(tree.entries.map((entry) => entry.path)).toEqual([
      'app',
      'app/page.tsx',
    ]);
    expect(tree.repository).toBe('merkurov1/newlove');
    expect(tree.commitSha).toBe(COMMIT_SHA);
  });

  it('searches only the requested repository and reports incompleteness', async () => {
    process.env.PIERROT_DEV_BRANCH_PIERROT = 'feature/dev';
    mockRest.search.code.mockResolvedValue({
      data: {
        items: [
          {
            path: 'lib/pierrot/dev/llm.ts',
            name: 'llm.ts',
            sha: '3',
            html_url: 'https://github.com/example',
            text_matches: [{ fragment: 'fallback' }],
          },
        ],
        total_count: 2,
        incomplete_results: true,
      },
    });

    const result = await searchRepo({
      repository: 'pierrot',
      query: 'fallback',
      limit: 5,
    });

    expect(mockRest.search.code).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining('repo:merkurov1/Pierrot'),
      })
    );
    expect(result.complete).toBe(false);
    expect(result.incomplete).toBe(true);
    expect(result.warnings.join(' ')).toContain('default branch');
  });

  it('reads a file range with line numbers and total length', async () => {
    const content = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n');
    mockRest.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        path: 'app/page.tsx',
        sha: '4',
        size: content.length,
        content: Buffer.from(content, 'utf8').toString('base64'),
      },
    });

    const result = await readFileRange({
      repository: 'newlove',
      path: 'app/page.tsx',
      startLine: 4,
      endLine: 8,
    });

    expect(result.content.split('\n')).toEqual([
      'line 4',
      'line 5',
      'line 6',
      'line 7',
      'line 8',
    ]);
    expect(result.totalLines).toBe(20);
    expect(result.repository).toBe('merkurov1/newlove');
  });

  it('reads whole files with the same metadata envelope', async () => {
    mockRest.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        path: 'README.md',
        sha: '5',
        size: 5,
        content: Buffer.from('hello', 'utf8').toString('base64'),
      },
    });

    const result = await readFile({ repository: 'pierrot', path: 'README.md' });
    expect(result.content).toBe('hello');
    expect(result.repository).toBe('merkurov1/Pierrot');
    expect(result.commitSha).toBe(COMMIT_SHA);
  });

  it('compares refs and returns a bounded diff', async () => {
    const result = await compareRefs({
      repository: 'newlove',
      base: 'main',
      head: 'feature/dev',
    });

    expect(mockRest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith(
      expect.objectContaining({ basehead: 'main...feature/dev' })
    );
    expect(result.files).toHaveLength(1);
    expect(result.files[0].patchTruncated).toBe(false);
    expect(result.aheadBy).toBe(1);
  });

  it('lists branches and check runs', async () => {
    const branches = await listBranches({ repository: 'pierrot' });
    expect(branches.branches.map((branch) => branch.name)).toEqual([
      'main',
      'feature/dev',
    ]);

    const checks = await getCheckRuns({
      repository: 'newlove',
      ref: 'main',
    });
    expect(checks.checks[0].name).toBe('test');
    expect(checks.combinedStatus?.state).toBe('success');
    expect(checks.repository).toBe('merkurov1/newlove');
  });
});
