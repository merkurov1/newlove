import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { RagEnvironment } from './config';
import { KnowledgeDatabaseError } from './errors';
import type {
  KnowledgeChunkWithEmbedding,
  KnowledgeDocumentRow,
  KnowledgeRepository,
  KnowledgeSearch,
  KnowledgeSearchInput,
  KnowledgeSearchRow,
} from './types';

export function toPgVector(vector: number[]): string {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new KnowledgeDatabaseError('query_failed');
  }

  if (!vector.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new KnowledgeDatabaseError('query_failed');
  }

  return `[${vector.join(',')}]`;
}

/**
 * PostgREST reports a column missing from its schema cache as `PGRST204`,
 * while direct PostgreSQL reports `42703`. Older live RAG schemas may predate
 * `knowledge_documents.ingestion_version`.
 */
export function isMissingIngestionVersionColumn(
  error: { code?: unknown; message?: unknown } | null | undefined
): boolean {
  if (!error) return false;

  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return (code === '42703' || code === 'PGRST204') && message.includes('ingestion_version');
}

export async function upsertKnowledgeDocument(
  store: SupabaseClient,
  document: KnowledgeDocumentRow
): Promise<void> {
  const { error } = await store.from('knowledge_documents').upsert(document, { onConflict: 'id' });

  if (!error) return;

  // Production schema reconciliation: some already-applied RAG schemas
  // predate the ingestion_version column. Keep the contract in metadata
  // instead of changing the live schema during an ingestion operation.
  if (isMissingIngestionVersionColumn(error) && document.ingestion_version) {
    const { ingestion_version, ...row } = document;
    const { error: retryError } = await store.from('knowledge_documents').upsert(
      {
        ...row,
        metadata: {
          ...(document.metadata || {}),
          ingestion_version,
        },
      },
      { onConflict: 'id' }
    );

    if (!retryError) return;
  }

  throw new KnowledgeDatabaseError('write_failed');
}

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function parseSearchRows(data: unknown): KnowledgeSearchRow[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];

    const value = row as Record<string, unknown>;
    const sectionPath = Array.isArray(value.section_path)
      ? value.section_path.filter((part): part is string => typeof part === 'string')
      : typeof value.section_path === 'string'
        ? [value.section_path]
        : [];

    if (
      typeof value.chunk_id !== 'string' ||
      typeof value.document_id !== 'string' ||
      typeof value.content !== 'string' ||
      typeof value.heading !== 'string' ||
      typeof value.section_index !== 'number' ||
      typeof value.line_start !== 'number' ||
      typeof value.line_end !== 'number' ||
      typeof value.similarity !== 'number' ||
      !Number.isFinite(value.similarity)
    ) {
      return [];
    }

    return [
      {
        chunk_id: value.chunk_id,
        document_id: value.document_id,
        content: value.content,
        heading: value.heading,
        section_path: sectionPath,
        section_index: value.section_index,
        line_start: value.line_start,
        line_end: value.line_end,
        similarity: value.similarity,
      },
    ];
  });
}

export function createSupabaseKnowledgeSearch(
  env: RagEnvironment = process.env
): KnowledgeSearch | null {
  const store = createServiceClient(env);

  if (!store) return null;

  return async (input: KnowledgeSearchInput): Promise<KnowledgeSearchRow[]> => {
    if (input.signal?.aborted) throw new KnowledgeDatabaseError('query_failed');

    const { data, error } = await store.rpc('knowledge_search_unframed', {
      p_query_embedding: toPgVector(input.queryEmbedding),
      p_model_id: input.modelId,
      p_dimensions: input.dimensions,
      p_access_class: input.accessClass,
      p_document_id: input.documentId,
      p_match_count: input.topK,
      p_min_similarity: input.minSimilarity,
    });

    if (error) throw new KnowledgeDatabaseError('query_failed');

    return parseSearchRows(data);
  };
}

export function createSupabaseKnowledgeRepository(
  env: RagEnvironment = process.env
): KnowledgeRepository | null {
  const store = createServiceClient(env);
  const search = createSupabaseKnowledgeSearch(env);

  if (!store || !search) return null;

  return {
    async upsertDocument(document: KnowledgeDocumentRow): Promise<void> {
      await upsertKnowledgeDocument(store, document);
    },

    async upsertChunks(chunks: KnowledgeChunkWithEmbedding[]): Promise<void> {
      if (chunks.length === 0) return;

      const rows = chunks.map((chunk) => ({
        ...chunk,
        embedding: toPgVector(chunk.embedding),
      }));

      const { error } = await store.from('knowledge_chunks').upsert(rows, { onConflict: 'id' });

      if (error) throw new KnowledgeDatabaseError('write_failed');
    },

    async listChunkIds(documentId: string): Promise<string[]> {
      const { data, error } = await store
        .from('knowledge_chunks')
        .select('id')
        .eq('document_id', documentId)
        .limit(10_000);

      if (error) throw new KnowledgeDatabaseError('query_failed');

      return Array.isArray(data)
        ? data.flatMap((row) =>
            row && typeof row === 'object' && typeof row.id === 'string' ? [row.id] : []
          )
        : [];
    },

    async deleteChunks(documentId: string, chunkIds: string[]): Promise<void> {
      if (chunkIds.length === 0) return;

      const { error } = await store
        .from('knowledge_chunks')
        .delete()
        .eq('document_id', documentId)
        .in('id', chunkIds);

      if (error) throw new KnowledgeDatabaseError('write_failed');
    },

    search,
  };
}
