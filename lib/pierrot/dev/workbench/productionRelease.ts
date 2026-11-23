import { assertServerOnly } from '@/lib/serverOnly';
import { getLatestProductionDeployment } from './github';
import { sameCommitSha } from './landing';
import {
  applyPendingSafeMigrations,
  inspectProductionMigrations,
  MigrationApplyError,
  MigrationAuditError,
} from './migrationAudit';
import {
  createPreviewDeployment,
  findReadyPreviewDeployment,
  getVercelDeployment,
  promoteDeployment,
  resolveVercelReleaseProject,
  rollbackProduction,
  VercelReleaseError,
  type VercelReleaseConfig,
} from './productionVercel';
import { getReleaseOverview } from './release';
import {
  getActiveProductionRelease,
  getLatestProductionRelease,
  getProductionRelease,
  newProductionRelease,
  recordProductionRelease,
} from './releaseLedger';
import { resolveProductionSmokeBaseUrl, runProductionSmokeTests } from './smokeTests';
import { tryAcquireProductionReleaseLock } from './store';
import type { DevProductionRelease } from './types';

assertServerOnly('lib/pierrot/dev/workbench/productionRelease');

const DEFAULT_RELEASE_TIMEOUT_MS = 30 * 60_000;
const MIN_RELEASE_TIMEOUT_MS = 5 * 60_000;
const MAX_RELEASE_TIMEOUT_MS = 60 * 60_000;

export class ReleaseError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: string | null;
  constructor(code: string, message: string, status = 409, detail: string | null = null) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function timeoutMs(): number {
  const raw = Number(process.env.PIERROT_RELEASE_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_RELEASE_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(raw), MIN_RELEASE_TIMEOUT_MS), MAX_RELEASE_TIMEOUT_MS);
}

function now(): string {
  return new Date().toISOString();
}

function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : 'unknown';
}

