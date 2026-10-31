import type { SupabaseClient } from '@supabase/supabase-js';

import { globalLimits, type WorkerScope } from './config';
import { recordOpsEvent } from './events';
import { createOpsClient, isMissingOpsTable } from './store';

export type WorkerLock = {
  key: string;
  ownerId: string;
  expiresAt: string;
  recovered: boolean;
  heartbeat: () => Promise<boolean>;
  release: () => Promise<void>;
};

export type AcquireLockResult =
  | { ok: true; lock: WorkerLock }
  | { ok: false; reason: 'lock_conflict' | 'lock_unavailable' };

function lockKey(scope: WorkerScope): string {
  return `worker:${scope}`;
}

function isMissingRpc(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const value = error as { code?: unknown; message?: unknown };
  const message = typeof value.message === 'string' ? value.message : '';

  return (
    value.code === 'PGRST202' ||
    value.code === '42883' ||
    message.includes('Could not find the function') ||
    message.includes('does not exist')
  );
}

export async function acquireWorkerLock(input: {
  scope: WorkerScope;
  ownerId: string;
  ttlSeconds?: number;
  client?: SupabaseClient | null;
}): Promise<AcquireLockResult> {
  const client = input.client === undefined ? createOpsClient() : input.client;

  if (!client) return { ok: false, reason: 'lock_unavailable' };

  const ttlSeconds = input.ttlSeconds ?? globalLimits().lockTtlSeconds;
  const key = lockKey(input.scope);

  try {
    const { data, error } = await client.rpc('claim_worker_lock', {
      p_lock_key: key,
      p_owner: input.ownerId,
      p_ttl_seconds: ttlSeconds,
    });

    if (error) {
      if (isMissingRpc(error) || isMissingOpsTable(error)) {
        return { ok: false, reason: 'lock_unavailable' };
      }
      throw error;
    }

    const value =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : { status: data === true ? 'acquired' : 'conflict' };

    if (value.status !== 'acquired') {
      await recordOpsEvent({
        event: 'lock_conflict',
        scope: input.scope,
        workerId: input.ownerId,
        severity: 'warning',
        client,
      });
      return { ok: false, reason: 'lock_conflict' };
    }

    const recovered = value.recovered === true;

    if (recovered) {
      await recordOpsEvent({
        event: 'stale_lock_recovered',
        scope: input.scope,
        workerId: input.ownerId,
        severity: 'warning',
        client,
      });
    }

    await recordOpsEvent({
      event: 'lock_acquired',
      scope: input.scope,
      workerId: input.ownerId,
      client,
    });

    return {
      ok: true,
      lock: {
        key,
        ownerId: input.ownerId,
        expiresAt:
          typeof value.expires_at === 'string'
            ? value.expires_at
            : new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        recovered,
        heartbeat: async () => {
          try {
            const { data: heartbeatData, error: heartbeatError } = await client.rpc(
              'heartbeat_worker_lock',
              {
                p_lock_key: key,
                p_owner: input.ownerId,
                p_ttl_seconds: ttlSeconds,
              }
            );

            if (heartbeatError) return false;
            return heartbeatData === true;
          } catch {
            return false;
          }
        },
        release: async () => {
          try {
            await client.rpc('release_worker_lock', {
              p_lock_key: key,
              p_owner: input.ownerId,
            });
          } catch {
            // The TTL will release the lock if the explicit release fails.
          }
        },
      },
    };
  } catch {
    return { ok: false, reason: 'lock_unavailable' };
  }
}
