/** @jest-environment node */

jest.mock('@octokit/rest', () => ({
  Octokit: class Octokit {},
}));

import {
  getGitHubClient,
  getGitHubRepository,
  normalizeGitHubBranch,
  normalizeGitHubPath,
  verifyGitHubAuth,
} from '@/lib/github';

const original = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  full: process.env.PIERROT_GITHUB_REPO,
  branch: process.env.GITHUB_DEFAULT_BRANCH,
};

afterEach(() => {
  for (const [key, value] of Object.entries({
    GITHUB_TOKEN: original.token,
    GITHUB_OWNER: original.owner,
    GITHUB_REPO: original.repo,
    PIERROT_GITHUB_REPO: original.full,
    GITHUB_DEFAULT_BRANCH: original.branch,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('server-side GitHub client', () => {
  it('resolves owner/repo from GITHUB_OWNER and GITHUB_REPO', () => {
    delete process.env.PIERROT_GITHUB_REPO;
    process.env.GITHUB_OWNER = 'example-owner';
    process.env.GITHUB_REPO = 'example-repo';
    process.env.GITHUB_DEFAULT_BRANCH = 'trunk';

    expect(getGitHubRepository()).toEqual({
      owner: 'example-owner',
      repo: 'example-repo',
      fullName: 'example-owner/example-repo',
      defaultBranch: 'trunk',
    });
  });

  it('does not create an Octokit client without GITHUB_TOKEN', () => {
    delete process.env.GITHUB_TOKEN;
    expect(getGitHubClient()).toBeNull();
  });

  it('reports missing credentials without throwing', async () => {
    delete process.env.GITHUB_TOKEN;
    const status = await verifyGitHubAuth({ force: true });
    expect(status.configured).toBe(false);
    expect(status.authenticated).toBe(false);
    expect(status.error).toContain('GITHUB_TOKEN');
  });

  it('validates repository paths', () => {
    expect(normalizeGitHubPath('/app/page.tsx/')).toBe('app/page.tsx');
    expect(normalizeGitHubPath('')).toBe('');
    expect(() => normalizeGitHubPath('../secrets')).toThrow('Invalid repository path');
  });

  it('validates branch names', () => {
    expect(normalizeGitHubBranch('', 'main')).toBe('main');
    expect(normalizeGitHubBranch('feature/dev', 'main')).toBe('feature/dev');
    expect(() => normalizeGitHubBranch('../main', 'main')).toThrow('Invalid branch name');
  });
});
