import { assertServerOnly } from '@/lib/serverOnly';
import {
  getCommitChecks,
  getLatestProductionDeployment,
  getPullRequestFiles,
  getPullRequestStatus,
} from './github';
import { blockingLandingRisks, detectLandingRisks } from './landing';
import { verifyProductionDeployment } from './delivery';
import { appendEvent, isWorkbenchSchemaReady, listFinalizationTasks, patchTask } from './store';
import type { DevWorkbenchTask } from './types';

assertServerOnly('lib/pierrot/dev/workbench/reconciliation');

export type ReviewReconciliationState =
  | 'landed'
  | 'not_merged'
  | 'closed_unmerged'
  | 'ci_failed'
  | 'ci_missing'
  | 'unreadable'
  | 'security_blocked'
  | 'production_missing'
  | 'missing_pull_request';

export type ReviewReconciliationRow = {
  taskId: string;
  title: string;
  fromStatus: string;
  toStatus: string;
  prUrl: string | null;
  prNumber: number | null;
  headSha: string | null;
  mergeSha: string | null;
  ciStatus: string;
  state: ReviewReconciliationState;
  changed: boolean;
  reason: string;
};

export type ReviewReconciliationReport = {
  apply: boolean;
  scanned: number;
  landed: number;
  stillReview: number;
  missingPullRequest: number;
  changed: number;
  rows: ReviewReconciliationRow[];
  generatedAt: string;
};

