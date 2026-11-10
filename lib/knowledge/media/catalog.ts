import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/knowledge/media/catalog');

import { buildDocumentText } from '@/lib/knowledge/media/intelligence';
import { mediaQuery } from '@/lib/knowledge/media/database';
import { inferMediaCountry } from '@/lib/knowledge/media/country';

/** Own authored archive material. External coverage is every other kind. */
export const MEDIA_OWN_KINDS = ['column', 'blog'] as const;
/**
 * "Own" requires positive authorship evidence. A publication imported with
 * kind=blog but a different document author (for example an Italian art
 * history article) must not be counted as Anton's own column.
 */
export const MEDIA_OWN_SQL = `(
  lower(m.kind) IN ('column', 'blog')
  AND (
    coalesce(m.author, '') ILIKE '%меркуров%'
    OR coalesce(m.author, '') ILIKE '%merkurov%'
    OR coalesce(d.author, '') ILIKE '%меркуров%'
    OR coalesce(d.author, '') ILIKE '%merkurov%'
    OR (
      coalesce(m.author, '') = ''
      AND coalesce(d.author, '') = ''
      AND lower(m.outlet) IN ('ретроградный меркуров', 'новая газета')
    )
  )
)`;
export const MEDIA_MENTION_SQL = `(NOT ${MEDIA_OWN_SQL})`;
export const MEDIA_MENTION_KINDS = [
  'mention',
  'quote',
  'interview',
  'profile',
  'radio',
  'video',
  'republication',
] as const;

export type MediaScope = 'all' | 'own' | 'mentions';

export type MediaCatalogFilters = {
  scope?: MediaScope;
  from?: string | null;
  to?: string | null;
  year?: number | null;
  month?: number | null;
  outlet?: string | null;
  language?: string | null;
  topic?: string | null;
  kind?: string | null;
  author?: string | null;
  title?: string | null;
  query?: string | null;
  status?: 'published' | 'draft' | 'all' | null;
  foreign?: boolean;
};

export type MediaProvenance = {
  source: 'media_archive_records' | 'knowledge_documents' | 'semantic_search';
  mode: 'sql_catalog' | 'sql_aggregate' | 'metadata_search' | 'semantic_search';
  totalMatching: number;
  returned: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  complete: boolean;
  filters: MediaCatalogFilters;
  caveats: string[];
  generatedAt: string;
};

export type MediaCatalogRow = {
  id: string;
  title: string;
  outlet: string;
  canonicalUrl: string;
  url: string;
  slug: string | null;
  publishedDate: string | null;
  language: string | null;
  kind: string | null;
  topic: string | null;
  author: string | null;
  status: string;
  indexingStatus: string | null;
  indexingError: string | null;
  documentId: string | null;
  coverageStatus: string | null;
  textQuality: string | null;
  chunkCount: number;
  sourceCharCount: number;
  country: string | null;
};

export type MediaCatalogList = {
  items: MediaCatalogRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  provenance: MediaProvenance;
};

export type MediaGroupCount = { key: string; count: number };

export type MediaArchiveStats = {
  total: number;
  published: number;
  draft: number;
  own: number;
  mentions: number;
  outlets: number;
  unknownDates: number;
  range: { from: string | null; to: string | null };
  byYear: MediaGroupCount[];
  byOutlet: MediaGroupCount[];
  byKind: MediaGroupCount[];
  byLanguage: MediaGroupCount[];
  byTopic: MediaGroupCount[];
  coverage: {
    fullText: number;
    partialText: number;
    metadataOnly: number;
    blocked: number;
    missingDocument: number;
  };
  indexing: {
    completed: number;
    failed: number;
    partial: number;
    blocked: number;
    notIndexed: number;
  };
  documents: {
    withChunks: number;
    withoutChunks: number;
    failedIngestion: number;
    embeddingMissing: number;
  };
  analysis: {
    runsCompleted: number;
    runsFailed: number;
    quotes: number;
    currentQuotes: number;
    topics: number;
    entities: number;
    relations: number;
  };
  provenance: MediaProvenance;
};

type CountRow = { key: string | null; count: string | number };

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function asCount(value: string | number | null | undefined): number {
  return typeof value === 'number' ? value : Number.parseInt(String(value ?? '0'), 10) || 0;
}

function normalizedFilters(filters: MediaCatalogFilters): MediaCatalogFilters {
  const scope: MediaScope =
    filters.scope === 'own' || filters.scope === 'mentions' ? filters.scope : 'all';
  const status =
    filters.status === 'draft' || filters.status === 'published' || filters.status === 'all'
      ? filters.status
      : 'published';

  return {
    ...filters,
    scope,
    status,
    year: filters.year ? clampInt(filters.year, new Date().getUTCFullYear(), 1900, 2200) : null,
    month: filters.month ? clampInt(filters.month, 1, 1, 12) : null,
    from: filters.from || null,
    to: filters.to || null,
    outlet: filters.outlet?.trim() || null,
    language: filters.language?.trim().toUpperCase() || null,
    topic: filters.topic?.trim() || null,
    kind: filters.kind?.trim().toLowerCase() || null,
    author: filters.author?.trim() || null,
    title: filters.title?.trim() || null,
    query: filters.query?.trim() || null,
    foreign: filters.foreign === true,
  };
}

type WhereParts = {
  joinSql: string;
  whereSql: string;
  params: unknown[];
  filters: MediaCatalogFilters;
};

function buildWhere(input: MediaCatalogFilters): WhereParts {
  const filters = normalizedFilters(input);
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.status === 'published') clauses.push(`m.status = 'published'`);
  else if (filters.status === 'draft') clauses.push(`m.status = 'draft'`);

  if (filters.scope === 'own') {
    clauses.push(MEDIA_OWN_SQL);
  } else if (filters.scope === 'mentions') {
    clauses.push(MEDIA_MENTION_SQL);
  }

  if (filters.from) clauses.push(`m.published_date >= ${add(filters.from)}::date`);
  if (filters.to) clauses.push(`m.published_date <= ${add(filters.to)}::date`);
  if (filters.year) clauses.push(`extract(year from m.published_date) = ${add(filters.year)}::int`);
  if (filters.month) {
    clauses.push(`extract(month from m.published_date) = ${add(filters.month)}::int`);
  }

  const outletToken = filters.outlet ? add(filters.outlet.toLowerCase()) : null;
  if (outletToken) {
    clauses.push(`(lower(m.outlet) = ${outletToken} OR lower(m.outlet) LIKE '%' || ${outletToken} || '%')`);
  }

  if (filters.language) {
    // Language is stored inconsistently (RU, ru, EN, bs); compare upper-case.
    clauses.push(
      `upper(coalesce(nullif(d.language, ''), nullif(m.lang, ''))) = ${add(filters.language)}`
    );
  }

  if (filters.foreign) {
    clauses.push(
      `upper(coalesce(nullif(d.language, ''), nullif(m.lang, ''))) <> 'RU'`
    );
  }

  if (filters.topic) {
    clauses.push(`coalesce(t.primary_topic, m.topic) = ${add(filters.topic)}`);
  }

  if (filters.kind) clauses.push(`lower(m.kind) = ${add(filters.kind)}`);

  if (filters.author) {
    clauses.push(`coalesce(m.author, d.author, '') ILIKE '%' || ${add(filters.author)} || '%'`);
  }

  if (filters.title) {
    clauses.push(`m.title ILIKE '%' || ${add(filters.title)} || '%'`);
  }

  if (filters.query) {
    const token = add(filters.query);
    clauses.push(`(
      m.title ILIKE '%' || ${token} || '%'
      OR m.summary ILIKE '%' || ${token} || '%'
      OR m.outlet ILIKE '%' || ${token} || '%'
      OR m.canonical_url ILIKE '%' || ${token} || '%'
      OR d.title ILIKE '%' || ${token} || '%'
    )`);
  }

  return {
    joinSql: `
      LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id
      LEFT JOIN LATERAL (
        SELECT topic.primary_topic
        FROM public.media_analysis_topics topic
        WHERE topic.media_record_id = m.id AND topic.is_current = true
        ORDER BY topic.created_at DESC
        LIMIT 1
      ) t ON true
    `,
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    filters,
  };
}

