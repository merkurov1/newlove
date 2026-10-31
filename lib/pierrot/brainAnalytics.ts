import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/brainAnalytics');

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { BrainRetrievalResult } from '@/lib/knowledge/rag/brainRetrieval';
import { recordPierrotEvent } from '@/lib/pierrot/serverStore';

export type PierrotRetrievalMode =
  | 'brain_v2'
  | 'brain_v1'
  | 'media'
  | 'public_brain'
  | 'disabled';

export type PierrotRetrievalTraceInput = {
  conversationId: string;
  sessionId: string;
  userMessageId: string;
  mode: PierrotRetrievalMode;
  outcome: string;
  code?: string | null;
  selectedSources: string[];
  documentIds: string[];
  chunkIds: string[];
  latencyMs: number;
  usedContext: boolean;
  generationOk: boolean;
  candidateCount?: number;
  topSimilarity?: number | null;
  refined?: boolean;
  attempts?: number;
  mediaFallbackCount?: number;
};

export type BrainRetrievalTraceInput = {
  conversationId: string;
  sessionId: string;
  userMessageId: string;
  result: BrainRetrievalResult;
  usedContext: boolean;
  generationOk: boolean;
};

function hashQuery(query: string): string {
  return createHash('sha256').update(query, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Retrieval observability for owner and public Pierrot. It intentionally stores
 * no query text, passage text, visitor text or publication content.
 */
export function buildPierrotRetrievalPayload(
  input: PierrotRetrievalTraceInput
): Record<string, unknown> {
  return {
    mode: input.mode,
    outcome: input.outcome,
    code: input.code ?? null,
    selected_sources: input.selectedSources.slice(0, 10),
    document_ids: input.documentIds.slice(0, 20),
    chunk_ids: input.chunkIds.slice(0, 20),
    document_count: input.documentIds.length,
    chunk_count: input.chunkIds.length,
    latency_ms: input.latencyMs,
    candidate_count: input.candidateCount ?? null,
    top_similarity: input.topSimilarity ?? null,
    used_context: input.usedContext,
    generation_ok: input.generationOk,
    refined: Boolean(input.refined),
    attempts: input.attempts ?? 1,
    media_fallback_count: input.mediaFallbackCount ?? null,
  };
}

export async function recordPierrotRetrieval(
  store: SupabaseClient,
  input: PierrotRetrievalTraceInput
): Promise<void> {
  try {
    await recordPierrotEvent(store, {
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      eventName: 'brain_retrieval',
      eventKey: `brain_retrieval:${input.userMessageId}`,
      payload: buildPierrotRetrievalPayload(input),
    });
  } catch {
    // Retrieval must never fail because observability is unavailable.
  }
}

/**
 * Owner-only retrieval trace. It intentionally stores no query text, passage
 * text, names or publication content. The event key is per user turn so a
 * retry cannot duplicate the trace.
 */
export async function recordBrainRetrieval(
  store: SupabaseClient,
  input: BrainRetrievalTraceInput
): Promise<void> {
  const { result } = input;

  try {
    await recordPierrotEvent(store, {
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      eventName: 'brain_retrieval',
      eventKey: `brain_retrieval:${input.userMessageId}`,
      payload: {
        query_hash: hashQuery(result.plan.originalQuery),
        language: result.plan.language,
        intent: result.plan.intent,
        subject_chars: result.plan.subject.length,
        requested_sources: result.plan.requestedSources,
        selected_sources: result.selectedSourceClasses,
        requested_domains: result.plan.requestedDomains,
        time_from: result.plan.publishedFrom,
        time_to: result.plan.publishedTo,
        method: result.method,
        outcome: result.outcome,
        code: result.code ?? null,
        empty: result.hits.length === 0,
        top_similarity: result.topSimilarity,
        candidate_count: result.candidateCount,
        document_ids: result.documentIds.slice(0, 10),
        chunk_ids: result.chunkIds.slice(0, 10),
        ranking: result.ranking.slice(0, 10).map((entry) => ({
          document_id: entry.documentId,
          chunk_id: entry.chunkId,
          source_class: entry.sourceClass,
          similarity: Number(entry.similarity.toFixed(4)),
          lexical_score: Number(entry.lexicalScore.toFixed(4)),
          combined_score: Number(entry.combinedScore.toFixed(4)),
        })),
        used_context: input.usedContext,
        generation_ok: input.generationOk,
      },
    });
  } catch {
    // Retrieval must never fail because observability is unavailable.
  }
}
