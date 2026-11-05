import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryEmbeddingClient } from './embeddingTypes';
import {
  UNFRAMED_EMBEDDING_DIMENSIONS,
  UNFRAMED_EMBEDDING_MODEL,
  resolveUnframedEmbeddingConfig,
} from '@/lib/knowledge/rag/config';
import { createOpenRouterEmbeddingClient } from '@/lib/knowledge/rag/embeddings';

const EMBEDDINGS_TABLE = 'pierrot_memory_embeddings';
const SEARCH_RPC = 'pierrot_memory_search';

export type MemoryEmbeddingRow = {
  decision_id: string;
  similarity: number;
  lexical_score: number;
};

export type MemoryEmbeddingCounts = {
  available: boolean;
  ready: number;
  pending: number;
  failed: number;
};

const rpcAvailability = new Map<string, { available: boolean; checkedAt: number }>();

export function memoryContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function toPgVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/** Returns null when the environment cannot provide a real embedding call. */
export function resolveMemoryEmbeddingClient(
  env: NodeJS.ProcessEnv = process.env
): MemoryEmbeddingClient | null {
  const apiKey = (env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) return null;

  try {
    const config = resolveUnframedEmbeddingConfig({
      ...env,
      UNFRAMED_EMBEDDING_MODEL:
        (env.UNFRAMED_EMBEDDING_MODEL || '').trim() || UNFRAMED_EMBEDDING_MODEL,
    } as typeof process.env);

    return createOpenRouterEmbeddingClient({
      apiKey,
      modelId: config.modelId,
      dimensions: config.dimensions,
      provider: env.UNFRAMED_EMBEDDING_PROVIDER || null,
      timeoutMs: 8_000,
    });
  } catch {
    return null;
  }
}

export function isMissingMemoryRelation(
  error: { code?: unknown; message?: unknown } | null
): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (code === 'PGRST204' && message.includes('pierrot_memory_embeddings'))
  );
}

function isMissingRpc(error: { code?: unknown; message?: unknown } | null): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    message.includes('pierrot_memory_search') ||
    message.includes('could not find the function')
  );
}

function rpcKey(store: SupabaseClient): string {
  // Supabase clients are per request; a stable identity is enough for a short
  // negative cache. The URL is not secret.
  const candidate = store as unknown as { supabaseUrl?: string };
  return candidate.supabaseUrl || 'default';
}

function rpcKnownMissing(store: SupabaseClient): boolean {
  const entry = rpcAvailability.get(rpcKey(store));
  if (!entry) return false;
  if (Date.now() - entry.checkedAt > 5 * 60 * 1000) {
    rpcAvailability.delete(rpcKey(store));
    return false;
  }
  return !entry.available;
}

function markRpc(store: SupabaseClient, available: boolean): void {
  rpcAvailability.set(rpcKey(store), { available, checkedAt: Date.now() });
}

/** Avoid paying for a query embedding once the RPC is known to be absent. */
export function isMemorySearchRpcKnownMissing(store: SupabaseClient): boolean {
  return rpcKnownMissing(store);
}

/**
 * Persist or refresh one record embedding. The caller has already saved the
 * record. A provider failure is stored as `failed` so the record stays
 * searchable through the lexical path and can be retried later.
 */
export async function indexMemoryEmbedding(
  store: SupabaseClient,
  input: {
    decisionId: string;
    userId: string;
    text: string;
    client: MemoryEmbeddingClient;
    force?: boolean;
  }
): Promise<'ready' | 'pending' | 'failed' | 'unavailable'> {
  const hash = memoryContentHash(input.text);

  if (!input.force) {
    const { data, error } = await store
      .from(EMBEDDINGS_TABLE)
      .select('content_hash,model_id,status')
      .eq('decision_id', input.decisionId)
      .maybeSingle();

    if (isMissingMemoryRelation(error)) return 'unavailable';
    if (!error && data) {
      const row = data as { content_hash?: string; model_id?: string; status?: string };
      if (
        row.status === 'ready' &&
        row.content_hash === hash &&
        row.model_id === input.client.modelId
      ) {
        return 'ready';
      }
    }
  }

  try {
    const [vector] = await input.client.embed([input.text.slice(0, 8_000)]);

    if (!Array.isArray(vector) || vector.length !== input.client.dimensions) {
      throw new Error('embedding_dimension_mismatch');
    }

    const { error } = await store.from(EMBEDDINGS_TABLE).upsert(
      {
        decision_id: input.decisionId,
        user_id: input.userId,
        model_id: input.client.modelId,
        dimensions: input.client.dimensions,
        content_hash: hash,
        embedding: toPgVector(vector),
        status: 'ready',
        error_code: null,
        indexed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'decision_id' }
    );

    if (error) return isMissingMemoryRelation(error) ? 'unavailable' : 'failed';

    return 'ready';
  } catch {
    // Never log record text. Only the failure state is persisted.
    await store
      .from(EMBEDDINGS_TABLE)
      .upsert(
        {
          decision_id: input.decisionId,
          user_id: input.userId,
          model_id: input.client.modelId,
          dimensions: input.client.dimensions,
          content_hash: hash,
          embedding: null,
          status: 'failed',
          error_code: 'embedding_failed',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'decision_id' }
      )
      .then(
        () => undefined,
        () => undefined
      );

    return 'failed';
  }
}

