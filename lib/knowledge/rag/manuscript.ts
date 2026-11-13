import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  BRAIN_RAG_MAX_QUERY_CHARS,
  UNFRAMED_EMBEDDING_DIMENSIONS,
  resolveUnframedEmbeddingConfig,
  type RagEnvironment,
} from './config';
import { createOpenRouterEmbeddingClientFromEnv } from './embeddings';
import { createSupabaseBrainSearch } from './supabaseStore';
import {
  buildManuscriptStructure,
  type ManuscriptChapter,
  type ManuscriptChunk,
  type ManuscriptChunkMeta,
  type ManuscriptCoverage,
  type ManuscriptStructure,
} from './manuscriptStructure';

/**
 * Document-level access to the UNFRAMED manuscript.
 *
 * This is intentionally not a semantic top-K search wrapper:
 *   * the document is resolved by exact ID, not by embedding similarity;
 *   * the full ordered chunk inventory can be validated without loading text;
 *   * chapters are read by chunk range in source order;
 *   * coverage and every failure are explicit.
 *
 * The module never writes. Editing proposals live in a separate module.
 */

export const UNFRAMED_MANUSCRIPT_ID = 'doc_unframed_manuscript';
export const UNFRAMED_MANUSCRIPT_TITLE = 'UNFRAMED';
export const UNFRAMED_MANUSCRIPT_SOURCE_PATH = 'app/unframed/Unframed.markdown';

export type ManuscriptDocument = {
  id: string;
  title: string;
  sourcePath: string;
  sourceSha256: string;
  parserVersion: string;
  chunkerVersion: string;
  embeddingModel: string;
  accessClass: 'public' | 'owner';
  chunkCount: number;
  sourceCharCount: number;
  sourceType: string;
  ingestionStatus: string | null;
  extractionStatus: string | null;
  updatedAt: string | null;
  metadata: Record<string, unknown>;
};

export type ManuscriptDataErrorCode =
  | 'unavailable'
  | 'not_found'
  | 'query_failed'
  | 'ingestion_incomplete'
  | 'partial_inventory';

export class ManuscriptDataError extends Error {
  readonly code: ManuscriptDataErrorCode;

  constructor(code: ManuscriptDataErrorCode, message?: string) {
    super(message || code);
    this.name = 'ManuscriptDataError';
    this.code = code;
  }
}

export type ManuscriptInventory = {
  document: ManuscriptDocument;
  chunks: ManuscriptChunkMeta[];
  structure: ManuscriptStructure;
  coverage: ManuscriptCoverage;
  loadedAt: string;
};

export type ManuscriptSearchHit = {
  chunk: ManuscriptChunkMeta;
  excerpt: string;
  method: 'lexical' | 'semantic' | 'exact_phrase' | 'chapter_scope';
  score: number;
  chapter: ManuscriptChapter | null;
};

const META_COLUMNS =
  'id,chunk_index,section_index,heading,section_path,char_start,char_end,line_start,line_end';
const TEXT_COLUMNS = `${META_COLUMNS},content`;
const DOCUMENT_COLUMNS =
  'id,title,source_path,source_sha256,parser_version,chunker_version,embedding_model,access_class,chunk_count,source_char_count,source_type,ingestion_status,extraction_status,updated_at,metadata';

const CACHE_TTL_MS = 10 * 60 * 1000;
const inventoryCache = new Map<
  string,
  { expiresAt: number; value: Promise<ManuscriptInventory> }
>();
const textCache = new Map<
  string,
  { expiresAt: number; value: ManuscriptChunk[] }
>();

export function clearManuscriptCache(): void {
  inventoryCache.clear();
  textCache.clear();
}

function createServiceClient(env: RagEnvironment): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapDocument(row: Record<string, unknown>): ManuscriptDocument | null {
  const id = text(row.id);
  const title = text(row.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    sourcePath: text(row.source_path),
    sourceSha256: text(row.source_sha256),
    parserVersion: text(row.parser_version),
    chunkerVersion: text(row.chunker_version),
    embeddingModel: text(row.embedding_model),
    accessClass: row.access_class === 'public' ? 'public' : 'owner',
    chunkCount: Number(row.chunk_count || 0),
    sourceCharCount: Number(row.source_char_count || 0),
    sourceType: text(row.source_type) || 'manuscript',
    ingestionStatus: text(row.ingestion_status) || null,
    extractionStatus: text(row.extraction_status) || null,
    updatedAt: text(row.updated_at) || null,
    metadata: object(row.metadata),
  };
}

