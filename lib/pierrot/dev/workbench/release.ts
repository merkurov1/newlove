import { assertServerOnly } from '@/lib/serverOnly';
import { getDevRepositoryConfig } from '../repositories';
import type { DevRepositoryKey } from '../types';
import { commitUrl, getBranchHead, getCommitRange, getLatestProductionDeployment } from './github';
import { getFinalizationReport } from './finalization';
import { isWorkbenchSchemaReady } from './store';
import type { DevReleaseCheck, DevReleaseCommit, DevReleaseOverview } from './types';

assertServerOnly('lib/pierrot/dev/workbench/release');

const MAX_COMMITS = 30;

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

/**
 * Read-only release readiness.
 *
 * This module never deploys. It answers:
 *  - what is the exact commit a release would publish (main head);
 *  - what did production last deploy;
 *  - which commits landed in main since then;
 *  - which preflight checks block the release.
 *
 * The production release execution lives in a separate task. When its console
 * URL is configured through PIERROT_DEV_RELEASE_URL the UI links to it; it is
 * never invoked from this process.
 */
export async function getReleaseOverview(
  repository: DevRepositoryKey = 'newlove'
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
        `Vercel production is ${deployment.state} at ${shortSha(deployment.commitSha)}.`
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
        `${behindBy} commit(s) landed in main and are not in production yet.`
      )
    );
  } else {
    const detail =
      compareError ||
      'Main cannot be compared with the production commit until both SHAs are readable.';
    checks.push(releaseCheck('behind', 'Main vs production', 'unknown', detail));
    if (compareError) blockers.push(detail);
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
        ? 'The additive workbench schema is applied.'
        : 'The additive workbench migration is not applied. Release evidence may be incomplete.'
    )
  );
  if (!schemaReady) {
    blockers.push('The additive workbench migration is not applied.');
  }

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

  const canRelease =
    Boolean(mainSha) &&
    Boolean(deployment.commitSha) &&
    productionAheadBy === 0 &&
    behindBy !== null &&
    behindBy > 0 &&
    blockers.length === 0;

  if (!canRelease && blockers.length === 0) {
    if (behindBy === 0) {
      blockers.push('Production already runs the main head commit.');
    } else if (behindBy === null) {
      blockers.push('Production commit is unknown.');
    }
  }

  const releaseUrl = (process.env.PIERROT_DEV_RELEASE_URL || '').trim();
  const releaseAction = releaseUrl
    ? {
        available: true,
        reason: canRelease
          ? 'Release readiness passed. Open the production release console to deploy the exact target SHA.'
          : 'The release console is configured but the preflight is not ready.',
        url: releaseUrl,
      }
    : {
        available: false,
        reason:
          'Production release execution is not connected in this deployment. The exact target SHA is shown, but Admin only reports readiness.',
        url: null,
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
    checks,
    blockers,
    canRelease,
    releaseAction,
    error: mainError,
  };
}
