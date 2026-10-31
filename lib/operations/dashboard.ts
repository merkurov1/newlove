import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getBudgetSnapshot,
  getQueueSnapshot,
  type BudgetSnapshot,
  type QueueSnapshot,
} from './budgets';
import { loadWorkerControl, type WorkerControl } from './control';
import { globalLimits, workerLimits, WORKER_SCOPES, type WorkerScope } from './config';
import { createOpsClient } from './store';

export type OpsLockRow = {
  lock_key: string;
  owner_id: string;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
  stale: boolean;
};

export type OpsWorkerRun = {
  id: string;
  scope: string;
  trigger: string;
  status: string;
  processed: number;
  failed: number;
  error_code: string | null;
  started_at: string;
  finished_at: string | null;
};

export type OperationsSnapshot = {
  generatedAt: string;
  control: WorkerControl;
  queues: Record<WorkerScope, QueueSnapshot>;
  budgets: Record<WorkerScope, BudgetSnapshot>;
  locks: OpsLockRow[];
  circuits: Array<Record<string, unknown>>;
  recentRuns: OpsWorkerRun[];
  events: Array<Record<string, unknown>>;
  scheduler: Record<string, unknown> | null;
  calls: { embedding: number; llm: number; externalHttp: number };
  limits: {
    lockTtlSeconds: number;
    maxEnqueuePerRequest: number;
    circuitFailureThreshold: number;
    circuitCooldownSeconds: number;
  };
  alerts: Array<{ level: 'warning' | 'error'; code: string; message: string }>;
};

async function safeRows<T>(promise: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error) return [];
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

async function loadLocks(client: SupabaseClient | null): Promise<OpsLockRow[]> {
  if (!client) return [];

  const rows = await safeRows<Record<string, unknown>>(
    client
      .from('worker_locks')
      .select('lock_key,owner_id,acquired_at,heartbeat_at,expires_at')
      .order('expires_at', { ascending: true })
      .limit(100)
  );

  return rows.map((row) => ({
    lock_key: String(row.lock_key || ''),
    owner_id: String(row.owner_id || ''),
    acquired_at: String(row.acquired_at || ''),
    heartbeat_at: String(row.heartbeat_at || ''),
    expires_at: String(row.expires_at || ''),
    stale: Date.parse(String(row.expires_at || '')) < Date.now(),
  }));
}

async function loadRecentRuns(client: SupabaseClient | null): Promise<OpsWorkerRun[]> {
  if (!client) return [];

  const rows = await safeRows<Record<string, unknown>>(
    client
      .from('brain_worker_runs')
      .select('id,scope,trigger,status,processed,failed,error_code,started_at,finished_at,metadata')
      .order('started_at', { ascending: false })
      .limit(40)
  );

  return rows.map((row) => ({
    id: String(row.id || ''),
    scope: String(row.scope || ''),
    trigger: String(row.trigger || ''),
    status: String(row.status || ''),
    processed: Number(row.processed) || 0,
    failed: Number(row.failed) || 0,
    error_code: typeof row.error_code === 'string' ? row.error_code : null,
    started_at: String(row.started_at || ''),
    finished_at: typeof row.finished_at === 'string' ? row.finished_at : null,
  }));
}

async function loadEvents(client: SupabaseClient | null): Promise<Array<Record<string, unknown>>> {
  if (!client) return [];

  return safeRows<Record<string, unknown>>(
    client
      .from('ops_events')
      .select('event_name,scope,worker_id,severity,details,created_at')
      .order('created_at', { ascending: false })
      .limit(30)
  );
}

async function loadCircuits(
  client: SupabaseClient | null
): Promise<Array<Record<string, unknown>>> {
  if (!client) return [];

  return safeRows<Record<string, unknown>>(
    client
      .from('ops_circuit_breakers')
      .select('dependency,state,consecutive_failures,open_until,last_error_code,updated_at')
      .order('updated_at', { ascending: false })
      .limit(30)
  );
}