const ROW_SELECT = `
  m.id::text AS id,
  m.title,
  m.outlet,
  m.canonical_url,
  m.url,
  m.published_date::text AS published_date,
  nullif(m.ai_metadata->>'slug', '') AS slug,
  coalesce(nullif(d.language, ''), nullif(m.lang, '')) AS language,
  m.kind,
  m.topic,
  m.author,
  m.status,
  m.indexing_status,
  m.indexing_error,
  d.id AS document_id,
  d.media_coverage_status,
  d.media_text_quality,
  coalesce(d.chunk_count, 0)::int AS chunk_count,
  coalesce(d.source_char_count, 0)::int AS source_char_count,
  nullif(m.ai_metadata->>'country', '') AS country
`;

function mapRow(row: Record<string, unknown>): MediaCatalogRow {
  const canonicalUrl = String(row.canonical_url || row.url || '');
  return {
    id: String(row.id),
    title: String(row.title || 'Untitled publication'),
    outlet: String(row.outlet || 'Unknown outlet'),
    canonicalUrl,
    url: String(row.url || canonicalUrl),
    slug: row.slug ? String(row.slug) : null,
    publishedDate: row.published_date ? String(row.published_date) : null,
    language: row.language ? String(row.language) : null,
    kind: row.kind ? String(row.kind) : null,
    topic: row.topic ? String(row.topic) : null,
    author: row.author ? String(row.author) : null,
    status: String(row.status || 'published'),
    indexingStatus: row.indexing_status ? String(row.indexing_status) : null,
    indexingError: row.indexing_error ? String(row.indexing_error) : null,
    documentId: row.document_id ? String(row.document_id) : null,
    coverageStatus: row.media_coverage_status ? String(row.media_coverage_status) : null,
    textQuality: row.media_text_quality ? String(row.media_text_quality) : null,
    chunkCount: asCount(row.chunk_count as string | number | null),
    sourceCharCount: asCount(row.source_char_count as string | number | null),
    country: inferMediaCountry({
      explicit: row.country ? String(row.country) : null,
      outlet: row.outlet ? String(row.outlet) : null,
      url: canonicalUrl,
    }),
  };
}

function provenance(
  filters: MediaCatalogFilters,
  input: {
    source: MediaProvenance['source'];
    mode: MediaProvenance['mode'];
    totalMatching: number;
    returned: number;
    page?: number;
    pageSize?: number;
    caveats?: string[];
  }
): MediaProvenance {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? input.returned;
  const hasMore = page * pageSize < input.totalMatching;

  return {
    source: input.source,
    mode: input.mode,
    totalMatching: input.totalMatching,
    returned: input.returned,
    page,
    pageSize,
    hasMore,
    complete: !hasMore && input.returned >= input.totalMatching,
    filters,
    caveats: input.caveats ?? [],
    generatedAt: new Date().toISOString(),
  };
}