function pullRequestNumber(url: string | null | undefined): number | null {
  const match = String(url || '').match(/\/pull\/(\d+)(?:\b|$)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function verificationPatch(
  task: DevWorkbenchTask,
  input: {
    status: 'review' | 'verified';
    verificationStatus: string;
    notes: string;
    resultCommit: string | null;
  }
): Record<string, unknown> {
  // Only verification evidence is rewritten. Reports, attempts, result notes
  // and the cached PR references are deliberately left untouched.
  return {
    status: input.status,
    verification_status: input.verificationStatus,
    verification_notes: input.notes,
    verified_at: input.status === 'verified' ? new Date().toISOString() : null,
    result_commit: input.resultCommit || task.resultCommit,
  };
}

/**
 * Reconcile cached review/verified rows against the real GitHub PR state.
 *
 * This is safe to repeat. It never deletes a row, attempt, note or PR link. A
 * row becomes verified only when the PR is actually merged and real CI passed
 * for its exact head. Unmerged or unproven rows stay in review with an explicit
 * reason, so unmerged work is never presented as complete.
 */
export async function reconcileLegacyReviewRows(
  input: {
    apply?: boolean;
    limit?: number;
  } = {}
): Promise<ReviewReconciliationReport> {
  const apply = input.apply === true;
  const generatedAt = new Date().toISOString();
  const report: ReviewReconciliationReport = {
    apply,
    scanned: 0,
    landed: 0,
    stillReview: 0,
    missingPullRequest: 0,
    changed: 0,
    rows: [],
    generatedAt,
  };

  let tasks: DevWorkbenchTask[] = [];
  try {
    if (!(await isWorkbenchSchemaReady())) return report;
    tasks = await listFinalizationTasks(input.limit || 200, { includeWithoutPullRequests: true });
  } catch {
    return report;
  }

  for (const task of tasks) {
    report.scanned += 1;
    const prUrl = task.pullRequests.find((url) => pullRequestNumber(url) !== null) || null;
    const number = pullRequestNumber(prUrl);

    if (!prUrl || !number) {
      report.missingPullRequest += 1;
      report.stillReview += 1;
      report.rows.push({
        taskId: task.id,
        title: task.title,
        fromStatus: task.status,
        toStatus: task.status,
        prUrl: null,
        prNumber: null,
        headSha: task.resultCommit,
        mergeSha: null,
        ciStatus: 'unknown',
        state: 'missing_pull_request',
        changed: false,
        reason:
          'No pull request is cached for this review row. It cannot be proved landed and is never marked complete by reconciliation.',
      });
      continue;
    }

    let status: Awaited<ReturnType<typeof getPullRequestStatus>>;
    try {
      status = await getPullRequestStatus(task.repository, number);
    } catch (error) {
      status = null;
      report.stillReview += 1;
      report.rows.push({
        taskId: task.id,
        title: task.title,
        fromStatus: task.status,
        toStatus: task.status,
        prUrl,
        prNumber: number,
        headSha: task.resultCommit,
        mergeSha: null,
        ciStatus: 'unknown',
        state: 'unreadable',
        changed: false,
        reason: `GitHub could not be read for PR #${number}: ${
          error instanceof Error ? error.message.slice(0, 300) : 'unknown error'
        }. No state was changed.`,
      });
      continue;
    }

    if (!status) {
      report.stillReview += 1;
      report.rows.push({
        taskId: task.id,
        title: task.title,
        fromStatus: task.status,
        toStatus: task.status,
        prUrl,
        prNumber: number,
        headSha: task.resultCommit,
        mergeSha: null,
        ciStatus: 'unknown',
        state: 'unreadable',
        changed: false,
        reason: `GitHub returned no pull request #${number}. No state was changed.`,
      });
      continue;
    }

    let ciStatus = 'unknown';
    let ciDetail = 'CI was not read.';
    try {
      const checks = await getCommitChecks(task.repository, status.headSha);
      ciStatus = checks.status;
      ciDetail = checks.detail;
    } catch (error) {
      ciDetail = error instanceof Error ? error.message.slice(0, 300) : 'CI could not be read.';
    }

    let risksReason = '';
    if (!status.merged) {
      try {
        const files = await getPullRequestFiles(task.repository, number);
        const blocking = blockingLandingRisks(detectLandingRisks(files));
        risksReason = blocking
          .map((risk) => `${risk.code}: ${risk.reason}`)
          .join(' ')
          .slice(0, 800);
      } catch {
        risksReason = 'The PR file list could not be read.';
      }
    }

    const merged = status.merged;
    let production: ReturnType<typeof verifyProductionDeployment> | null = null;
    if (merged && ciStatus === 'passed' && !risksReason) {
      try {
        const deployment = await getLatestProductionDeployment(task.repository);
        production = verifyProductionDeployment({
          deployment,
          landedShas: [status.mergeCommitSha, status.headSha],
        });
      } catch (error) {
        production = {
          status: 'unavailable',
          reason:
            error instanceof Error
              ? error.message.slice(0, 300)
              : 'Production deployment could not be read.',
          deployment: null,
          matchedSha: null,
        };
      }
    }
    const landed =
      merged && ciStatus === 'passed' && !risksReason && production?.status === 'verified';
    const nextStatus: 'review' | 'verified' = landed ? 'verified' : 'review';
    const state: ReviewReconciliationState = landed
      ? 'landed'
      : !merged
        ? status.state === 'closed'
          ? 'closed_unmerged'
          : 'not_merged'
        : risksReason
          ? 'security_blocked'
          : ciStatus !== 'passed'
            ? ciStatus === 'failed'
              ? 'ci_failed'
              : 'ci_missing'
            : 'production_missing';

    const reason = landed
      ? `PR #${number} is merged at ${status.mergeCommitSha || status.headSha} and CI passed for head ${status.headSha}; production is ready at the landed commit.`
      : !merged
        ? `PR #${number} is ${status.state}, not merged. It is not complete.`
        : risksReason
          ? `PR #${number} was merged, but reconciliation does not certify it: ${risksReason}`
          : ciStatus !== 'passed'
            ? `PR #${number} is merged, but real CI evidence is ${ciStatus}: ${ciDetail}`
            : `PR #${number} is merged and CI passed, but production is not verified: ${
                production?.reason || 'the deployed commit is unknown.'
              } The task stays in review.`;

    const needsChange =
      apply &&
      (task.status !== nextStatus ||
        task.verificationStatus !== (landed ? 'passed' : 'reconciled_not_landed'));

    if (needsChange) {
      await patchTask(
        task.id,
        verificationPatch(task, {
          status: nextStatus,
          verificationStatus: landed ? 'passed' : 'reconciled_not_landed',
          notes: `Reconciled against GitHub: ${reason} Reports, attempts, result notes and PR links were preserved.`,
          resultCommit: status.mergeCommitSha || status.headSha || task.resultCommit,
        })
      ).catch(() => null);
      report.changed += 1;
    }

    await appendEvent({
      taskId: task.id,
      type: 'task.reconciled',
      level: landed ? 'info' : 'warn',
      message: reason,
      payload: {
        apply,
        state,
        prNumber: number,
        prUrl,
        headSha: status.headSha,
        mergeSha: status.mergeCommitSha,
        ciStatus,
        ciDetail,
        production: production
          ? {
              status: production.status,
              reason: production.reason,
              commitSha: production.deployment?.commitSha || null,
              state: production.deployment?.state || null,
            }
          : null,
        risks: risksReason || null,
        previousStatus: task.status,
        nextStatus: needsChange ? nextStatus : task.status,
      },
      dedupeKey: `task-reconciled:${task.id}:${number}:${state}:${status.headSha}:${apply ? 'apply' : 'dry'}`,
    }).catch(() => undefined);

    if (landed) report.landed += 1;
    else report.stillReview += 1;
    report.rows.push({
      taskId: task.id,
      title: task.title,
      fromStatus: task.status,
      toStatus: needsChange ? nextStatus : task.status,
      prUrl,
      prNumber: number,
      headSha: status.headSha,
      mergeSha: status.mergeCommitSha,
      ciStatus,
      state,
      changed: needsChange,
      reason,
    });
  }

  return report;
}