function terminal(status: DevProductionRelease['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'blocked';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 1200);
  return 'The production release failed.';
}

function errorCode(error: unknown): string {
  if (error instanceof ReleaseError) return error.code;
  if (error instanceof VercelReleaseError) return error.code;
  if (error instanceof MigrationApplyError) return error.code;
  if (error instanceof MigrationAuditError) return error.code;
  return 'RELEASE_FAILED';
}

async function save(
  record: DevProductionRelease,
  patch: Partial<DevProductionRelease> = {}
): Promise<DevProductionRelease> {
  Object.assign(record, patch);
  record.updatedAt = now();
  if (terminal(record.status)) {
    record.finishedAt = record.finishedAt || record.updatedAt;
  }
  await recordProductionRelease(record);
  return record;
}

async function blockRelease(
  record: DevProductionRelease,
  blockers: string[],
  code = 'RELEASE_BLOCKED'
): Promise<DevProductionRelease> {
  return save(record, {
    status: 'blocked',
    phase: record.phase,
    blockers: blockers.map((item) => String(item).slice(0, 1200)).slice(0, 10),
    errorCode: code,
    errorMessage: blockers[0] ? String(blockers[0]).slice(0, 1200) : null,
  });
}

async function rollbackForFailure(
  record: DevProductionRelease
): Promise<{ rolledBack: boolean; rollbackError: string | null }> {
  if (!record.productionDeploymentId) {
    return { rolledBack: false, rollbackError: null };
  }
  if (!record.previousProductionDeploymentId) {
    return {
      rolledBack: false,
      rollbackError:
        'The previous production deployment id is unknown, so the old production could not be restored automatically.',
    };
  }
  const project = await resolveVercelReleaseProject('newlove');
  if (!project.ok) {
    return { rolledBack: false, rollbackError: project.blocker };
  }
  try {
    await rollbackProduction(project.config, record.previousProductionDeploymentId);
    return { rolledBack: true, rollbackError: null };
  } catch (error) {
    return { rolledBack: false, rollbackError: errorMessage(error) };
  }
}

async function failRelease(
  record: DevProductionRelease,
  code: string,
  message: string,
  restoreProduction = true
): Promise<DevProductionRelease> {
  let rolledBack = record.rolledBack;
  let rollbackError = record.rollbackError;
  if (restoreProduction && !record.rolledBack) {
    const rollback = await rollbackForFailure(record);
    rolledBack = rollback.rolledBack || record.rolledBack;
    rollbackError = rollback.rollbackError;
  }
  return save(record, {
    status: 'failed',
    errorCode: code,
    errorMessage: message.slice(0, 1200),
    rolledBack,
    rollbackError,
  });
}

async function migrationsPhase(record: DevProductionRelease): Promise<DevProductionRelease> {
  // Re-run the full preflight immediately before any side effect. The displayed
  // SHA may have moved, CI may have changed, or a migration may have been
  // applied manually in the meantime.
  const preflight = await getReleaseOverview('newlove', { ignoreReleaseId: record.id });
  if (!preflight.target || !sameCommitSha(preflight.target.sha, record.pinnedSha)) {
    return blockRelease(
      record,
      [
        `main moved from the pinned ${shortSha(record.pinnedSha)} to ${shortSha(
          preflight.target?.sha
        )}. Nothing was applied or deployed. Start a new release from the displayed SHA.`,
      ],
      'RELEASE_SHA_MOVED'
    );
  }
  if (preflight.blockers.length > 0) {
    return blockRelease(record, preflight.blockers);
  }

  const audit = await inspectProductionMigrations();
  if (!audit.available || audit.blockers.length > 0) {
    return blockRelease(
      record,
      audit.blockers.length > 0
        ? audit.blockers
        : [audit.error || 'Production migration state is unavailable.'],
      'MIGRATION_PREFLIGHT_BLOCKED'
    );
  }

  let applied: string[] = [];
  if (audit.pendingSafe.length > 0) {
    try {
      const result = await applyPendingSafeMigrations(audit);
      applied = result.applied;
    } catch (error) {
      return failRelease(record, errorCode(error), errorMessage(error), false);
    }
  }

  // Prove the result from the live schema; never write or assume history.
  const confirmed = await inspectProductionMigrations();
  if (!confirmed.available || confirmed.blockers.length > 0) {
    return failRelease(
      record,
      'MIGRATION_VERIFY_FAILED',
      confirmed.blockers[0] ||
        confirmed.error ||
        'Applied migrations could not be verified against the live schema.',
      false
    );
  }

  return save(record, {
    phase: 'preview',
    migrationVersions: applied,
    migrationSummary: {
      appliedBefore: audit.counts,
      appliedNow: applied,
      pendingAfter: confirmed.counts.pending,
      pendingSafeAfter: confirmed.pendingSafe,
      checkedAt: confirmed.checkedAt,
    },
    blockers: [],
  });
}

async function previewPhase(record: DevProductionRelease): Promise<DevProductionRelease> {
  const project = await resolveVercelReleaseProject('newlove');
  if (!project.ok) {
    return blockRelease(record, [project.blocker], project.code);
  }
  const config = project.config;

  if (record.previewDeploymentId) {
    const deployment = await getVercelDeployment(config, record.previewDeploymentId);
    if (deployment.state === 'READY') {
      return save(record, {
        phase: 'promote',
        previewUrl: deployment.url || record.previewUrl,
      });
    }
    if (['ERROR', 'CANCELED', 'BLOCKED'].includes(deployment.state)) {
      return failRelease(
        record,
        'VERCEL_PREVIEW_FAILED',
        deployment.errorMessage ||
          `Preview deployment ${deployment.id} ended in ${deployment.state}.`,
        false
      );
    }
    return save(record, { previewUrl: deployment.url || record.previewUrl });
  }

  const existing = await findReadyPreviewDeployment(config, record.pinnedSha);
  if (existing) {
    if (existing.state === 'READY') {
      return save(record, {
        phase: 'promote',
        previewDeploymentId: existing.id,
        previewUrl: existing.url,
      });
    }
    return save(record, {
      previewDeploymentId: existing.id,
      previewUrl: existing.url,
    });
  }

  const created = await createPreviewDeployment(config, record.pinnedSha);
  return save(record, {
    phase: created.state === 'READY' ? 'promote' : 'preview',
    previewDeploymentId: created.id,
    previewUrl: created.url,
  });
}

async function promotePhase(record: DevProductionRelease): Promise<DevProductionRelease> {
  const project = await resolveVercelReleaseProject('newlove');
  if (!project.ok) {
    return blockRelease(record, [project.blocker], project.code);
  }
  const config: VercelReleaseConfig = project.config;
  if (!record.previewDeploymentId) {
    return failRelease(
      record,
      'RELEASE_PREVIEW_MISSING',
      'No preview deployment is recorded; promotion was not attempted.',
      false
    );
  }

  const current = await getLatestProductionDeployment('newlove');
  if (
    record.previousProductionSha &&
    current.commitSha &&
    !sameCommitSha(current.commitSha, record.previousProductionSha)
  ) {
    if (sameCommitSha(current.commitSha, record.pinnedSha)) {
      return save(record, {
        phase: 'production_ready',
        productionDeploymentId: current.deploymentId || record.previewDeploymentId,
        productionUrl: current.url || record.previewUrl,
      });
    }
    return failRelease(
      record,
      'PRODUCTION_MOVED',
      `Production moved to ${shortSha(current.commitSha)} after this release was pinned to ${shortSha(
        record.pinnedSha
      )}. Promotion was not attempted so the other production change is preserved.`,
      false
    );
  }

  try {
    await promoteDeployment(config, record.previewDeploymentId);
  } catch (error) {
    return failRelease(record, errorCode(error), errorMessage(error), false);
  }

  return save(record, {
    phase: 'production_ready',
    productionDeploymentId: record.previewDeploymentId,
    productionUrl: record.previewUrl,
  });
}

async function productionReadyPhase(record: DevProductionRelease): Promise<DevProductionRelease> {
  const project = await resolveVercelReleaseProject('newlove');
  if (!project.ok) {
    return blockRelease(record, [project.blocker], project.code);
  }
  if (!record.productionDeploymentId) {
    return failRelease(
      record,
      'RELEASE_DEPLOYMENT_MISSING',
      'The promoted deployment id is unknown, so production readiness cannot be proven.',
      false
    );
  }

  const deployment = await getVercelDeployment(project.config, record.productionDeploymentId);
  if (['ERROR', 'CANCELED', 'BLOCKED'].includes(deployment.state)) {
    return failRelease(
      record,
      'VERCEL_PRODUCTION_FAILED',
      deployment.errorMessage ||
        `Production deployment ${deployment.id} ended in ${deployment.state}.`,
      true
    );
  }
  if (deployment.state !== 'READY') {
    return save(record, { productionUrl: deployment.url || record.productionUrl });
  }

  const current = await getLatestProductionDeployment('newlove');
  if (!current.commitSha || !sameCommitSha(current.commitSha, record.pinnedSha)) {
    return save(record, {
      productionUrl: deployment.url || record.productionUrl,
    });
  }

  return save(record, {
    phase: 'smoke',
    productionUrl: deployment.url || record.productionUrl,
  });
}

async function smokePhase(record: DevProductionRelease): Promise<DevProductionRelease> {
  const baseUrl = resolveProductionSmokeBaseUrl(record.productionUrl || record.previewUrl);
  if (!baseUrl) {
    return failRelease(
      record,
      'SMOKE_URL_MISSING',
      'No production URL is configured for smoke tests. Set PIERROT_RELEASE_PRODUCTION_URL or NEXT_PUBLIC_APP_URL.',
      true
    );
  }

  const results = await runProductionSmokeTests(baseUrl);
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    return save(record, {
      status: 'succeeded',
      phase: 'completed',
      smokeResults: results,
      blockers: [],
      errorCode: null,
      errorMessage: null,
    });
  }

  const message = `Smoke tests failed: ${failed
    .map((result) => `${result.path} → ${result.detail}`)
    .slice(0, 5)
    .join('; ')}`;
  const rollback = await rollbackForFailure(record);
  return save(record, {
    status: 'failed',
    phase: 'smoke',
    smokeResults: results,
    errorCode: 'SMOKE_FAILED',
    errorMessage: message.slice(0, 1200),
    rolledBack: rollback.rolledBack,
    rollbackError: rollback.rollbackError,
  });
}

