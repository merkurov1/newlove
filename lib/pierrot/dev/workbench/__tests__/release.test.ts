/** @jest-environment node */

jest.mock('@/lib/pierrot/dev/workbench/github', () => ({
  getBranchHead: jest.fn(),
  getCommitChecks: jest.fn(),
  getCommitRange: jest.fn(),
  getLatestProductionDeployment: jest.fn(),
  commitUrl: (repository: string, sha: string) => `https://github.com/${repository}/commit/${sha}`,
}));

jest.mock('@/lib/pierrot/dev/workbench/finalization', () => ({
  getFinalizationReport: jest.fn(async () => null),
}));

jest.mock('@/lib/pierrot/dev/workbench/store', () => ({
  isWorkbenchSchemaReady: jest.fn(async () => true),
}));

jest.mock('@/lib/pierrot/dev/workbench/migrationAudit', () => ({
  inspectProductionMigrations: jest.fn(async () => ({
    checkedAt: '2026-11-23T10:00:00.000Z',
    available: true,
    source: 'PIERROT_RELEASE_DATABASE_URL',
    error: null,
    counts: { applied: 1, pending: 0, unsafe: 0, unknown: 0 },
    rows: [],
    pendingSafe: [],
    blockers: [],
  })),
}));

jest.mock('@/lib/pierrot/dev/workbench/productionVercel', () => ({
  resolveVercelReleaseProject: jest.fn(async () => ({
    ok: true,
    config: {
      project: {
        id: 'prj_1',
        name: 'newlove',
        repoId: '123',
        repo: 'newlove',
        org: 'merkurov1',
        productionBranch: 'main',
        teamId: null,
      },
      token: 'test-token',
      teamId: null,
    },
  })),
}));

jest.mock('@/lib/pierrot/dev/workbench/releaseLedger', () => ({
  getLatestProductionRelease: jest.fn(async () => null),
  getActiveProductionRelease: jest.fn(async () => null),
}));

import {
  getBranchHead,
  getCommitChecks,
  getCommitRange,
  getLatestProductionDeployment,
} from '@/lib/pierrot/dev/workbench/github';
import { getFinalizationReport } from '@/lib/pierrot/dev/workbench/finalization';
import { isWorkbenchSchemaReady } from '@/lib/pierrot/dev/workbench/store';
import { inspectProductionMigrations } from '@/lib/pierrot/dev/workbench/migrationAudit';
import { resolveVercelReleaseProject } from '@/lib/pierrot/dev/workbench/productionVercel';
import { getReleaseOverview } from '../release';

const branch = getBranchHead as jest.Mock;
const checks = getCommitChecks as jest.Mock;
const range = getCommitRange as jest.Mock;
const production = getLatestProductionDeployment as jest.Mock;
const finalization = getFinalizationReport as jest.Mock;
const schema = isWorkbenchSchemaReady as jest.Mock;
const migrations = inspectProductionMigrations as jest.Mock;
const vercel = resolveVercelReleaseProject as jest.Mock;

const MAIN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MID = 'cccccccccccccccccccccccccccccccccccccccc';

beforeEach(() => {
  jest.clearAllMocks();
  branch.mockResolvedValue(MAIN);
  checks.mockResolvedValue({
    status: 'passed',
    detail: '2 CI checks completed successfully.',
    checks: [],
  });
  range.mockResolvedValue({
    status: 'ahead',
    aheadBy: 2,
    behindBy: 0,
    commits: [
      {
        sha: MID,
        message: 'feat: land a task\n\nbody',
        author: 'Owner',
        committedAt: '2026-11-20T10:00:00Z',
      },
      {
        sha: MAIN,
        message: 'fix: follow up',
        author: 'Owner',
        committedAt: '2026-11-21T10:00:00Z',
      },
    ],
    files: [{ filename: 'app/page.tsx', status: 'modified', additions: 4, deletions: 1 }],
  });
  production.mockResolvedValue({
    state: 'ready',
    url: 'https://newlove.example',
    target: 'production',
    commitSha: PROD,
    checkedAt: '2026-11-22T10:00:00Z',
    reason: null,
    deploymentId: 'dpl_old',
  });
  finalization.mockResolvedValue(null);
  schema.mockResolvedValue(true);
  migrations.mockResolvedValue({
    checkedAt: '2026-11-23T10:00:00.000Z',
    available: true,
    source: 'PIERROT_RELEASE_DATABASE_URL',
    error: null,
    counts: { applied: 1, pending: 0, unsafe: 0, unknown: 0 },
    rows: [],
    pendingSafe: [],
    blockers: [],
  });
  vercel.mockResolvedValue({
    ok: true,
    config: {
      project: {
        id: 'prj_1',
        name: 'newlove',
        repoId: '123',
        repo: 'newlove',
        org: 'merkurov1',
        productionBranch: 'main',
        teamId: null,
      },
      token: 'test-token',
      teamId: null,
    },
  });
  delete process.env.PIERROT_DEV_RELEASE_URL;
});

