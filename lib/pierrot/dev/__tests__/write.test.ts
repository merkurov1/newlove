/** @jest-environment node */

jest.mock('@octokit/rest', () => {
  const rest = {
    users: { getAuthenticated: jest.fn() },
    repos: {
      get: jest.fn(),
      getBranch: jest.fn(),
      getContent: jest.fn(),
      createOrUpdateFileContents: jest.fn(),
    },
    git: { createRef: jest.fn() },
    pulls: { create: jest.fn() },
    issues: { create: jest.fn(), update: jest.fn(), createComment: jest.fn() },
  };

  return {
    Octokit: class Octokit {
      rest = rest;
    },
  };
});

import { Octokit } from '@octokit/rest';
import {
  DevWriteError,
  addDevIssueComment,
  createDevBranch,
  createDevIssue,
  createDevPullRequest,
  getGitHubWriteCapability,
} from '../write';

const mockRest = (new Octokit() as unknown as {
  rest: Record<string, Record<string, jest.Mock>>;
}).rest;

const original = {
  token: process.env.GITHUB_TOKEN,
  write: process.env.PIERROT_DEV_WRITE_ENABLED,
  newlove: process.env.PIERROT_DEV_REPO_NEWLOVE,
  pierrot: process.env.PIERROT_DEV_REPO_PIERROT,
};

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.PIERROT_DEV_WRITE_ENABLED = 'true';
  process.env.PIERROT_DEV_REPO_NEWLOVE = 'merkurov1/newlove';
  process.env.PIERROT_DEV_REPO_PIERROT = 'merkurov1/Pierrot';
  jest.clearAllMocks();

  mockRest.users.getAuthenticated.mockResolvedValue({ data: { login: 'anton' } });
  mockRest.repos.get.mockResolvedValue({
    data: {
      full_name: 'merkurov1/newlove',
      permissions: { pull: true, push: true, admin: false },
    },
  });
  mockRest.repos.getBranch.mockResolvedValue({
    data: { commit: { sha: 'a'.repeat(40) } },
  });
  mockRest.repos.getContent.mockRejectedValue(
    Object.assign(new Error('not found'), { status: 404 })
  );
  mockRest.git.createRef.mockResolvedValue({ data: {} });
  mockRest.issues.create.mockResolvedValue({
    data: {
      number: 42,
      html_url: 'https://github.com/merkurov1/newlove/issues/42',
      state: 'open',
      title: 'Fix menu',
    },
  });
  mockRest.issues.update.mockResolvedValue({
    data: {
      number: 42,
      html_url: 'https://github.com/merkurov1/newlove/issues/42',
      state: 'closed',
    },
  });
  mockRest.issues.createComment.mockResolvedValue({
    data: { html_url: 'https://github.com/merkurov1/newlove/issues/42#comment' },
  });
  mockRest.pulls.create.mockResolvedValue({
    data: {
      number: 7,
      html_url: 'https://github.com/merkurov1/newlove/pull/7',
      state: 'open',
      head: { ref: 'feature/test' },
      base: { ref: 'main' },
    },
  });
});

afterAll(() => {
  process.env.GITHUB_TOKEN = original.token;
  process.env.PIERROT_DEV_WRITE_ENABLED = original.write;
  process.env.PIERROT_DEV_REPO_NEWLOVE = original.newlove;
  process.env.PIERROT_DEV_REPO_PIERROT = original.pierrot;
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
  expect(mockRest.issues.create).not.toHaveBeenCalled();
}

describe('GitHub write safety gates', () => {
  it('refuses writes when the server flag is disabled', async () => {
    process.env.PIERROT_DEV_WRITE_ENABLED = 'false';
    await expectCode(
      createDevIssue({ repository: 'newlove', title: 'x', confirmed: true }),
      'GITHUB_WRITES_DISABLED'
    );
  });

  it('requires explicit confirmation', async () => {
    await expectCode(
      createDevIssue({ repository: 'newlove', title: 'x', confirmed: false }),
      'GITHUB_WRITE_CONFIRMATION_REQUIRED'
    );
  });

  it('refuses when the token has no push permission', async () => {
    mockRest.repos.get.mockResolvedValue({
      data: {
        full_name: 'merkurov1/newlove',
        permissions: { pull: true, push: false },
      },
    });
    await expectCode(
      createDevIssue({ repository: 'newlove', title: 'x', confirmed: true }),
      'GITHUB_WRITE_PERMISSION_DENIED'
    );
  });

  it('reports missing token', async () => {
    delete process.env.GITHUB_TOKEN;
    await expectCode(
      createDevIssue({ repository: 'newlove', title: 'x', confirmed: true }),
      'GITHUB_TOKEN_MISSING'
    );
  });

  it('exposes the capability without leaking a token', async () => {
    const capability = await getGitHubWriteCapability('newlove');
    expect(capability).toMatchObject({
      repository: 'merkurov1/newlove',
      writesEnabled: true,
      authenticated: true,
      canPush: true,
      login: 'anton',
    });
    expect(JSON.stringify(capability)).not.toContain('test-token');
  });
});

describe('GitHub write operations', () => {
  it('creates an issue after confirmation and permission checks', async () => {
    const result = await createDevIssue({
      repository: 'newlove',
      title: 'Fix menu',
      body: 'Details',
      confirmed: true,
    });
    expect(result).toMatchObject({
      repository: 'merkurov1/newlove',
      number: 42,
      url: 'https://github.com/merkurov1/newlove/issues/42',
      sideEffect: true,
    });
    expect(mockRest.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'merkurov1', repo: 'newlove', title: 'Fix menu' })
    );
  });

  it('refuses to create the protected default branch', async () => {
    await expect(
      createDevBranch({ repository: 'newlove', branch: 'main', confirmed: true })
    ).rejects.toBeInstanceOf(DevWriteError);
    expect(mockRest.git.createRef).not.toHaveBeenCalled();
  });

  it('creates a working branch from the default branch', async () => {
    mockRest.repos.getBranch
      .mockResolvedValueOnce({ data: { commit: { sha: 'a'.repeat(40) } } })
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));

    const result = await createDevBranch({
      repository: 'newlove',
      branch: 'pierrot/test',
      confirmed: true,
    });
    expect(result.branch).toBe('pierrot/test');
    expect(mockRest.git.createRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'refs/heads/pierrot/test' })
    );
  });

  it('creates a pull request from a working branch', async () => {
    const result = await createDevPullRequest({
      repository: 'newlove',
      title: 'Fix menu',
      head: 'feature/test',
      base: 'main',
      confirmed: true,
    });
    expect(result).toMatchObject({ number: 7, head: 'feature/test', base: 'main' });
  });

  it('refuses a PR whose head is the default branch', async () => {
    await expect(
      createDevPullRequest({
        repository: 'newlove',
        title: 'Fix',
        head: 'main',
        confirmed: true,
      })
    ).rejects.toMatchObject({ code: 'GITHUB_INVALID_BRANCH' });
  });

  it('adds an issue comment after confirmation', async () => {
    const result = await addDevIssueComment({
      repository: 'newlove',
      number: 42,
      body: 'Done',
      confirmed: true,
    });
    expect(result.commentUrl).toContain('#comment');
  });

  it('surfaces GitHub API failures as safe errors', async () => {
    mockRest.issues.create.mockRejectedValue(
      Object.assign(new Error('denied'), { status: 403 })
    );
    await expect(
      createDevIssue({ repository: 'newlove', title: 'x', confirmed: true })
    ).rejects.toMatchObject({ code: 'GITHUB_API_ERROR', status: 403 });
  });
});