export async function listMediaCatalog(input: {
  filters?: MediaCatalogFilters;
  page?: number;
  pageSize?: number;
} = {}): Promise<MediaCatalogList> {
  const filters = normalizedFilters(input.filters ?? {});
  const page = clampInt(input.page, 1, 1, 100_000);
  const pageSize = clampInt(input.pageSize, 50, 1, 200);
  const { joinSql, whereSql, params } = buildWhere(filters);
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;

  const [rows, totals] = await Promise.all([
    mediaQuery<Record<string, unknown>>(
      `SELECT ${ROW_SELECT}
       FROM public.media_archive_records m
       ${joinSql}
       ${whereSql}
       ORDER BY m.published_date DESC NULLS LAST, m.title ASC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      [...params, limit, offset]
    ),
    mediaQuery<{ total: string | number }>(
      `SELECT count(*)::int AS total
       FROM public.media_archive_records m
       ${joinSql}
       ${whereSql}`,
      params
    ),
  ]);

  const total = asCount(totals[0]?.total);
  const items = rows.map(mapRow);

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
    provenance: provenance(filters, {
      source: 'media_archive_records',
      mode: filters.title || filters.query ? 'metadata_search' : 'sql_catalog',
      totalMatching: total,
      returned: items.length,
      page,
      pageSize,
      caveats:
        total > items.length
          ? [`Показана страница ${page}; всего под фильтр попадает ${total} записей.`]
          : [],
    }),
  };
}

async function groupCounts(
  select: string,
  filters: MediaCatalogFilters,
  limit = 50
): Promise<MediaGroupCount[]> {
  const { joinSql, whereSql, params } = buildWhere(filters);
  const rows = await mediaQuery<CountRow>(
    `SELECT ${select} AS key, count(*)::int AS count
     FROM public.media_archive_records m
     ${joinSql}
     ${whereSql}
     GROUP BY 1
     ORDER BY count DESC, key ASC
     LIMIT ${clampInt(limit, 50, 1, 500)}`,
    params
  );

  return rows.map((row) => ({
    key: row.key === null || row.key === undefined ? 'unknown' : String(row.key),
    count: asCount(row.count),
  }));
}

export async function getMediaArchiveStats(
  input: MediaCatalogFilters = {}
): Promise<MediaArchiveStats> {
  const filters = normalizedFilters(input);
  const { joinSql, whereSql, params } = buildWhere(filters);

  const [
    metricsRows,
    byYear,
    byOutlet,
    byKind,
    byLanguage,
    byTopic,
    coverageRows,
    indexingRows,
    documentRows,
    analysisRows,
  ] = await Promise.all([
    mediaQuery<Record<string, unknown>>(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE m.status = 'published')::int AS published,
         count(*) FILTER (WHERE m.status = 'draft')::int AS draft,
         count(*) FILTER (WHERE ${MEDIA_OWN_SQL})::int AS own,
         count(*) FILTER (WHERE ${MEDIA_MENTION_SQL})::int AS mentions,
         count(DISTINCT m.outlet)::int AS outlets,
         count(*) FILTER (WHERE m.published_date IS NULL)::int AS unknown_dates,
         min(m.published_date)::text AS min_date,
         max(m.published_date)::text AS max_date
       FROM public.media_archive_records m
       ${joinSql}
       ${whereSql}`,
      params
    ),
    groupCounts(`coalesce(extract(year from m.published_date)::text, 'unknown')`, filters, 100),
    groupCounts(`m.outlet`, filters, 60),
    groupCounts(`coalesce(m.kind, 'unknown')`, filters, 40),
    groupCounts(
      `upper(coalesce(nullif(d.language, ''), nullif(m.lang, ''), 'unknown'))`,
      filters,
      40
    ),
    groupCounts(`coalesce(t.primary_topic, m.topic, 'unknown')`, filters, 20),
    mediaQuery<Record<string, number | string>>(
      `SELECT
         count(*) FILTER (
           WHERE d.media_text_quality = 'full_text' AND coalesce(d.chunk_count, 0) > 0
         )::int AS full_text,
         count(*) FILTER (
           WHERE d.media_text_quality = 'partial_text' AND coalesce(d.chunk_count, 0) > 0
         )::int AS partial_text,
         count(*) FILTER (WHERE d.media_text_quality = 'metadata_only')::int AS metadata_only,
         count(*) FILTER (
           WHERE d.media_text_quality = 'blocked'
              OR d.media_coverage_status = 'blocked'
         )::int AS blocked,
         count(*) FILTER (WHERE d.id IS NULL)::int AS missing_document
       FROM public.media_archive_records m
       ${joinSql}
       ${whereSql}`,
      params
    ),
    mediaQuery<Record<string, number | string>>(
      `SELECT
         count(*) FILTER (WHERE m.indexing_status = 'completed')::int AS completed,
         count(*) FILTER (WHERE m.indexing_status = 'failed')::int AS failed,
         count(*) FILTER (WHERE m.indexing_status = 'partial')::int AS partial,
         count(*) FILTER (WHERE m.indexing_status = 'blocked')::int AS blocked,
         count(*) FILTER (WHERE m.indexing_status = 'not_indexed')::int AS not_indexed
       FROM public.media_archive_records m
       ${joinSql}
       ${whereSql}`,
      params
    ),
    mediaQuery<Record<string, number | string>>(
      `SELECT
         count(*) FILTER (WHERE coalesce(d.chunk_count, 0) > 0)::int AS with_chunks,
         count(*) FILTER (WHERE d.id IS NOT NULL AND coalesce(d.chunk_count, 0) = 0)::int AS without_chunks,
         count(*) FILTER (WHERE d.ingestion_status = 'failed')::int AS failed_ingestion,
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.knowledge_chunks c
             WHERE c.document_id = d.id AND c.embedding IS NULL
           )
         )::int AS embedding_missing
       FROM public.media_archive_records m
       ${joinSql}
       ${whereSql}`,
      params
    ),
    mediaQuery<Record<string, number | string>>(
      `SELECT
         (SELECT count(*)::int FROM public.media_analysis_runs r
           WHERE r.media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           ) AND r.status = 'completed') AS runs_completed,
         (SELECT count(*)::int FROM public.media_analysis_runs r
           WHERE r.media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           ) AND r.status = 'failed') AS runs_failed,
         (SELECT count(*)::int FROM public.media_quotes q
           WHERE q.media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           )) AS quotes,
         (SELECT count(*)::int FROM public.media_quotes q
           WHERE q.is_current AND q.media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           )) AS current_quotes,
         (SELECT count(*)::int FROM public.media_analysis_topics t2
           WHERE t2.is_current AND t2.media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           )) AS topics,
         (SELECT count(*)::int FROM public.media_analysis_entities e
           WHERE e.is_current AND e.media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           )) AS entities,
         (SELECT count(*)::int FROM public.media_record_relations rel
           WHERE rel.is_current AND rel.source_media_record_id IN (
             SELECT m.id FROM public.media_archive_records m ${joinSql} ${whereSql}
           )) AS relations`,
      params
    ),
  ]);

  const metrics = metricsRows[0] || {};
  const coverage = coverageRows[0] || {};
  const indexing = indexingRows[0] || {};
  const documents = documentRows[0] || {};
  const analysis = analysisRows[0] || {};

  return {
    total: asCount(metrics.total as string | number | null),
    published: asCount(metrics.published as string | number | null),
    draft: asCount(metrics.draft as string | number | null),
    own: asCount(metrics.own as string | number | null),
    mentions: asCount(metrics.mentions as string | number | null),
    outlets: asCount(metrics.outlets as string | number | null),
    unknownDates: asCount(metrics.unknown_dates as string | number | null),
    range: {
      from: metrics.min_date ? String(metrics.min_date) : null,
      to: metrics.max_date ? String(metrics.max_date) : null,
    },
    byYear: [...byYear].sort((left, right) => Number(right.key) - Number(left.key)),
    byOutlet: byOutlet.filter((row) => row.key !== 'Unknown outlet'),
    byKind,
    byLanguage,
    byTopic,
    coverage: {
      fullText: asCount(coverage.full_text as string | number | null),
      partialText: asCount(coverage.partial_text as string | number | null),
      metadataOnly: asCount(coverage.metadata_only as string | number | null),
      blocked: asCount(coverage.blocked as string | number | null),
      missingDocument: asCount(coverage.missing_document as string | number | null),
    },
    indexing: {
      completed: asCount(indexing.completed as string | number | null),
      failed: asCount(indexing.failed as string | number | null),
      partial: asCount(indexing.partial as string | number | null),
      blocked: asCount(indexing.blocked as string | number | null),
      notIndexed: asCount(indexing.not_indexed as string | number | null),
    },
    documents: {
      withChunks: asCount(documents.with_chunks as string | number | null),
      withoutChunks: asCount(documents.without_chunks as string | number | null),
      failedIngestion: asCount(documents.failed_ingestion as string | number | null),
      embeddingMissing: asCount(documents.embedding_missing as string | number | null),
    },
    analysis: {
      runsCompleted: asCount(analysis.runs_completed as string | number | null),
      runsFailed: asCount(analysis.runs_failed as string | number | null),
      quotes: asCount(analysis.quotes as string | number | null),
      currentQuotes: asCount(analysis.current_quotes as string | number | null),
      topics: asCount(analysis.topics as string | number | null),
      entities: asCount(analysis.entities as string | number | null),
      relations: asCount(analysis.relations as string | number | null),
    },
    provenance: provenance(filters, {
      source: 'media_archive_records',
      mode: 'sql_aggregate',
      totalMatching: asCount(metrics.total as string | number | null),
      returned: asCount(metrics.total as string | number | null),
      caveats: [],
    }),
  };
}

export async function findMediaRecords(input: {
  title?: string;
  query?: string;
  outlet?: string | null;
  limit?: number;
  status?: 'published' | 'draft' | 'all' | null;
}): Promise<MediaCatalogList> {
  return listMediaCatalog({
    filters: {
      title: input.title || null,
      query: input.query || null,
      outlet: input.outlet || null,
      status: input.status || 'published',
    },
    page: 1,
    pageSize: clampInt(input.limit, 20, 1, 100),
  });
}

export type MediaMentionSummary = {
  total: number;
  byOutlets: MediaGroupCount[];
  byYear: MediaGroupCount[];
  byKind: MediaGroupCount[];
  byLanguage: MediaGroupCount[];
  records: MediaCatalogRow[];
  provenance: MediaProvenance;
};

