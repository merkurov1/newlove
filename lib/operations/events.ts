import type { SupabaseClient } from '@supabase/supabase-js';

import { createOpsClient, isMissingOpsTable } from './store';

export type OpsEventName =
  | 'worker_started'
  | 'worker_completed'
  | 'worker_timeout'
  | 'worker_skipped'
  | 'worker_budget_exhausted'
  | 'lock_acquired'
  | 'lock_conflict'
  | 'stale_lock_recovered'
  | 'job_retry'
  | 'job_dead_lettered'
  | 'circuit_opened'
  | 'circuit_closed'
  | 'queue_limit_reached'
  | 'global_kill_switch_enabled';

export type OpsEventSeverity = 'info' | 'warning' | 'error';

export type OpsEventInput = {
  event: OpsEventName;
  scope?: string | null;
  workerId?: string | null;
  severity?: OpsEventSeverity;
  details?: Record<string, unknown>;
  client?: SupabaseClient | null;
};

function compactDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!details) return {};

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      result[key] = value;
    } else if (typeof value === 'string') {
      result[key] = value.slice(0, 200);
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 20).map((item) =>
        typeof item === 'string' ? item.slice(0, 120) : typeof item === 'number' ? item : null
      );
    }
  }

  return result;
}

export async function recordOpsEvent(input: OpsEventInput): Promise<void> {
  const client = input.client === undefined ? createOpsClient() : input.client;

  if (!client) return;

  try {
    const { error } = await client.from('ops_events').insert({
      event_name: input.event,
      scope: input.scope || null,
      worker_id: input.workerId || null,
      severity: input.severity || 'info',
      details: compactDetails(input.details),
    });

    if (error && !isMissingOpsTable(error)) {
      console.warn('[ops] event insert failed', { event: input.event });
    }
  } catch {
    // Observability must never break the worker path.
  }
}
