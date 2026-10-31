import type { SupabaseClient } from '@supabase/supabase-js';

import {
  globalLimits,
  workerLimits,
  type WorkerScope,
} from './config';
import { recordOpsEvent } from './events';
import { createOpsClient, isMissingOpsTable } from './store';

type QueueTableConfig = {
  table: string;
  queued: string[];
  processing: string[];
  failed: string[];
  timestamp: string;
};

function queueConfig(scope: WorkerScope): QueueTableConfig | null {
  switch (scope) {
    case 'brain':
      return {
        table: 'brain_ingestion_jobs',
        queued: ['queued'],
        processing: ['processing'],
        failed: ['failed'],
        timestamp: 'created_at',
      };
    case 'graph':
      return {
        table: 'brain_graph_jobs',
        queued: ['queued'],
        processing: ['processing'],
        failed: ['failed'],
        timestamp: 'created_at',
      };
    case 'media':
      return {
        table: 'media_analysis_runs',
        queued: ['pending'],
        processing: ['processing'],
        failed: ['failed'],
        timestamp: 'created_at',
      };
    case 'newsletter':
      return {
        table: 'newsletter_jobs',
        queued: ['pending'],
        processing: ['processing'],
        failed: ['failed'],
        timestamp: 'created_at',
      };
    case 'retention':
      return null;
  }
}

async function countWhere(
  client: SupabaseClient,
  table: string,
  column: string,
  values: string[]
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in(column, values);

  if (error) throw new Error('ops_queue_count_failed');
  return count || 0;
}

export type QueueSnapshot = {
  scope: WorkerScope;
  queued: number;
  processing: number;
  failed: number;
  oldestQueuedAt: string | null;
  oldestAgeHours: number | null;
  maxQueue: number;
  maxQueueAgeHours: number;
  overLimit: boolean;
  stale: boolean;
};

