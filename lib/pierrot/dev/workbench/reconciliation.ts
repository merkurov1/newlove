import { assertServerOnly } from '@/lib/serverOnly';
import { getPullRequestStatus } from './github';
import { appendEvent, listAttemptsForTasks, patchTask } from './store';
import type { DevAttempt, DevWorkbenchTask } from './types';

assertServerOnly('lib/pierrot/dev/workbench/reconciliation');

/**
 * Task/PR state reconciliation.
 *
 * Two different facts must never be conflated:
 *   * a PR is merged into main;
 *   * the task has enough evidence (structured report, satisfied criteria and
 *     a passing command) to be marked verified.
 *
 * A merged PR therefore either becomes `verified` when the evidence exists, or
 * stays in `review` with `verification_status = not_run` and a note explaining
 * that integration is complete but owner verification is not. A PR merged into
 * main is never left holding a stale `partial`/`passed` verification flag, and
 * a closed-but-unmerged PR never closes the owner's task automatically.
 */

export type ReconciliationPullRequest = {
  number: number | null;
  url: string;
  state: string;
  merged: boolean;
  mergeCommitSha?: string | null;
  headSha?: string | null;
};

export type ReconciliationAttempt = {
  id: string;
  status: string;
  warnings?: string[];
  commands?: Array<{ status?: string }>;
  verification?: Record<string, unknown>;
} | null;

export type TaskReconciliationInput = {
  task: Pick<
    DevWorkbenchTask,
    | 'id'
    | 'status'
    | 'verificationStatus'
    | 'verifiedAt'
    | 'acceptanceCriteria'
    | 'resultCommit'
    | 'pullRequests'
  >;
  pr: ReconciliationPullRequest | null;
  attempt: ReconciliationAttempt;
  now?: string;
};

export type TaskReconciliationAction =
  | 'none'
  | 'mark_verified'
  | 'mark_integration_only'
  | 'repair_review_state'
  | 'notify_closed_unmerged';

export type TaskReconciliationPlan = {
  action: TaskReconciliationAction;
  patch: Record<string, unknown> | null;
  event: {
    type: string;
    level: 'info' | 'warn';
    message: string;
    payload: Record<string, unknown>;
  } | null;
  dedupeKey: string | null;
};

const VERIFIED_LIKE = new Set([
  'passed',
  'partial',
  'integration_only',
  'verified',
  'verified_with_warnings',
]);

/**
 * The same evidence rule used by queue finalization: a structured report with
 * every criterion satisfied and at least one passing command. Warnings alone
 * are not evidence.
 */
export function attemptHasStructuredEvidence(attempt: ReconciliationAttempt): boolean {
  if (!attempt) return false;
  if (
    (attempt.warnings || []).some((warning) =>
      /without a structured final report/i.test(String(warning))
    )
  ) {
    return false;
  }
  const verification =
    attempt.verification && typeof attempt.verification === 'object' ? attempt.verification : {};
  const criteria = Array.isArray(verification.criteria) ? verification.criteria : [];
  if (criteria.length === 0) return false;
  if (
    !criteria.every(
      (criterion) =>
        Boolean(criterion) &&
        typeof criterion === 'object' &&
        (criterion as { status?: unknown }).status === 'satisfied'
    )
  ) {
    return false;
  }
  const commands = Array.isArray(attempt.commands) ? attempt.commands : [];
  return commands.some((command) => command?.status === 'passed');
}

