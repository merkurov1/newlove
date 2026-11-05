import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrainStatusSnapshot } from './brainStatusTypes';

assertServerOnly('lib/pierrot/memory/brainCache');

const SNAPSHOT_TABLE = 'pierrot_brain_status_snapshots';
const MEMORY_TTL_MS = 15 * 60 * 1000;

type CachedSnapshot = {
  snapshot: BrainStatusSnapshot;
  expiresAt: number;
};

/**
 * Process-local last-known snapshot. Serverless instances are short-lived, so
 * this is only a fallback; the durable copy lives in Supabase. It is useful
 * when the database is briefly unavailable and prevents a full recomputation
 * on every request within one instance.
 */
const localCache = new Map<string, CachedSnapshot>();

export function readLocalBrainSnapshot(userId: string): BrainStatusSnapshot | null {
  const entry = localCache.get(userId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    // Keep the snapshot as a stale fallback, but report that it is not fresh.
    return { ...entry.snapshot, stale: true };
  }

  return entry.snapshot;
}

export function writeLocalBrainSnapshot(userId: string, snapshot: BrainStatusSnapshot): void {
  localCache.set(userId, {
    snapshot,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
}

export function clearLocalBrainSnapshot(userId: string): void {
  localCache.delete(userId);
}

function isMissingRelation(error: { code?: unknown } | null | undefined): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code === '42P01' || code === 'PGRST205';
}

/**
 * Invalidate the durable snapshot after a meaningful memory/index change.
 * Failure is intentionally silent: the write that triggered it has already
 * succeeded and must not be reported as failed.
 */
export async function invalidateBrainStatus(
  store: SupabaseClient | null,
  userId: string
): Promise<void> {
  clearLocalBrainSnapshot(userId);
  if (!store) return;

  try {
    const { error } = await store.from(SNAPSHOT_TABLE).delete().eq('user_id', userId);
    if (error && !isMissingRelation(error)) {
      // No content is logged, only the operation name.
      console.warn('[Pierrot brain status] invalidate failed');
    }
  } catch {
    console.warn('[Pierrot brain status] invalidate failed');
  }
}
