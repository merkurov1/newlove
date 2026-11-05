import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  indexMemoryEmbedding,
  readMemoryEmbeddingCounts,
  resolveMemoryEmbeddingClient,
} from './embeddings';
import { invalidateBrainStatus } from './brainCache';
import { listMemoryIndexCandidates } from './store';

assertServerOnly('lib/pierrot/memory/indexing');

export type MemoryIndexBatchResult = {
  available: boolean;
  attempted: number;
  indexed: number;
  failed: number;
  pending: number;
  reason?: string;
};

/**
 * Bounded manual re-indexing. One call handles at most 20 records, stops after
 * three consecutive provider failures and never schedules itself again.
 */
export async function indexMemoryBatch(
  store: SupabaseClient,
  userId: string,
  options: { limit?: number; force?: boolean } = {}
): Promise<MemoryIndexBatchResult> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
  const candidates = await listMemoryIndexCandidates(store, userId, limit);

  if (candidates === null) {
    return {
      available: false,
      attempted: 0,
      indexed: 0,
      failed: 0,
      pending: 0,
      reason: 'index_table_unavailable',
    };
  }

  const client = resolveMemoryEmbeddingClient();

  if (!client) {
    return {
      available: false,
      attempted: 0,
      indexed: 0,
      failed: 0,
      pending: candidates.length,
      reason: 'embedding_provider_unavailable',
    };
  }

  let indexed = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (const candidate of candidates) {
    const status = await indexMemoryEmbedding(store, {
      decisionId: candidate.id,
      userId,
      text: `${candidate.title}\n${candidate.content}`,
      client,
      force: options.force === true,
    });

    if (status === 'ready') {
      indexed += 1;
      consecutiveFailures = 0;
    } else if (status === 'failed') {
      failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) break;
    } else if (status === 'unavailable') {
      return {
        available: false,
        attempted: indexed + failed,
        indexed,
        failed,
        pending: 0,
        reason: 'index_table_unavailable',
      };
    }
  }

  const counts = await readMemoryEmbeddingCounts(store, userId).catch(() => null);
  await invalidateBrainStatus(store, userId);

  return {
    available: true,
    attempted: indexed + failed,
    indexed,
    failed,
    pending: Math.max(0, (counts?.pending ?? 0) + candidates.length - indexed),
    ...(failed > 0 ? { reason: 'some_embeddings_failed' } : {}),
  };
}

export async function readMemoryIndexStatus(
  store: SupabaseClient,
  userId: string
): Promise<{ available: boolean; ready: number; pending: number; failed: number }> {
  return readMemoryEmbeddingCounts(store, userId);
}
