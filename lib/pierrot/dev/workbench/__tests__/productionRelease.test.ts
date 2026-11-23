/** @jest-environment node */

type FakeRelease = Record<string, unknown>;

jest.mock('../release', () => ({
  getReleaseOverview: jest.fn(),
}));

jest.mock('../migrationAudit', () => ({
  MigrationApplyError: class MigrationApplyError extends Error {},
  MigrationAuditError: class MigrationAuditError extends Error {},
  inspectProductionMigrations: jest.fn(),
  applyPendingSafeMigrations: jest.fn(),
}));

jest.mock('../productionVercel', () => ({
  VercelReleaseError: class VercelReleaseError extends Error {},
  createPreviewDeployment: jest.fn(),
  findReadyPreviewDeployment: jest.fn(),
  getVercelDeployment: jest.fn(),
  promoteDeployment: jest.fn(),
  resolveVercelReleaseProject: jest.fn(),
  rollbackProduction: jest.fn(),
}));

jest.mock('../smokeTests', () => ({
  resolveProductionSmokeBaseUrl: jest.fn(() => 'https://www.merkurov.love'),
  runProductionSmokeTests: jest.fn(),
}));

jest.mock('../store', () => ({
  tryAcquireProductionReleaseLock: jest.fn(async () => true),
}));

jest.mock('../github', () => ({
  getLatestProductionDeployment: jest.fn(),
}));

jest.mock('../releaseLedger', () => {
  let current: FakeRelease | null = null;
  return {
    newProductionRelease: jest.fn((input: Record<string, unknown>) => ({
      id: 'release-1',
      actorId: input.actorId,
      status: 'requested',
      phase: 'requested',
      pinnedSha: input.pinnedSha,
      previousProductionSha: input.previousProductionSha,
      previousProductionDeploymentId: input.previousProductionDeploymentId,
      previewDeploymentId: null,
      previewUrl: null,
      productionDeploymentId: null,
      productionUrl: null,
      migrationVersions: [],
      migrationSummary: {},
      smokeResults: [],
      blockers: [],
      errorCode: null,
      errorMessage: null,
      rolledBack: false,
      rollbackError: null,
      requestedAt: '2026-11-23T10:00:00.000Z',
      startedAt: null,
      updatedAt: '2026-11-23T10:00:00.000Z',
      finishedAt: null,
    })),
    recordProductionRelease: jest.fn(async (record: FakeRelease) => {
      current = { ...record };
    }),
    getProductionRelease: jest.fn(async (id: string) =>
      current && current.id === id ? { ...current } : null
    ),
    getActiveProductionRelease: jest.fn(async () =>
      current && ['requested', 'running'].includes(String(current.status)) ? { ...current } : null
    ),
    getLatestProductionRelease: jest.fn(async () => (current ? { ...current } : null)),
    __setRelease: (record: FakeRelease | null) => {
      current = record;
    },
    __getRelease: () => current,
  };
});

import { getReleaseOverview } from '../release';
import { inspectProductionMigrations, applyPendingSafeMigrations } from '../migrationAudit';
import {
  createPreviewDeployment,
  findReadyPreviewDeployment,
  getVercelDeployment,
  promoteDeployment,
  resolveVercelReleaseProject,
  rollbackProduction,
} from '../productionVercel';
import { runProductionSmokeTests } from '../smokeTests';
import { getLatestProductionDeployment } from '../github';
import {
  advanceProductionRelease,
  ReleaseError,
  startProductionRelease,
} from '../productionRelease';
import { getActiveProductionRelease } from '../releaseLedger';

const overview = getReleaseOverview as jest.Mock;
const audit = inspectProductionMigrations as jest.Mock;
const apply = applyPendingSafeMigrations as jest.Mock;
const createPreview = createPreviewDeployment as jest.Mock;
const findPreview = findReadyPreviewDeployment as jest.Mock;
const getDeployment = getVercelDeployment as jest.Mock;
const promote = promoteDeployment as jest.Mock;
const rollback = rollbackProduction as jest.Mock;
const resolveVercel = resolveVercelReleaseProject as jest.Mock;
const smoke = runProductionSmokeTests as jest.Mock;
const production = getLatestProductionDeployment as jest.Mock;
const activeRelease = getActiveProductionRelease as jest.Mock;
const ledger = jest.requireMock('../releaseLedger') as {
  __setRelease: (record: FakeRelease | null) => void;
  __getRelease: () => FakeRelease | null;
};

