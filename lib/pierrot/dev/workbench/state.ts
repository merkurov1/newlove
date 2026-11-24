import { assertServerOnly } from '@/lib/serverOnly';
import type {
  DevAttemptStatus,
  DevWorkbenchTaskStatus,
} from './types';

assertServerOnly('lib/pierrot/dev/workbench/state');

/**
 * Explicit, closed state machines. Every transition in the Workbench goes
 * through these helpers; the API never trusts a status supplied by a client.
 */

const TASK_TRANSITIONS: Record<DevWorkbenchTaskStatus, DevWorkbenchTaskStatus[]> = {
  draft: ['ready', 'blocked', 'cancelled', 'archived'],
  ready: ['queued', 'draft', 'blocked', 'cancelled', 'archived'],
  queued: ['ready', 'in_progress', 'blocked', 'cancelled'],
  // `queued` is only produced by the bounded automatic-retry path after a
  // transient execution failure; it is not an owner transition.
  in_progress: ['review', 'failed', 'manual_review', 'queued', 'cancelled'],
  review: ['verified', 'rejected', 'failed', 'queued', 'cancelled'],
  verified: ['archived'],
  failed: ['queued', 'cancelled', 'archived', 'review'],
  // A task that exhausted the bounded automatic retry budget waits for an
  // explicit owner decision. It is never re-claimed by the queue RPC.
  manual_review: ['queued', 'blocked', 'cancelled', 'archived'],
  rejected: ['queued', 'archived', 'cancelled'],
  cancelled: ['queued', 'archived'],
  blocked: ['ready', 'cancelled', 'archived'],
  archived: [],
};

const ATTEMPT_TRANSITIONS: Record<DevAttemptStatus, DevAttemptStatus[]> = {
  created: ['claimed', 'cancelled'],
  claimed: ['running', 'completed', 'failed', 'cancelled', 'timed_out'],
  running: ['completed', 'failed', 'cancelled', 'timed_out'],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export class DevTransitionError extends Error {
  readonly code = 'DEV_INVALID_TRANSITION';

  constructor(
    readonly entity: 'task' | 'attempt',
    readonly from: string,
    readonly to: string
  ) {
    super(`Invalid ${entity} transition: ${from} → ${to}`);
    this.name = 'DevTransitionError';
  }
}

export function canTransitionTask(
  from: DevWorkbenchTaskStatus,
  to: DevWorkbenchTaskStatus
): boolean {
  if (from === to) return true;
  return (TASK_TRANSITIONS[from] || []).includes(to);
}

export function assertTaskTransition(
  from: DevWorkbenchTaskStatus,
  to: DevWorkbenchTaskStatus
): void {
  if (!canTransitionTask(from, to)) throw new DevTransitionError('task', from, to);
}

export function canTransitionAttempt(from: DevAttemptStatus, to: DevAttemptStatus): boolean {
  if (from === to) return true;
  return (ATTEMPT_TRANSITIONS[from] || []).includes(to);
}

export function assertAttemptTransition(from: DevAttemptStatus, to: DevAttemptStatus): void {
  if (!canTransitionAttempt(from, to)) throw new DevTransitionError('attempt', from, to);
}

export function isTerminalAttempt(status: DevAttemptStatus): boolean {
  return ATTEMPT_TRANSITIONS[status]?.length === 0;
}

export function isFinalTaskStatus(status: DevWorkbenchTaskStatus): boolean {
  return status === 'verified' || status === 'archived';
}

/** Tasks the owner can put into the execution queue. */
export function isQueueable(status: DevWorkbenchTaskStatus): boolean {
  return status === 'ready';
}

export function branchNameForAttempt(taskId: string, attemptNumber: number): string {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error('Invalid task id.');
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new Error('Invalid attempt number.');
  }
  return `pierrot/dev/${taskId.toLowerCase()}/${attemptNumber}`;
}

export function taskStatusLabel(status: DevWorkbenchTaskStatus): string {
  const labels: Record<DevWorkbenchTaskStatus, string> = {
    draft: 'Draft',
    ready: 'Ready',
    queued: 'Queued',
    in_progress: 'In progress',
    review: 'Review',
    verified: 'Verified',
    failed: 'Failed',
    manual_review: 'Manual review',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    archived: 'Archived',
    blocked: 'Blocked',
  };
  return labels[status] || status;
}

export function attemptStatusLabel(status: DevAttemptStatus): string {
  const labels: Record<DevAttemptStatus, string> = {
    created: 'Created',
    claimed: 'Claimed',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    timed_out: 'Timed out',
  };
  return labels[status] || status;
}

export function truncateText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\u0000/g, '');
  return normalized.length > limit ? `${normalized.slice(0, limit)}\n…[truncated]` : normalized;
}

export function truncateLog(value: unknown, limit = 60_000): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\u0000/g, '');
  if (normalized.length <= limit) return normalized;
  // Keep both the beginning (setup errors) and the tail (final failure).
  const head = normalized.slice(0, Math.floor(limit * 0.4));
  const tail = normalized.slice(-Math.floor(limit * 0.6));
  return `${head}\n…[log truncated: ${normalized.length - limit} characters omitted]…\n${tail}`;
}