/**
 * Record that an embedding is waiting to be produced. This is used when the
 * provider is not configured or temporarily unavailable: the memory itself is
 * already saved and remains reachable through lexical search.
 */
export async function markMemoryEmbeddingPending(
  store: SupabaseClient,
  input: {
    decisionId: string;
    userId: string;
    text: string;
    modelId?: string;
    dimensions?: number;
    errorCode?: string | null;
  }
): Promise<'pending' | 'unavailable'> {
  const { error } = await store.from(EMBEDDINGS_TABLE).upsert(
    {
      decision_id: input.decisionId,
      user_id: input.userId,
      model_id: input.modelId || UNFRAMED_EMBEDDING_MODEL,
      dimensions: input.dimensions || UNFRAMED_EMBEDDING_DIMENSIONS,
      content_hash: memoryContentHash(input.text),
      embedding: null,
      status: 'pending',
      error_code: input.errorCode ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'decision_id' }
  );

  if (error) return isMissingMemoryRelation(error) ? 'unavailable' : 'pending';
  return 'pending';
}

export async function deleteMemoryEmbedding(
  store: SupabaseClient,
  decisionId: string
): Promise<void> {
  try {
    const { error } = await store.from(EMBEDDINGS_TABLE).delete().eq('decision_id', decisionId);
    if (error && !isMissingMemoryRelation(error)) {
      console.warn('[Pierrot memory] embedding delete failed');
    }
  } catch {
    console.warn('[Pierrot memory] embedding delete failed');
  }
}

export async function readMemoryEmbeddingCounts(
  store: SupabaseClient,
  userId: string
): Promise<MemoryEmbeddingCounts> {
  const count = async (status: string) => {
    const { count, error } = await store
      .from(EMBEDDINGS_TABLE)
      .select('decision_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', status);

    if (isMissingMemoryRelation(error)) return null;
    if (error) throw error;
    return count ?? 0;
  };

  const [ready, pending, failed] = await Promise.all([
    count('ready'),
    count('pending'),
    count('failed'),
  ]);

  if (ready === null || pending === null || failed === null) {
    return { available: false, ready: 0, pending: 0, failed: 0 };
  }

  return { available: true, ready, pending, failed };
}

export async function loadEmbeddingStates(
  store: SupabaseClient,
  decisionIds: string[]
): Promise<Map<string, { status: string; contentHash: string; modelId: string }> | null> {
  if (decisionIds.length === 0) return new Map();

  const { data, error } = await store
    .from(EMBEDDINGS_TABLE)
    .select('decision_id,content_hash,model_id,status')
    .in('decision_id', decisionIds);

  if (isMissingMemoryRelation(error)) return null;
  if (error) throw error;

  const result = new Map<string, { status: string; contentHash: string; modelId: string }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    if (typeof row.decision_id === 'string') {
      result.set(row.decision_id, {
        status: typeof row.status === 'string' ? row.status : 'pending',
        contentHash: typeof row.content_hash === 'string' ? row.content_hash : '',
        modelId: typeof row.model_id === 'string' ? row.model_id : '',
      });
    }
  }

  return result;
}

/**
 * pgvector hybrid search. Returns null when the additive migration has not
 * been applied, so callers can fall back to lexical retrieval honestly.
 */
export async function searchMemoryEmbeddings(
  store: SupabaseClient,
  input: {
    userId: string;
    queryEmbedding: number[] | null;
    queryText: string;
    includeArchive: boolean;
    kinds?: string[];
    statuses?: string[];
    project?: string | null;
    tags?: string[];
    matchCount?: number;
    minSimilarity?: number;
  }
): Promise<MemoryEmbeddingRow[] | null> {
  if (rpcKnownMissing(store)) return null;

  const { data, error } = await store.rpc(SEARCH_RPC, {
    p_user_id: input.userId,
    p_query_embedding: input.queryEmbedding ? toPgVector(input.queryEmbedding) : null,
    p_query_text: input.queryText || null,
    p_include_archive: input.includeArchive,
    p_kinds: input.kinds && input.kinds.length > 0 ? input.kinds : null,
    p_statuses: input.statuses && input.statuses.length > 0 ? input.statuses : null,
    p_project: input.project || null,
    p_tags: input.tags && input.tags.length > 0 ? input.tags : null,
    p_match_count: Math.min(Math.max(input.matchCount ?? 24, 1), 60),
    p_min_similarity: Math.min(Math.max(input.minSimilarity ?? -1, -1), 1),
  });

  if (error) {
    if (isMissingRpc(error)) {
      markRpc(store, false);
      return null;
    }
    throw error;
  }

  markRpc(store, true);

  return (Array.isArray(data) ? data : []).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Record<string, unknown>;
    if (typeof value.decision_id !== 'string') return [];

    return [
      {
        decision_id: value.decision_id,
        similarity:
          typeof value.similarity === 'number' && Number.isFinite(value.similarity)
            ? value.similarity
            : 0,
        lexical_score:
          typeof value.lexical_score === 'number' && Number.isFinite(value.lexical_score)
            ? value.lexical_score
            : 0,
      },
    ];
  });
}