describe('release readiness', () => {
  it('answers what landed in main and the exact target SHA without deploying', async () => {
    const release = await getReleaseOverview('newlove');

    expect(release.main?.sha).toBe(MAIN);
    expect(release.production?.commitSha).toBe(PROD);
    expect(release.target?.sha).toBe(MAIN);
    expect(release.behindBy).toBe(2);
    expect(release.commits.map((commit) => commit.sha)).toEqual([MAIN, MID]);
    expect(release.commits[0].shortSha).toBe('aaaaaaa');
    expect(release.files.map((file) => file.filename)).toEqual(['app/page.tsx']);
    expect(release.ci?.status).toBe('passed');
    expect(release.migrations.available).toBe(true);
    expect(release.canRelease).toBe(true);
    expect(release.releaseAction.available).toBe(true);
    expect(release.releaseAction.builtIn).toBe(true);
    expect(release.releaseAction.requiresConfirmation).toBe(true);
    expect(range).toHaveBeenCalledWith('newlove', PROD, MAIN);
  });

  it('disables release with the exact reason when production is already current', async () => {
    production.mockResolvedValueOnce({
      state: 'ready',
      url: 'https://newlove.example',
      target: 'production',
      commitSha: MAIN,
      checkedAt: '2026-11-22T10:00:00Z',
      reason: null,
    });

    const release = await getReleaseOverview('newlove');

    expect(release.behindBy).toBe(0);
    expect(release.commits).toEqual([]);
    expect(release.canRelease).toBe(false);
    expect(release.blockers).toContain('Production already runs the main head commit.');
    expect(range).not.toHaveBeenCalled();
  });

  it('never fabricates a production commit when Vercel is unavailable', async () => {
    production.mockResolvedValueOnce({
      state: 'unavailable',
      url: null,
      target: 'production',
      commitSha: null,
      checkedAt: '2026-11-22T10:00:00Z',
      reason: 'VERCEL_TOKEN is not configured.',
    });

    const release = await getReleaseOverview('newlove');

    expect(release.production?.commitSha).toBeNull();
    expect(release.behindBy).toBeNull();
    expect(release.canRelease).toBe(false);
    expect(release.blockers[0]).toMatch(/VERCEL_TOKEN/);
    expect(release.target?.sha).toBe(MAIN);
  });

  it('blocks release when queue finalization is blocked', async () => {
    finalization.mockResolvedValueOnce({
      stage: 'blocked',
      blockedReason: 'PR #42 has a merge conflict.',
    });

    const release = await getReleaseOverview('newlove');

    expect(release.canRelease).toBe(false);
    expect(release.blockers).toContain('PR #42 has a merge conflict.');
  });

  it('blocks release when production contains commits that are not in main', async () => {
    range.mockResolvedValueOnce({
      status: 'diverged',
      aheadBy: 1,
      behindBy: 1,
      commits: [
        {
          sha: MID,
          message: 'feat: land a task',
          author: 'Owner',
          committedAt: '2026-11-20T10:00:00Z',
        },
      ],
    });

    const release = await getReleaseOverview('newlove');

    expect(release.canRelease).toBe(false);
    expect(release.blockers.join(' ')).toMatch(/not in main/);
  });

  it('uses an explicitly configured release console without deploying itself', async () => {
    process.env.PIERROT_DEV_RELEASE_URL = 'https://release.example/console';

    const release = await getReleaseOverview('newlove');

    expect(release.releaseAction.available).toBe(true);
    expect(release.releaseAction.url).toBe('https://release.example/console');
  });
});