const MAIN = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

const CONFIG = {
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
};

const MIGRATION_REPORT = {
  checkedAt: '2026-11-23T10:00:00.000Z',
  available: true,
  source: 'PIERROT_RELEASE_DATABASE_URL',
  error: null,
  counts: { applied: 2, pending: 0, unsafe: 0, unknown: 0 },
  rows: [],
  pendingSafe: [],
  blockers: [],
};

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    target: { sha: MAIN, shortSha: MAIN.slice(0, 7), url: 'https://github.com/x/y/commit/a' },
    main: { sha: MAIN, shortSha: MAIN.slice(0, 7), url: 'https://github.com/x/y/commit/a' },
    production: {
      state: 'ready',
      url: 'https://old.example',
      target: 'production',
      commitSha: OLD,
      checkedAt: '2026-11-23T10:00:00.000Z',
      reason: null,
      deploymentId: 'dpl_old',
      shortSha: OLD.slice(0, 7),
    },
    behindBy: 1,
    blockers: [],
    canRelease: true,
    migrations: MIGRATION_REPORT,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  ledger.__setRelease(null);
  overview.mockResolvedValue(preflight());
  audit.mockResolvedValue(MIGRATION_REPORT);
  apply.mockResolvedValue({ applied: [], skipped: [] });
  resolveVercel.mockResolvedValue(CONFIG);
  createPreview.mockResolvedValue({
    id: 'dpl_preview',
    url: 'https://preview.example',
    state: 'BUILDING',
    target: null,
    commitSha: MAIN,
  });
  findPreview.mockResolvedValue(null);
  getDeployment.mockResolvedValue({
    id: 'dpl_preview',
    url: 'https://preview.example',
    state: 'READY',
    target: 'production',
    commitSha: MAIN,
  });
  promote.mockResolvedValue(undefined);
  rollback.mockResolvedValue(undefined);
  smoke.mockResolvedValue([
    {
      path: '/api/health',
      url: 'https://www.merkurov.love/api/health',
      ok: true,
      status: 200,
      durationMs: 10,
      detail: 'HTTP 200 · healthy',
      checkedAt: '2026-11-23T10:00:00.000Z',
    },
  ]);
  production.mockResolvedValue({
    state: 'ready',
    url: 'https://old.example',
    target: 'production',
    commitSha: OLD,
    checkedAt: '2026-11-23T10:00:00.000Z',
    reason: null,
    deploymentId: 'dpl_old',
  });
  activeRelease.mockResolvedValue(null);
});

