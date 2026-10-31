import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  BRAIN_RAG_MAX_QUERY_CHARS,
  BRAIN_RAG_TIMEOUT_MS,
  resolveUnframedEmbeddingConfig,
  type RagEnvironment,
} from '@/lib/knowledge/rag/config';
import { createOpenRouterEmbeddingClientFromEnv, type EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import { buildBrainQueryPlan, type BrainQueryPlan } from '@/lib/knowledge/rag/queryRouting';
import { createSupabaseFlowPublicSearch } from '@/lib/knowledge/rag/supabaseStore';
import type { BrainSearch, BrainSearchRow } from '@/lib/knowledge/rag/types';

export const FLOW_AI_RAG_TOP_K = 5;
export const FLOW_AI_RAG_MAX_CHUNKS_PER_DOCUMENT = 2;
export const FLOW_AI_RAG_DEFAULT_MIN_SIMILARITY = 0.34;
export const FLOW_AI_RAG_MAX_EXCERPT_CHARS = 600;
export const FLOW_AI_RAG_MAX_EVIDENCE_CHARS = 6000;

/**
 * Manuscripts and private columns are never usable in public Flow summaries.
 * The database check constraint enforces the same rule.
 */
export const FLOW_AI_RAG_ALLOWED_SOURCE_TYPES = [
  'article',
  'media_coverage',
  'research',
  'art_project',
  'biography',
  'other',
] as const;

const FORBIDDEN_SOURCE_TYPES = new Set(['manuscript', 'personal_writing']);

export type FlowRetrievalStatus =
  | 'disabled'
  | 'no_match'
  | 'weak_match'
  | 'relevant'
  | 'unavailable'
  | 'error';

export type FlowPublicDocument = {
  id: string;
  title: string;
  source_type: string;
  canonical_url: string | null;
  source_url: string | null;
  published_at: string | null;
  author: string | null;
  language: string | null;
  public_retrieval_allowed: boolean;
  ingestion_status: string | null;
};

export type FlowSourceRef = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  excerpt: string;
  similarity: number;
  sourceUrl: string | null;
  sourceType: string;
  publishedAt: string | null;
};

export type FlowPublicRetrievalResult = {
  status: FlowRetrievalStatus;
  method: 'brain_hybrid_public' | null;
  latencyMs: number;
  hits: BrainSearchRow[];
  sourceRefs: FlowSourceRef[];
  documentIds: string[];
  titles: string[];
  topSimilarity: number | null;
  plan: BrainQueryPlan | null;
  diagnostics: Record<string, unknown>;
};

export type FlowRagItemInput = {
  title: string | null;
  body_md: string | null;
  metadata: Record<string, unknown> | null;
  type: string;
  lang: string;
  source_url?: string | null;
};

export type LoadFlowPublicDocuments = (input: {
  ids?: string[];
  limit?: number;
}) => Promise<FlowPublicDocument[]>;