function mapMeta(row: Record<string, unknown>): ManuscriptChunkMeta | null {
  if (typeof row.id !== 'string' || typeof row.chunk_index !== 'number') return null;
  if (typeof row.content === 'string' && !row.content.trim()) return null;

  return {
    chunkId: row.id,
    chunkIndex: row.chunk_index,
    sectionIndex: typeof row.section_index === 'number' ? row.section_index : 0,
    heading: text(row.heading),
    sectionPath: Array.isArray(row.section_path)
      ? row.section_path.filter((part): part is string => typeof part === 'string')
      : [],
    charStart: Number(row.char_start || 0),
    charEnd: Number(row.char_end || 0),
    lineStart: Number(row.line_start || 0),
    lineEnd: Number(row.line_end || 0),
  };
}

function mapChunk(row: Record<string, unknown>): ManuscriptChunk | null {
  const meta = mapMeta(row);
  if (!meta || typeof row.content !== 'string' || !row.content.trim()) return null;
  return { ...meta, content: row.content };
}

export async function getManuscriptDocument(input: {
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  documentId?: string;
} = {}): Promise<ManuscriptDocument> {
  const env = input.env ?? process.env;
  const store = input.store ?? createServiceClient(env);
  if (!store) throw new ManuscriptDataError('unavailable');

  const { data, error } = await store
    .from('knowledge_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('id', input.documentId || UNFRAMED_MANUSCRIPT_ID)
    .maybeSingle();

  if (error) throw new ManuscriptDataError('query_failed', error.message);
  if (!data) throw new ManuscriptDataError('not_found');

  const document = mapDocument(data as Record<string, unknown>);
  if (!document) throw new ManuscriptDataError('not_found');

  if (document.ingestionStatus && document.ingestionStatus !== 'completed') {
    throw new ManuscriptDataError(
      'ingestion_incomplete',
      `ingestion_status=${document.ingestionStatus}`
    );
  }

  return document;
}

async function fetchChunkPage(input: {
  store: SupabaseClient;
  documentId: string;
  includeContent: boolean;
  from: number;
  to: number;
}): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await input.store
    .from('knowledge_chunks')
    .select(input.includeContent ? TEXT_COLUMNS : META_COLUMNS)
    .eq('document_id', input.documentId)
    .eq('access_class', 'owner')
    .order('chunk_index', { ascending: true })
    .range(input.from, input.to);

  if (error) throw new ManuscriptDataError('query_failed', error.message);
  if (!Array.isArray(data)) throw new ManuscriptDataError('query_failed');
  return data as unknown as Array<Record<string, unknown>>;
}

async function fetchAllInventoryRows(input: {
  store: SupabaseClient;
  document: ManuscriptDocument;
}): Promise<ManuscriptChunkMeta[]> {
  const pageSize = 250;
  const rows: ManuscriptChunkMeta[] = [];

  // The manuscript is currently 169 chunks. The loop is bounded so a corrupted
  // row count cannot turn a conversation request into an unbounded scan.
  for (let from = 0; from < 2_000; from += pageSize) {
    const page = await fetchChunkPage({
      store: input.store,
      documentId: input.document.id,
      includeContent: false,
      from,
      to: from + pageSize - 1,
    });

    for (const row of page) {
      const meta = mapMeta(row);
      if (meta) rows.push(meta);
    }

    if (page.length < pageSize) break;
  }

  if (rows.length === 0 && input.document.chunkCount > 0) {
    throw new ManuscriptDataError('query_failed');
  }

  return rows;
}

function storeScope(store: SupabaseClient): string {
  const value = store as unknown as { supabaseUrl?: unknown; rest?: { url?: unknown } };
  return typeof value.supabaseUrl === 'string'
    ? value.supabaseUrl
    : typeof value.rest?.url === 'string'
      ? value.rest.url
      : 'injected';
}

