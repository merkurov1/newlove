import type { SupabaseClient } from '@supabase/supabase-js';

import {
  WORKER_SCOPES,
  workerEnabledByEnv,
  workersEnabledByEnv,
  type WorkerScope,
} from './config';
import { createOpsClient, isMissingOpsTable } from './store';

export type WorkerControl = {
  workersEnabled: boolean;
  scopes: Record<WorkerScope, boolean>;
  source: 'database' | 'environment';
};

function defaultScopes(enabled: boolean): Record<WorkerScope, boolean> {
  return Object.fromEntries(WORKER_SCOPES.map((scope) => [scope, enabled])) as Record<
    WorkerScope,
    boolean
  >;
}

function normalizeScopes(value: unknown, fallback: boolean): Record<WorkerScope, boolean> {
  const result = defaultScopes(fallback);

  if (!value || typeof value !== 'object') return result;

  for (const scope of WORKER_SCOPES) {
    const entry = (value as Record<string, unknown>)[scope];
    if (typeof entry === 'boolean') result[scope] = entry;
  }

  return result;
}

export async function loadWorkerControl(
  client: SupabaseClient | null = createOpsClient()
): Promise<WorkerControl> {
  const envEnabled = workersEnabledByEnv();
  const envScopes = Object.fromEntries(
    WORKER_SCOPES.map((scope) => [scope, workerEnabledByEnv(scope)])
  ) as Record<WorkerScope, boolean>;

  if (!client) {
    return { workersEnabled: envEnabled, scopes: envScopes, source: 'environment' };
  }

  try {
    const { data, error } = await client
      .from('ops_runtime_settings')
      .select('key,value')
      .in('key', ['workers_enabled', 'worker_scopes']);

    if (error) {
      if (isMissingOpsTable(error)) {
        return { workersEnabled: envEnabled, scopes: envScopes, source: 'environment' };
      }
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const byKey = new Map(
      rows.map((row) => [String((row as { key: unknown }).key), (row as { value: unknown }).value])
    );

    const storedEnabled = byKey.get('workers_enabled');
    const workersEnabled =
      typeof storedEnabled === 'boolean' ? storedEnabled : envEnabled;

    return {
      workersEnabled,
      scopes: normalizeScopes(byKey.get('worker_scopes'), workersEnabled),
      source: 'database',
    };
  } catch (error) {
    if (isMissingOpsTable(error)) {
      return { workersEnabled: envEnabled, scopes: envScopes, source: 'environment' };
    }

    console.warn('[ops] worker control unavailable; using environment defaults');
    return { workersEnabled: envEnabled, scopes: envScopes, source: 'environment' };
  }
}

export async function assertWorkerEnabled(
  scope: WorkerScope,
  options: { client?: SupabaseClient | null; control?: WorkerControl } = {}
): Promise<WorkerControl> {
  const control = options.control || (await loadWorkerControl(options.client));

  if (!control.workersEnabled) {
    throw new Error('worker_kill_switch_enabled');
  }

  if (!control.scopes[scope]) {
    throw new Error(`worker_disabled:${scope}`);
  }

  return control;
}

export async function setWorkersEnabled(
  enabled: boolean,
  actor: string | null,
  client: SupabaseClient | null = createOpsClient()
): Promise<void> {
  if (!client) throw new Error('ops_database_unavailable');

  const { error } = await client.from('ops_runtime_settings').upsert(
    {
      key: 'workers_enabled',
      value: enabled,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) throw new Error('ops_setting_update_failed');
}

export async function setWorkerScopeEnabled(
  scope: WorkerScope,
  enabled: boolean,
  actor: string | null,
  client: SupabaseClient | null = createOpsClient()
): Promise<void> {
  if (!client) throw new Error('ops_database_unavailable');

  const current = await loadWorkerControl(client);
  const scopes = { ...current.scopes, [scope]: enabled };

  const { error } = await client.from('ops_runtime_settings').upsert(
    {
      key: 'worker_scopes',
      value: scopes,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) throw new Error('ops_setting_update_failed');
}