export async function getMediaMentionsSummary(input: {
  filters?: MediaCatalogFilters;
  limit?: number;
} = {}): Promise<MediaMentionSummary> {
  const filters = normalizedFilters({ ...input.filters, scope: 'mentions' });
  const [stats, records] = await Promise.all([
    getMediaArchiveStats(filters),
    listMediaCatalog({
      filters,
      page: 1,
      pageSize: clampInt(input.limit, 100, 1, 200),
    }),
  ]);

  return {
    total: stats.total,
    byOutlets: stats.byOutlet,
    byYear: stats.byYear,
    byKind: stats.byKind,
    byLanguage: stats.byLanguage,
    records: records.items,
    provenance: records.provenance,
  };
}

export type MediaQuoteView = {
  id: string;
  text: string;
  type: string;
  verificationStatus: string;
  attribution: string;
  confidence: number;
  language: string | null;
  translation: string | null;
  documentCharStart: number;
};

export type MediaRecordDetail = {
  record: MediaCatalogRow;
  metadata: {
    summary: string | null;
    imageUrl: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    aiMetadata: Record<string, unknown>;
    sourceFormat: string | null;
    contentHash: string | null;
    diagnostics: Record<string, unknown>;
  };
  document: {
    id: string;
    title: string;
    sourceType: string | null;
    sourceUrl: string | null;
    canonicalUrl: string | null;
    language: string | null;
    author: string | null;
    publishedAt: string | null;
    ingestionStatus: string | null;
    extractionStatus: string | null;
    coverageStatus: string | null;
    textQuality: string | null;
    coverageMethod: string | null;
    errorCode: string | null;
    errorDetail: string | null;
    chunkCount: number;
    sourceCharCount: number;
    contentHash: string | null;
  } | null;
  text: {
    available: boolean;
    quality: 'full_text' | 'partial_text' | 'metadata_only' | 'blocked' | 'missing';
    content: string;
    length: number;
    chunks: number;
    truncated: boolean;
    reason: string | null;
  };
  fragments: Array<{
    id: string;
    chunkIndex: number;
    heading: string;
    content: string;
    charStart: number;
    charEnd: number;
  }>;
  quotes: MediaQuoteView[];
  topics: Array<{ primaryTopic: string; subtopics: string[]; confidence: number }>;
  editorialRole: { role: string; confidence: number; evidence: string | null } | null;
  entities: Array<{ type: string; name: string; role: string | null; confidence: number }>;
  brain: {
    available: boolean;
    entities: Array<{
      id: string;
      type: string;
      name: string;
      relationType: string;
      confidence: number;
      evidence: string | null;
      verified: boolean;
    }>;
    relationshipCount: number;
    caveat: string;
  };
  relations: Array<{
    id: string;
    direction: 'source' | 'target';
    type: string;
    otherId: string;
    otherTitle: string;
    otherOutlet: string;
    confidence: number;
    reviewStatus: string;
  }>;
  provenance: MediaProvenance;
};

export async function getMediaRecordDetail(input: {
  id?: string;
  title?: string;
  maxTextChars?: number;
}): Promise<
  | { status: 'found'; detail: MediaRecordDetail }
  | { status: 'ambiguous'; candidates: MediaCatalogRow[]; total: number }
  | { status: 'not_found' }
