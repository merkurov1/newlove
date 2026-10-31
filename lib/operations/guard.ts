import type { SupabaseClient } from '@supabase/supabase-js';

import {
  globalLimits,
  workerLimits,
  type WorkerScope,
} from './config';
import { assertWorkerBudget, type BudgetSnapshot } from './budgets';
import { assertWorkerEnabled, type WorkerControl } from './control';
import { recordOpsEvent } from './events';
import { acquireWorkerLock, type WorkerLock } from './locks';
import { createOpsClient } from './store';

export type WorkerSkipReason =
  | 'worker_disabled'
  | 'kill_switch'
  | 'lock_conflict'
  | 'lock_unavailable'
  | 'budget_exhausted';

export type WorkerGuard =
  | {
      ok: true;
      lock: WorkerLock | null;
      control: WorkerControl | null;
      budget: BudgetSnapshot | null;
      startedAt: number;
      deadline: number;
      remainingMs: () => number;
      finish: (input: {
        status: 'completed' | 'completed_with_errors' | 'failed' | 'skipped';
        processed?: number;
        failed?: number;
        stoppedBy?: string;
        errorCode?: string | null;
      }) => Promise<void>;
    }
  | { ok: false; reason: WorkerSkipReason; message: string };

export async function beginWorkerInvocation(input: {
  scope: WorkerScope;
  trigger: string;
  workerId: string;
  maxDurationMs?: number;
  skipGuard?: boolean;
  skipLock?: boolean;
  client?: SupabaseClient | null;
}): Promise<WorkerGuard> {
  const startedAt = Date.now();
  const limits = workerLimits(input.scope);
  const deadline = startedAt + (input.maxDurationMs ?? limits.maxDurationMs);
  const client = input.client === undefined ? createOpsClient() : input.client;

  if (input.skipGuard || (process.env.NODE_ENV || '').toLowerCase() === 'test') {
    return {
      ok: true,
      lock: null,
      control: null,
      budget: null,
      startedAt,
      deadline,
      remainingMs: () => deadline - Date.now(),
      finish: async () => undefined,
    };
  }

  try {
    await assertWorkerEnabled(input.scope, { client });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker_disabled';
    await recordOpsEvent({
      event: 'worker_skipped',
      scope: input.scope,
      workerId: input.workerId,
      severity: 'warning',
      details: { reason: message },
      client,
    });

    return {
      ok: false,
      reason: message === 'worker_kill_switch_enabled' ? 'kill_switch' : 'worker_disabled',
      message,
    };
  }

  if (!input.skipLock) {
    const acquired = await acquireWorkerLock({
      scope: input.scope,
      ownerId: input.workerId,
      ttlSeconds: globalLimits().lockTtlSeconds,
      client,
    });

    if (!acquired.ok) {
      await recordOpsEvent({
        event: 'worker_skipped',
        scope: input.scope,
        workerId: input.workerId,
        severity: 'warning',
        details: { reason: acquired.reason },
        client,
      });
      return { ok: false, reason: acquired.reason, message: acquired.reason };
    }

    let budget: BudgetSnapshot | null = null;

    try {
      budget = await assertWorkerBudget(input.scope, client);
    } catch (error) {
      await acquired.lock.release();
      const message = error instanceof Error ? error.message : 'worker_budget_exhausted';
      return {
        ok: false,
        reason: 'budget_exhausted',
        message,
      };
    }

    const heartbeat = setInterval(() => {
      void acquired.lock.heartbeat().catch(() => undefined);
    }, globalLimits().lockHeartbeatMs);

    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    await recordOpsEvent({
      event: 'worker_started',
      scope: input.scope,
      workerId: input.workerId,
      details: { trigger: input.trigger, budget },
      client,
    });

    return {
      ok: true,
      lock: acquired.lock,
      control: null,
      budget,
      startedAt,
      deadline,
      remainingMs: () => deadline - Date.now(),
      finish: async (result) => {
        clearInterval(heartbeat);
        await acquired.lock.release();
        await recordOpsEvent({
          event:
            result.stoppedBy === 'time_budget'
              ? 'worker_timeout'
              : result.status === 'skipped'
                ? 'worker_skipped'
                : 'worker_completed',
          scope: input.scope,
          workerId: input.workerId,
          severity: result.status === 'completed' ? 'info' : 'warning',
          details: {
            trigger: input.trigger,
            status: result.status,
            processed: result.processed || 0,
            failed: result.failed || 0,
            stopped_by: result.stoppedBy || null,
            error_code: result.errorCode || null,
          },
          client,
        });
      },
    };
  }

  let budget: BudgetSnapshot | null = null;

  try {
    budget = await assertWorkerBudget(input.scope, client);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker_budget_exhausted';
    return { ok: false, reason: 'budget_exhausted', message };
  }

  await recordOpsEvent({
    event: 'worker_started',
    scope: input.scope,
    workerId: input.workerId,
    details: { trigger: input.trigger, budget },
    client,
  });

  return {
    ok: true,
    lock: null,
    control: null,
    budget,
    startedAt,
    deadline,
    remainingMs: () => deadline - Date.now(),
    finish: async (result) => {
      await recordOpsEvent({
        event:
          result.stoppedBy === 'time_budget'
            ? 'worker_timeout'
            : result.status === 'skipped'
              ? 'worker_skipped'
              : 'worker_completed',
        scope: input.scope,
        workerId: input.workerId,
        severity: result.status === 'completed' ? 'info' : 'warning',
        details: {
          trigger: input.trigger,
          status: result.status,
          processed: result.processed || 0,
          failed: result.failed || 0,
          stopped_by: result.stoppedBy || null,
          error_code: result.errorCode || null,
        },
        client,
      });
    },
  };
}
