/** @jest-environment node */

jest.mock('@octokit/rest', () => ({
  Octokit: class Octokit {},
}));

import {
  createPullRequest,
  createOrUpdateFile,
  GitHubError,
  isGitHubWriteEnabled,
} from '@/lib/github';
import {
  getDevRepositoryConfig,
  getDevRepositoryConfigs,
  isDevRepositoryKey,
  resolveDevRepository,
} from '../repositories';

const original = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  full: process.env.PIERROT_GITHUB_REPO,
  branch: process.env.GITHUB_DEFAULT_BRANCH,
  write: process.env.PIERROT_DEV_WRITE_ENABLED,
  newloveRepo: process.env.PIERROT_DEV_REPO_NEWLOVE,
  pierrotRepo: process.env.PIERROT_DEV_REPO_PIERROT,
  newloveBranch: process.env.PIERROT_DEV_BRANCH_NEWLOVE,
  pierrotBranch: process.env.PIERROT_DEV_BRANCH_PIERROT,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    GITHUB_TOKEN: original.token,
    GITHUB_OWNER: original.owner,
    GITHUB_REPO: original.repo,
    PIERROT_GITHUB_REPO: original.full,
    GITHUB_DEFAULT_BRANCH: original.branch,
    PIERROT_DEV_WRITE_ENABLED: original.write,
    PIERROT_DEV_REPO_NEWLOVE: original.newloveRepo,
    PIERROT_DEV_REPO_PIERROT: original.pierrotRepo,
    PIERROT_DEV_BRANCH_NEWLOVE: original.newloveBranch,
    PIERROT_DEV_BRANCH_PIERROT: original.pierrotBranch,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('two-repository Dev configuration', () => {
  it('exposes newlove and Pierrot independently', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    delete process.env.PIERROT_DEV_REPO_NEWLOVE;
    delete process.env.PIERROT_DEV_REPO_PIERROT;
    delete process.env.PIERROT_GITHUB_REPO;

    const configs = getDevRepositoryConfigs();
    expect(configs.map((repo) => repo.key)).toEqual(['newlove', 'pierrot']);
    expect(configs[0].fullName).toBe('merkurov1/newlove');
    expect(configs[1].fullName).toBe('merkurov1/Pierrot');
    expect(configs[0].configured).toBe(true);
    expect(configs[1].configured).toBe(true);
  });

  it('resolves short keys and full names but rejects unknown repositories', () => {
    process.env.GITHUB_TOKEN = 'test-token';

    expect(resolveDevRepository('pierrot').fullName).toBe('merkurov1/Pierrot');
    expect(resolveDevRepository('merkurov1/newlove').key).toBe('newlove');
    expect(() => resolveDevRepository('other/repo')).toThrow('Unknown repository');
    expect(() => resolveDevRepository(42)).toThrow('repository must be');
    expect(isDevRepositoryKey('pierrot')).toBe(true);
    expect(isDevRepositoryKey('newlove')).toBe(true);
    expect(isDevRepositoryKey('main')).toBe(false);
  });

  it('applies per-repository branch overrides without mixing them', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.PIERROT_DEV_BRANCH_NEWLOVE = 'dev';
    process.env.PIERROT_DEV_BRANCH_PIERROT = 'mobile';

    expect(getDevRepositoryConfig('newlove').workBranch).toBe('dev');
    expect(getDevRepositoryConfig('pierrot').workBranch).toBe('mobile');
  });
});

describe('GitHub write safety', () => {
  it('is read-only by default', () => {
    delete process.env.PIERROT_DEV_WRITE_ENABLED;
    expect(isGitHubWriteEnabled()).toBe(false);
    process.env.PIERROT_DEV_WRITE_ENABLED = 'yes';
    expect(isGitHubWriteEnabled()).toBe(false);
    process.env.PIERROT_DEV_WRITE_ENABLED = 'true';
    expect(isGitHubWriteEnabled()).toBe(true);
  });

  it('requires explicit confirmation even when the flag is on', async () => {
    process.env.PIERROT_DEV_WRITE_ENABLED = 'true';
    process.env.GITHUB_TOKEN = 'test-token';

    await expect(
      createOrUpdateFile({
        path: 'app/test.ts',
        content: 'x',
        message: 'test',
        branch: 'feature/dev',
      })
    ).rejects.toMatchObject({ code: 'GITHUB_WRITE_CONFIRMATION_REQUIRED' });
  });

  it('refuses to write to the default branch', async () => {
    process.env.PIERROT_DEV_WRITE_ENABLED = 'true';
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.PIERROT_GITHUB_REPO = 'merkurov1/newlove';
    process.env.GITHUB_DEFAULT_BRANCH = 'main';

    await expect(
      createOrUpdateFile({
        path: 'app/test.ts',
        content: 'x',
        message: 'test',
        branch: 'main',
        confirmed: true,
      })
    ).rejects.toMatchObject({ code: 'GITHUB_DEFAULT_BRANCH_PROTECTED' });
  });

  it('refuses a pull request whose head is the default branch', async () => {
    process.env.PIERROT_DEV_WRITE_ENABLED = 'true';
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.PIERROT_GITHUB_REPO = 'merkurov1/newlove';
    process.env.GITHUB_DEFAULT_BRANCH = 'main';

    await expect(
      createPullRequest({
        title: 'test',
        head: 'main',
        confirmed: true,
      })
    ).rejects.toMatchObject({ code: 'GITHUB_DEFAULT_BRANCH_PROTECTED' });
  });

  it('fails closed when writes are disabled', async () => {
    delete process.env.PIERROT_DEV_WRITE_ENABLED;
    process.env.GITHUB_TOKEN = 'test-token';

    await expect(
      createOrUpdateFile({
        path: 'app/test.ts',
        content: 'x',
        message: 'test',
        branch: 'feature/dev',
        confirmed: true,
      })
    ).rejects.toBeInstanceOf(GitHubError);
  });
});