export async function getQueueSnapshot(
  scope: WorkerScope,
  client: SupabaseClient | null = createOpsClient()
): Promise<QueueSnapshot> {
  const limits = workerLimits(scope);
  const config = queueConfig(scope);

  if (!client || !config) {
    return {
      scope,
      queued: 0,
      processing: 0,
      failed: 0,
      oldestQueuedAt: null,
      oldestAgeHours: null,
      maxQueue: limits.maxQueue,
      maxQueueAgeHours: limits.maxQueueAgeHours,
      overLimit: false,
      stale: false,
    };
  }

  const [queued, processing, failed] = await Promise.all([
    countWhere(client, config.table, 'status', config.queued),
    countWhere(client, config.table, 'status', config.processing),
    countWhere(client, config.table, 'status', config.failed),
  ]);

  const { data, error } = await client
    .from(config.table)
    .select(config.timestamp)
    .in('status', config.queued)
    .order(config.timestamp, { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error('ops_queue_oldest_failed');

  const oldestQueuedAt = data
    ? String((data as unknown as Record<string, unknown>)[config.timestamp])
    : null;
  const oldestAgeHours = oldestQueuedAt
    ? Math.max(0, (Date.now() - Date.parse(oldestQueuedAt)) / 3_600_000)
    : null;

  return {
    scope,
    queued,
    processing,
    failed,
    oldestQueuedAt,
    oldestAgeHours,
    maxQueue: limits.maxQueue,
    maxQueueAgeHours: limits.maxQueueAgeHours,
    overLimit: queued >= limits.maxQueue,
    stale: oldestAgeHours !== null && oldestAgeHours >= limits.maxQueueAgeHours,
  };
}

export async function assertQueueCapacity(
  scope: WorkerScope,
  client: SupabaseClient | null = createOpsClient()
): Promise<QueueSnapshot> {
  const snapshot = await getQueueSnapshot(scope, client);

  if (snapshot.overLimit || snapshot.stale) {
    await recordOpsEvent({
      event: 'queue_limit_reached',
      scope,
      severity: 'warning',
      details: {
        queued: snapshot.queued,
        max_queue: snapshot.maxQueue,
        oldest_age_hours: snapshot.oldestAgeHours,
        max_age_hours: snapshot.maxQueueAgeHours,
      },
      client,
    });
    throw new Error(`queue_limit_reached:${scope}`);
  }

  return snapshot;
}

export function assertEnqueueLimit(count: number): void {
  const max = globalLimits().maxEnqueuePerRequest;

  if (count > max) {
    throw new Error(`enqueue_limit_reached:${max}`);
  }
}

async function sumProcessedSince(
  client: SupabaseClient,
  scope: 'brain' | 'graph',
  since: string
): Promise<number> {
  const { data, error } = await client
    .from('brain_worker_runs')
    .select('processed')
    .eq('scope', scope)
    .gte('started_at', since)
    .limit(1000);

  if (error) throw new Error('ops_budget_query_failed');

  return (Array.isArray(data) ? data : []).reduce((total, row) => {
    const value = Number((row as { processed?: unknown }).processed);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

async function countSince(
  client: SupabaseClient,
  table: string,
  column: string,
  dateColumn: string,
  since: string,
  statusColumn?: string,
  statusValue?: string
): Promise<number> {
  let query = client
    .from(table)
    .select(column, { count: 'exact', head: true })
    .gte(dateColumn, since);

  if (statusColumn && statusValue) query = query.eq(statusColumn, statusValue);

  const { count, error } = await query;

  if (error) throw new Error('ops_budget_query_failed');

  return count || 0;
}

export type BudgetSnapshot = {
  scope: WorkerScope;
  usedHour: number;
  usedDay: number;
  maxHour: number;
  maxDay: number;
  exhausted: boolean;
};

export async function getBudgetSnapshot(
  scope: WorkerScope,
  client: SupabaseClient | null = createOpsClient()
): Promise<BudgetSnapshot> {
  const limits = workerLimits(scope);
  const base = {
    scope,
    maxHour: limits.maxJobsPerHour,
    maxDay: limits.maxJobsPerDay,
    usedHour: 0,
    usedDay: 0,
    exhausted: false,
  };

  if (!client || scope === 'retention') return base;

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  try {
    let usedHour = 0;
    let usedDay = 0;

    if (scope === 'brain' || scope === 'graph') {
      [usedHour, usedDay] = await Promise.all([
        sumProcessedSince(client, scope, hourAgo),
        sumProcessedSince(client, scope, dayAgo),
      ]);
    } else if (scope === 'media') {
      [usedHour, usedDay] = await Promise.all([
        countSince(client, 'media_analysis_runs', 'id', 'completed_at', hourAgo, 'status', 'completed'),
        countSince(client, 'media_analysis_runs', 'id', 'completed_at', dayAgo, 'status', 'completed'),
      ]);
    } else if (scope === 'newsletter') {
      [usedHour, usedDay] = await Promise.all([
        countSince(client, 'newsletter_logs', 'id', 'sent_at', hourAgo, 'status', 'sent'),
        countSince(client, 'newsletter_logs', 'id', 'sent_at', dayAgo, 'status', 'sent'),
      ]);
    }

    return {
      ...base,
      usedHour,
      usedDay,
      exhausted: usedHour >= limits.maxJobsPerHour || usedDay >= limits.maxJobsPerDay,
    };
  } catch (error) {
    if (isMissingOpsTable(error)) return base;
    return base;
  }
}

export async function assertWorkerBudget(
  scope: WorkerScope,
  client: SupabaseClient | null = createOpsClient()
): Promise<BudgetSnapshot> {
  const snapshot = await getBudgetSnapshot(scope, client);

  if (snapshot.exhausted) {
    await recordOpsEvent({
      event: 'worker_budget_exhausted',
      scope,
      severity: 'warning',
      details: {
        used_hour: snapshot.usedHour,
        max_hour: snapshot.maxHour,
        used_day: snapshot.usedDay,
        max_day: snapshot.maxDay,
      },
      client,
    });
    throw new Error(`worker_budget_exhausted:${scope}`);
  }

  return snapshot;
}
