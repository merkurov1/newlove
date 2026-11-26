import { assertServerOnly } from '@/lib/serverOnly';
import { dispatchNextQueuedTask, type ActionsDispatchResult } from './actions';
import { reapExpiredAttempts } from './store';
import {
  WorkbenchStageTimer,
  type WorkbenchStageStatus,
  type WorkbenchTelemetrySummary,
} from './telemetry';
import type { DevFinalizationReport } from './types';

assertServerOnly('lib/pierrot/dev/workbench/recovery');

export const RECOVERY_DEFAULT_BUDGET_MS = 15_000;
export const RECOVERY_MIN_BUDGET_MS = 250;
export const RECOVERY_MAX_BUDGET_MS = 60_000;

export type WorkbenchRecoveryStep = 'reap' | 'dispatch' | 'finalization';

export type WorkbenchRecoveryStepResult = {
  step: WorkbenchRecoveryStep;
  status: WorkbenchStageStatus;
  durationMs: number;
  startedAt: string;
  code: string | null;
  detail: string | null;
};

export type WorkbenchRecoveryResult = {
  source: string;
  startedAt: string;
  durationMs: number;
  budgetMs: number;
  timedOut: boolean;
  status: 'ok' | 'partial' | 'failed' | 'timed_out';
  steps: WorkbenchRecoveryStepResult[];
  /** Expired attempts finalized by the single bounded reap call. */
  reaped: number;
  dispatch: ActionsDispatchResult | null;
  finalization: DevFinalizationReport | null;
  failures: Array<{ step: WorkbenchRecoveryStep; code: string; detail: string }>;
  telemetry: WorkbenchTelemetrySummary;
};

export type WorkbenchRecoveryInput = {
  source: string;
  /**
   * Ordered, bounded recovery steps. The default is the safe autonomous pair:
   * one reap pass and one dispatch pass. Finalization is opt-in because it is
   * the GitHub-heavy step; the worker idle lifecycle and the explicit Admin
   * action already own it.
   */
  steps?: WorkbenchRecoveryStep[];
  /** Overall wall-clock budget for this pass, clamped to a safe range. */
  budgetMs?: number;
};

const ALL_STEPS: WorkbenchRecoveryStep[] = ['reap', 'dispatch', 'finalization'];

function clampBudget(value: number | undefined): number {
  const raw = value ?? RECOVERY_DEFAULT_BUDGET_MS;
  if (!Number.isFinite(raw)) return RECOVERY_DEFAULT_BUDGET_MS;
  return Math.min(Math.max(Math.trunc(raw), RECOVERY_MIN_BUDGET_MS), RECOVERY_MAX_BUDGET_MS);
}

function normalizeSteps(steps: WorkbenchRecoveryStep[] | undefined): WorkbenchRecoveryStep[] {
  if (!steps || steps.length === 0) return ['reap', 'dispatch'];
  const requested = new Set(steps);
  // Keep the dependency order: a lease must be reaped before its task can be
  // dispatched, and finalization must observe the post-dispatch state.
  return ALL_STEPS.filter((step) => requested.has(step));
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code.slice(0, 80);
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name) return name.slice(0, 80);
  }
  return 'RECOVERY_STEP_FAILED';
}

function errorDetail(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 400);
  return 'The recovery step failed.';
}

type Settled<T> =
  | { kind: 'value'; value: T }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

/**
 * Race one bounded step against the remaining pass budget.
 *
 * The timeout only stops *waiting*. A step that is already mutating keeps its
 * existing idempotency guarantees (reservation RPC, finalization lock, bounded
 * reap). The next scheduled pass can safely retry, so work is never lost and a
 * duplicate side effect is prevented by the same primitives used today.
 */