export type CriterionEvidenceInput = {
  criterion: string;
  changedFiles: string[];
  /** At least one real test/build/lint/typecheck command passed locally. */
  localChecksPassed: boolean;
  localChecksFailed: boolean;
  /** At least one real CI check run concluded successfully. */
  ciPassed: boolean;
  ciFailed: boolean;
  /** Explicit owner confirmation recorded during acceptance. */
  manualConfirmed: boolean;
};

export type CriterionEvidence = {
  criterion: string;
  status: 'satisfied' | 'not_verified' | 'failed';
  evidence: string;
  source: 'diff' | 'ci' | 'local' | 'manual' | 'none';
};

const CHECK_CRITERION = /(test|tests|тест|сборк|build|lint|typecheck|проверк|ci\b)/i;

/**
 * Evidence rules.
 *
 * A changed filename is NEVER proof that a behavioural acceptance criterion is
 * satisfied. It is only reported as a supporting hint. Verification requires
 * a real passing local command, a real passing CI check, or explicit manual
 * confirmation by the owner.
 */
export function evaluateCriterion(input: CriterionEvidenceInput): CriterionEvidence {
  const mentioned = input.changedFiles.find((file) => {
    const normalized = file.toLowerCase();
    const basename = normalized.split('/').pop() || normalized;
    const criterion = input.criterion.toLowerCase();
    return criterion.includes(normalized) || (basename.length >= 4 && criterion.includes(basename));
  });

  const isCheck = CHECK_CRITERION.test(input.criterion);

  if (input.manualConfirmed) {
    return {
      criterion: input.criterion,
      status: 'satisfied',
      evidence: 'Confirmed manually by the owner in Admin.',
      source: 'manual',
    };
  }

  if (input.localChecksFailed || input.ciFailed) {
    return {
      criterion: input.criterion,
      status: 'failed',
      evidence: input.ciFailed
        ? 'A CI check run for the head commit concluded with a failure.'
        : 'A local verification command failed during execution.',
      source: input.ciFailed ? 'ci' : 'local',
    };
  }

  if (isCheck && (input.localChecksPassed || input.ciPassed)) {
    return {
      criterion: input.criterion,
      status: 'satisfied',
      evidence: input.ciPassed
        ? 'A CI check run for the head commit concluded successfully.'
        : 'A local verification command executed by the worker passed.',
      source: input.ciPassed ? 'ci' : 'local',
    };
  }

  if (isCheck) {
    return {
      criterion: input.criterion,
      status: 'not_verified',
      evidence: 'No passing test, build, lint or typecheck result is attached to this attempt.',
      source: 'none',
    };
  }

  return {
    criterion: input.criterion,
    status: 'not_verified',
    evidence: mentioned
      ? `The diff touches ${mentioned}, but a changed file is not proof that this criterion is satisfied. Manual review is required.`
      : 'The diff alone cannot prove this criterion. It requires a manual check or an explicit confirmation.',
    source: mentioned ? 'diff' : 'none',
  };
}

export function computeVerdict(input: {
  hasChanges: boolean;
  hasBlocker: boolean;
  hasHighFinding: boolean;
  localChecksPassed: boolean;
  localChecksFailed: boolean;
  ciPassed: boolean;
  ciFailed: boolean;
  /** Every criterion was explicitly confirmed by the owner. */
  manualAll?: boolean;
  criteria: Array<{ status: 'satisfied' | 'not_verified' | 'failed' }>;
}): 'verified' | 'verified_with_warnings' | 'not_verified' | 'rejected' {
  if (input.hasBlocker) return 'rejected';
  if (!input.hasChanges) return 'not_verified';
  if (input.ciFailed || input.localChecksFailed) return 'rejected';
  if (input.criteria.some((criterion) => criterion.status === 'failed')) return 'rejected';

  const checksPassed = input.ciPassed || input.localChecksPassed;
  const allSatisfied = input.criteria.every((criterion) => criterion.status === 'satisfied');

  if (checksPassed && allSatisfied && !input.hasHighFinding) return 'verified';
  if (checksPassed) return 'verified_with_warnings';
  // Manual verification is real evidence, but it is never presented as CI.
  if (input.manualAll && allSatisfied) return 'verified_with_warnings';
  return 'not_verified';
}

/** Bounded, predictable polling guidance shared by worker and Admin. */
export const WORKER_POLL_INTERVAL_MS = 20_000;
export const WORKER_MIN_POLL_INTERVAL_MS = 15_000;
export const WORKER_MAX_POLL_INTERVAL_MS = 30_000;
export const WORKER_ERROR_BACKOFF_MAX_MS = 120_000;
export const WORKER_HEARTBEAT_INTERVAL_MS = 25_000;
export const WORKER_LEASE_SECONDS = 1_800;
export const WORKER_OFFLINE_AFTER_SECONDS = 90;
