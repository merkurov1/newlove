import { assertServerOnly } from '@/lib/serverOnly';
import { getDevRepositoryConfig } from '../repositories';
import type { DevRepositoryKey } from '../types';
import {
  commitUrl,
  getBranchHead,
  getCommitChecks,
  getCommitRange,
  getLatestProductionDeployment,
} from './github';
import { getFinalizationReport } from './finalization';
import { inspectProductionMigrations } from './migrationAudit';
import { resolveVercelReleaseProject } from './productionVercel';
import { getActiveProductionRelease, getLatestProductionRelease } from './releaseLedger';
import { isWorkbenchSchemaReady } from './store';
import type {
  DevReleaseCheck,
  DevReleaseCommit,
  DevReleaseFile,
  DevReleaseMigrations,
  DevReleaseOverview,
} from './types';

assertServerOnly('lib/pierrot/dev/workbench/release');

const MAX_COMMITS = 30;
const MAX_FILES = 100;

function shortSha(value: string | null | undefined): string | null {
  return value ? value.slice(0, 7) : null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return 'Unknown error.';
}

function releaseCheck(
  key: string,
  label: string,
  status: DevReleaseCheck['status'],
  detail: string
): DevReleaseCheck {
  return { key, label, status, detail };
}

function migrationOverview(
  report: Awaited<ReturnType<typeof inspectProductionMigrations>>
): DevReleaseMigrations {
  return {
    checkedAt: report.checkedAt,
    available: report.available,
    source: report.source,
    error: report.error,
    counts: report.counts,
    rows: report.rows.map((row) => ({
      version: row.version,
      filename: row.filename,
      status: row.status,
      risk: row.risk,
      reasons: row.reasons,
      evidence: row.evidence,
    })),
    pendingSafe: report.pendingSafe,
    blockers: report.blockers,
  };
}

export type ReleaseOverviewOptions = {
  /** Do not let this release block its own advancement poll. */
  ignoreReleaseId?: string | null;
  /** Skip Vercel project verification for a read-only display call. */
  skipVercelCheck?: boolean;
};

/**
 * Read-only production release readiness.
 *
 * This function never deploys and never applies SQL. It answers:
 *  - what exact commit a release would publish (main head);
 *  - what production last deployed and which commits/files are new;
 *  - whether real CI passed for the exact head;
 *  - which migrations are applied, pending-safe, unsafe or unknown;
 *  - what blocks an owner-confirmed release.
 *
 * The owner action lives in `productionRelease.ts` and only promotes an
 * immutable preview deployment for the SHA displayed here.
 */