export function planTaskReconciliation(input: TaskReconciliationInput): TaskReconciliationPlan {
  const { task, pr, attempt } = input;
  const now = input.now || new Date().toISOString();
  const none: TaskReconciliationPlan = {
    action: 'none',
    patch: null,
    event: null,
    dedupeKey: null,
  };

  // Owner-approved verification is terminal. Reconciliation never downgrades it.
  if (task.status === 'verified') return none;
  if (task.status !== 'review') return none;

  const inconsistentVerification =
    Boolean(task.verifiedAt) ||
    (typeof task.verificationStatus === 'string' && VERIFIED_LIKE.has(task.verificationStatus));

  if (!pr) {
    if (!inconsistentVerification) return none;
    return {
      action: 'repair_review_state',
      patch: {
        status: 'review',
        verification_status: 'not_run',
        verified_at: null,
      },
      event: {
        type: 'task.review_state_repaired',
        level: 'warn',
        message:
          'Review task held a verification flag without a verification action. The flag was reset to not_run; the task remains in review.',
        payload: {
          previousVerificationStatus: task.verificationStatus,
          previousVerifiedAt: task.verifiedAt,
        },
      },
      dedupeKey: `review-state-repaired:${task.id}`,
    };
  }

  if (pr.state === 'closed' && !pr.merged) {
    // Never close, archive or reject the owner's task because a PR was closed.
    return {
      action: 'notify_closed_unmerged',
      patch: null,
      event: {
        type: 'integration.closed_unmerged',
        level: 'warn',
        message: `Pull request ${pr.number ? `#${pr.number}` : pr.url} was closed without merging. The task remains in review; no status was changed automatically.`,
        payload: { prUrl: pr.url, prNumber: pr.number, taskStatus: task.status },
      },
      dedupeKey: `closed-unmerged:${task.id}:${pr.number ?? pr.url}`,
    };
  }

  if (!pr.merged) {
    if (!inconsistentVerification) return none;
    return {
      action: 'repair_review_state',
      patch: {
        status: 'review',
        verification_status: 'not_run',
        verified_at: null,
      },
      event: {
        type: 'task.review_state_repaired',
        level: 'warn',
        message:
          'Review task held a verification flag while its PR is still open. The flag was reset to not_run; the task remains in review.',
        payload: { prUrl: pr.url, previousVerificationStatus: task.verificationStatus },
      },
      dedupeKey: `review-state-repaired:${task.id}:${pr.number ?? pr.url}`,
    };
  }

  const mergedSha = pr.mergeCommitSha || pr.headSha || task.resultCommit || null;
  const evidence = attemptHasStructuredEvidence(attempt);
  if (evidence) {
    return {
      action: 'mark_verified',
      patch: {
        status: 'verified',
        verification_status: 'passed',
        verification_notes: `Integrated into main${mergedSha ? ` at ${mergedSha}` : ''} by PR ${
          pr.number ? `#${pr.number}` : pr.url
        }. The latest attempt has a structured final report with satisfied acceptance criteria and a passing command.`,
        verified_at: now,
        result_commit: mergedSha,
      },
      event: {
        type: 'task.integration_reconciled_verified',
        level: 'info',
        message: `PR ${pr.number ? `#${pr.number}` : pr.url} is merged and the attempt has structured evidence. Task marked verified.`,
        payload: {
          prUrl: pr.url,
          prNumber: pr.number,
          mergeSha: mergedSha,
          attemptId: attempt?.id || null,
        },
      },
      dedupeKey: `integration-reconciled:${task.id}:${mergedSha || pr.number || pr.url}`,
    };
  }

  if (
    task.verificationStatus === 'not_run' &&
    !task.verifiedAt &&
    mergedSha &&
    task.resultCommit === mergedSha
  ) {
    return none;
  }

  return {
    action: 'mark_integration_only',
    patch: {
      status: 'review',
      verification_status: 'not_run',
      verification_notes: `PR ${
        pr.number ? `#${pr.number}` : pr.url
      } was merged into main${mergedSha ? ` at ${mergedSha}` : ''}, but verification is not complete: the latest attempt has no structured final report with satisfied acceptance criteria and a passing command. The task remains in review for owner verification.`,
      verified_at: null,
      result_commit: mergedSha,
    },
    event: {
      type: 'task.integration_reconciled',
      level: 'warn',
      message: `PR ${
        pr.number ? `#${pr.number}` : pr.url
      } is merged, but the task was kept in review because structured verification evidence is missing.`,
      payload: {
        prUrl: pr.url,
        prNumber: pr.number,
        mergeSha: mergedSha,
        attemptId: attempt?.id || null,
      },
    },
    dedupeKey: `integration-reconciled:${task.id}:${mergedSha || pr.number || pr.url}`,
  };
}

function pullRequestNumber(url: string): number | null {
  const match = String(url || '').match(/\/pull\/(\d+)(?:\b|$)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export type TaskReconciliationResult = {
  checked: number;
  repaired: number;
  skipped: boolean;
  errors: number;
};

export type NonTerminalTaskIssue = {
  taskId: string;
  status: string;
  code: 'review_verification_flag' | 'ready_with_pull_request' | 'failed_with_pull_request';
  message: string;
};

/**
 * Read-only audit of the remaining non-terminal rows. Reconciliation mutates
 * only `review` rows; `ready`/`failed` rows are reported for the owner and are
 * deliberately never closed, archived or re-statused automatically.
 */
export function auditNonTerminalTasks(tasks: DevWorkbenchTask[]): NonTerminalTaskIssue[] {
  const issues: NonTerminalTaskIssue[] = [];
  for (const task of tasks) {
    if (!['review', 'ready', 'failed'].includes(task.status)) continue;
    if (
      task.status === 'review' &&
      (Boolean(task.verifiedAt) ||
        (typeof task.verificationStatus === 'string' && VERIFIED_LIKE.has(task.verificationStatus)))
    ) {
      issues.push({
        taskId: task.id,
        status: task.status,
        code: 'review_verification_flag',
        message:
          'Review task holds a verified-like flag; the next overview reconciliation resets it to not_run.',
      });
    }
    if (task.status === 'ready' && task.pullRequests.length > 0) {
      issues.push({
        taskId: task.id,
        status: task.status,
        code: 'ready_with_pull_request',
        message:
          'A ready task already has a PR link. The owner must decide whether to re-enqueue or archive it; nothing was changed automatically.',
      });
    }
    if (task.status === 'failed' && task.pullRequests.length > 0) {
      issues.push({
        taskId: task.id,
        status: task.status,
        code: 'failed_with_pull_request',
        message:
          'A failed task has a PR link. It may have been merged after the failure; the owner must review it. Nothing was changed automatically.',
      });
    }
  }
  return issues.slice(0, 50);
}

let lastReconciliationAt = 0;
const RECONCILIATION_INTERVAL_MS = 60_000;
const MAX_RECONCILIATION_TASKS = 12;

/**
 * Bounded, read-mostly reconciliation pass. It is independent of queue
 * finalization, so a merged PR cannot sit in `review` just because queued work
 * arrived. Every GitHub failure is isolated to the task; it never fails the
 * Admin overview.
 */
export async function reconcileTaskStates(input: {
  tasks: DevWorkbenchTask[];
  force?: boolean;
}): Promise<TaskReconciliationResult> {
  if (!input.force && Date.now() - lastReconciliationAt < RECONCILIATION_INTERVAL_MS) {
    return { checked: 0, repaired: 0, skipped: true, errors: 0 };
  }
  lastReconciliationAt = Date.now();
  const candidates = input.tasks
    .filter((task) => task.status === 'review')
    // Prefer rows with a PR link; review rows without one are still checked for
    // a stale verified-like flag.
    .sort(
      (a, b) =>
        Number(b.pullRequests.length > 0) - Number(a.pullRequests.length > 0) ||
        a.updatedAt.localeCompare(b.updatedAt)
    )
    .slice(0, MAX_RECONCILIATION_TASKS);
  if (candidates.length === 0) {
    return { checked: 0, repaired: 0, skipped: false, errors: 0 };
  }

  const attemptsByTask = await listAttemptsForTasks(
    candidates.map((task) => task.id),
    5
  ).catch((): Map<string, DevAttempt[]> => new Map());

  let repaired = 0;
  let errors = 0;
  for (const task of candidates) {
    const prUrl = task.pullRequests[0];
    const number = prUrl ? pullRequestNumber(prUrl) : null;
    try {
      let plan: TaskReconciliationPlan;
      if (!prUrl || !number) {
        // No PR to read. Still repair a review row that holds a verified-like
        // flag without a verification action.
        plan = planTaskReconciliation({ task, pr: null, attempt: null });
      } else {
        const status = await getPullRequestStatus(task.repository, number);
        if (!status) continue;
        const attempts = attemptsByTask.get(task.id) || [];
        const latest =
          attempts.find((attempt) => attempt.status === 'completed') || attempts[0] || null;
        plan = planTaskReconciliation({
          task,
          pr: {
            number: status.number,
            url: status.url,
            state: status.state,
            merged: status.merged,
            mergeCommitSha: status.mergeCommitSha,
            headSha: status.headSha,
          },
          attempt: latest as ReconciliationAttempt,
        });
      }
      if (plan.patch) {
        const updated = await patchTask(task.id, plan.patch, ['review']);
        if (!updated) continue;
        repaired += 1;
      }
      if (plan.event) {
        await appendEvent({
          taskId: task.id,
          type: plan.event.type,
          level: plan.event.level,
          message: plan.event.message,
          payload: plan.event.payload,
          dedupeKey: plan.dedupeKey,
        }).catch(() => {});
      }
    } catch {
      errors += 1;
    }
  }
  return { checked: candidates.length, repaired, skipped: false, errors };
}