> {
  let id = input.id?.trim() || null;

  if (!id) {
    const title = input.title?.trim();
    if (!title) return { status: 'not_found' };

    const candidates = await findMediaRecords({
      title,
      limit: 10,
      status: 'all',
    });

    const exact = candidates.items.filter(
      (row) => row.title.trim().toLowerCase() === title.toLowerCase()
    );

    if (exact.length === 1) id = exact[0].id;
    else if (candidates.items.length === 1) id = candidates.items[0].id;
    else if (candidates.items.length > 1) {
      return { status: 'ambiguous', candidates: candidates.items, total: candidates.total };
    } else {
      const broader = await findMediaRecords({ query: title, limit: 10, status: 'all' });
      if (broader.items.length === 1) id = broader.items[0].id;
      else if (broader.items.length > 1) {
        return { status: 'ambiguous', candidates: broader.items, total: broader.total };
      } else {
        return { status: 'not_found' };
      }
    }
  }

  const records = await mediaQuery<Record<string, unknown>>(
    `SELECT ${ROW_SELECT},
       m.summary,
       m.image_url,
       m.created_at::text AS created_at,
       m.updated_at::text AS updated_at,
       m.ai_metadata,
       m.source_format,
       m.content_hash,
       m.extraction_diagnostics
     FROM public.media_archive_records m
     LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id
     WHERE m.id = $1::uuid
     LIMIT 1`,
    [id]
  );

  const row = records[0];
  if (!row) return { status: 'not_found' };

  const record = mapRow(row);
  const documentId = record.documentId;

  const [documents, chunks, quotes, topics, roles, entities, brainRows, relations] =
    await Promise.all([
      documentId
        ? mediaQuery<Record<string, unknown>>(
            `SELECT id, title, source_type, source_url, canonical_url, language, author,
                published_at::text AS published_at, ingestion_status, extraction_status,
                media_coverage_status, media_text_quality, media_coverage_method,
                media_coverage_error_code, media_coverage_error_detail,
                chunk_count, source_char_count, content_hash
             FROM public.knowledge_documents WHERE id = $1 LIMIT 1`,
            [documentId]
          )
        : Promise.resolve([]),
      documentId
        ? mediaQuery<Record<string, unknown>>(
            `SELECT id, chunk_index, content, heading, section_path, char_start, char_end
             FROM public.knowledge_chunks
             WHERE document_id = $1
             ORDER BY chunk_index ASC
             LIMIT 2000`,
            [documentId]
          )
        : Promise.resolve([]),
      mediaQuery<Record<string, unknown>>(
        `SELECT id, quote_text, quote_type, verification_status, attribution, confidence,
            language, translation, document_char_start
         FROM public.media_quotes
         WHERE media_record_id = $1::uuid AND is_current = true
         ORDER BY document_char_start ASC
         LIMIT 200`,
        [record.id]
      ),
      mediaQuery<Record<string, unknown>>(
        `SELECT primary_topic, subtopics, confidence
         FROM public.media_analysis_topics
         WHERE media_record_id = $1::uuid AND is_current = true
         ORDER BY created_at DESC LIMIT 10`,
        [record.id]
      ),
      mediaQuery<Record<string, unknown>>(
        `SELECT role, confidence, evidence
         FROM public.media_editorial_roles
         WHERE media_record_id = $1::uuid AND is_current = true
         ORDER BY created_at DESC LIMIT 1`,
        [record.id]
      ),
      mediaQuery<Record<string, unknown>>(
        `SELECT entity_type, name, role, confidence
         FROM public.media_analysis_entities
         WHERE media_record_id = $1::uuid AND is_current = true
         ORDER BY confidence DESC, name ASC LIMIT 100`,
        [record.id]
      ),
      documentId
        ? mediaQuery<Record<string, unknown>>(
            `SELECT e.id, e.entity_type, e.canonical_name, r.relation_type, r.confidence,
                r.evidence, r.verified
             FROM public.brain_relationships r
             JOIN public.brain_entities e
               ON e.id = r.source_entity_id OR e.id = r.target_entity_id
             WHERE r.provenance_document_id = $1
             ORDER BY r.confidence DESC
             LIMIT 100`,
            [documentId]
          )
        : Promise.resolve([]),
      mediaQuery<Record<string, unknown>>(
        `SELECT rel.id, rel.source_media_record_id, rel.target_media_record_id,
            rel.relation_type, rel.confidence, rel.review_status,
            target.title AS target_title, target.outlet AS target_outlet,
            source.title AS source_title, source.outlet AS source_outlet
         FROM public.media_record_relations rel
         JOIN public.media_archive_records source ON source.id = rel.source_media_record_id
         JOIN public.media_archive_records target ON target.id = rel.target_media_record_id
         WHERE rel.is_current = true
           AND (rel.source_media_record_id = $1::uuid OR rel.target_media_record_id = $1::uuid)
         ORDER BY rel.confidence DESC
         LIMIT 50`,
        [record.id]
      ),
    ]);

  const doc = documents[0];
  const chunkRows = chunks.map((chunk) => ({
    id: String(chunk.id),
    document_id: documentId || '',
    chunk_index: asCount(chunk.chunk_index as string | number | null),
    content: String(chunk.content || ''),
    char_start: asCount(chunk.char_start as string | number | null),
    char_end: asCount(chunk.char_end as string | number | null),
    heading: String(chunk.heading || ''),
  }));

  const fullText = doc ? buildDocumentText(chunkRows) : '';
  const maxTextChars = clampInt(input.maxTextChars, 60_000, 1000, 200_000);
  const truncated = fullText.length > maxTextChars;
  const content = truncated ? fullText.slice(0, maxTextChars) : fullText;

  let quality: MediaRecordDetail['text']['quality'] = 'missing';
  let reason: string | null = null;

  if (record.textQuality === 'full_text') quality = 'full_text';
  else if (record.textQuality === 'partial_text') quality = 'partial_text';
  else if (record.textQuality === 'metadata_only') quality = 'metadata_only';
  else if (record.textQuality === 'blocked') quality = 'blocked';
  else if (record.documentId) quality = fullText.length > 0 ? 'partial_text' : 'metadata_only';

  if (quality === 'metadata_only') {
    reason = 'Доступны только метаданные: полный текст не был извлечён.';
  } else if (quality === 'blocked') {
    reason =
      record.indexingError ||
      'Источник заблокировал извлечение (paywall/HTTP-ограничение). Полный текст недоступен.';
  } else if (quality === 'missing') {
    reason = 'Связанный документ Brain отсутствует; доступны только метаданные архива.';
  } else if (truncated) {
    reason = `Полный текст длиннее лимита ответа (${fullText.length} символов); показано ${maxTextChars}.`;
  }

  const relationshipRows = brainRows.filter(
    (brain) => brain.id && brain.canonical_name && brain.relation_type
  );

  return {
    status: 'found',
    detail: {
      record,
      metadata: {
        summary: row.summary ? String(row.summary) : null,
        imageUrl: row.image_url ? String(row.image_url) : null,
        createdAt: row.created_at ? String(row.created_at) : null,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
        aiMetadata:
          row.ai_metadata && typeof row.ai_metadata === 'object'
            ? (row.ai_metadata as Record<string, unknown>)
            : {},
        sourceFormat: row.source_format ? String(row.source_format) : null,
        contentHash: row.content_hash ? String(row.content_hash) : null,
        diagnostics:
          row.extraction_diagnostics && typeof row.extraction_diagnostics === 'object'
            ? (row.extraction_diagnostics as Record<string, unknown>)
            : {},
      },
      document: doc
        ? {
            id: String(doc.id),
            title: String(doc.title || record.title),
            sourceType: doc.source_type ? String(doc.source_type) : null,
            sourceUrl: doc.source_url ? String(doc.source_url) : null,
            canonicalUrl: doc.canonical_url ? String(doc.canonical_url) : null,
            language: doc.language ? String(doc.language) : null,
            author: doc.author ? String(doc.author) : null,
            publishedAt: doc.published_at ? String(doc.published_at) : null,
            ingestionStatus: doc.ingestion_status ? String(doc.ingestion_status) : null,
            extractionStatus: doc.extraction_status ? String(doc.extraction_status) : null,
            coverageStatus: doc.media_coverage_status
              ? String(doc.media_coverage_status)
              : null,
            textQuality: doc.media_text_quality ? String(doc.media_text_quality) : null,
            coverageMethod: doc.media_coverage_method
              ? String(doc.media_coverage_method)
              : null,
            errorCode: doc.media_coverage_error_code
              ? String(doc.media_coverage_error_code)
              : null,
            errorDetail: doc.media_coverage_error_detail
              ? String(doc.media_coverage_error_detail)
              : null,
            chunkCount: asCount(doc.chunk_count as string | number | null),
            sourceCharCount: asCount(doc.source_char_count as string | number | null),
            contentHash: doc.content_hash ? String(doc.content_hash) : null,
          }
        : null,
      text: {
        available: content.length > 0,
        quality,
        content,
        length: fullText.length,
        chunks: chunkRows.length,
        truncated,
        reason,
      },
      fragments: chunkRows.map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunk_index,
        heading: chunk.heading,
        content: chunk.content,
        charStart: chunk.char_start,
        charEnd: chunk.char_end,
      })),
      quotes: quotes.map((quote) => ({
        id: String(quote.id),
        text: String(quote.quote_text || ''),
        type: String(quote.quote_type || 'unknown'),
        verificationStatus: String(quote.verification_status || 'unverified'),
        attribution: String(quote.attribution || 'unknown'),
        confidence: Number(quote.confidence) || 0,
        language: quote.language ? String(quote.language) : null,
        translation: quote.translation ? String(quote.translation) : null,
        documentCharStart: asCount(quote.document_char_start as string | number | null),
      })),
      topics: topics.map((topic) => ({
        primaryTopic: String(topic.primary_topic || ''),
        subtopics: Array.isArray(topic.subtopics)
          ? topic.subtopics.filter((value): value is string => typeof value === 'string')
          : [],
        confidence: Number(topic.confidence) || 0,
      })),
      editorialRole: roles[0]
        ? {
            role: String(roles[0].role || 'unknown'),
            confidence: Number(roles[0].confidence) || 0,
            evidence: roles[0].evidence ? String(roles[0].evidence) : null,
          }
        : null,
      entities: entities.map((entity) => ({
        type: String(entity.entity_type || 'unknown'),
        name: String(entity.name || ''),
        role: entity.role ? String(entity.role) : null,
        confidence: Number(entity.confidence) || 0,
      })),
      brain: {
        available: relationshipRows.length > 0,
        entities: relationshipRows.map((brain) => ({
          id: String(brain.id),
          type: String(brain.entity_type || 'unknown'),
          name: String(brain.canonical_name),
          relationType: String(brain.relation_type),
          confidence: Number(brain.confidence) || 0,
          evidence: brain.evidence ? String(brain.evidence) : null,
          verified: Boolean(brain.verified),
        })),
        relationshipCount: relationshipRows.length,
        caveat:
          'Связи Brain — извлечённые утверждения с provenance. Упоминание персоны в статье не равно подтверждённому факту о ней.',
      },
      relations: relations.map((relation) => {
        const isSource = String(relation.source_media_record_id) === record.id;
        return {
          id: String(relation.id),
          direction: isSource ? ('source' as const) : ('target' as const),
          type: String(relation.relation_type || 'related'),
          otherId: String(
            isSource ? relation.target_media_record_id : relation.source_media_record_id
          ),
          otherTitle: String(isSource ? relation.target_title : relation.source_title),
          otherOutlet: String(isSource ? relation.target_outlet : relation.source_outlet),
          confidence: Number(relation.confidence) || 0,
          reviewStatus: String(relation.review_status || 'unverified'),
        };
      }),
      provenance: provenance({ scope: 'all' }, {
        source: 'media_archive_records',
        mode: 'sql_catalog',
        totalMatching: 1,
        returned: 1,
      }),
    },
  };
}

