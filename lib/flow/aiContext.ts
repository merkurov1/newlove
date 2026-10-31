import type { FlowAIResult } from '@/lib/flow/ai';

/** Public pages may select only these columns. */
export const FLOW_AI_CONTEXT_PUBLIC_COLUMNS =
  'id,item_id,content,model,provider,status,generated_at';

/** Admin diagnostics may use the full row, including source references. */
export const FLOW_AI_CONTEXT_ADMIN_COLUMNS = '*';

function now(): string {
  return new Date().toISOString();
}

function safePublicUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function flowAiContextGeneratingPayload(
  itemId: string,
  ragEnabled: boolean
): Record<string, unknown> {
  return {
    item_id: itemId,
    status: 'generating',
    rag_enabled: ragEnabled,
    retrieval_status: ragEnabled ? 'pending' : 'disabled',
    error: null,
    updated_at: now(),
  };
}

export function flowAiContextErrorPayload(
  itemId: string,
  message: string,
  ragEnabled: boolean
): Record<string, unknown> {
  return {
    item_id: itemId,
    status: 'error',
    error: message.slice(0, 2000),
    rag_enabled: ragEnabled,
    retrieval_status: 'error',
    retrieval_method: null,
    retrieval_latency_ms: null,
    source_document_ids: [],
    source_titles: [],
    source_refs: [],
    retrieval_diagnostics: { reason: 'generation_failed' },
    generation_version: 'flow-ai-v1',
    updated_at: now(),
  };
}

/**
 * Persists the complete generation provenance. Only public source references
 * produced by retrieveFlowPublicEvidence() may enter this payload.
 */
export function flowAiContextReadyPayload(
  itemId: string,
  result: FlowAIResult
): Record<string, unknown> {
  const timestamp = now();

  return {
    item_id: itemId,
    content: result.content,
    model: result.model,
    provider: result.provider || 'deepseek',
    status: 'ready',
    error: null,
    generated_at: timestamp,
    updated_at: timestamp,
    rag_enabled: result.ragEnabled,
    retrieval_status: result.retrievalStatus,
    retrieval_method: result.retrievalMethod,
    retrieval_latency_ms: result.retrievalLatencyMs,
    source_document_ids: result.sourceDocumentIds.slice(0, 20),
    source_titles: result.sourceTitles.slice(0, 20).map((title) => title.slice(0, 500)),
    source_refs: result.sourceRefs.slice(0, 10).map((ref) => ({
      documentId: ref.documentId,
      documentTitle: ref.documentTitle.slice(0, 500),
      chunkId: ref.chunkId,
      excerpt: ref.excerpt.slice(0, 600),
      similarity: Number.isFinite(ref.similarity) ? ref.similarity : null,
      sourceUrl: safePublicUrl(ref.sourceUrl),
      sourceType: ref.sourceType,
      publishedAt: ref.publishedAt,
    })),
    retrieval_diagnostics: result.retrievalDiagnostics,
    generation_version: result.generationVersion,
  };
}