export async function loadManuscriptInventory(input: {
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  documentId?: string;
  useCache?: boolean;
} = {}): Promise<ManuscriptInventory> {
  const env = input.env ?? process.env;
  const store = input.store ?? createServiceClient(env);
  if (!store) throw new ManuscriptDataError('unavailable');
  const documentId = input.documentId || UNFRAMED_MANUSCRIPT_ID;
  const cacheKey = `${documentId}:${storeScope(store)}`;
  const useCache = input.useCache !== false;
  const cached = inventoryCache.get(cacheKey);

  if (useCache && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = (async (): Promise<ManuscriptInventory> => {
    const document = await getManuscriptDocument({ store, env, documentId });
    const chunks = await fetchAllInventoryRows({ store, document });
    const structure = buildManuscriptStructure({
      chunks,
      sourceCharCount: document.sourceCharCount,
      expectedChunkCount: document.chunkCount,
    });

    return {
      document,
      chunks,
      structure,
      coverage: structure.coverage,
      loadedAt: new Date().toISOString(),
    };
  })();

  if (useCache) {
    inventoryCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    value.catch(() => inventoryCache.delete(cacheKey));
  }

  return value;
}

async function loadChunkText(input: {
  store: SupabaseClient;
  documentId: string;
  fromChunk: number;
  toChunk: number;
}): Promise<ManuscriptChunk[]> {
  const pageSize = 40;
  const chunks: ManuscriptChunk[] = [];

  for (let index = input.fromChunk; index <= input.toChunk; index += pageSize) {
    const end = Math.min(input.toChunk, index + pageSize - 1);
    const { data, error } = await input.store
      .from('knowledge_chunks')
      .select(TEXT_COLUMNS)
      .eq('document_id', input.documentId)
      .eq('access_class', 'owner')
      .gte('chunk_index', index)
      .lte('chunk_index', end)
      .order('chunk_index', { ascending: true });

    if (error) throw new ManuscriptDataError('query_failed', error.message);
    if (!Array.isArray(data)) throw new ManuscriptDataError('query_failed');

    for (const row of data as Array<Record<string, unknown>>) {
      const chunk = mapChunk(row);
      if (chunk) chunks.push(chunk);
    }
  }

  const unique = new Map<number, ManuscriptChunk>();
  for (const chunk of chunks) unique.set(chunk.chunkIndex, chunk);

  return Array.from(unique.values()).sort((left, right) => left.chunkIndex - right.chunkIndex);
}

export async function loadManuscriptText(input: {
  inventory?: ManuscriptInventory;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  fromChunk?: number;
  toChunk?: number;
  useCache?: boolean;
} = {}): Promise<ManuscriptChunk[]> {
  const env = input.env ?? process.env;
  const store = input.store ?? createServiceClient(env);
  if (!store) throw new ManuscriptDataError('unavailable');
  const inventory = input.inventory ?? (await loadManuscriptInventory({ store, env }));
  const fromChunk = Math.max(0, input.fromChunk ?? 0);
  const toChunk = Math.min(
    inventory.chunks[inventory.chunks.length - 1]?.chunkIndex ?? 0,
    input.toChunk ?? Number.MAX_SAFE_INTEGER
  );
  const useCache = input.useCache !== false;

  if (fromChunk > toChunk) return [];

  const key = `${inventory.document.id}:${storeScope(store)}:${fromChunk}:${toChunk}`;
  const cached = textCache.get(key);
  if (useCache && cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loadChunkText({
    store,
    documentId: inventory.document.id,
    fromChunk,
    toChunk,
  });

  if (useCache) {
    textCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    // Keep the cache bounded. Deep reading can touch many ranges.
    if (textCache.size > 32) {
      const oldest = textCache.keys().next().value;
      if (oldest) textCache.delete(oldest);
    }
  }

  return value;
}

export async function loadChapterText(input: {
  inventory: ManuscriptInventory;
  chapter: ManuscriptChapter;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
}): Promise<{ chunks: ManuscriptChunk[]; coverage: ManuscriptCoverage; missing: number[] }> {
  const chunks = await loadManuscriptText({
    inventory: input.inventory,
    store: input.store,
    env: input.env,
    fromChunk: input.chapter.startChunkIndex,
    toChunk: input.chapter.endChunkIndex,
  });
  const expected = input.chapter.endChunkIndex - input.chapter.startChunkIndex + 1;
  const present = new Set(chunks.map((chunk) => chunk.chunkIndex));
  const missing: number[] = [];
  for (let index = input.chapter.startChunkIndex; index <= input.chapter.endChunkIndex; index += 1) {
    if (!present.has(index)) missing.push(index);
  }
  const meta = chunks.map((chunk) => ({
    ...chunk,
    chunkIndex: chunk.chunkIndex - input.chapter.startChunkIndex,
    charStart: chunk.charStart - input.chapter.charStart,
    charEnd: chunk.charEnd - input.chapter.charStart,
  }));
  const coveragemeta = meta.map(({ content: _chunkContent, ...rest }) => rest);
  const coverage = buildManuscriptStructure({
    chunks: coveragemeta,
    sourceCharCount: input.chapter.charEnd - input.chapter.charStart,
    expectedChunkCount: expected,
  }).coverage;

  return { chunks, coverage, missing };
}

/** Query terms without language-specific stemming. Short words are kept for
 * exact phrase search; lexical SQL uses a 4+ character root for inflection. */
export function manuscriptSearchTerms(query: string): string[] {
  const stop = new Set([
    'that',
    'this',
    'with',
    'from',
    'about',
    'what',
    'when',
    'where',
    'which',
    'find',
    'show',
    'book',
    'manuscript',
    'unframed',
    'chapter',
    'глава',
    'главе',
    'главу',
    'книга',
    'книге',
    'книгу',
    'книги',
    'найди',
    'покажи',
    'прочитай',
    'перечитай',
    'все',
    'весь',
    'всю',
    'the',
    'and',
    'for',
    'и',
    'в',
    'во',
    'на',
    'с',
    'по',
    'про',
  ]);

  const terms = (query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [])
    .map((term) => term.replace(/^[-’']+|[-’']+$/g, ''))
    .filter((term) => term.length >= 3 && !stop.has(term));

  return Array.from(new Set(terms)).slice(0, 12);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The manuscript is written in English while the owner often searches in
 * Russian. These are conservative lexical bridges for recurring proper nouns
 * and themes, used only when the semantic channel is unavailable or returns
 * too little. They are not translations of the whole query and never replace
 * the source.
 */
const MANUSCRIPT_TERM_ALIASES: Record<string, string[]> = {
  лондон: ['London'],
  лондоне: ['London'],
  лондона: ['London'],
  москва: ['Moscow'],
  москве: ['Moscow'],
  москвы: ['Moscow'],
  берлин: ['Berlin'],
  париж: ['Paris'],
  нью: ['New York'],
  йорк: ['New York'],
  израил: ['Israel'],
  израиле: ['Israel'],
  армени: ['Armenia'],
  ереван: ['Yerevan'],
  грузи: ['Georgia'],
  тбилиси: ['Tbilisi'],
  украин: ['Ukraine'],
  киев: ['Kyiv', 'Kiev'],
  росси: ['Russia'],
  америк: ['America'],
  англи: ['England', 'Britain'],
  британи: ['Britain'],
  виза: ['visa'],
  визы: ['visa'],
  аэропорт: ['airport'],
  тюрьм: ['prison', 'cell'],
  арест: ['arrest'],
  суд: ['court'],
  наркотик: ['drugs'],
  героин: ['heroin'],
  бизнес: ['business'],
  интернет: ['internet'],
  модем: ['modem'],
  фидонет: ['FidoNet'],
  жж: ['LiveJournal'],
  livejournal: ['LiveJournal'],
  твиттер: ['Twitter'],
  фейсбук: ['Facebook'],
  инстаграм: ['Instagram'],
  клубхаус: ['Clubhouse'],
  крипт: ['crypto'],
  биткоин: ['Bitcoin'],
  блокчейн: ['blockchain'],
  нфт: ['NFT'],
  сми: ['media'],
  журналист: ['journalist', 'journalism'],
  газет: ['newspaper', 'Novaya Gazeta'],
  фотографи: ['photography', 'photographer'],
  выставк: ['exhibition'],
  ярмарк: ['fair'],
  искусств: ['art'],
  сердц: ['heart', 'Hearts'],
  ангел: ['Angel'],
  наследств: ['heritage', 'legacy'],
  прадед: ['great-grandfather'],
  ленин: ['Lenin'],
  скульптор: ['sculptor'],
  смерт: ['death'],
  любов: ['love'],
  семья: ['family'],
  семье: ['family'],
  отец: ['father'],
  мать: ['mother'],
  война: ['war'],
  путин: ['Putin'],
  навальн: ['Navalny'],
  протест: ['protest'],
  эмиграц: ['emigration', 'exit'],
  тигр: ['Tiger'],
  спектральн: ['Spectral'],
  варкрафт: ['Warcraft'],
  аукцион: ['Auction House', 'auction'],
  железн: ['Ironforge'],
};

function expandManuscriptTerms(terms: string[]): string[] {
  const expanded: string[] = [];
  for (const term of terms) {
    const lower = term.toLowerCase();
    expanded.push(term);
    for (const [key, aliases] of Object.entries(MANUSCRIPT_TERM_ALIASES)) {
      if (lower === key || lower.startsWith(key) || key.startsWith(lower)) {
        expanded.push(...aliases);
      }
    }
  }
  return Array.from(new Set(expanded)).slice(0, 24);
}

function excerptAround(content: string, terms: string[], max = 700): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const lower = clean.toLowerCase();
  const index = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right)[0];

  if (index === undefined) return `${clean.slice(0, max - 1).trimEnd()}…`;
  const start = Math.max(0, index - Math.floor(max / 3));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + max).trim()}${start + max < clean.length ? '…' : ''}`;
}

function chapterForChunk(
  structure: ManuscriptStructure,
  chunk: ManuscriptChunkMeta
): ManuscriptChapter | null {
  return (
    structure.chapters.find(
      (chapter) =>
        chunk.chunkIndex >= chapter.startChunkIndex &&
        chunk.chunkIndex <= chapter.endChunkIndex
    ) || null
  );
}

export async function searchManuscriptLexical(input: {
  inventory: ManuscriptInventory;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  query: string;
  limit?: number;
  exactPhrase?: string | null;
}): Promise<ManuscriptSearchHit[]> {
  const env = input.env ?? process.env;
  const store = input.store ?? createServiceClient(env);
  if (!store) throw new ManuscriptDataError('unavailable');

  const rawTerms = manuscriptSearchTerms(input.query);
  const terms = expandManuscriptTerms(rawTerms);
  const exact = (input.exactPhrase || '').trim();
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 80);

  if (terms.length === 0 && exact.length < 3) return [];

  const patterns = new Set<string>();
  for (const term of terms.slice(0, 8)) {
    const root = term.length > 6 ? term.slice(0, Math.max(4, term.length - 2)) : term;
    patterns.add(`content.ilike.%${escapeLike(root)}%`);
    patterns.add(`heading.ilike.%${escapeLike(root)}%`);
  }
  if (exact.length >= 3) patterns.add(`content.ilike.%${escapeLike(exact)}%`);

  const { data, error } = await store
    .from('knowledge_chunks')
    .select(TEXT_COLUMNS)
    .eq('document_id', input.inventory.document.id)
    .eq('access_class', 'owner')
    .or(Array.from(patterns).join(','))
    .order('chunk_index', { ascending: true })
    .limit(limit);

  if (error) throw new ManuscriptDataError('query_failed', error.message);
  if (!Array.isArray(data)) throw new ManuscriptDataError('query_failed');

  const hits: ManuscriptSearchHit[] = [];
  for (const row of data as Array<Record<string, unknown>>) {
    const chunk = mapChunk(row);
    if (!chunk) continue;
    const contentLower = `${chunk.heading}\n${chunk.content}`.toLowerCase();
    const matched = terms.filter((term) => contentLower.includes(term.toLowerCase()));
    const exactHit = exact.length >= 3 && contentLower.includes(exact.toLowerCase());
    const score = Math.min(
      1,
      (exactHit ? 0.45 : 0) +
        matched.length / Math.max(1, rawTerms.length || terms.length) * 0.45 +
        (chunk.heading.toLowerCase().includes(exact.toLowerCase()) ? 0.1 : 0)
    );

    hits.push({
      chunk: {
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        sectionIndex: chunk.sectionIndex,
        heading: chunk.heading,
        sectionPath: chunk.sectionPath,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
      },
      excerpt: excerptAround(chunk.content, exactHit ? [exact, ...terms] : terms),
      method: exactHit ? 'exact_phrase' : 'lexical',
      score: Number(score.toFixed(4)),
      chapter: chapterForChunk(input.inventory.structure, chunk),
    });
  }

  return hits.sort((left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex);
}

export type ManuscriptSemanticSearchOutcome = {
  available: boolean;
  code?: string;
  hits: ManuscriptSearchHit[];
};

export async function searchManuscriptSemantic(input: {
  inventory: ManuscriptInventory;
  env?: RagEnvironment;
  query: string;
  limit?: number;
  embeddingClient?: {
    modelId: string;
    dimensions: number;
    embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  } | null;
  search?: ReturnType<typeof createSupabaseBrainSearch>;
}): Promise<ManuscriptSemanticSearchOutcome> {
  const env = input.env ?? process.env;
  const query = input.query.trim().slice(0, BRAIN_RAG_MAX_QUERY_CHARS);
  if (!query) return { available: false, code: 'invalid_query', hits: [] };

  try {
    const config = resolveUnframedEmbeddingConfig(env);
    const client = input.embeddingClient ?? createOpenRouterEmbeddingClientFromEnv(env);
    const search = input.search ?? createSupabaseBrainSearch(env);
    if (!search) return { available: false, code: 'database_unavailable', hits: [] };

    const vectors = await client.embed([query]);
    if (!Array.isArray(vectors) || vectors.length !== 1) {
      return { available: false, code: 'embedding_failed', hits: [] };
    }

    const rows = await search({
      queryEmbedding: vectors[0],
      modelId: config.modelId,
      dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
      accessClass: 'owner',
      documentId: input.inventory.document.id,
      documentIds: [input.inventory.document.id],
      topK: Math.min(Math.max(input.limit ?? 30, 1), 60),
      matchCount: Math.min(Math.max((input.limit ?? 30) * 2, 40), 60),
      minSimilarity: -1,
      queryText: manuscriptSearchTerms(query).join(' ') || query,
    });

    const hits: ManuscriptSearchHit[] = [];
    for (const row of rows) {
      if (row.document_id !== input.inventory.document.id) continue;
      const meta = input.inventory.chunks.find((chunk) => chunk.chunkId === row.chunk_id);
      if (!meta) continue;
      hits.push({
        chunk: meta,
        excerpt: excerptAround(row.content, manuscriptSearchTerms(query)),
        method: 'semantic',
        score: Number(row.similarity.toFixed(4)),
        chapter: chapterForChunk(input.inventory.structure, meta),
      });
    }

    return { available: true, hits };
  } catch (error) {
    return {
      available: false,
      code: error instanceof Error ? error.name || 'embedding_failed' : 'embedding_failed',
      hits: [],
    };
  }
}

/**
 * Merge lexical and semantic hits without returning the same four chunks over
 * and over. Diversity is explicit: one chunk per position, at most two chunks
 * per chapter in the first pass, then a second pass if the caller asks for broad
 * coverage.
 */
export function mergeManuscriptHits(input: {
  lexical: ManuscriptSearchHit[];
  semantic: ManuscriptSearchHit[];
  limit?: number;
  maxPerChapter?: number;
}): ManuscriptSearchHit[] {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 60);
  const maxPerChapter = Math.max(1, input.maxPerChapter ?? 2);
  const merged = new Map<string, ManuscriptSearchHit>();

  for (const hit of [...input.lexical, ...input.semantic]) {
    const existing = merged.get(hit.chunk.chunkId);
    if (!existing) {
      merged.set(hit.chunk.chunkId, hit);
      continue;
    }
    merged.set(hit.chunk.chunkId, {
      ...existing,
      score: Math.max(existing.score, hit.score),
      method: existing.method === hit.method ? existing.method : 'semantic',
    });
  }

  const sorted = Array.from(merged.values()).sort(
    (left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex
  );
  const selected: ManuscriptSearchHit[] = [];
  const perChapter = new Map<string, number>();

  for (const hit of sorted) {
    const key = hit.chapter?.key || `chunk:${hit.chunk.chunkIndex}`;
    const count = perChapter.get(key) || 0;
    if (count >= maxPerChapter) continue;
    selected.push(hit);
    perChapter.set(key, count + 1);
    if (selected.length >= limit) break;
  }

  // A broad request should not stop at two chapters. Add the remaining strong
  // hits in score order, still without duplicates.
  if (selected.length < limit) {
    for (const hit of sorted) {
      if (selected.some((item) => item.chunk.chunkId === hit.chunk.chunkId)) continue;
      selected.push(hit);
      if (selected.length >= limit) break;
    }
  }

  return selected.sort(
    (left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex
  );
}

export async function loadManuscriptChunksByIds(input: {
  inventory: ManuscriptInventory;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  chunkIds: string[];
}): Promise<ManuscriptChunk[]> {
  const store = input.store ?? createServiceClient(input.env ?? process.env);
  if (!store) throw new ManuscriptDataError('unavailable');
  const ids = Array.from(new Set(input.chunkIds.filter(Boolean))).slice(0, 80);
  if (ids.length === 0) return [];

  const { data, error } = await store
    .from('knowledge_chunks')
    .select(TEXT_COLUMNS)
    .eq('document_id', input.inventory.document.id)
    .eq('access_class', 'owner')
    .in('id', ids);

  if (error) throw new ManuscriptDataError('query_failed', error.message);
  if (!Array.isArray(data)) throw new ManuscriptDataError('query_failed');

  return (data as Array<Record<string, unknown>>)
    .map(mapChunk)
    .filter((chunk): chunk is ManuscriptChunk => chunk !== null)
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
}

/** Find an exact phrase across the manuscript. Quotations are never
 * reconstructed from model memory: this returns the source chunk and offsets. */
export async function findManuscriptPhrase(input: {
  inventory: ManuscriptInventory;
  store?: SupabaseClient | null;
  env?: RagEnvironment;
  phrase: string;
  limit?: number;
}): Promise<{
  phrase: string;
  matches: Array<{
    chunkId: string;
    chunkIndex: number;
    heading: string;
    sectionPath: string[];
    charStart: number;
    charEnd: number;
    lineStart: number;
    lineEnd: number;
    passage: string;
    passageCharStart: number;
    passageCharEnd: number;
  }>;
}> {
  const phrase = input.phrase.replace(/\s+/g, ' ').trim();
  if (phrase.length < 3) return { phrase, matches: [] };

  const store = input.store ?? createServiceClient(input.env ?? process.env);
  if (!store) throw new ManuscriptDataError('unavailable');

  const { data, error } = await store
    .from('knowledge_chunks')
    .select(TEXT_COLUMNS)
    .eq('document_id', input.inventory.document.id)
    .eq('access_class', 'owner')
    .ilike('content', `%${escapeLike(phrase)}%`)
    .order('chunk_index', { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 8, 1), 20));

  if (error) throw new ManuscriptDataError('query_failed', error.message);
  if (!Array.isArray(data)) throw new ManuscriptDataError('query_failed');

  const matches: Array<{
    chunkId: string;
    chunkIndex: number;
    heading: string;
    sectionPath: string[];
    charStart: number;
    charEnd: number;
    lineStart: number;
    lineEnd: number;
    passage: string;
    passageCharStart: number;
    passageCharEnd: number;
  }> = [];

  for (const row of data as Array<Record<string, unknown>>) {
    const chunk = mapChunk(row);
    if (!chunk) continue;
    const lower = chunk.content.toLowerCase();
    const target = phrase.toLowerCase();
    let from = 0;

    while (matches.length < (input.limit ?? 8)) {
      const found = lower.indexOf(target, from);
      if (found < 0) break;
      const passageStart = Math.max(0, found - 240);
      const passageEnd = Math.min(chunk.content.length, found + phrase.length + 360);
      matches.push({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading,
        sectionPath: chunk.sectionPath,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        passage: chunk.content.slice(passageStart, passageEnd).trim(),
        passageCharStart: chunk.charStart + passageStart,
        passageCharEnd: chunk.charStart + passageEnd,
      });
      from = found + Math.max(1, phrase.length);
    }
  }

  return { phrase, matches };
}