export type MediaFailureClass =
  | 'temporary'
  | 'fetch_error'
  | 'source_unavailable'
  | 'paywall'
  | 'access_blocked'
  | 'metadata_only'
  | 'corrupted_document'
  | 'incomplete_text'
  | 'parser_error'
  | 'embedding_error'
  | 'missing_media_link'
  | 'manual_review';

export type MediaFailureAssessment = {
  class: MediaFailureClass;
  retryable: boolean;
  recommendedAction: string;
};

export function classifyMediaFailure(input: {
  coverageStatus?: string | null;
  textQuality?: string | null;
  ingestionStatus?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  hasDocument?: boolean;
  chunkCount?: number;
}): MediaFailureAssessment {
  const code = (input.errorCode || '').toLowerCase();
  const status = (input.coverageStatus || '').toLowerCase();

  if (!input.hasDocument) {
    return {
      class: 'missing_media_link',
      retryable: false,
      recommendedAction: 'Создать связь с документом Brain или подтвердить metadata-only статус.',
    };
  }

  if (code.includes('paywall') || code === 'http_status_402') {
    return {
      class: 'paywall',
      retryable: false,
      recommendedAction:
        'Не обходить paywall. Сохранить метаданные и пометить текст как недоступный.',
    };
  }

  if (code === 'http_status_401' || code === 'http_status_403') {
    return {
      class: 'access_blocked',
      retryable: false,
      recommendedAction:
        'Не обходить ограничение доступа. Оставить метаданные и явно показывать отсутствие текста.',
    };
  }

  if (code === 'http_status_404' || code === 'http_status_410') {
    return {
      class: 'source_unavailable',
      retryable: false,
      recommendedAction: 'Источник удалён или переехал; проверить канонический URL вручную.',
    };
  }

  if (input.textQuality === 'metadata_only' || code === 'metadata_only') {
    return {
      class: 'metadata_only',
      retryable: false,
      recommendedAction:
        'Полный текст не был получен. Дозагрузить разрешённый источник или оставить metadata-only.',
    };
  }

  if (code === 'fetch_timeout' || code === 'dns_failed' || code === 'http_status_429') {
    return {
      class: 'temporary',
      retryable: true,
      recommendedAction: 'Повторить с ограниченным backoff и лимитом попыток.',
    };
  }

  if (code === 'fetch_failed' || code.startsWith('http_status_5')) {
    return {
      class: 'fetch_error',
      retryable: true,
      recommendedAction: 'Повторить один раз; при повторе ошибки оставить метаданные.',
    };
  }

  if (status === 'blocked' || input.textQuality === 'blocked') {
    return {
      class: 'access_blocked',
      retryable: false,
      recommendedAction: 'Источник недоступен для автоматического извлечения; нужна ручная проверка.',
    };
  }

  if (code.startsWith('embedding_') || code === 'embedding_failed') {
    return {
      class: 'embedding_error',
      retryable: true,
      recommendedAction: 'Переиндексировать только документ после восстановления embedding-провайдера.',
    };
  }

  if (code === 'truncated_content') {
    return {
      class: 'incomplete_text',
      retryable: false,
      recommendedAction: 'Текст извлечён частично; проверить источник и пометить partial_text.',
    };
  }

  if (code === 'needs_review') {
    return {
      class: 'manual_review',
      retryable: false,
      recommendedAction: 'Требуется ручная проверка качества извлечения.',
    };
  }

  if (
    code.includes('extraction') ||
    code.includes('parser') ||
    code === 'word_count_below_threshold' ||
    code === 'deepseek_invalid_json'
  ) {
    return {
      class: 'parser_error',
      retryable: code === 'deepseek_invalid_json',
      recommendedAction:
        code === 'deepseek_invalid_json'
          ? 'Повторить анализ с ограничением попыток; при повторе — ручная проверка.'
          : 'Проверить парсер и исходный HTML вручную.',
    };
  }

  if (input.textQuality === 'partial_text' || status === 'partial') {
    return {
      class: 'incomplete_text',
      retryable: false,
      recommendedAction: 'Сохранить partial_text и явно указывать неполноту в ответах.',
    };
  }

  return {
    class: 'manual_review',
    retryable: false,
    recommendedAction: 'Классифицировать вручную; автоматический retry не применять.',
  };
}

export type MediaDiagnosticRow = MediaCatalogRow & {
  errorCode: string | null;
  errorDetail: string | null;
  failure: MediaFailureAssessment;
};

export type MediaDiagnostics = {
  summary: {
    total: number;
    own: number;
    mentions: number;
    withDocument: number;
    missingDocument: number;
    noChunks: number;
    failed: number;
    partial: number;
    blocked: number;
    metadataOnly: number;
    notIndexed: number;
    duplicateCanonical: number;
    duplicateTitle: number;
    duplicateContentHash: number;
    duplicateQuotes: number;
    topicMismatch: number;
    outletMismatch: number;
    dateMismatch: number;
    multiCurrentTopic: number;
    multiCurrentRole: number;
    brainLinkedDocuments: number;
    brainDocumentsWithoutMedia: number;
    analysisFailed: number;
  };
  rows: MediaDiagnosticRow[];
  duplicates: {
    canonical: Array<{ key: string; count: number; ids: string[] }>;
    title: Array<{ key: string; count: number; ids: string[] }>;
    contentHash: Array<{ key: string; count: number; ids: string[] }>;
    quotes: Array<{ key: string; count: number; ids: string[] }>;
  };
  brainWithoutMedia: Array<{
    id: string;
    title: string;
    sourceType: string | null;
    ingestionStatus: string | null;
    reason: string;
  }>;
  provenance: MediaProvenance;
};