async function runWithBudget<T>(
  operation: () => Promise<T>,
  budgetMs: number
): Promise<Settled<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settled: Promise<Settled<T>> = Promise.resolve()
    .then(operation)
    .then(
      (value) => ({ kind: 'value' as const, value }),
      (error) => ({ kind: 'error' as const, error })
    );
  const expired = new Promise<Settled<T>>((resolve) => {
    timeout = setTimeout(() => resolve({ kind: 'timeout' }), budgetMs);
  });
  try {
    return await Promise.race([settled, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Run the existing recovery primitives in bounded, observable order.
 *
 * This is the single recovery entry point shared by the protected cron tick and
 * the explicit Admin action. It does not create a parallel scheduler, does not
 * change worker concurrency and never loops: each enabled step runs at most
 * once per invocation. A failed step is recorded and the remaining steps still
 * run, so one unavailable dependency (for example the GitHub dispatch API)
 * cannot hide a recoverable lease or finalization pass.
 */
export async function runWorkbenchRecovery(
  input: WorkbenchRecoveryInput
): Promise<WorkbenchRecoveryResult> {
  const source = input.source;
  const steps = normalizeSteps(input.steps);
  const budgetMs = clampBudget(input.budgetMs);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const timer = new WorkbenchStageTimer({ label: 'workbench-recovery', source });

  const results: WorkbenchRecoveryStepResult[] = [];
  const failures: WorkbenchRecoveryResult['failures'] = [];
  let reaped = 0;
  let dispatch: ActionsDispatchResult | null = null;
  let finalization: DevFinalizationReport | null = null;
  let timedOut = false;
  let budgetExhausted = false;
  let executed = 0;
  let failed = 0;

  for (const step of steps) {
    const remaining = budgetMs - (Date.now() - started);
    if (budgetExhausted || remaining <= 0) {
      const code = 'RECOVERY_BUDGET_EXHAUSTED';
      const startedStepAt = new Date().toISOString();
      results.push({
        step,
        status: 'skipped',
        durationMs: 0,
        startedAt: startedStepAt,
        code,
        detail:
          'The previous step used the whole recovery budget; this step will retry on the next tick.',
      });
      timer.record(step, 0, 'skipped', { code, startedAt: startedStepAt });
      timedOut = true;
      continue;
    }

    const stepStartedAt = new Date().toISOString();
    const stepStarted = Date.now();
    let outcome: Settled<ActionsDispatchResult | number | DevFinalizationReport | null>;
    try {
      outcome = await runWithBudget(async () => {
        if (step === 'reap') {
          reaped = await reapExpiredAttempts();
          return reaped;
        }
        if (step === 'dispatch') {
          dispatch = await dispatchNextQueuedTask({ source });
          return dispatch;
        }
        // Loaded lazily: the dispatch cron tick does not need the GitHub-heavy
        // finalizer and should not pay its import cost on every cold start.
        const { advanceFinalization } = await import('./finalization');
        finalization = await advanceFinalization({ trigger: source });
        return finalization;
      }, remaining);
    } catch (error) {
      // runWithBudget already converts rejections; this is only a defensive
      // guard for a synchronous throw while scheduling the operation.
      outcome = { kind: 'error', error };
    }
    const durationMs = Date.now() - stepStarted;
    executed += 1;

    if (outcome.kind === 'value') {
      results.push({
        step,
        status: 'ok',
        durationMs,
        startedAt: stepStartedAt,
        code: null,
        detail: null,
      });
      timer.record(step, durationMs, 'ok', { startedAt: stepStartedAt });
      continue;
    }

    if (outcome.kind === 'timeout') {
      const code = 'RECOVERY_STEP_TIMEOUT';
      results.push({
        step,
        status: 'timed_out',
        durationMs,
        startedAt: stepStartedAt,
        code,
        detail: `The step exceeded the remaining recovery budget of ${Math.max(0, remaining)}ms.`,
      });
      timer.record(step, durationMs, 'timed_out', { code, startedAt: stepStartedAt });
      timedOut = true;
      budgetExhausted = true;
      continue;
    }

    const code = errorCode(outcome.error);
    const detail = errorDetail(outcome.error);
    failed += 1;
    failures.push({ step, code, detail });
    results.push({
      step,
      status: 'error',
      durationMs,
      startedAt: stepStartedAt,
      code,
      detail,
    });
    timer.record(step, durationMs, 'error', { code, startedAt: stepStartedAt });
  }

  const status: WorkbenchRecoveryResult['status'] = timedOut
    ? 'timed_out'
    : failed === 0
      ? 'ok'
      : executed > 0 && failed === executed
        ? 'failed'
        : 'partial';

  const result: WorkbenchRecoveryResult = {
    source,
    startedAt,
    durationMs: Date.now() - started,
    budgetMs,
    timedOut,
    status,
    steps: results,
    reaped,
    dispatch,
    finalization,
    failures,
    telemetry: timer.summary(),
  };
  timer.log();
  return result;
}