describe('production release start', () => {
  it('requires explicit confirmation and the displayed SHA', async () => {
    await expect(
      startProductionRelease({ actorId: 'owner', expectedSha: MAIN })
    ).rejects.toMatchObject({ code: 'RELEASE_CONFIRMATION_REQUIRED' });
    await expect(
      startProductionRelease({ actorId: 'owner', confirm: true, expectedSha: 'main' })
    ).rejects.toMatchObject({ code: 'RELEASE_EXPECTED_SHA_REQUIRED' });
    expect(overview).not.toHaveBeenCalled();
  });

  it('refuses to release when main moved after the panel rendered', async () => {
    await expect(
      startProductionRelease({
        actorId: 'owner',
        confirm: true,
        expectedSha: 'c'.repeat(40),
      })
    ).rejects.toBeInstanceOf(ReleaseError);
    expect(createPreview).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it('persists a blocked release and performs no side effects when preflight is blocked', async () => {
    overview.mockResolvedValue(
      preflight({
        blockers: ['CI for main is pending.'],
        canRelease: false,
      })
    );

    const release = await startProductionRelease({
      actorId: 'owner',
      confirm: true,
      expectedSha: MAIN,
    });

    expect(release.status).toBe('blocked');
    expect(release.blockers).toContain('CI for main is pending.');
    expect(apply).not.toHaveBeenCalled();
    expect(createPreview).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it('returns the active release instead of starting a duplicate', async () => {
    activeRelease.mockResolvedValue({ id: 'existing', status: 'running' });

    const release = await startProductionRelease({
      actorId: 'owner',
      confirm: true,
      expectedSha: MAIN,
    });

    expect(release.id).toBe('existing');
    expect(overview).not.toHaveBeenCalled();
  });
});

describe('production release advancement', () => {
  function runningRelease(overrides: Record<string, unknown>) {
    const record = {
      id: 'release-1',
      actorId: 'owner',
      status: 'running',
      phase: 'preview',
      pinnedSha: MAIN,
      previousProductionSha: OLD,
      previousProductionDeploymentId: 'dpl_old',
      previewDeploymentId: null,
      previewUrl: null,
      productionDeploymentId: null,
      productionUrl: null,
      migrationVersions: [],
      migrationSummary: {},
      smokeResults: [],
      blockers: [],
      errorCode: null,
      errorMessage: null,
      rolledBack: false,
      rollbackError: null,
      requestedAt: '2026-11-23T10:00:00.000Z',
      startedAt: new Date().toISOString(),
      updatedAt: '2026-11-23T10:00:00.000Z',
      finishedAt: null,
      ...overrides,
    };
    ledger.__setRelease(record);
    return record;
  }

  it('only marks success after production READY for the pinned SHA and passing smoke', async () => {
    runningRelease({
      phase: 'production_ready',
      previewDeploymentId: 'dpl_preview',
      productionDeploymentId: 'dpl_preview',
      productionUrl: 'https://preview.example',
    });
    production.mockResolvedValue({
      state: 'ready',
      url: 'https://preview.example',
      target: 'production',
      commitSha: MAIN,
      checkedAt: '2026-11-23T10:00:00.000Z',
      reason: null,
      deploymentId: 'dpl_preview',
    });

    const ready = await advanceProductionRelease('release-1');
    expect(ready?.phase).toBe('smoke');
    expect(smoke).not.toHaveBeenCalled();

    const finished = await advanceProductionRelease('release-1');
    expect(finished?.status).toBe('succeeded');
    expect(smoke).toHaveBeenCalledWith('https://www.merkurov.love');
    expect(promote).not.toHaveBeenCalled();
  });

  it('fails and rolls back when live smoke tests fail', async () => {
    runningRelease({
      phase: 'smoke',
      previewDeploymentId: 'dpl_preview',
      productionDeploymentId: 'dpl_preview',
      productionUrl: 'https://preview.example',
    });
    smoke.mockResolvedValue([
      {
        path: '/api/health',
        url: 'https://www.merkurov.love/api/health',
        ok: false,
        status: 503,
        durationMs: 10,
        detail: 'HTTP 503 · unhealthy',
        checkedAt: '2026-11-23T10:00:00.000Z',
      },
    ]);

    const release = await advanceProductionRelease('release-1');

    expect(release?.status).toBe('failed');
    expect(release?.errorCode).toBe('SMOKE_FAILED');
    expect(release?.rolledBack).toBe(true);
    expect(rollback).toHaveBeenCalledWith(CONFIG.config, 'dpl_old');
  });

  it('promotes the immutable preview and records the previous production deployment', async () => {
    runningRelease({
      phase: 'promote',
      previewDeploymentId: 'dpl_preview',
      previewUrl: 'https://preview.example',
    });

    const release = await advanceProductionRelease('release-1');

    expect(promote).toHaveBeenCalledWith(CONFIG.config, 'dpl_preview');
    expect(release?.phase).toBe('production_ready');
    expect(release?.productionDeploymentId).toBe('dpl_preview');
    expect(release?.previousProductionDeploymentId).toBe('dpl_old');
  });

  it('reuses an existing READY preview for the exact SHA', async () => {
    runningRelease({ phase: 'preview' });
    findPreview.mockResolvedValue({
      id: 'dpl_existing',
      url: 'https://existing.example',
      state: 'READY',
      target: null,
      commitSha: MAIN,
    });

    const release = await advanceProductionRelease('release-1');

    expect(createPreview).not.toHaveBeenCalled();
    expect(release?.phase).toBe('promote');
    expect(release?.previewDeploymentId).toBe('dpl_existing');
  });
});