/**
 * Advance one step of an active release. Safe to call repeatedly from Admin
 * polling: a distributed event lock prevents concurrent phase execution, and
 * every external operation is looked up before it is repeated.
 */
export async function advanceProductionRelease(
  releaseId: string
): Promise<DevProductionRelease | null> {
  if (!releaseId) return null;
  const acquired = await tryAcquireProductionReleaseLock(releaseId);
  if (!acquired) return getProductionRelease(releaseId);

  const record = await getProductionRelease(releaseId);
  if (!record || terminal(record.status)) return record;

  const started = record.startedAt ? new Date(record.startedAt).getTime() : Date.now();
  if (Date.now() - started > timeoutMs()) {
    const message = `Release exceeded the ${Math.round(timeoutMs() / 60_000)} minute execution limit at phase ${record.phase}.`;
    return record.productionDeploymentId
      ? failRelease(record, 'RELEASE_TIMEOUT', message, true)
      : failRelease(record, 'RELEASE_TIMEOUT', message, false);
  }

  try {
    switch (record.phase) {
      case 'requested':
      case 'preflight':
      case 'migrations':
        return await migrationsPhase(record);
      case 'preview':
        return await previewPhase(record);
      case 'promote':
        return await promotePhase(record);
      case 'production_ready':
        return await productionReadyPhase(record);
      case 'smoke':
        return await smokePhase(record);
      default:
        return record;
    }
  } catch (error) {
    const promoted = Boolean(record.productionDeploymentId);
    return failRelease(record, errorCode(error), errorMessage(error), promoted);
  }
}

