/**
 * Pure failure-disposition rules for a Dev execution attempt.
 *
 * A failed attempt is not automatically an owner decision:
 *   * a transient OpenCode/executor failure is retried a bounded number of
 *     times with exponential backoff;
 *   * once the bounded budget is spent the task stops looping and is handed
 *     to the owner as `manual_review`;
 *   * a permanent failure (cancelled, security, file limit, commit/push,
 *     branch ownership) is never retried automatically.
 *
 * This module has no runtime dependencies so the decision can be unit tested
 * without Supabase, git or OpenCode.
 */

/** Total automatic execution attempts per task (the first run counts). */
export const EXECUTION_MAX_ATTEMPTS = 3;

/** First retry delay. Each later retry doubles it, bounded by the max. */
export const EXECUTION_RETRY_BASE_MS = 60_000;

/** Hard ceiling for the bounded backoff (15 minutes). */
export const EXECUTION_RETRY_MAX_DELAY_MS = 15 * 60_000;

/**
 * Error codes the worker emits for a genuinely transient execution problem.
 * `EXECUTION_SETUP_FAILED` is deliberately absent: a workspace/config error is
 * not an OpenCode model failure and retrying it automatically could loop on a
 * broken checkout. The owner can still retry it explicitly.
 */
export const RETRYABLE_EXECUTION_ERROR_CODES: readonly string[] = Object.freeze([
  'EXECUTION_TIMEOUT',
  'OPENCODE_FAILED',
  'OPENCODE_INTERRUPTED',
  'OPENCODE_REPORT_MISSING',
]);

/**
 * Explicit permanent errors. Listing them documents the policy and keeps the
 * default (unknown code) fail-closed instead of accidentally retrying.
 */
export const PERMANENT_EXECUTION_ERROR_CODES: readonly string[] = Object.freeze([
  'CANCELLED_BY_OWNER',
  'SECURITY_SENSITIVE_FILE',
  'TOO_MANY_FILES',
  'COMMIT_SIGNING_UNAVAILABLE',
  'COMMIT_SIGNING_FAILED',
  'COMMIT_SIGNING_MISSING',
  'COMMIT_IDENTITY_MISMATCH',
  'COMMIT_COMMITTER_MISMATCH',
  'COMMIT_FAILED',
  'PUSH_FAILED',
  'BRANCH_CONFLICT',
  'WORKER_BRANCH_FORBIDDEN',
  'WORKER_STOPPED',
]);

export type ExecutionRetryAction = 'retry' | 'manual_review' | 'fail';

export type ExecutionRetryDecision = {
  /** True only for a transient failure that the policy allows retrying. */
  retryable: boolean;
  action: ExecutionRetryAction;
  /** Attempt number the failure belongs to (1-based, clamped). */
  attemptNumber: number;
  maxAttempts: number;
  /** Backoff before the next attempt, null when no retry is scheduled. */
  delayMs: number | null;
  /** Absolute ISO timestamp for the next eligible attempt. */
  retryAfter: string | null;
  /** Machine-readable reason for logs/events. */
  reasonCode: string;
  reason: string;
};

function normalizedAttemptNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

export function isRetryableExecutionError(code: unknown): boolean {
  const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!normalized) return false;
  if (PERMANENT_EXECUTION_ERROR_CODES.includes(normalized)) return false;
  return RETRYABLE_EXECUTION_ERROR_CODES.includes(normalized);
}

/**
 * Bounded exponential backoff. The exponent is capped so a corrupted attempt
 * number can never produce an unbounded timestamp or an invalid Date.
 */
export function executionRetryDelayMs(
  attemptNumber: unknown,
  baseMs = EXECUTION_RETRY_BASE_MS,
  maxMs = EXECUTION_RETRY_MAX_DELAY_MS
): number {
  const attempts = normalizedAttemptNumber(attemptNumber);
  const base = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : EXECUTION_RETRY_BASE_MS;
  const ceiling = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : EXECUTION_RETRY_MAX_DELAY_MS;
  const exponent = Math.min(attempts - 1, 6);
  return Math.min(base * 2 ** exponent, ceiling);
}

/**
 * Decide what to do with a failed attempt.
 *
 * `attemptNumber` is the immutable attempt sequence assigned by the claim RPC.
 * It is not a retry counter, so an owner requeue cannot silently exceed the
 * automatic budget in a way that creates an infinite loop.
 */
export function decideExecutionRetry(input: {
  errorCode: unknown;
  attemptNumber: unknown;
  maxAttempts?: number;
  now?: number;
  baseMs?: number;
  maxMs?: number;
}): ExecutionRetryDecision {
  const attemptNumber = normalizedAttemptNumber(input.attemptNumber);
  const maxAttempts =
    Number.isFinite(input.maxAttempts) && Number(input.maxAttempts) >= 1
      ? Math.trunc(Number(input.maxAttempts))
      : EXECUTION_MAX_ATTEMPTS;
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const code =
    typeof input.errorCode === 'string' && input.errorCode.trim()
      ? input.errorCode.trim().toUpperCase()
      : 'EXECUTION_FAILED';

  if (!isRetryableExecutionError(code)) {
    return {
      retryable: false,
      action: 'fail',
      attemptNumber,
      maxAttempts,
      delayMs: null,
      retryAfter: null,
      reasonCode: 'PERMANENT_FAILURE',
      reason: `${code} is a permanent failure and is never retried automatically.`,
    };
  }

  if (attemptNumber >= maxAttempts) {
    return {
      retryable: true,
      action: 'manual_review',
      attemptNumber,
      maxAttempts,
      delayMs: null,
      retryAfter: null,
      reasonCode: 'RETRY_BUDGET_EXHAUSTED',
      reason: `Automatic retry budget exhausted after ${attemptNumber} of ${maxAttempts} attempts; the task requires manual review.`,
    };
  }

  const delayMs = executionRetryDelayMs(attemptNumber, input.baseMs, input.maxMs);
  return {
    retryable: true,
    action: 'retry',
    attemptNumber,
    maxAttempts,
    delayMs,
    retryAfter: new Date(now + delayMs).toISOString(),
    reasonCode: 'RETRY_SCHEDULED',
    reason: `Transient failure on attempt ${attemptNumber}; retry ${Math.round(
      delayMs / 1000
    )}s later (attempt ${attemptNumber + 1} of ${maxAttempts}).`,
  };
}