export type FlowPublicRetrievalDeps = {
  env?: RagEnvironment;
  enabled?: boolean;
  embeddingClient?: EmbeddingClient;
  search?: BrainSearch | null;
  loadPublicDocuments?: LoadFlowPublicDocuments;
  topK?: number;
  minSimilarity?: number;
  timeoutMs?: number;
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

export function isFlowPublicSourceType(value: string | null | undefined): boolean {
  if (!value) return false;
  if (FORBIDDEN_SOURCE_TYPES.has(value)) return false;

  return (FLOW_AI_RAG_ALLOWED_SOURCE_TYPES as readonly string[]).includes(value);
}

export function isFlowAiRagEnabled(env: RagEnvironment = process.env): boolean {
  return (env.FLOW_AI_RAG_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

export function resolveFlowAiRagThreshold(env: RagEnvironment = process.env): number {
  const raw = (env.FLOW_AI_RAG_MIN_SIMILARITY || '').trim();

  if (!raw) return FLOW_AI_RAG_DEFAULT_MIN_SIMILARITY;

  const value = Number(raw);

  if (!Number.isFinite(value) || value < -1 || value > 1) {
    return FLOW_AI_RAG_DEFAULT_MIN_SIMILARITY;
  }

  return value;
}

/**
 * Builds a retrieval query from the public Flow item. The query is derived only
 * from the item itself; no private Brain text is sent to the embedding model.
 */
export function buildFlowRetrievalQuery(item: FlowRagItemInput): string {
  const metadata = item.metadata ?? {};
  const title = clean(item.title, 500);
  const description = clean(metadata.description, 500);
  const body = clean(item.body_md, 1200);
  const query = [title, description, body].filter(Boolean).join('\n').trim();

  return query.slice(0, BRAIN_RAG_MAX_QUERY_CHARS);
}

function createFlowPublicDocumentLoader(
  env: RagEnvironment
): LoadFlowPublicDocuments | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  const store: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return async (input) => {
    const ids = input.ids;

    if (ids && ids.length === 0) return [];

    let query = store
      .from('knowledge_documents')
      .select(
        'id,title,source_type,canonical_url,source_url,published_at,author,language,public_retrieval_allowed,ingestion_status'
      )
      .eq('public_retrieval_allowed', true)
      .in('source_type', [...FLOW_AI_RAG_ALLOWED_SOURCE_TYPES])
      .eq('ingestion_status', 'completed')
      .limit(Math.min(Math.max(input.limit || 500, 1), 500));

    if (ids) query = query.in('id', ids);

    const { data, error } = await query;

    if (error) throw new Error('flow_rag_scope_query_failed');

    return ((data || []) as FlowPublicDocument[]).filter(
      (row) =>
        row.public_retrieval_allowed === true &&
        row.ingestion_status === 'completed' &&
        isFlowPublicSourceType(row.source_type)
    );
  };
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('flow_rag_timeout'));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('flow_rag_timeout'));
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

function emptyResult(
  status: FlowRetrievalStatus,
  startedAt: number,
  overrides: Partial<FlowPublicRetrievalResult> = {}
): FlowPublicRetrievalResult {
  return {
    status,
    method: null,
    latencyMs: Math.max(0, Date.now() - startedAt),
    hits: [],
    sourceRefs: [],
    documentIds: [],
    titles: [],
    topSimilarity: null,
    plan: null,
    diagnostics: {},
    ...overrides,
  };
}

/**
 * Final defense-in-depth filter. Even if the RPC or a future query change
 * accidentally returns an owner-only document, it is dropped here.
 */
export function filterFlowPublicHits(input: {
  rows: BrainSearchRow[];
  allowedDocuments: FlowPublicDocument[];
  topK?: number;
  minSimilarity?: number;
  maxPerDocument?: number;
}): BrainSearchRow[] {
  const allowed = new Map(
    input.allowedDocuments
      .filter(
        (document) =>
          document.public_retrieval_allowed === true &&
          isFlowPublicSourceType(document.source_type)
      )
      .map((document) => [document.id, document])
  );
  const perDocument = new Map<string, number>();
  const topK = Math.min(Math.max(input.topK ?? FLOW_AI_RAG_TOP_K, 1), 10);
  const maxPerDocument = Math.max(1, input.maxPerDocument ?? FLOW_AI_RAG_MAX_CHUNKS_PER_DOCUMENT);
  const minSimilarity = input.minSimilarity ?? FLOW_AI_RAG_DEFAULT_MIN_SIMILARITY;
  const selected: BrainSearchRow[] = [];
  const seenChunks = new Set<string>();

  for (const row of input.rows) {
    if (!row || typeof row.chunk_id !== 'string' || typeof row.document_id !== 'string') continue;
    if (seenChunks.has(row.chunk_id)) continue;
    if (!allowed.has(row.document_id)) continue;
    if (!isFlowPublicSourceType(row.source_type)) continue;
    if (typeof row.content !== 'string' || !row.content.trim()) continue;

    const count = perDocument.get(row.document_id) || 0;
    if (count >= maxPerDocument) continue;

    const lexical = Number.isFinite(row.lexical_score) ? row.lexical_score : 0;
    if (row.similarity < minSimilarity && lexical < 0.15) continue;

    seenChunks.add(row.chunk_id);
    perDocument.set(row.document_id, count + 1);
    selected.push(row);

    if (selected.length >= topK) break;
  }

  return selected;
}

function toSourceRef(row: BrainSearchRow, document: FlowPublicDocument): FlowSourceRef {
  return {
    documentId: document.id,
    documentTitle: document.title.slice(0, 500),
    chunkId: row.chunk_id,
    excerpt: row.content.replace(/\s+/g, ' ').trim().slice(0, FLOW_AI_RAG_MAX_EXCERPT_CHARS),
    similarity: Number(row.similarity.toFixed(4)),
    sourceUrl: document.canonical_url || document.source_url || null,
    sourceType: document.source_type,
    publishedAt: document.published_at,
  };
}

/**
 * Retrieves public-only Brain evidence for a Flow item.
 *
 * Steps: query plan -> explicit document allowlist -> embedding -> public RPC
 * -> post-verification against the current allowlist -> selected source refs.
 * It never throws to the caller; failures become an unavailable/error status and
 * the caller falls back to the non-RAG pipeline.
 */
export async function retrieveFlowPublicEvidence(
  item: FlowRagItemInput,
  deps: FlowPublicRetrievalDeps = {}
): Promise<FlowPublicRetrievalResult> {
  const startedAt = Date.now();
  const env = deps.env ?? process.env;
  const enabled = deps.enabled ?? isFlowAiRagEnabled(env);
  const method = 'brain_hybrid_public' as const;

  if (!enabled) {
    return emptyResult('disabled', startedAt, {
      diagnostics: { reason: 'flow_ai_rag_disabled' },
    });
  }

  const query = buildFlowRetrievalQuery(item);

  if (!query) {
    return emptyResult('no_match', startedAt, {
      method,
      diagnostics: { reason: 'empty_query' },
    });
  }

  const plan = buildBrainQueryPlan(query);
  const loadPublicDocuments =
    deps.loadPublicDocuments ?? createFlowPublicDocumentLoader(env);

  if (!loadPublicDocuments) {
    return emptyResult('unavailable', startedAt, {
      plan,
      diagnostics: { reason: 'scope_database_unavailable' },
    });
  }

  try {
    const allowlist = await loadPublicDocuments({ limit: 500 });

    if (allowlist.length === 0) {
      return emptyResult('no_match', startedAt, {
        method,
        plan,
        diagnostics: { reason: 'no_public_documents', intent: plan.intent },
      });
    }

    const config = resolveUnframedEmbeddingConfig(env);
    const embeddingClient =
      deps.embeddingClient ?? createOpenRouterEmbeddingClientFromEnv(env);
    const search = deps.search === undefined ? createSupabaseFlowPublicSearch(env) : deps.search;

    if (!search) {
      return emptyResult('unavailable', startedAt, {
        method,
        plan,
        diagnostics: { reason: 'search_unavailable', intent: plan.intent },
      });
    }

    if (embeddingClient.modelId !== config.modelId) {
      return emptyResult('unavailable', startedAt, {
        method,
        plan,
        diagnostics: { reason: 'embedding_model_mismatch', intent: plan.intent },
      });
    }

    if (embeddingClient.dimensions !== config.dimensions) {
      return emptyResult('unavailable', startedAt, {
        method,
        plan,
        diagnostics: { reason: 'embedding_dimension_mismatch', intent: plan.intent },
      });
    }

    const timeoutMs = Math.max(1, deps.timeoutMs ?? BRAIN_RAG_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const vectors = await withAbort(
        embeddingClient.embed([query], controller.signal),
        controller.signal
      );

      if (!Array.isArray(vectors) || vectors.length !== 1) {
        return emptyResult('unavailable', startedAt, {
          method,
          plan,
          diagnostics: { reason: 'embedding_failed', intent: plan.intent },
        });
      }

      const rowMatches = await withAbort(
        search({
          queryEmbedding: vectors[0],
          modelId: config.modelId,
          dimensions: config.dimensions,
          accessClass: 'public',
          documentId: null,
          documentIds: allowlist.map((document) => document.id),
          topK: deps.topK ?? FLOW_AI_RAG_TOP_K,
          matchCount: 24,
          minSimilarity: -1,
          queryText: plan.lexicalQuery || query,
          signal: controller.signal,
        }),
        controller.signal
      );

      // Re-check the current DB allowlist after retrieval. This is deliberately
      // a second query: a stale or broken RPC result must never become evidence.
      const hitDocumentIds = Array.from(
        new Set(rowMatches.map((row) => row.document_id).filter(Boolean))
      );
      const verifiedDocuments = await loadPublicDocuments({
        ids: hitDocumentIds,
        limit: Math.max(hitDocumentIds.length, 1),
      });

      if (verifiedDocuments.length === 0 && rowMatches.length > 0) {
        return emptyResult('unavailable', startedAt, {
          method,
          plan,
          diagnostics: {
            reason: 'scope_verification_failed',
            candidateCount: rowMatches.length,
            intent: plan.intent,
          },
        });
      }

      const hits = filterFlowPublicHits({
        rows: rowMatches,
        allowedDocuments: verifiedDocuments,
        topK: deps.topK ?? FLOW_AI_RAG_TOP_K,
        minSimilarity: deps.minSimilarity ?? resolveFlowAiRagThreshold(env),
      });

      if (hits.length === 0) {
        return emptyResult(rowMatches.length === 0 ? 'no_match' : 'weak_match', startedAt, {
          method,
          plan,
          diagnostics: {
            candidateCount: rowMatches.length,
            intent: plan.intent,
            reason: rowMatches.length === 0 ? 'no_candidates' : 'below_threshold_or_filtered',
          },
        });
      }

      const documentById = new Map(verifiedDocuments.map((document) => [document.id, document]));
      let budget = FLOW_AI_RAG_MAX_EVIDENCE_CHARS;
      const sourceRefs: FlowSourceRef[] = [];
      const selectedHits: BrainSearchRow[] = [];

      for (const hit of hits) {
        const document = documentById.get(hit.document_id);
        if (!document) continue;

        const excerptLength = Math.min(
          FLOW_AI_RAG_MAX_EXCERPT_CHARS,
          Math.max(0, budget)
        );

        if (excerptLength <= 0) break;

        selectedHits.push(hit);
        sourceRefs.push({
          ...toSourceRef(hit, document),
          excerpt: hit.content
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, excerptLength),
        });
        budget -= Math.min(hit.content.length, excerptLength);
      }

      const topSimilarity = selectedHits[0]?.similarity ?? null;

      return {
        status: 'relevant',
        method,
        latencyMs: Math.max(0, Date.now() - startedAt),
        hits: selectedHits,
        sourceRefs,
        documentIds: Array.from(new Set(sourceRefs.map((ref) => ref.documentId))),
        titles: Array.from(
          new Set(sourceRefs.map((ref) => ref.documentTitle).filter(Boolean))
        ),
        topSimilarity,
        plan,
        diagnostics: {
          intent: plan.intent,
          language: plan.language,
          candidateCount: rowMatches.length,
          selectedCount: sourceRefs.length,
          topSimilarity,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';

    return emptyResult(
      message === 'flow_rag_timeout' ? 'unavailable' : 'error',
      startedAt,
      {
        method,
        plan,
        diagnostics: {
          reason: message === 'flow_rag_timeout' ? 'timeout' : 'retrieval_failed',
          error: message.slice(0, 200),
          intent: plan.intent,
        },
      }
    );
  }
}
