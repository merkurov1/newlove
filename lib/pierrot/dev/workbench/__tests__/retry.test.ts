/** @jest-environment node */

import {
  EXECUTION_MAX_ATTEMPTS,
  EXECUTION_RETRY_BASE_MS,
  EXECUTION_RETRY_MAX_DELAY_MS,
  decideExecutionRetry,
  executionRetryDelayMs,
  isRetryableExecutionError,
} from '../retry';

describe('execution failure classification', () => {
  it('treats transient OpenCode failures as retryable', () => {
    for (const code of [
      'EXECUTION_TIMEOUT',
      'OPENCODE_FAILED',
      'OPENCODE_INTERRUPTED',
      'OPENCODE_REPORT_MISSING',
    ]) {
      expect(isRetryableExecutionError(code)).toBe(true);
    }
  });

  it('never retries permanent security, commit, push or cancellation failures', () => {
    for (const code of [
      'CANCELLED_BY_OWNER',
      'SECURITY_SENSITIVE_FILE',
      'TOO_MANY_FILES',
      'COMMIT_SIGNING_FAILED',
      'COMMIT_SIGNING_MISSING',
      'PUSH_FAILED',
      'BRANCH_CONFLICT',
      'WORKER_BRANCH_FORBIDDEN',
      'WORKER_STOPPED',
      'UNKNOWN_FUTURE_CODE',
    ]) {
      expect(isRetryableExecutionError(code)).toBe(false);
    }
  });
});

describe('bounded backoff', () => {
  it('doubles from the base delay and never exceeds the ceiling', () => {
    expect(executionRetryDelayMs(1)).toBe(EXECUTION_RETRY_BASE_MS);
    expect(executionRetryDelayMs(2)).toBe(EXECUTION_RETRY_BASE_MS * 2);
    expect(executionRetryDelayMs(3)).toBe(EXECUTION_RETRY_BASE_MS * 4);
    expect(executionRetryDelayMs(10_000)).toBe(EXECUTION_RETRY_MAX_DELAY_MS);
    expect(executionRetryDelayMs(Number.NaN)).toBe(EXECUTION_RETRY_BASE_MS);
  });

  it('produces a deterministic retry timestamp from the supplied clock', () => {
    const now = Date.parse('2026-12-16T12:00:00.000Z');
    const decision = decideExecutionRetry({
      errorCode: 'OPENCODE_FAILED',
      attemptNumber: 2,
      now,
    });

    expect(decision.action).toBe('retry');
    expect(decision.delayMs).toBe(120_000);
    expect(decision.retryAfter).toBe('2026-12-16T12:02:00.000Z');
  });
});

describe('automatic retry budget', () => {
  it('retries while the bounded budget remains', () => {
    const decision = decideExecutionRetry({
      errorCode: 'EXECUTION_TIMEOUT',
      attemptNumber: 1,
    });
    expect(decision).toMatchObject({
      retryable: true,
      action: 'retry',
      maxAttempts: EXECUTION_MAX_ATTEMPTS,
    });
  });

  it('hands the task to manual review once the budget is spent', () => {
    const decision = decideExecutionRetry({
      errorCode: 'OPENCODE_FAILED',
      attemptNumber: EXECUTION_MAX_ATTEMPTS,
    });
    expect(decision).toMatchObject({
      retryable: true,
      action: 'manual_review',
      reasonCode: 'RETRY_BUDGET_EXHAUSTED',
      retryAfter: null,
    });
  });

  it('never schedules a retry for a permanent failure even below the budget', () => {
    const decision = decideExecutionRetry({
      errorCode: 'PUSH_FAILED',
      attemptNumber: 1,
    });
    expect(decision).toMatchObject({
      retryable: false,
      action: 'fail',
      retryAfter: null,
      reasonCode: 'PERMANENT_FAILURE',
    });
  });

  it('treats a corrupted attempt number as the first attempt', () => {
    const decision = decideExecutionRetry({
      errorCode: 'OPENCODE_FAILED',
      attemptNumber: 'not-a-number',
    });
    expect(decision.attemptNumber).toBe(1);
    expect(decision.action).toBe('retry');
  });
});