async function loadScheduler(
  client: SupabaseClient | null
): Promise<Record<string, unknown> | null> {
  if (!client) return null;

  try {
    const { data, error } = await client.rpc('ops_scheduler_status');
    if (error || !data || typeof data !== 'object') return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadCalls(client: SupabaseClient | null): Promise<OperationsSnapshot['calls']> {
  if (!client) return { embedding: 0, llm: 0, externalHttp: 0 };

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const rows = await safeRows<Record<string, unknown>>(
    client.from('brain_worker_runs').select('metadata').gte('started_at', since).limit(500)
  );

  return rows.reduce<OperationsSnapshot['calls']>(
    (total, row) => {
      const metadata =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : {};
      total.embedding += Number(metadata.embeddingCalls) || 0;
      total.llm += Number(metadata.llmCalls) || 0;
      total.externalHttp += Number(metadata.externalHttpCalls) || 0;
      return total;
    },
    { embedding: 0, llm: 0, externalHttp: 0 }
  );
}

function buildAlerts(input: {
  control: WorkerControl;
  queues: Record<WorkerScope, QueueSnapshot>;
  budgets: Record<WorkerScope, BudgetSnapshot>;
  locks: OpsLockRow[];
  circuits: Array<Record<string, unknown>>;
  recentRuns: OpsWorkerRun[];
}): OperationsSnapshot['alerts'] {
  const alerts: OperationsSnapshot['alerts'] = [];

  if (!input.control.workersEnabled) {
    alerts.push({
      level: 'warning',
      code: 'global_kill_switch_enabled',
      message: 'Global worker kill switch is enabled. New worker runs are blocked.',
    });
  }

  for (const scope of WORKER_SCOPES) {
    if (!input.control.scopes[scope]) {
      alerts.push({
        level: 'warning',
        code: 'worker_disabled',
        message: `${scope} worker is disabled.`,
      });
    }

    const queue = input.queues[scope];
    if (queue.overLimit) {
      alerts.push({
        level: 'error',
        code: 'queue_limit_reached',
        message: `${scope} queue has ${queue.queued} jobs (limit ${queue.maxQueue}).`,
      });
    }
    if (queue.stale) {
      alerts.push({
        level: 'error',
        code: 'queue_age_exceeded',
        message: `${scope} oldest queued job is ${Math.round(queue.oldestAgeHours || 0)}h old.`,
      });
    }

    const budget = input.budgets[scope];
    if (budget.exhausted) {
      alerts.push({
        level: 'error',
        code: 'budget_exhausted',
        message: `${scope} worker budget is exhausted for this hour/day.`,
      });
    }
  }

  for (const lock of input.locks) {
    if (lock.stale) {
      alerts.push({
        level: 'warning',
        code: 'stale_lock',
        message: `Stale lock ${lock.lock_key} from ${lock.owner_id}.`,
      });
    }
  }

  for (const circuit of input.circuits) {
    if (circuit.state === 'open') {
      alerts.push({
        level: 'error',
        code: 'circuit_open',
        message: `Circuit ${String(circuit.dependency)} is open until ${String(circuit.open_until || 'unknown')}.`,
      });
    }
  }

  const lastRuns = new Map<string, OpsWorkerRun>();
  for (const run of input.recentRuns) {
    if (!lastRuns.has(run.scope)) lastRuns.set(run.scope, run);
  }

  for (const [scope, run] of lastRuns) {
    if (run.status === 'failed') {
      alerts.push({
        level: 'error',
        code: 'worker_failed',
        message: `Last ${scope} run failed: ${run.error_code || 'unknown'}.`,
      });
    }
  }

  return alerts.slice(0, 40);
}

export async function loadOperationsSnapshot(
  client: SupabaseClient | null = createOpsClient()
): Promise<OperationsSnapshot> {
  const [control, ...snapshots] = await Promise.all([
    loadWorkerControl(client),
    ...WORKER_SCOPES.map((scope) => getQueueSnapshot(scope, client)),
    ...WORKER_SCOPES.map((scope) => getBudgetSnapshot(scope, client)),
  ]);

  const queues = Object.fromEntries(
    WORKER_SCOPES.map((scope, index) => [scope, snapshots[index]])
  ) as Record<WorkerScope, QueueSnapshot>;
  const budgets = Object.fromEntries(
    WORKER_SCOPES.map((scope, index) => [scope, snapshots[WORKER_SCOPES.length + index]])
  ) as Record<WorkerScope, BudgetSnapshot>;

  const [locks, circuits, recentRuns, events, scheduler, calls] = await Promise.all([
    loadLocks(client),
    loadCircuits(client),
    loadRecentRuns(client),
    loadEvents(client),
    loadScheduler(client),
    loadCalls(client),
  ]);

  const limits = globalLimits();

  return {
    generatedAt: new Date().toISOString(),
    control,
    queues,
    budgets,
    locks,
    circuits,
    recentRuns,
    events,
    scheduler,
    calls,
    limits: {
      lockTtlSeconds: limits.lockTtlSeconds,
      maxEnqueuePerRequest: limits.maxEnqueuePerRequest,
      circuitFailureThreshold: limits.circuitFailureThreshold,
      circuitCooldownSeconds: limits.circuitCooldownSeconds,
    },
    alerts: buildAlerts({ control, queues, budgets, locks, circuits, recentRuns }),
  };
}

export function workerEffectiveLimit(scope: WorkerScope) {
  return workerLimits(scope);
}