/**
 * Owner-triggered start. The SHA is always read from GitHub at release start;
 * `expectedSha` is only a concurrency check against what Admin displayed. A
 * client-supplied SHA is never used as the deployment target.
 */
export async function startProductionRelease(input: {
  actorId: string;
  expectedSha?: string | null;
  confirm?: boolean;
}): Promise<DevProductionRelease> {
  if (input.confirm !== true) {
    throw new ReleaseError(
      'RELEASE_CONFIRMATION_REQUIRED',
      'A production release requires explicit owner confirmation.',
      409
    );
  }
  const expectedSha = String(input.expectedSha || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(expectedSha)) {
    throw new ReleaseError(
      'RELEASE_EXPECTED_SHA_REQUIRED',
      'The exact SHA displayed in Admin is required. A branch name is never accepted.',
      400
    );
  }

  const active = await getActiveProductionRelease();
  if (active) return active;

  const lock = await tryAcquireProductionReleaseLock(`start:${input.actorId}`, 15_000);
  if (!lock) {
    const current = await getActiveProductionRelease();
    if (current) return current;
    throw new ReleaseError(
      'RELEASE_START_IN_PROGRESS',
      'Another release request is starting. Retry in a few seconds.',
      409
    );
  }

  const preflight = await getReleaseOverview('newlove');
  if (!preflight.target?.sha) {
    throw new ReleaseError(
      'RELEASE_MAIN_UNAVAILABLE',
      preflight.blockers[0] || 'The main branch SHA cannot be read.',
      502
    );
  }
  const pinnedSha = preflight.target.sha;
  if (!sameCommitSha(expectedSha, pinnedSha)) {
    throw new ReleaseError(
      'RELEASE_SHA_MOVED',
      `main moved since the release panel was rendered. Displayed ${expectedSha}, current main is ${pinnedSha}. Nothing was deployed.`,
      409,
      pinnedSha
    );
  }

  const latest = await getLatestProductionRelease();
  if (
    latest?.status === 'succeeded' &&
    sameCommitSha(latest.pinnedSha, pinnedSha) &&
    sameCommitSha(preflight.production?.commitSha, pinnedSha)
  ) {
    return latest;
  }

  const record = newProductionRelease({
    actorId: input.actorId,
    pinnedSha,
    previousProductionSha: preflight.production?.commitSha || null,
    previousProductionDeploymentId: preflight.production?.deploymentId || null,
  });
  await recordProductionRelease(record);

  if (preflight.blockers.length > 0) {
    return blockRelease(record, preflight.blockers);
  }

  await save(record, {
    status: 'running',
    phase: 'migrations',
    startedAt: record.startedAt || now(),
    blockers: [],
  });

  return (await advanceProductionRelease(record.id)) || record;
}
