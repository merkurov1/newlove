import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RagEnvironment } from '@/lib/knowledge/rag/config';

export type WorkerScope = 'brain' | 'graph';
export type WorkerTrigger = 'cron' | 'admin' | 'scheduler';

export type WorkerRunRecord = {
  id: string;
  scope: WorkerScope;
  trigger: WorkerTrigger;
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'skipped';
  worker_id: string | null;
  processed: number;
  claimed: number;
  failed: number;
  runs_touched: number;
  error_code: string | null;
  error_detail: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};

export type WorkerQueueCounts = {
  queued: number;
  processing: number;
  completed: number;
  duplicate?: number;
  partial?: number;
  failed: number;
  skipped?: number;
  cancelled: number;
  oldestQueuedAt: string | null;
};

export type ActiveWorker = {
  workerId: string;
  scope: WorkerScope;
  processing: number;
  oldestLockedAt: string | null;
};

export type WorkerDashboard = {
  generatedAt: string;
  brain: WorkerQueueCounts;
  graph: WorkerQueueCounts;
  activeWorkers: ActiveWorker[];
  activeRuns: { brain: number; graph: number };
  lastSuccessful: WorkerRunRecord | null;
  lastError: {
    scope: WorkerScope;
    code: string | null;
    detail: string | null;
    at: string | null;
  } | null;
  recentRuns: WorkerRunRecord[];
};

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function createWorkerTelemetry(env: RagEnvironment = process.env) {
  const store = createServiceClient(env);

  if (!store) return null;

  return {
    client: store,

    async startWorkerRun(input: {
      scope: WorkerScope;
      trigger: WorkerTrigger;
      workerId: string;
      metadata?: Record<string, unknown>;
    }): Promise<string | null> {
      try {
        const { data, error } = await store
          .from('brain_worker_runs')
          .insert({
            scope: input.scope,
            trigger: input.trigger,
            worker_id: input.workerId,
            status: 'running',
            metadata: input.metadata || {},
          })
          .select('id')
          .single();

        if (error || !data) return null;
        return String((data as { id: string }).id);
      } catch {
        return null;
      }
    },

    async finishWorkerRun(
      id: string | null,
      patch: Partial<{
        status: WorkerRunRecord['status'];
        processed: number;
        claimed: number;
        failed: number;
        runs_touched: number;
        error_code: string | null;
        error_detail: string | null;
        metadata: Record<string, unknown>;
      }>
    ): Promise<void> {
      if (!id) return;

      try {
        await store
          .from('brain_worker_runs')
          .update({
            ...patch,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      } catch {
        // Worker telemetry must never fail the actual job.
      }
    },
  };
}

export type WorkerTelemetry = NonNullable<ReturnType<typeof createWorkerTelemetry>>;

async function settle<T>(value: PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await value;
  } catch {
    return fallback;
  }
}

async function countStatus(
  store: SupabaseClient,
  table: 'brain_ingestion_jobs' | 'brain_graph_jobs',
  status: string
): Promise<number> {
  const { count, error } = await store
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('status', status);

  if (error) return 0;
  return count || 0;
}

async function oldestQueued(
  store: SupabaseClient,
  table: 'brain_ingestion_jobs' | 'brain_graph_jobs'
): Promise<string | null> {
  const { data, error } = await store
    .from(table)
    .select('created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return String((data as { created_at: string }).created_at);
}

async function queueCounts(
  store: SupabaseClient,
  table: 'brain_ingestion_jobs' | 'brain_graph_jobs'
): Promise<WorkerQueueCounts> {
  const statuses =
    table === 'brain_ingestion_jobs'
      ? ['queued', 'processing', 'completed', 'duplicate', 'partial', 'failed', 'cancelled']
      : ['queued', 'processing', 'completed', 'skipped', 'failed', 'cancelled'];

  const entries = await Promise.all(
    statuses.map(async (status) => [status, await countStatus(store, table, status)] as const)
  );
  const counts = Object.fromEntries(entries) as Record<string, number>;

  return {
    queued: counts.queued || 0,
    processing: counts.processing || 0,
    completed: counts.completed || 0,
    ...(table === 'brain_ingestion_jobs'
      ? { duplicate: counts.duplicate || 0, partial: counts.partial || 0 }
      : { skipped: counts.skipped || 0 }),
    failed: counts.failed || 0,
    cancelled: counts.cancelled || 0,
    oldestQueuedAt: await oldestQueued(store, table),
  };
}

async function activeWorkersFor(
  store: SupabaseClient,
  table: 'brain_ingestion_jobs' | 'brain_graph_jobs',
  scope: WorkerScope
): Promise<ActiveWorker[]> {
  const { data, error } = await store
    .from(table)
    .select('worker_id,locked_at')
    .eq('status', 'processing')
    .not('worker_id', 'is', null)
    .limit(500);

  if (error) return [];

  const byWorker = new Map<string, { count: number; oldest: string | null }>();

  for (const row of data || []) {
    const value = row as { worker_id: string; locked_at: string | null };
    const current = byWorker.get(value.worker_id) || { count: 0, oldest: null };
    current.count += 1;

    if (!current.oldest || (value.locked_at && value.locked_at < current.oldest)) {
      current.oldest = value.locked_at;
    }

    byWorker.set(value.worker_id, current);
  }

  return Array.from(byWorker.entries()).map(([workerId, value]) => ({
    workerId,
    scope,
    processing: value.count,
    oldestLockedAt: value.oldest,
  }));
}

export async function loadWorkerDashboard(
  env: RagEnvironment = process.env
): Promise<WorkerDashboard> {
  const store = createServiceClient(env);

  if (!store) throw new Error('worker_dashboard_database_unavailable');

  const [
    brain,
    graph,
    brainWorkers,
    graphWorkers,
    brainRuns,
    graphRuns,
    lastSuccess,
    lastWorkerError,
    recent,
  ] = await Promise.all([
    queueCounts(store, 'brain_ingestion_jobs'),
    queueCounts(store, 'brain_graph_jobs'),
    activeWorkersFor(store, 'brain_ingestion_jobs', 'brain'),
    activeWorkersFor(store, 'brain_graph_jobs', 'graph'),
    store
      .from('brain_ingestion_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running'),
    store
      .from('brain_graph_runs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running'),
    settle(
      store
        .from('brain_worker_runs')
        .select('*')
        .eq('status', 'completed')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      { data: null } as never
    ),
    settle(
      store
        .from('brain_worker_runs')
        .select('*')
        .not('error_detail', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      { data: null } as never
    ),
    settle(
      store
        .from('brain_worker_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10),
      { data: [] as unknown[] } as never
    ),
  ]);

  const [lastBrainJobError, lastGraphJobError] = await Promise.all([
    settle(
      store
        .from('brain_ingestion_jobs')
        .select('error_code,error_detail,updated_at')
        .not('error_detail', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      { data: null } as never
    ),
    settle(
      store
        .from('brain_graph_jobs')
        .select('error_code,error_detail,updated_at')
        .not('error_detail', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      { data: null } as never
    ),
  ]);

  const workerError =
    lastWorkerError && 'data' in lastWorkerError && lastWorkerError.data
      ? {
          scope: String((lastWorkerError.data as Record<string, unknown>).scope) as WorkerScope,
          code:
            typeof (lastWorkerError.data as Record<string, unknown>).error_code === 'string'
              ? String((lastWorkerError.data as Record<string, unknown>).error_code)
              : null,
          detail:
            typeof (lastWorkerError.data as Record<string, unknown>).error_detail === 'string'
              ? String((lastWorkerError.data as Record<string, unknown>).error_detail)
              : null,
          at:
            typeof (lastWorkerError.data as Record<string, unknown>).finished_at === 'string'
              ? String((lastWorkerError.data as Record<string, unknown>).finished_at)
              : null,
        }
      : null;

  const jobErrors = [
    lastBrainJobError && 'data' in lastBrainJobError && lastBrainJobError.data
      ? {
          scope: 'brain' as WorkerScope,
          code:
            typeof (lastBrainJobError.data as Record<string, unknown>).error_code === 'string'
              ? String((lastBrainJobError.data as Record<string, unknown>).error_code)
              : null,
          detail:
            typeof (lastBrainJobError.data as Record<string, unknown>).error_detail === 'string'
              ? String((lastBrainJobError.data as Record<string, unknown>).error_detail)
              : null,
          at:
            typeof (lastBrainJobError.data as Record<string, unknown>).updated_at === 'string'
              ? String((lastBrainJobError.data as Record<string, unknown>).updated_at)
              : null,
        }
      : null,
    lastGraphJobError && 'data' in lastGraphJobError && lastGraphJobError.data
      ? {
          scope: 'graph' as WorkerScope,
          code:
            typeof (lastGraphJobError.data as Record<string, unknown>).error_code === 'string'
              ? String((lastGraphJobError.data as Record<string, unknown>).error_code)
              : null,
          detail:
            typeof (lastGraphJobError.data as Record<string, unknown>).error_detail === 'string'
              ? String((lastGraphJobError.data as Record<string, unknown>).error_detail)
              : null,
          at:
            typeof (lastGraphJobError.data as Record<string, unknown>).updated_at === 'string'
              ? String((lastGraphJobError.data as Record<string, unknown>).updated_at)
              : null,
        }
      : null,
  ]
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((left, right) => String(right.at || '').localeCompare(String(left.at || '')));

  const lastError =
    jobErrors[0] &&
    (!workerError || String(jobErrors[0].at || '') > String(workerError.at || ''))
      ? jobErrors[0]
      : workerError;

  return {
    generatedAt: new Date().toISOString(),
    brain,
    graph,
    activeWorkers: [...brainWorkers, ...graphWorkers],
    activeRuns: { brain: brainRuns.count || 0, graph: graphRuns.count || 0 },
    lastSuccessful:
      lastSuccess && 'data' in lastSuccess && lastSuccess.data
        ? (lastSuccess.data as WorkerRunRecord)
        : null,
    lastError,
    recentRuns:
      recent && 'data' in recent && Array.isArray(recent.data)
        ? (recent.data as WorkerRunRecord[])
        : [],
  };
}
