import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { KnowledgeDatabaseError } from './errors';
import { classifyBrainDocument } from './queryRouting';
import type { RagEnvironment } from './config';
import type { BrainSourceClass, KnowledgeAccessClass, RetrievedChunk } from './types';

export type BrainDocumentMatch = {
  id: string;
  title: string;
  sourceType: string;
  publishedAt: string | null;
  accessClass: KnowledgeAccessClass;
  chunkCount: number;
  match: 'exact' | 'partial';
  score: number;
};

type DocumentRow = {
  id?: unknown;
  title?: unknown;
  source_type?: unknown;
  published_at?: unknown;
  access_class?: unknown;
  chunk_count?: unknown;
};

const TITLE_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'a',
  'an',
  'of',
  'in',
  'on',
  'и',
  'в',
  'во',
  'на',
  'с',
  'со',
  'по',
  'из',
]);

export function normalizeDocumentTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[—–−-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(value: string): string[] {
  return normalizeDocumentTitle(value)
    .split(/[\s-]+/)
    .filter((token) => token.length >= 3 && !TITLE_STOP_WORDS.has(token))
    .slice(0, 12);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Pure ranking helper so exact / partial title behaviour can be tested without
 * a database. Exact title wins; a full phrase wins over one shared token; a
 * shorter matching title wins over a longer one with the same score.
 */
export function rankTitleCandidates(
  candidates: Array<Pick<BrainDocumentMatch, 'id' | 'title'>>,
  requested: string
): BrainDocumentMatch[] {
  const target = normalizeDocumentTitle(requested);
  const targetTokens = titleTokens(requested);

  if (!target) return [];

  return candidates
    .map((candidate): BrainDocumentMatch | null => {
      const title = normalizeDocumentTitle(candidate.title);
      if (!title) return null;

      let score = 0;
      let match: 'exact' | 'partial' = 'partial';

      if (title === target) {
        score = 100;
        match = 'exact';
      } else if (title.startsWith(target)) {
        score = 86;
      } else if (title.includes(target)) {
        score = 78;
      } else if (target.includes(title)) {
        score = 72;
      } else if (targetTokens.length > 0) {
        const matched = targetTokens.filter((token) => title.includes(token)).length;
        const ratio = matched / targetTokens.length;

        if (matched === 0) return null;
        if (targetTokens.length > 1 && matched < 2) return null;

        score = 35 + Math.round(ratio * 40);
        if (matched === targetTokens.length) score += 5;
      }

      if (score === 0) return null;

      return {
        id: candidate.id,
        title: candidate.title,
        sourceType: 'other',
        publishedAt: null,
        accessClass: 'owner' as KnowledgeAccessClass,
        chunkCount: 0,
        match,
        score: score - Math.min(title.length, 200) / 1000,
      };
    })
    .filter((candidate): candidate is BrainDocumentMatch => candidate !== null)
    .sort((left, right) => right.score - left.score);
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

function toMatch(row: DocumentRow): BrainDocumentMatch | null {
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null;

  return {
    id: row.id,
    title: row.title,
    sourceType: typeof row.source_type === 'string' ? row.source_type : 'other',
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null,
    accessClass: row.access_class === 'public' ? 'public' : 'owner',
    chunkCount: typeof row.chunk_count === 'number' ? row.chunk_count : 0,
    match: 'partial',
    score: 0,
  };
}

/**
 * Metadata-first document lookup. This never uses embeddings: an exact or
 * partial title must work even when the embedding provider is slow or down.
 *
 * The caller decides how to use the match. This function only reports what the
 * database actually contains and never substitutes a different document.
 */
export async function findBrainDocumentByTitle(input: {
  title: string;
  scope?: KnowledgeAccessClass;
  env?: RagEnvironment;
  store?: SupabaseClient | null;
  limit?: number;
}): Promise<BrainDocumentMatch | null> {
  const env = input.env ?? process.env;
  const scope = input.scope ?? 'owner';
  const store = input.store ?? createServiceClient(env);
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 40);

  if (!store) throw new KnowledgeDatabaseError('unavailable');

  const requested = input.title.trim();
  if (!requested) return null;

  const rows = new Map<string, DocumentRow>();
  const phrases = [requested, ...titleTokens(requested).slice(0, 3)];

  for (const phrase of phrases) {
    let query = store
      .from('knowledge_documents')
      .select('id,title,source_type,published_at,access_class,chunk_count')
      .eq('access_class', scope)
      .eq('ingestion_status', 'completed')
      .ilike('title', `%${escapeLike(phrase)}%`)
      .limit(limit);

    if (scope === 'public') {
      query = query.eq('public_retrieval_allowed', true);
    }

    const { data, error } = await query;

    if (error) throw new KnowledgeDatabaseError('query_failed');
    if (!Array.isArray(data)) continue;

    for (const row of data as DocumentRow[]) {
      if (typeof row.id === 'string') rows.set(row.id, row);
    }
  }

  const candidates = Array.from(rows.values())
    .map(toMatch)
    .filter((candidate): candidate is BrainDocumentMatch => candidate !== null);
  const ranked = rankTitleCandidates(candidates, requested);

  const best = ranked[0];
  if (!best) return null;

  const source = candidates.find((candidate) => candidate.id === best.id);
  if (!source) return null;

  return {
    ...source,
    match: best.match,
    score: best.score,
  };
}

/**
 * Direct chunk loader for an already identified document. It deliberately
 * avoids embeddings: once the title is known, the document's own chunks are
 * the correct evidence, ordered by their section index.
 */
export async function loadBrainDocumentChunks(input: {
  document: BrainDocumentMatch;
  scope?: KnowledgeAccessClass;
  env?: RagEnvironment;
  store?: SupabaseClient | null;
  limit?: number;
}): Promise<RetrievedChunk[]> {
  const env = input.env ?? process.env;
  const scope = input.scope ?? 'owner';
  const store = input.store ?? createServiceClient(env);
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 24);

  if (!store) throw new KnowledgeDatabaseError('unavailable');

  const { data, error } = await store
    .from('knowledge_chunks')
    .select('id,document_id,content,heading,section_path,section_index,line_start,line_end')
    .eq('document_id', input.document.id)
    .eq('access_class', scope)
    .order('section_index', { ascending: true })
    .limit(limit);

  if (error) throw new KnowledgeDatabaseError('query_failed');
  if (!Array.isArray(data)) return [];

  const sourceClass: BrainSourceClass = classifyBrainDocument({
    source_type: input.document.sourceType,
    title: input.document.title,
    metadata: null,
  });

  return data.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];

    const value = row as Record<string, unknown>;
    if (
      typeof value.id !== 'string' ||
      typeof value.document_id !== 'string' ||
      typeof value.content !== 'string' ||
      !value.content.trim()
    ) {
      return [];
    }

    const sectionPath = Array.isArray(value.section_path)
      ? value.section_path.filter((part): part is string => typeof part === 'string')
      : [];

    return [
      {
        chunkId: value.id,
        documentId: value.document_id,
        documentTitle: input.document.title,
        sourceType: input.document.sourceType,
        sourceClass,
        sourceDomain: null,
        author: null,
        language: null,
        publishedAt: input.document.publishedAt,
        content: value.content,
        heading: typeof value.heading === 'string' ? value.heading : '',
        sectionPath,
        sectionIndex: typeof value.section_index === 'number' ? value.section_index : 0,
        lineStart: typeof value.line_start === 'number' ? value.line_start : 0,
        lineEnd: typeof value.line_end === 'number' ? value.line_end : 0,
        similarity: 0.99,
        lexicalScore: 1,
        combinedScore: 0.99,
      } satisfies RetrievedChunk,
    ];
  });
}
