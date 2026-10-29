import {
  UNFRAMED_RAG_DOCUMENT,
  UNFRAMED_RAG_MAX_QUERY_CHARS,
  UNFRAMED_RAG_TIMEOUT_MS,
  UNFRAMED_RAG_TOP_K,
  isPierrotRagEnabled,
  resolveUnframedEmbeddingConfig,
  resolveUnframedRagThreshold,
  type RagEnvironment,
} from './config';
import {
  EmbeddingDimensionMismatchError,
  EmbeddingModelMismatchError,
  EmbeddingProviderError,
  EmbeddingTimeoutError,
  KnowledgeDatabaseError,
  RagConfigurationError,
} from './errors';
import { createOpenRouterEmbeddingClientFromEnv, type EmbeddingClient } from './embeddings';
import { createSupabaseKnowledgeSearch } from './supabaseStore';
import type {
  KnowledgeAccessClass,
  KnowledgeSearch,
  RetrievedChunk,
  RagRetrievalResult,
  RagUnavailableCode,
} from './types';

export type RetrieveUnframedEvidenceInput = {
  query: string;
  scope: KnowledgeAccessClass;
  /** True only when the request carried a verified server-side owner identity. */
  ownerAuthorized: boolean;
  enabled?: boolean;
  env?: RagEnvironment;
  embeddingClient?: EmbeddingClient;
  search?: KnowledgeSearch;
  topK?: number;
  minSimilarity?: number;
  timeoutMs?: number;
};

function unavailable(
  code: RagUnavailableCode,
  startedAt: number,
  topSimilarity: number | null = null
): RagRetrievalResult {
  return {
    outcome: 'unavailable',
    hits: [],
    latencyMs: Math.max(0, Date.now() - startedAt),
    topSimilarity,
    code,
  };
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new EmbeddingTimeoutError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new EmbeddingTimeoutError());

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function errorCode(error: unknown): RagUnavailableCode {
  if (error instanceof EmbeddingTimeoutError) return 'timeout';
  if (error instanceof EmbeddingDimensionMismatchError) return 'embedding_dimension_mismatch';
  if (error instanceof EmbeddingModelMismatchError) return 'embedding_model_mismatch';
  if (error instanceof EmbeddingProviderError) return 'embedding_failed';
  if (error instanceof KnowledgeDatabaseError) {
    return error.code === 'database_unavailable' ? 'database_unavailable' : 'database_failed';
  }
  if (error instanceof RagConfigurationError) return 'missing_configuration';

  return 'unexpected';
}

function toHit(row: {
  chunk_id: string;
  document_id: string;
  content: string;
  heading: string;
  section_path: string[];
  section_index: number;
  line_start: number;
  line_end: number;
  similarity: number;
}): RetrievedChunk {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    content: row.content,
    heading: row.heading,
    sectionPath: [...row.section_path],
    sectionIndex: row.section_index,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    similarity: row.similarity,
  };
}

/**
 * Owner-scoped retrieval. The scope is never read from the request body: the
 * caller must pass a server-derived access class and a verified-owner flag.
 *
 * The function deliberately never throws. All failures become `unavailable`
 * so Pierrot can fall back to its existing generation path.
 */
export async function retrieveUnframedEvidence(
  input: RetrieveUnframedEvidenceInput
): Promise<RagRetrievalResult> {
  const startedAt = Date.now();
  const env = input.env ?? process.env;
  const enabled = input.enabled ?? isPierrotRagEnabled(env);

  if (!enabled) return unavailable('disabled', startedAt);

  if (input.scope !== 'owner' && input.scope !== 'public') {
    return unavailable('unauthorized_scope', startedAt);
  }

  if (input.scope === 'owner' && !input.ownerAuthorized) {
    return unavailable('unauthorized_scope', startedAt);
  }

  const query = typeof input.query === 'string' ? input.query.trim() : '';

  if (!query || query.length > UNFRAMED_RAG_MAX_QUERY_CHARS) {
    return unavailable('invalid_query', startedAt);
  }

  let modelId: string;
  let dimensions: number;
  let threshold: number;

  try {
    const config = resolveUnframedEmbeddingConfig(env);
    modelId = config.modelId;
    dimensions = config.dimensions;
    threshold = input.minSimilarity ?? resolveUnframedRagThreshold(env);
  } catch {
    return unavailable('missing_configuration', startedAt);
  }

  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    return unavailable('missing_configuration', startedAt);
  }

  const topK = Math.min(
    Math.max(Math.trunc(input.topK ?? UNFRAMED_RAG_TOP_K), 1),
    UNFRAMED_RAG_TOP_K
  );
  const timeoutMs = Math.max(1, Math.trunc(input.timeoutMs ?? UNFRAMED_RAG_TIMEOUT_MS));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const embeddingClient = input.embeddingClient ?? createOpenRouterEmbeddingClientFromEnv(env);
    const search = input.search ?? createSupabaseKnowledgeSearch(env);

    if (!search) return unavailable('database_unavailable', startedAt);

    if (embeddingClient.modelId !== modelId) {
      return unavailable('embedding_model_mismatch', startedAt);
    }

    if (embeddingClient.dimensions !== dimensions) {
      return unavailable('embedding_dimension_mismatch', startedAt);
    }

    const vectors = await withAbort(
      embeddingClient.embed([query], controller.signal),
      controller.signal
    );

    if (!Array.isArray(vectors) || vectors.length !== 1) {
      return unavailable('embedding_failed', startedAt);
    }

    const queryVector = vectors[0];

    if (!Array.isArray(queryVector) || queryVector.length !== dimensions) {
      return unavailable('embedding_dimension_mismatch', startedAt);
    }

    if (!queryVector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return unavailable('embedding_failed', startedAt);
    }

    const rows = await withAbort(
      search({
        queryEmbedding: queryVector,
        modelId,
        dimensions,
        accessClass: input.scope,
        documentId: UNFRAMED_RAG_DOCUMENT.id,
        topK,
        minSimilarity: -1,
        signal: controller.signal,
      }),
      controller.signal
    );

    const ordered = rows
      .filter(
        (row) =>
          row &&
          typeof row.chunk_id === 'string' &&
          typeof row.content === 'string' &&
          row.content.length > 0 &&
          Number.isFinite(row.similarity) &&
          row.document_id === UNFRAMED_RAG_DOCUMENT.id
      )
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, topK);

    const topSimilarity = ordered.length > 0 ? ordered[0].similarity : null;

    if (ordered.length === 0) {
      return {
        outcome: 'no_match',
        hits: [],
        latencyMs: Math.max(0, Date.now() - startedAt),
        topSimilarity: null,
      };
    }

    const usable = ordered.filter((row) => row.similarity >= threshold);

    if (usable.length === 0) {
      return {
        outcome: 'weak_match',
        hits: [],
        latencyMs: Math.max(0, Date.now() - startedAt),
        topSimilarity,
      };
    }

    return {
      outcome: 'relevant_results',
      hits: usable.slice(0, topK).map(toHit),
      latencyMs: Math.max(0, Date.now() - startedAt),
      topSimilarity,
    };
  } catch (error) {
    return unavailable(errorCode(error), startedAt);
  } finally {
    clearTimeout(timer);
  }
}