export async function getReleaseOverview(
  repository: DevRepositoryKey = 'newlove',
  options: ReleaseOverviewOptions = {}
): Promise<DevReleaseOverview> {
  const checkedAt = new Date().toISOString();
  const config = getDevRepositoryConfig(repository);
  const branch = config.defaultBranch || 'main';

  const checks: DevReleaseCheck[] = [];
  const blockers: string[] = [];

  let mainSha: string | null = null;
  let mainError: string | null = null;
  try {
    mainSha = await getBranchHead(repository, branch);
  } catch (error) {
    mainError = messageOf(error);
  }

  if (mainSha) {
    checks.push(
      releaseCheck(
        'main',
        `${branch} branch`,
        'ok',
        `${config.fullName}@${branch} is at ${shortSha(mainSha)}.`
      )
    );
  } else {
    const detail =
      mainError ||
      `GitHub did not return a head commit for ${config.fullName}@${branch}. Check GITHUB_TOKEN and the branch name.`;
    checks.push(releaseCheck('main', `${branch} branch`, 'error', detail));
    blockers.push(detail);
  }

  const deployment = await getLatestProductionDeployment(repository);

  if (deployment.commitSha) {
    checks.push(
      releaseCheck(
        'production',
        'Production deployment',
        deployment.state === 'ready'
          ? 'ok'
          : deployment.state === 'unavailable'
            ? 'unknown'
            : 'warn',
        `Vercel production is ${deployment.state} at ${shortSha(deployment.commitSha)}${
          deployment.deploymentId ? ` (${deployment.deploymentId})` : ''
        }.`
      )
    );
  } else {
    const detail =
      deployment.reason ||
      'The production deployment commit is unknown, so Admin cannot prove what is live.';
    checks.push(releaseCheck('production', 'Production deployment', 'unknown', detail));
    blockers.push(detail);
  }

  let behindBy: number | null = null;
  let productionAheadBy = 0;
  let commits: DevReleaseCommit[] = [];
  let files: DevReleaseFile[] = [];
  let compareError: string | null = null;

  if (mainSha && deployment.commitSha) {
    if (mainSha.toLowerCase() === deployment.commitSha.toLowerCase()) {
      behindBy = 0;
    } else {
      try {
        const range = await getCommitRange(repository, deployment.commitSha, mainSha);
        behindBy = range.aheadBy;
        productionAheadBy = range.behindBy;
        commits = [...range.commits]
          .reverse()
          .slice(0, MAX_COMMITS)
          .map((commit) => ({
            sha: commit.sha,
            shortSha: shortSha(commit.sha) || '',
            message: (commit.message || '').split('\n')[0].slice(0, 240),
            author: commit.author,
            committedAt: commit.committedAt,
            url: commitUrl(repository, commit.sha),
          }));
        files = (range.files || []).slice(0, MAX_FILES).map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: Number(file.additions || 0),
          deletions: Number(file.deletions || 0),
          url: `https://github.com/${config.fullName}/blob/${mainSha}/${file.filename}`,
        }));
      } catch (error) {
        compareError = messageOf(error);
      }
    }
  }

  if (productionAheadBy > 0) {
    const detail = `Production has ${productionAheadBy} commit(s) that are not in ${branch}. Reconcile the divergence before releasing ${shortSha(mainSha)}.`;
    checks.push(releaseCheck('behind', 'Main vs production', 'error', detail));
    blockers.push(detail);
  } else if (behindBy === 0) {
    checks.push(
      releaseCheck(
        'behind',
        'Main vs production',
        'ok',
        'Production already runs the main head commit. Nothing to release.'
      )
    );
  } else if (behindBy !== null && behindBy > 0) {
    checks.push(
      releaseCheck(
        'behind',
        'Main vs production',
        'ok',
        `${behindBy} commit(s) and ${files.length} file(s) landed in main and are not in production yet.`
      )
    );
  } else {
    const detail =
      compareError ||
      'Main cannot be compared with the production commit until both SHAs are readable.';
    checks.push(releaseCheck('behind', 'Main vs production', 'unknown', detail));
    if (compareError) blockers.push(detail);
  }

  let ci: { status: string; detail: string } | null = null;
  if (mainSha) {
    try {
      const summary = await getCommitChecks(repository, mainSha);
      ci = { status: summary.status, detail: summary.detail };
      checks.push(
        releaseCheck(
          'ci',
          'CI for main head',
          summary.status === 'passed' ? 'ok' : summary.status === 'pending' ? 'warn' : 'error',
          `CI ${summary.status} for ${shortSha(mainSha)}: ${summary.detail}`
        )
      );
      if (summary.status !== 'passed') {
        blockers.push(
          `CI for main ${shortSha(mainSha)} is ${summary.status}. A production release requires passing real CI for the exact SHA.`
        );
      }
    } catch (error) {
      const detail = `CI could not be read for ${shortSha(mainSha)}: ${messageOf(error)}`;
      checks.push(releaseCheck('ci', 'CI for main head', 'error', detail));
      blockers.push(detail);
    }
  }

  const migrationReport = await inspectProductionMigrations();
  const migrations = migrationOverview(migrationReport);
  checks.push(
    releaseCheck(
      'migrations',
      'Migration reconciliation',
      !migrations.available
        ? 'error'
        : migrations.blockers.length > 0
          ? 'error'
          : migrations.pendingSafe.length > 0
            ? 'warn'
            : 'ok',
      !migrations.available
        ? migrations.error || 'Production migration history is unavailable.'
        : migrations.blockers.length > 0
          ? migrations.blockers[0]
          : migrations.pendingSafe.length > 0
            ? `${migrations.pendingSafe.length} safe pending migration(s) will be applied in order: ${migrations.pendingSafe.slice(0, 6).join(', ')}${migrations.pendingSafe.length > 6 ? ', …' : ''}.`
            : `Applied ${migrations.counts.applied}, pending ${migrations.counts.pending}, unsafe ${migrations.counts.unsafe}, unknown ${migrations.counts.unknown}.`
    )
  );
  blockers.push(...migrations.blockers);

  if (!options.skipVercelCheck) {
    const vercel = await resolveVercelReleaseProject(repository);
    checks.push(
      releaseCheck(
        'vercel',
        'Vercel release workflow',
        vercel.ok ? 'ok' : 'error',
        vercel.ok
          ? `Vercel project ${vercel.config.project.name} (${vercel.config.project.id}) is linked to ${vercel.config.project.org || '?'}/${vercel.config.project.repo || '?'}. Release uses an immutable preview → production promotion.`
          : vercel.blocker
      )
    );
    if (!vercel.ok) blockers.push(vercel.blocker);
  }

  let schemaReady = false;
  try {
    schemaReady = await isWorkbenchSchemaReady();
  } catch {
    schemaReady = false;
  }
  checks.push(
    releaseCheck(
      'schema',
      'Workbench migrations',
      schemaReady ? 'ok' : 'error',
      schemaReady
        ? 'The additive workbench schema is applied, so the release ledger can be persisted.'
        : 'The additive workbench migration is not applied. Release evidence cannot be persisted.'
    )
  );
  if (!schemaReady) blockers.push('The additive workbench migration is not applied.');

  const finalization = await getFinalizationReport();
  if (finalization && ['blocked', 'failed'].includes(finalization.stage)) {
    const detail =
      finalization.blockedReason ||
      `Queue finalization is ${finalization.stage}; main may not contain every merged task.`;
    checks.push(releaseCheck('finalization', 'Queue finalization', 'error', detail));
    blockers.push(detail);
  } else {
    checks.push(
      releaseCheck(
        'finalization',
        'Queue finalization',
        finalization ? 'ok' : 'warn',
        finalization
          ? `Finalization stage: ${finalization.stage}.`
          : 'Finalization has not run yet; no blocked integration is recorded.'
      )
    );
  }

  const [latestRelease, activeRelease] = await Promise.all([
    getLatestProductionRelease(),
    getActiveProductionRelease(),
  ]);
  if (activeRelease && activeRelease.id !== options.ignoreReleaseId) {
    const detail = `Release ${activeRelease.id} is ${activeRelease.status} at ${activeRelease.phase} for ${shortSha(activeRelease.pinnedSha)}. Wait for it to finish before starting another.`;
    checks.push(releaseCheck('release', 'Release in progress', 'error', detail));
    blockers.push(detail);
  } else {
    checks.push(
      releaseCheck(
        'release',
        'Release ledger',
        latestRelease ? 'ok' : 'warn',
        latestRelease
          ? `Latest release ${latestRelease.id} is ${latestRelease.status} at ${latestRelease.phase}.`
          : 'No production release has been recorded yet.'
      )
    );
  }

  const canRelease =
    Boolean(mainSha) &&
    Boolean(deployment.commitSha) &&
    productionAheadBy === 0 &&
    behindBy !== null &&
    behindBy > 0 &&
    migrations.available &&
    migrations.blockers.length === 0 &&
    ci?.status === 'passed' &&
    blockers.length === 0;

  if (!canRelease && blockers.length === 0) {
    if (behindBy === 0) {
      blockers.push('Production already runs the main head commit.');
    } else if (behindBy === null) {
      blockers.push('Production commit is unknown.');
    } else if (ci?.status !== 'passed') {
      blockers.push('CI for the exact main head has not passed.');
    }
  }

  const externalReleaseUrl = (process.env.PIERROT_DEV_RELEASE_URL || '').trim();
  const releaseAction = {
    available: canRelease && blockers.length === 0,
    reason: canRelease
      ? `Releasing will pin ${shortSha(mainSha)}, apply safe pending migrations, build a preview for that exact SHA, promote it to production, wait for READY and run live smoke tests.`
      : blockers[0] || 'Release preflight is not ready.',
    url: externalReleaseUrl || null,
    builtIn: true,
    requiresConfirmation: true,
  };

  return {
    repository: config.fullName,
    branch,
    checkedAt,
    main: mainSha
      ? { sha: mainSha, shortSha: shortSha(mainSha) || '', url: commitUrl(repository, mainSha) }
      : null,
    production: {
      ...deployment,
      shortSha: shortSha(deployment.commitSha),
    },
    target: mainSha
      ? { sha: mainSha, shortSha: shortSha(mainSha) || '', url: commitUrl(repository, mainSha) }
      : null,
    behindBy,
    commits,
    files,
    ci,
    migrations,
    checks,
    blockers,
    canRelease: canRelease && blockers.length === 0,
    releaseAction,
    productionRelease: latestRelease,
    activeRelease,
    error: mainError,
  };
}