export async function getMediaDiagnostics(input: {
  includeHealthy?: boolean;
  limit?: number;
} = {}): Promise<MediaDiagnostics> {
  const limit = clampInt(input.limit, 300, 1, 1000);
  const includeHealthy = input.includeHealthy === true;

  const [
    summaryRows,
    rows,
    duplicateCanonical,
    duplicateTitle,
    duplicateHash,
    duplicateQuotes,
    brainWithoutMedia,
  ] = await Promise.all([
    mediaQuery<Record<string, number | string>>(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE ${MEDIA_OWN_SQL})::int AS own,
         count(*) FILTER (WHERE ${MEDIA_MENTION_SQL})::int AS mentions,
         count(*) FILTER (WHERE d.id IS NOT NULL)::int AS with_document,
         count(*) FILTER (WHERE d.id IS NULL)::int AS missing_document,
         count(*) FILTER (WHERE d.id IS NOT NULL AND coalesce(d.chunk_count, 0) = 0)::int AS no_chunks,
         count(*) FILTER (WHERE d.media_coverage_status = 'failed')::int AS failed,
         count(*) FILTER (WHERE d.media_coverage_status = 'partial')::int AS partial,
         count(*) FILTER (WHERE d.media_coverage_status = 'blocked')::int AS blocked,
         count(*) FILTER (WHERE d.media_text_quality = 'metadata_only')::int AS metadata_only,
         count(*) FILTER (WHERE m.indexing_status = 'not_indexed')::int AS not_indexed,
         (SELECT count(*)::int FROM (
           SELECT canonical_url FROM public.media_archive_records
           WHERE canonical_url IS NOT NULL AND canonical_url <> ''
           GROUP BY canonical_url HAVING count(*) > 1
         ) dup) AS duplicate_canonical,
         (SELECT count(*)::int FROM (
           SELECT lower(btrim(title)), outlet, published_date
           FROM public.media_archive_records
           GROUP BY 1,2,3 HAVING count(*) > 1
         ) dup) AS duplicate_title,
         (SELECT count(*)::int FROM (
           SELECT content_hash FROM public.media_archive_records
           WHERE content_hash IS NOT NULL GROUP BY content_hash HAVING count(*) > 1
         ) dup) AS duplicate_hash,
         (SELECT count(*)::int FROM (
           SELECT quote_hash FROM public.media_quotes
           WHERE is_current GROUP BY quote_hash HAVING count(*) > 1
         ) dup) AS duplicate_quotes,
         (SELECT count(DISTINCT r.provenance_document_id)::int
            FROM public.brain_relationships r
            JOIN public.knowledge_documents doc ON doc.id = r.provenance_document_id
           WHERE doc.media_record_id IS NOT NULL) AS brain_linked_documents,
         (SELECT count(*)::int FROM public.knowledge_documents doc
           WHERE doc.media_record_id IS NULL) AS brain_without_media,
         (SELECT count(*)::int FROM public.media_analysis_topics t
           JOIN public.media_archive_records mm ON mm.id = t.media_record_id
          WHERE t.is_current AND t.primary_topic IS DISTINCT FROM mm.topic) AS topic_mismatch,
         (SELECT count(*)::int FROM public.knowledge_documents d2
           JOIN public.media_archive_records mm ON mm.id = d2.media_record_id
          WHERE d2.media_outlet IS DISTINCT FROM mm.outlet) AS outlet_mismatch,
         (SELECT count(*)::int FROM public.knowledge_documents d2
           JOIN public.media_archive_records mm ON mm.id = d2.media_record_id
          WHERE d2.media_published_date IS DISTINCT FROM mm.published_date
             OR (d2.published_at IS NOT NULL AND d2.published_at::date <> mm.published_date)) AS date_mismatch,
         (SELECT count(*)::int FROM (
           SELECT media_record_id FROM public.media_analysis_topics
           WHERE is_current GROUP BY media_record_id HAVING count(*) > 1
         ) multi_topic) AS multi_current_topic,
         (SELECT count(*)::int FROM (
           SELECT media_record_id FROM public.media_editorial_roles
           WHERE is_current GROUP BY media_record_id HAVING count(*) > 1
         ) multi_role) AS multi_current_role,
         (SELECT count(*)::int FROM public.media_analysis_runs r WHERE r.status = 'failed') AS analysis_failed
       FROM public.media_archive_records m
       LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id`,
      []
    ),
    mediaQuery<Record<string, unknown>>(
      `SELECT ${ROW_SELECT},
         d.media_coverage_error_code AS error_code,
         d.media_coverage_error_detail AS error_detail
       FROM public.media_archive_records m
       LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id
       LEFT JOIN LATERAL (
         SELECT topic.primary_topic FROM public.media_analysis_topics topic
         WHERE topic.media_record_id = m.id AND topic.is_current = true
         ORDER BY topic.created_at DESC LIMIT 1
       ) t ON true
       ${includeHealthy
         ? ''
         : `WHERE d.id IS NULL
            OR coalesce(d.chunk_count, 0) = 0
            OR d.media_coverage_status IN ('failed', 'partial', 'blocked')
            OR d.media_text_quality IN ('metadata_only', 'blocked', 'partial_text')
            OR m.indexing_status IN ('failed', 'partial', 'blocked', 'not_indexed')`}
       ORDER BY
         CASE d.media_coverage_status WHEN 'blocked' THEN 0 WHEN 'failed' THEN 1 WHEN 'partial' THEN 2 ELSE 3 END,
         m.published_date DESC NULLS LAST,
         m.title ASC
       LIMIT ${limit}`,
      []
    ),
    mediaQuery<{ key: string; count: string | number; ids: string[] }>(
      `SELECT canonical_url AS key, count(*)::int AS count, array_agg(id::text) AS ids
       FROM public.media_archive_records
       WHERE canonical_url IS NOT NULL AND canonical_url <> ''
       GROUP BY canonical_url HAVING count(*) > 1
       ORDER BY count DESC LIMIT 100`
    ),
    mediaQuery<{ key: string; count: string | number; ids: string[] }>(
      `SELECT lower(btrim(title)) || ' · ' || coalesce(outlet, '') || ' · ' || coalesce(published_date::text, '') AS key,
              count(*)::int AS count, array_agg(id::text) AS ids
       FROM public.media_archive_records
       GROUP BY lower(btrim(title)), outlet, published_date
       HAVING count(*) > 1
       ORDER BY count DESC LIMIT 100`
    ),
    mediaQuery<{ key: string; count: string | number; ids: string[] }>(
      `SELECT content_hash AS key, count(*)::int AS count, array_agg(id::text) AS ids
       FROM public.media_archive_records
       WHERE content_hash IS NOT NULL
       GROUP BY content_hash HAVING count(*) > 1
       ORDER BY count DESC LIMIT 100`
    ),
    mediaQuery<{ key: string; count: string | number; ids: string[] }>(
      `SELECT quote_hash AS key, count(*)::int AS count, array_agg(DISTINCT media_record_id::text) AS ids
       FROM public.media_quotes WHERE is_current
       GROUP BY quote_hash HAVING count(*) > 1
       ORDER BY count DESC LIMIT 100`
    ),
    mediaQuery<Record<string, unknown>>(
      `SELECT d.id, d.title, d.source_type, d.ingestion_status, d.created_at::text AS created_at,
              d.source_url, d.chunk_count
       FROM public.knowledge_documents d
       WHERE d.media_record_id IS NULL
       ORDER BY d.created_at DESC
       LIMIT 100`
    ),
  ]);

  const summary = summaryRows[0] || {};
  const diagnosticRows: MediaDiagnosticRow[] = rows.map((row) => {
    const mapped = mapRow(row);
    return {
      ...mapped,
      errorCode: row.error_code ? String(row.error_code) : null,
      errorDetail: row.error_detail ? String(row.error_detail) : null,
      failure: classifyMediaFailure({
        coverageStatus: mapped.coverageStatus,
        textQuality: mapped.textQuality,
        ingestionStatus: row.ingestion_status ? String(row.ingestion_status) : null,
        errorCode: row.error_code ? String(row.error_code) : null,
        errorDetail: row.error_detail ? String(row.error_detail) : null,
        hasDocument: Boolean(mapped.documentId),
        chunkCount: mapped.chunkCount,
      }),
    };
  });

  const total = asCount(summary.total as string | number | null);

  return {
    summary: {
      total,
      own: asCount(summary.own as string | number | null),
      mentions: asCount(summary.mentions as string | number | null),
      withDocument: asCount(summary.with_document as string | number | null),
      missingDocument: asCount(summary.missing_document as string | number | null),
      noChunks: asCount(summary.no_chunks as string | number | null),
      failed: asCount(summary.failed as string | number | null),
      partial: asCount(summary.partial as string | number | null),
      blocked: asCount(summary.blocked as string | number | null),
      metadataOnly: asCount(summary.metadata_only as string | number | null),
      notIndexed: asCount(summary.not_indexed as string | number | null),
      duplicateCanonical: asCount(summary.duplicate_canonical as string | number | null),
      duplicateTitle: asCount(summary.duplicate_title as string | number | null),
      duplicateContentHash: asCount(summary.duplicate_hash as string | number | null),
      duplicateQuotes: asCount(summary.duplicate_quotes as string | number | null),
      topicMismatch: asCount(summary.topic_mismatch as string | number | null),
      outletMismatch: asCount(summary.outlet_mismatch as string | number | null),
      dateMismatch: asCount(summary.date_mismatch as string | number | null),
      multiCurrentTopic: asCount(summary.multi_current_topic as string | number | null),
      multiCurrentRole: asCount(summary.multi_current_role as string | number | null),
      brainLinkedDocuments: asCount(summary.brain_linked_documents as string | number | null),
      brainDocumentsWithoutMedia: asCount(summary.brain_without_media as string | number | null),
      analysisFailed: asCount(summary.analysis_failed as string | number | null),
    },
    rows: diagnosticRows,
    duplicates: {
      canonical: duplicateCanonical.map((row) => ({
        key: row.key,
        count: asCount(row.count),
        ids: row.ids || [],
      })),
      title: duplicateTitle.map((row) => ({
        key: row.key,
        count: asCount(row.count),
        ids: row.ids || [],
      })),
      contentHash: duplicateHash.map((row) => ({
        key: row.key,
        count: asCount(row.count),
        ids: row.ids || [],
      })),
      quotes: duplicateQuotes.map((row) => ({
        key: row.key,
        count: asCount(row.count),
        ids: row.ids || [],
      })),
    },
    brainWithoutMedia: brainWithoutMedia.map((row) => ({
      id: String(row.id),
      title: String(row.title || ''),
      sourceType: row.source_type ? String(row.source_type) : null,
      ingestionStatus: row.ingestion_status ? String(row.ingestion_status) : null,
      reason:
        row.source_type === 'manuscript'
          ? 'Рукопись Brain; не является публикацией Media Archive.'
          : row.source_type === 'text' || row.source_type === 'txt'
            ? 'Личный текст/файл Brain; не является публикацией Media Archive.'
            : row.ingestion_status === 'superseded'
              ? 'Устаревший дубль; заменён связанным документом Media.'
              : 'Документ Brain без записи Media Archive; проверить происхождение.',
    })),
    provenance: provenance({ status: 'all' }, {
      source: 'media_archive_records',
      mode: 'sql_aggregate',
      totalMatching: total,
      returned: diagnosticRows.length,
      caveats:
        diagnosticRows.length < total
          ? ['Показаны только проблемные записи; счётчики охватывают весь архив.']
          : [],
    }),
  };
}

export type MediaAnalytics = {
  stats: MediaArchiveStats;
  months: MediaGroupCount[];
  countries: MediaGroupCount[];
  duplicates: MediaDiagnostics['duplicates'];
  brain: {
    entities: number;
    relationships: number;
    documentsWithRelationships: number;
    mediaDocuments: number;
  };
  provenance: MediaProvenance;
};

export async function getMediaAnalytics(
  filters: MediaCatalogFilters = {}
): Promise<MediaAnalytics> {
  const [stats, diagnostics, monthRows, brainRows, relationshipRows] = await Promise.all([
    getMediaArchiveStats(filters),
    getMediaDiagnostics({ limit: 1 }),
    groupCounts(`to_char(date_trunc('month', m.published_date), 'YYYY-MM')`, filters, 300),
    mediaQuery<Record<string, number | string>>(
      `SELECT
         (SELECT count(*)::int FROM public.brain_entities) AS entities,
         (SELECT count(*)::int FROM public.brain_relationships) AS relationships,
         (SELECT count(DISTINCT r.provenance_document_id)::int
            FROM public.brain_relationships r
            JOIN public.knowledge_documents d ON d.id = r.provenance_document_id
           WHERE d.media_record_id IS NOT NULL) AS documents_with_relationships,
         (SELECT count(*)::int FROM public.knowledge_documents WHERE media_record_id IS NOT NULL) AS media_documents`
    ),
    mediaQuery<{ country: string | null; count: string | number }>(
      `SELECT nullif(m.ai_metadata->>'country', '') AS country, count(*)::int AS count
       FROM public.media_archive_records m
       GROUP BY 1 ORDER BY count DESC`
    ),
  ]);

  const countryTotals = new Map<string, number>();
  for (const row of relationshipRows) {
    const country = row.country;
    if (!country) continue;
    countryTotals.set(country, (countryTotals.get(country) || 0) + asCount(row.count));
  }

  // The stored country is sparse; infer from the same explicit mapping used by
  // the dashboard instead of pretending that language is a country.
  const outletRows = await mediaQuery<{ outlet: string; count: string | number; url: string | null }>(
    `SELECT outlet, count(*)::int AS count, min(canonical_url) AS url
     FROM public.media_archive_records GROUP BY outlet`
  );
  for (const row of outletRows) {
    const country = inferMediaCountry({ outlet: row.outlet, url: row.url });
    if (!country) continue;
    countryTotals.set(country, (countryTotals.get(country) || 0) + asCount(row.count));
  }

  const brain = brainRows[0] || {};

  return {
    stats,
    months: monthRows.sort((left, right) => right.key.localeCompare(left.key)),
    countries: [...countryTotals.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count),
    duplicates: diagnostics.duplicates,
    brain: {
      entities: asCount(brain.entities as string | number | null),
      relationships: asCount(brain.relationships as string | number | null),
      documentsWithRelationships: asCount(
        brain.documents_with_relationships as string | number | null
      ),
      mediaDocuments: asCount(brain.media_documents as string | number | null),
    },
    provenance: stats.provenance,
  };
}
