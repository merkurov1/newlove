import { Pool } from 'pg';

import {
  mediaIntelligenceCacheKey,
  safePercent,
  type MediaIntelligenceFilters,
} from '@/lib/analytics/mediaIntelligenceFilters';
import { inferMediaCountry } from '@/lib/knowledge/media/country';
import { MEDIA_ANALYZER_VERSION } from '@/lib/knowledge/media/intelligence';

type Row = Record<string, unknown>;

let pool: Pool | null = null;

const cache = new Map<string, { expiresAt: number; value: unknown }>();

/** Clears dashboard data after an analysis mutation on the same instance. */
export function clearMediaIntelligenceCache(): void {
  cache.clear();
}

function connectionString(): string | null {
  return (
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null
  );
}

function getPool(): Pool | null {
  const url = connectionString();
  if (!url) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl:
        url.includes('localhost') || url.includes('127.0.0.1')
          ? undefined
          : { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function query<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = getPool();

  if (!client) throw new Error('media_intelligence_database_unavailable');

  const result = await client.query(sql, params);
  return result.rows as T[];
}

async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);

  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await loader();
  cache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

const KIND_ROLE_SQL = `CASE lower(m.kind)
  WHEN 'column' THEN 'author'
  WHEN 'blog' THEN 'author'
  WHEN 'interview' THEN 'interview'
  WHEN 'quote' THEN 'quoted_expert'
  WHEN 'profile' THEN 'profile'
  WHEN 'mention' THEN 'mention'
  WHEN 'video' THEN 'interview'
  WHEN 'radio' THEN 'interview'
  WHEN 'republication' THEN 'republication'
  ELSE 'unknown'
END`;

const KIND_INTERACTION_SQL = `CASE lower(m.kind)
  WHEN 'column' THEN 'commentary'
  WHEN 'blog' THEN 'commentary'
  WHEN 'interview' THEN 'interview'
  WHEN 'quote' THEN 'quoted_expert'
  WHEN 'profile' THEN 'profile'
  WHEN 'mention' THEN 'mention'
  WHEN 'video' THEN 'interview'
  WHEN 'radio' THEN 'interview'
  WHEN 'republication' THEN 'republication'
  ELSE 'unknown'
END`;

function baseCte(filters: MediaIntelligenceFilters): {
  sql: string;
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (filters.from) {
    clauses.push(`COALESCE(m.published_date, d.published_at::date) >= $${index}::date`);
    params.push(filters.from);
    index += 1;
  }

  if (filters.to) {
    clauses.push(`COALESCE(m.published_date, d.published_at::date) <= $${index}::date`);
    params.push(filters.to);
    index += 1;
  }

  if (filters.topic) {
    clauses.push(`COALESCE(t.primary_topic, m.topic) = $${index}`);
    params.push(filters.topic);
    index += 1;
  }

  if (filters.language) {
    clauses.push(`UPPER(COALESCE(NULLIF(d.language, ''), NULLIF(m.lang, ''))) = $${index}`);
    params.push(filters.language);
    index += 1;
  }

  if (filters.outlet) {
    clauses.push(`m.outlet = $${index}`);
    params.push(filters.outlet);
    index += 1;
  }

  if (filters.status) {
    clauses.push(`m.status = $${index}`);
    params.push(filters.status);
    index += 1;
  }

  if (filters.kind) {
    clauses.push(`m.kind = $${index}`);
    params.push(filters.kind);
    index += 1;
  }

  if (filters.role) {
    clauses.push(`(CASE WHEN er.role IS NULL OR er.role = 'unknown' THEN ${KIND_ROLE_SQL} ELSE er.role END) = $${index}`);
    params.push(filters.role);
    index += 1;
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  return {
    sql: `
      WITH filtered AS (
        SELECT
          m.id,
          m.title,
          m.outlet,
          m.canonical_url,
          m.published_date,
          m.lang,
          m.kind,
          m.topic,
          m.status,
          m.ai_metadata,
          d.id AS document_id,
          d.media_coverage_status,
          d.media_text_quality,
          d.chunk_count,
          d.source_char_count,
          d.content_hash,
          d.ingestion_status,
          d.language AS detected_language,
          COALESCE(t.primary_topic, m.topic) AS effective_topic,
          t.subtopics,
          COALESCE(m.published_date, d.published_at::date) AS effective_date,
          CASE WHEN er.role IS NULL OR er.role = 'unknown'
            THEN ${KIND_ROLE_SQL}
            ELSE er.role
          END AS effective_role,
          CASE WHEN er.role IS NULL OR er.role = 'unknown' THEN 0.3
            ELSE COALESCE(er.confidence, 0.3)
          END::float8 AS role_confidence,
          CASE
            WHEN er.metadata->>'interaction_type' IS NULL
              OR er.metadata->>'interaction_type' = 'unknown'
            THEN ${KIND_INTERACTION_SQL}
            ELSE er.metadata->>'interaction_type'
          END AS interaction_type
        FROM public.media_archive_records m
        LEFT JOIN public.knowledge_documents d
          ON d.media_record_id = m.id
        LEFT JOIN public.media_analysis_topics t
          ON t.media_record_id = m.id AND t.is_current = true
        LEFT JOIN LATERAL (
          SELECT r.role, r.confidence, r.metadata
          FROM public.media_editorial_roles r
          WHERE r.media_record_id = m.id AND r.is_current = true
          ORDER BY r.created_at DESC
          LIMIT 1
        ) er ON true
        ${where}
      )
    `,
    params,
  };
}

function pageParams(filters: MediaIntelligenceFilters, params: unknown[]) {
  const limitIndex = params.length + 1;
  const offsetIndex = params.length + 2;
  return {
    limitSql: `$${limitIndex}`,
    offsetSql: `$${offsetIndex}`,
    params: [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  };
}

export type MediaIntelligenceOverview = {
  total: number;
  byStatus: { published: number; draft: number };
  outlets: number;
  languages: Array<{ language: string; count: number }>;
  range: { from: string | null; to: string | null };
  quotes: {
    direct: number;
    indirect: number;
    mentions: number;
    verifiedDirect: number;
    pending: number;
    unconfirmedAttribution: number;
  };
  fullTextShare: number | null;
  awaitingReviewShare: number | null;
  awaitingReviewPublications: number;
  missingDates: number;
  extractionErrors: number;
  coverage: {
    fullText: number;
    partialText: number;
    blocked: number;
    missing: number;
  };
  analysis: {
    eligible: number;
    analyzed: number;
    stale: number;
    notAnalyzed: number;
    queued: number;
    failed: number;
  };
  roles: Array<{ role: string; count: number }>;
  entities: Array<{ entity_type: string; name: string; count: number }>;
};

export async function loadMediaIntelligenceOverview(
  filters: MediaIntelligenceFilters
): Promise<MediaIntelligenceOverview> {
  const key = mediaIntelligenceCacheKey('overview', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);

    const [metrics, quoteMetrics, languages, range, awaiting, coverage, analysis, roles, entities] =
      await Promise.all([
      query<{
        total: number;
        published: number;
        draft: number;
        outlets: number;
        full_text: number;
        with_text: number;
        missing_dates: number;
        extraction_errors: number;
      }>(
        `${base.sql}
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'published')::int AS published,
           COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
           COUNT(DISTINCT outlet)::int AS outlets,
           COUNT(*) FILTER (WHERE media_text_quality = 'full_text' AND chunk_count > 0)::int AS full_text,
           COUNT(*) FILTER (WHERE media_text_quality IN ('full_text', 'partial_text') AND chunk_count > 0)::int AS with_text,
           COUNT(*) FILTER (WHERE effective_date IS NULL)::int AS missing_dates,
           COUNT(*) FILTER (
             WHERE media_coverage_status IN ('failed', 'blocked')
                OR media_text_quality IN ('metadata_only', 'blocked')
           )::int AS extraction_errors
         FROM filtered`,
        base.params
      ),
      query<{
        direct: number;
        indirect: number;
        mentions: number;
        verified_direct: number;
        pending: number;
        unconfirmed: number;
      }>(
        `${base.sql}
         SELECT
           COUNT(*) FILTER (WHERE q.quote_type = 'direct_quote')::int AS direct,
           COUNT(*) FILTER (WHERE q.quote_type = 'indirect_quote')::int AS indirect,
           COUNT(*) FILTER (WHERE q.quote_type = 'mention')::int AS mentions,
           COUNT(*) FILTER (
             WHERE q.quote_type = 'direct_quote' AND q.verification_status = 'verified'
           )::int AS verified_direct,
           COUNT(*) FILTER (
             WHERE q.verification_status IN ('unverified', 'needs_review')
           )::int AS pending,
           COUNT(*) FILTER (WHERE q.attribution = 'unknown')::int AS unconfirmed
         FROM filtered f
         LEFT JOIN public.media_quotes q
           ON q.media_record_id = f.id AND q.is_current = true`,
        base.params
      ),
      query<{ language: string; count: number }>(
        `${base.sql}
         SELECT
           COALESCE(NULLIF(detected_language, ''), NULLIF(lang, ''), 'unknown') AS language,
           COUNT(*)::int AS count
         FROM filtered
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{ from: string | null; to: string | null }>(
        `${base.sql}
         SELECT MIN(effective_date)::text AS from, MAX(effective_date)::text AS to
         FROM filtered`,
        base.params
      ),
      query<{ count: number }>(
        `${base.sql}
         SELECT COUNT(DISTINCT f.id)::int AS count
         FROM filtered f
         WHERE f.media_coverage_status IN ('pending', 'processing')
            OR EXISTS (
              SELECT 1 FROM public.media_quotes q
              WHERE q.media_record_id = f.id
                AND q.is_current = true
                AND q.verification_status IN ('unverified', 'needs_review')
            )`,
        base.params
      ),
      query<{
        full_text: number;
        partial_text: number;
        blocked: number;
        missing: number;
      }>(
        `${base.sql}
         SELECT
           COUNT(*) FILTER (
             WHERE media_text_quality = 'full_text' AND chunk_count > 0
           )::int AS full_text,
           COUNT(*) FILTER (
             WHERE media_text_quality = 'partial_text' AND chunk_count > 0
           )::int AS partial_text,
           COUNT(*) FILTER (
             WHERE media_coverage_status = 'blocked'
                OR media_text_quality IN ('blocked', 'metadata_only')
           )::int AS blocked,
           COUNT(*) FILTER (WHERE document_id IS NULL)::int AS missing
         FROM filtered`,
        base.params
      ),
      query<{
        eligible: number;
        analyzed: number;
        stale: number;
        not_analyzed: number;
        queued: number;
        failed: number;
      }>(
        `${base.sql}
         SELECT
           COUNT(*) FILTER (
             WHERE f.media_text_quality IN ('full_text', 'partial_text')
               AND COALESCE(f.chunk_count, 0) > 0
               AND f.ingestion_status = 'completed'
           )::int AS eligible,
           COUNT(*) FILTER (
             WHERE lr.status = 'completed'
               AND lr.content_hash IS NOT DISTINCT FROM f.content_hash
               AND lr.analyzer_version = $${base.params.length + 1}
           )::int AS analyzed,
           COUNT(*) FILTER (
             WHERE lr.status = 'completed'
               AND (
                 lr.content_hash IS DISTINCT FROM f.content_hash
                 OR lr.analyzer_version <> $${base.params.length + 1}
               )
           )::int AS stale,
           COUNT(*) FILTER (WHERE lr.id IS NULL)::int AS not_analyzed,
           COUNT(*) FILTER (WHERE lr.status IN ('pending', 'processing'))::int AS queued,
           COUNT(*) FILTER (WHERE lr.status = 'failed')::int AS failed
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT r.id, r.status, r.content_hash, r.analyzer_version
           FROM public.media_analysis_runs r
           WHERE r.media_record_id = f.id
           ORDER BY r.created_at DESC
           LIMIT 1
         ) lr ON true`,
        [...base.params, MEDIA_ANALYZER_VERSION]
      ),
      query<{ role: string; count: number }>(
        `${base.sql}
         SELECT effective_role AS role, COUNT(*)::int AS count
         FROM filtered
         WHERE effective_role IS NOT NULL
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{ entity_type: string; name: string; count: number }>(
        `${base.sql}
         SELECT e.entity_type, e.name, COUNT(*)::int AS count
         FROM public.media_analysis_entities e
         WHERE e.is_current = true
           AND e.media_record_id IN (SELECT id FROM filtered)
         GROUP BY 1, 2
         ORDER BY 3 DESC, 2 ASC
         LIMIT 20`,
        base.params
      ),
    ]);

    const metric = metrics[0] || {
      total: 0,
      published: 0,
      draft: 0,
      outlets: 0,
      full_text: 0,
      with_text: 0,
      missing_dates: 0,
      extraction_errors: 0,
    };
    const quote = quoteMetrics[0] || {
      direct: 0,
      indirect: 0,
      mentions: 0,
      verified_direct: 0,
      pending: 0,
      unconfirmed: 0,
    };
    const awaitingCount = awaiting[0]?.count || 0;

    return {
      total: metric.total,
      byStatus: { published: metric.published, draft: metric.draft },
      outlets: metric.outlets,
      languages,
      range: range[0] || { from: null, to: null },
      quotes: {
        direct: quote.direct,
        indirect: quote.indirect,
        mentions: quote.mentions,
        verifiedDirect: quote.verified_direct,
        pending: quote.pending,
        unconfirmedAttribution: quote.unconfirmed,
      },
      fullTextShare: safePercent(metric.full_text, metric.total),
      awaitingReviewShare: safePercent(awaitingCount, metric.total),
      awaitingReviewPublications: awaitingCount,
      missingDates: metric.missing_dates,
      extractionErrors: metric.extraction_errors,
      coverage: {
        fullText: coverage[0]?.full_text || 0,
        partialText: coverage[0]?.partial_text || 0,
        blocked: coverage[0]?.blocked || 0,
        missing: coverage[0]?.missing || 0,
      },
      analysis: {
        eligible: analysis[0]?.eligible || 0,
        analyzed: analysis[0]?.analyzed || 0,
        stale: analysis[0]?.stale || 0,
        notAnalyzed: analysis[0]?.not_analyzed || 0,
        queued: analysis[0]?.queued || 0,
        failed: analysis[0]?.failed || 0,
      },
      roles,
      entities,
    };
  });
}

export async function loadMediaIntelligenceTimeline(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('timeline', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);
    const [months, years, topicTimeline] = await Promise.all([
      query<{
        month: string;
        publications: number;
        direct_quotes: number;
        indirect_quotes: number;
        mentions: number;
      }>(
        `${base.sql}
         SELECT
           to_char(date_trunc('month', f.effective_date), 'YYYY-MM') AS month,
           COUNT(*)::int AS publications,
           COALESCE(SUM(q.direct_quotes), 0)::int AS direct_quotes,
           COALESCE(SUM(q.indirect_quotes), 0)::int AS indirect_quotes,
           COALESCE(SUM(q.mentions), 0)::int AS mentions
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*) FILTER (WHERE qq.quote_type = 'direct_quote')::int AS direct_quotes,
             COUNT(*) FILTER (WHERE qq.quote_type = 'indirect_quote')::int AS indirect_quotes,
             COUNT(*) FILTER (WHERE qq.quote_type = 'mention')::int AS mentions
           FROM public.media_quotes qq
           WHERE qq.media_record_id = f.id AND qq.is_current = true
         ) q ON true
         WHERE f.effective_date IS NOT NULL
         GROUP BY 1
         ORDER BY 1`,
        base.params
      ),
      query<{ year: string; publications: number }>(
        `${base.sql}
         SELECT to_char(date_trunc('year', effective_date), 'YYYY') AS year,
                COUNT(*)::int AS publications
         FROM filtered
         WHERE effective_date IS NOT NULL
         GROUP BY 1
         ORDER BY 1`,
        base.params
      ),
      query<{ month: string; topic: string; publications: number }>(
        `${base.sql}
         SELECT to_char(date_trunc('month', effective_date), 'YYYY-MM') AS month,
                effective_topic AS topic,
                COUNT(*)::int AS publications
         FROM filtered
         WHERE effective_date IS NOT NULL
         GROUP BY 1, 2
         ORDER BY 1, 2`,
        base.params
      ),
    ]);

    return { months, years, topicTimeline };
  });
}

export async function loadMediaIntelligenceTopics(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('topics', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);

    const [distribution, subtopics, characteristic] = await Promise.all([
      query<{
        topic: string;
        publications: number;
        full_text: number;
        direct_quotes: number;
      }>(
        `${base.sql}
         SELECT
           f.effective_topic AS topic,
           COUNT(*)::int AS publications,
           COUNT(*) FILTER (WHERE f.media_text_quality = 'full_text' AND f.chunk_count > 0)::int AS full_text,
           COALESCE(SUM(q.direct_quotes), 0)::int AS direct_quotes
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE qq.quote_type = 'direct_quote')::int AS direct_quotes
           FROM public.media_quotes qq
           WHERE qq.media_record_id = f.id AND qq.is_current = true
         ) q ON true
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{ subtopic: string; count: number }>(
        `${base.sql}
         SELECT subtopic, COUNT(*)::int AS count
         FROM filtered f
         CROSS JOIN LATERAL unnest(f.subtopics) AS subtopic
         WHERE subtopic IS NOT NULL AND subtopic <> ''
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC
         LIMIT 30`,
        base.params
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        effective_date: string | null;
        effective_topic: string;
        direct_quotes: number;
      }>(
        `${base.sql}
         SELECT * FROM (
           SELECT
             f.id,
             f.title,
             f.outlet,
             f.effective_date::text AS effective_date,
             f.effective_topic,
             (
               SELECT COUNT(*)::int FROM public.media_quotes q
               WHERE q.media_record_id = f.id
                 AND q.is_current = true
                 AND q.quote_type = 'direct_quote'
             ) AS direct_quotes,
             ROW_NUMBER() OVER (
               PARTITION BY f.effective_topic
               ORDER BY (
                 SELECT COUNT(*) FROM public.media_quotes q
                 WHERE q.media_record_id = f.id
                   AND q.is_current = true
                   AND q.quote_type = 'direct_quote'
               ) DESC,
               f.effective_date DESC NULLS LAST
             ) AS row_number
           FROM filtered f
         ) ranked
         WHERE row_number <= 3
         ORDER BY effective_topic, row_number`,
        base.params
      ),
    ]);

    return { distribution, subtopics, characteristic };
  });
}

export async function loadMediaIntelligenceOutlets(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('outlets', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);
    const paged = pageParams(filters, base.params);

    const [rows, total, countryRows] = await Promise.all([
      query<{
        outlet: string;
        publications: number;
        languages: string[];
        full_text: number;
        direct_quotes: number;
        last_publication: string | null;
        country: string | null;
        canonical_url: string | null;
      }>(
        `${base.sql}
         SELECT
           f.outlet,
           COUNT(*)::int AS publications,
           ARRAY_REMOVE(
             ARRAY_AGG(DISTINCT COALESCE(NULLIF(f.detected_language, ''), NULLIF(f.lang, ''))),
             NULL
           ) AS languages,
           COUNT(*) FILTER (WHERE f.media_text_quality = 'full_text' AND f.chunk_count > 0)::int AS full_text,
           COALESCE(SUM(q.direct_quotes), 0)::int AS direct_quotes,
           MAX(f.effective_date)::text AS last_publication,
           NULLIF(MAX(f.ai_metadata->>'country'), '') AS country,
           MAX(f.canonical_url) AS canonical_url
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE qq.quote_type = 'direct_quote')::int AS direct_quotes
           FROM public.media_quotes qq
           WHERE qq.media_record_id = f.id AND qq.is_current = true
         ) q ON true
         GROUP BY f.outlet
         ORDER BY publications DESC, f.outlet ASC
         LIMIT ${paged.limitSql} OFFSET ${paged.offsetSql}`,
        paged.params
      ),
      query<{ total: number }>(
        `${base.sql} SELECT COUNT(DISTINCT outlet)::int AS total FROM filtered`,
        base.params
      ),
      query<{
        outlet: string;
        publications: number;
        country: string | null;
        canonical_url: string | null;
      }>(
        `${base.sql}
         SELECT outlet,
                COUNT(*)::int AS publications,
                NULLIF(MAX(ai_metadata->>'country'), '') AS country,
                MAX(canonical_url) AS canonical_url
         FROM filtered
         GROUP BY outlet`,
        base.params
      ),
    ]);

    const rowsWithCountry = rows.map((row) => ({
      ...row,
      country: inferMediaCountry({
        explicit: row.country,
        outlet: row.outlet,
        url: row.canonical_url,
      }),
    }));

    const countryTotals = new Map<string, number>();

    for (const row of countryRows) {
      const country = inferMediaCountry({
        explicit: row.country,
        outlet: row.outlet,
        url: row.canonical_url,
      });

      if (!country) continue;

      countryTotals.set(country, (countryTotals.get(country) || 0) + row.publications);
    }

    const countryAgg = [...countryTotals.entries()]
      .map(([country, publications]) => ({ country, publications }))
      .sort((left, right) => right.publications - left.publications);

    return {
      rows: rowsWithCountry,
      total: total[0]?.total || 0,
      page: filters.page,
      pageSize: filters.pageSize,
      countries: countryAgg,
    };
  });
}

export async function loadMediaIntelligenceQuotes(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('quotes', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);
    const paged = pageParams(filters, base.params);

    const [counts, topics, outlets, publications, pending, pendingTotal] = await Promise.all([
      query<{
        direct: number;
        indirect: number;
        mentions: number;
        verified_direct: number;
        unconfirmed: number;
        total: number;
      }>(
        `${base.sql}
           SELECT
             COUNT(*) FILTER (WHERE q.quote_type = 'direct_quote')::int AS direct,
             COUNT(*) FILTER (WHERE q.quote_type = 'indirect_quote')::int AS indirect,
             COUNT(*) FILTER (WHERE q.quote_type = 'mention')::int AS mentions,
             COUNT(*) FILTER (
               WHERE q.quote_type = 'direct_quote' AND q.verification_status = 'verified'
             )::int AS verified_direct,
             COUNT(*) FILTER (WHERE q.attribution = 'unknown')::int AS unconfirmed,
             COUNT(*)::int AS total
           FROM filtered f
           JOIN public.media_quotes q
             ON q.media_record_id = f.id AND q.is_current = true`,
        base.params
      ),
      query<{ topic: string; quotes: number; verified: number }>(
        `${base.sql}
           SELECT f.effective_topic AS topic,
                  COUNT(*)::int AS quotes,
                  COUNT(*) FILTER (WHERE q.verification_status = 'verified')::int AS verified
           FROM filtered f
           JOIN public.media_quotes q
             ON q.media_record_id = f.id AND q.is_current = true
           GROUP BY 1
           ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{ outlet: string; direct_quotes: number }>(
        `${base.sql}
           SELECT f.outlet,
                  COUNT(*) FILTER (WHERE q.quote_type = 'direct_quote')::int AS direct_quotes
           FROM filtered f
           JOIN public.media_quotes q
             ON q.media_record_id = f.id AND q.is_current = true
           GROUP BY 1
           HAVING COUNT(*) FILTER (WHERE q.quote_type = 'direct_quote') > 0
           ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        effective_date: string | null;
        quotes: number;
        direct_quotes: number;
        verified: number;
      }>(
        `${base.sql}
           SELECT f.id, f.title, f.outlet, f.effective_date::text AS effective_date,
                  COUNT(*)::int AS quotes,
                  COUNT(*) FILTER (WHERE q.quote_type = 'direct_quote')::int AS direct_quotes,
                  COUNT(*) FILTER (WHERE q.verification_status = 'verified')::int AS verified
           FROM filtered f
           JOIN public.media_quotes q
             ON q.media_record_id = f.id AND q.is_current = true
           GROUP BY f.id, f.title, f.outlet, f.effective_date
           ORDER BY quotes DESC, direct_quotes DESC, effective_date DESC NULLS LAST
           LIMIT 20`,
        base.params
      ),
      query<{
        id: string;
        media_record_id: string;
        title: string;
        outlet: string;
        canonical_url: string | null;
        effective_date: string | null;
        quote_text: string;
        quote_type: string;
        attribution: string;
        confidence: number;
      }>(
        `${base.sql}
           SELECT q.id, f.id AS media_record_id, f.title, f.outlet, f.canonical_url,
                  f.effective_date::text AS effective_date,
                  q.quote_text, q.quote_type, q.attribution, q.confidence::float8 AS confidence
           FROM filtered f
           JOIN public.media_quotes q
             ON q.media_record_id = f.id AND q.is_current = true
           WHERE q.attribution = 'unknown'
              OR q.verification_status IN ('unverified', 'needs_review')
           ORDER BY q.created_at DESC
           LIMIT ${paged.limitSql} OFFSET ${paged.offsetSql}`,
        paged.params
      ),
      query<{ total: number }>(
        `${base.sql}
           SELECT COUNT(*)::int AS total
           FROM filtered f
           JOIN public.media_quotes q
             ON q.media_record_id = f.id AND q.is_current = true
           WHERE q.attribution = 'unknown'
              OR q.verification_status IN ('unverified', 'needs_review')`,
        base.params
      ),
    ]);

    return {
      counts: counts[0] || {
        direct: 0,
        indirect: 0,
        mentions: 0,
        verified_direct: 0,
        unconfirmed: 0,
        total: 0,
      },
      topics,
      outlets,
      publications,
      pending,
      pendingTotal: pendingTotal[0]?.total || 0,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  });
}

export async function loadMediaIntelligenceRelations(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('relations', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);
    const paged = pageParams(filters, base.params);

    const [counts, rows, total, clusters] = await Promise.all([
      query<{ relation_type: string; count: number; confirmed: number; review: number }>(
        `${base.sql}
         SELECT r.relation_type,
                COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE r.review_status = 'confirmed')::int AS confirmed,
                COUNT(*) FILTER (WHERE r.review_status IN ('unverified', 'needs_review'))::int AS review
         FROM filtered f
         JOIN public.media_record_relations r
           ON r.source_media_record_id = f.id AND r.is_current = true
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{
        id: string;
        relation_type: string;
        confidence: number;
        detected_by: string;
        review_status: string;
        evidence: Record<string, unknown>;
        target_media_record_id: string;
        target_title: string;
        target_outlet: string;
        target_canonical_url: string;
      }>(
        `${base.sql}
         SELECT r.id, r.relation_type, r.confidence::float8 AS confidence,
                r.detected_by, r.review_status, r.evidence,
                t.id AS target_media_record_id,
                t.title AS target_title,
                t.outlet AS target_outlet,
                t.canonical_url AS target_canonical_url
         FROM filtered f
         JOIN public.media_record_relations r
           ON r.source_media_record_id = f.id AND r.is_current = true
         JOIN public.media_archive_records t
           ON t.id = r.target_media_record_id
         ORDER BY r.confidence DESC, r.created_at DESC
         LIMIT ${paged.limitSql} OFFSET ${paged.offsetSql}`,
        paged.params
      ),
      query<{ total: number }>(
        `${base.sql}
         SELECT COUNT(*)::int AS total
         FROM filtered f
         JOIN public.media_record_relations r
           ON r.source_media_record_id = f.id AND r.is_current = true`,
        base.params
      ),
      query<{ topic: string; publications: number; subtopics: string[] }>(
        `${base.sql}
         SELECT effective_topic AS topic,
                COUNT(*)::int AS publications,
                ARRAY_REMOVE(ARRAY_AGG(DISTINCT subtopic), NULL) AS subtopics
         FROM filtered f
         CROSS JOIN LATERAL unnest(f.subtopics) AS subtopic
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
    ]);

    return {
      counts,
      rows,
      total: total[0]?.total || 0,
      clusters,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  });
}

export async function loadMediaIntelligenceQuality(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('quality', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);

    const [
      counts,
      missingDates,
      withoutText,
      extractionErrors,
      duplicates,
      pendingQuotes,
      missingEmbeddings,
    ] = await Promise.all([
      query<{
        missing_dates: number;
        without_text: number;
        extraction_errors: number;
        duplicate_groups: number;
        pending_quotes: number;
        missing_embeddings: number;
      }>(
        `${base.sql}
         SELECT
           COUNT(*) FILTER (WHERE effective_date IS NULL)::int AS missing_dates,
           COUNT(*) FILTER (
             WHERE media_text_quality NOT IN ('full_text', 'partial_text')
                OR COALESCE(chunk_count, 0) = 0
           )::int AS without_text,
           COUNT(*) FILTER (
             WHERE media_coverage_status IN ('failed', 'blocked')
                OR media_text_quality IN ('metadata_only', 'blocked')
           )::int AS extraction_errors,
           (
             SELECT COUNT(*)::int FROM (
               SELECT content_hash
               FROM public.knowledge_documents
               WHERE media_record_id IN (SELECT id FROM filtered)
                 AND content_hash IS NOT NULL
               GROUP BY content_hash
               HAVING COUNT(*) > 1
             ) duplicate_hashes
           ) AS duplicate_groups,
           (
             SELECT COUNT(*)::int FROM public.media_quotes q
             WHERE q.media_record_id IN (SELECT id FROM filtered)
               AND q.is_current = true
               AND q.verification_status IN ('unverified', 'needs_review')
           ) AS pending_quotes,
           (
             SELECT COUNT(*)::int
             FROM public.knowledge_documents d
             WHERE d.media_record_id IN (SELECT id FROM filtered)
               AND d.chunk_count > 0
               AND NOT EXISTS (
                 SELECT 1 FROM public.knowledge_chunks c
                 WHERE c.document_id = d.id
                   AND c.embedding_model = 'baai/bge-m3'
                   AND c.embedding_dimensions = 1024
               )
           ) AS missing_embeddings
         FROM filtered`,
        base.params
      ),
      query<{ id: string; title: string; outlet: string }>(
        `${base.sql}
         SELECT id, title, outlet FROM filtered
         WHERE effective_date IS NULL
         ORDER BY title ASC LIMIT 50`,
        base.params
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        media_coverage_status: string | null;
        media_text_quality: string | null;
        chunk_count: number | null;
      }>(
        `${base.sql}
         SELECT id, title, outlet, media_coverage_status, media_text_quality, chunk_count
         FROM filtered
         WHERE media_text_quality NOT IN ('full_text', 'partial_text')
            OR COALESCE(chunk_count, 0) = 0
         ORDER BY title ASC LIMIT 50`,
        base.params
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        media_coverage_status: string | null;
        media_text_quality: string | null;
      }>(
        `${base.sql}
         SELECT id, title, outlet, media_coverage_status, media_text_quality
         FROM filtered
         WHERE media_coverage_status IN ('failed', 'blocked')
            OR media_text_quality IN ('metadata_only', 'blocked')
         ORDER BY title ASC LIMIT 50`,
        base.params
      ),
      query<{ content_hash: string; count: number; titles: string[] }>(
        `${base.sql}
         SELECT d.content_hash, COUNT(*)::int AS count, ARRAY_AGG(f.title) AS titles
         FROM filtered f
         JOIN public.knowledge_documents d ON d.media_record_id = f.id
         WHERE d.content_hash IS NOT NULL
         GROUP BY d.content_hash
         HAVING COUNT(*) > 1
         ORDER BY count DESC LIMIT 50`,
        base.params
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        quote_text: string;
        verification_status: string;
        attribution: string;
      }>(
        `${base.sql}
         SELECT q.id, f.title, f.outlet, q.quote_text, q.verification_status, q.attribution
         FROM filtered f
         JOIN public.media_quotes q
           ON q.media_record_id = f.id AND q.is_current = true
         WHERE q.verification_status IN ('unverified', 'needs_review')
         ORDER BY q.created_at DESC LIMIT 50`,
        base.params
      ),
      query<{ id: string; title: string; outlet: string; chunk_count: number }>(
        `${base.sql}
         SELECT f.document_id AS id, f.title, f.outlet, f.chunk_count
         FROM filtered f
         WHERE f.document_id IS NOT NULL
           AND COALESCE(f.chunk_count, 0) > 0
           AND NOT EXISTS (
             SELECT 1 FROM public.knowledge_chunks c
             WHERE c.document_id = f.document_id
               AND c.embedding_model = 'baai/bge-m3'
               AND c.embedding_dimensions = 1024
           )
         ORDER BY f.title ASC LIMIT 50`,
        base.params
      ),
    ]);

    return {
      counts: counts[0] || {
        missing_dates: 0,
        without_text: 0,
        extraction_errors: 0,
        duplicate_groups: 0,
        pending_quotes: 0,
        missing_embeddings: 0,
      },
      missingDates,
      withoutText,
      extractionErrors,
      duplicates,
      pendingQuotes,
      missingEmbeddings,
    };
  });
}

export async function loadMediaIntelligenceAnalysis(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('analysis', filters);

  return cached(key, 30_000, async () => {
    const base = baseCte(filters);
    const paged = pageParams(filters, base.params);
    const versionParam = `$${base.params.length + 1}`;
    const versionParams = [...base.params, MEDIA_ANALYZER_VERSION];

    const statusExpression = `
      CASE
        WHEN f.media_text_quality NOT IN ('full_text', 'partial_text')
          OR COALESCE(f.chunk_count, 0) = 0
          OR f.ingestion_status IS DISTINCT FROM 'completed'
          THEN 'not_eligible'
        WHEN lr.status IN ('pending', 'processing') THEN lr.status
        WHEN lr.status = 'failed' THEN 'failed'
        WHEN lr.status = 'completed'
          AND lr.content_hash IS NOT DISTINCT FROM f.content_hash
          AND lr.analyzer_version = ${versionParam}
          THEN 'analyzed'
        WHEN lr.status = 'completed' THEN 'stale'
        ELSE 'not_analyzed'
      END`;
    const rowStatusExpression = statusExpression.replace(
      `= ${versionParam}`,
      `= $${paged.params.length + 1}`
    );

    const [counts, rows, total, runs, queue] = await Promise.all([
      query<{
        eligible: number;
        analyzed: number;
        stale: number;
        not_analyzed: number;
        pending: number;
        processing: number;
        failed: number;
        not_eligible: number;
      }>(
        `${base.sql}
         SELECT
           COUNT(*) FILTER (
             WHERE f.media_text_quality IN ('full_text', 'partial_text')
               AND COALESCE(f.chunk_count, 0) > 0
               AND f.ingestion_status = 'completed'
           )::int AS eligible,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'analyzed')::int AS analyzed,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'stale')::int AS stale,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'not_analyzed')::int AS not_analyzed,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'pending')::int AS pending,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'processing')::int AS processing,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'failed')::int AS failed,
           COUNT(*) FILTER (WHERE ${statusExpression} = 'not_eligible')::int AS not_eligible
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT r.id, r.status, r.content_hash, r.analyzer_version
           FROM public.media_analysis_runs r
           WHERE r.media_record_id = f.id
           ORDER BY r.created_at DESC
           LIMIT 1
         ) lr ON true`,
        versionParams
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        canonical_url: string | null;
        effective_date: string | null;
        kind: string;
        language: string | null;
        effective_topic: string | null;
        media_text_quality: string | null;
        chunk_count: number | null;
        analysis_status: string;
        latest_run_id: string | null;
        latest_run_status: string | null;
        latest_run_at: string | null;
        error_code: string | null;
        quote_count: number | null;
        relation_count: number | null;
        analyzer_version: string | null;
        latest_run_hash: string | null;
        document_hash: string | null;
        effective_role: string | null;
      }>(
        `${base.sql}
         SELECT
           f.id,
           f.title,
           f.outlet,
           f.canonical_url,
           f.effective_date::text AS effective_date,
           f.kind,
           COALESCE(NULLIF(f.detected_language, ''), NULLIF(f.lang, '')) AS language,
           f.effective_topic,
           f.media_text_quality,
           f.chunk_count,
           ${rowStatusExpression} AS analysis_status,
           lr.id AS latest_run_id,
           lr.status AS latest_run_status,
           lr.created_at::text AS latest_run_at,
           lr.error_code,
           lr.quote_count,
           lr.relation_count,
           lr.analyzer_version,
           lr.content_hash AS latest_run_hash,
           f.content_hash AS document_hash,
           f.effective_role
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT r.id, r.status, r.created_at, r.error_code, r.quote_count,
                  r.relation_count, r.analyzer_version, r.content_hash
           FROM public.media_analysis_runs r
           WHERE r.media_record_id = f.id
           ORDER BY r.created_at DESC
           LIMIT 1
         ) lr ON true
         ORDER BY
           CASE ${rowStatusExpression}
             WHEN 'failed' THEN 0
             WHEN 'stale' THEN 1
             WHEN 'not_analyzed' THEN 2
             WHEN 'pending' THEN 3
             WHEN 'processing' THEN 4
             WHEN 'analyzed' THEN 5
             ELSE 6
           END,
           f.effective_date DESC NULLS LAST,
           f.title ASC
         LIMIT ${paged.limitSql} OFFSET ${paged.offsetSql}`,
        [...paged.params, MEDIA_ANALYZER_VERSION]
      ),
      query<{ total: number }>(
        `${base.sql} SELECT COUNT(*)::int AS total FROM filtered`,
        base.params
      ),
      query<{
        id: string;
        media_record_id: string;
        title: string | null;
        outlet: string | null;
        status: string;
        attempt: number;
        max_attempts: number;
        error_code: string | null;
        error_detail: string | null;
        quote_count: number;
        relation_count: number;
        topic_count: number;
        rejected_candidate_count: number;
        analyzer_version: string;
        requested_via: string;
        created_at: string;
        completed_at: string | null;
      }>(
        `${base.sql}
         SELECT r.id, r.media_record_id, m.title, m.outlet, r.status, r.attempt,
                r.max_attempts, r.error_code, r.error_detail, r.quote_count,
                r.relation_count, r.topic_count, r.rejected_candidate_count,
                r.analyzer_version, r.requested_via, r.created_at::text AS created_at,
                r.completed_at::text AS completed_at
         FROM public.media_analysis_runs r
         JOIN public.media_archive_records m ON m.id = r.media_record_id
         WHERE r.media_record_id IN (SELECT id FROM filtered)
         ORDER BY r.created_at DESC
         LIMIT 30`,
        base.params
      ),
      query<{ status: string; count: number; oldest: string | null }>(
        `${base.sql}
         SELECT r.status, COUNT(*)::int AS count, MIN(r.created_at)::text AS oldest
         FROM public.media_analysis_runs r
         WHERE r.media_record_id IN (SELECT id FROM filtered)
         GROUP BY 1`,
        base.params
      ),
    ]);

    const queueCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      oldestPendingAt: null as string | null,
    };

    for (const row of queue) {
      if (row.status in queueCounts && row.status !== 'oldestPendingAt') {
        const key = row.status as keyof typeof queueCounts;
        if (key !== 'oldestPendingAt') queueCounts[key] = row.count;
      }

      if (row.status === 'pending') queueCounts.oldestPendingAt = row.oldest;
    }

    return {
      counts: counts[0] || {
        eligible: 0,
        analyzed: 0,
        stale: 0,
        not_analyzed: 0,
        pending: 0,
        processing: 0,
        failed: 0,
        not_eligible: 0,
      },
      rows,
      total: total[0]?.total || 0,
      runs,
      queue: queueCounts,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  });
}

export async function loadMediaIntelligenceRoles(filters: MediaIntelligenceFilters) {
  const key = mediaIntelligenceCacheKey('roles', filters);

  return cached(key, 60_000, async () => {
    const base = baseCte(filters);

    const [roles, roleOutlets, rolePublications, entities, entityTypes, interactions] =
      await Promise.all([
      query<{
        role: string;
        publications: number;
        confidence: number | null;
        direct_quotes: number;
      }>(
        `${base.sql}
         SELECT f.effective_role AS role,
                COUNT(*)::int AS publications,
                AVG(f.role_confidence)::float8 AS confidence,
                COALESCE(SUM(q.direct_quotes), 0)::int AS direct_quotes
         FROM filtered f
         LEFT JOIN LATERAL (
           SELECT COUNT(*) FILTER (WHERE qq.quote_type = 'direct_quote')::int AS direct_quotes
           FROM public.media_quotes qq
           WHERE qq.media_record_id = f.id AND qq.is_current = true
         ) q ON true
         WHERE f.effective_role IS NOT NULL
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
      query<{ role: string; outlet: string; publications: number }>(
        `${base.sql}
         SELECT effective_role AS role, outlet, COUNT(*)::int AS publications
         FROM filtered
         WHERE effective_role IS NOT NULL
         GROUP BY 1, 2
         ORDER BY 3 DESC, 2 ASC`,
        base.params
      ),
      query<{
        id: string;
        title: string;
        outlet: string;
        canonical_url: string | null;
        effective_date: string | null;
        role: string;
        confidence: number | null;
      }>(
        `${base.sql}
         SELECT id, title, outlet, canonical_url, effective_date::text AS effective_date,
                effective_role AS role, role_confidence AS confidence
         FROM filtered
         WHERE effective_role IS NOT NULL
         ORDER BY effective_date DESC NULLS LAST
         LIMIT 60`,
        base.params
      ),
      query<{
        entity_type: string;
        name: string;
        mentions: number;
        publications: number;
      }>(
        `${base.sql}
         SELECT e.entity_type, e.name, COUNT(*)::int AS mentions,
                COUNT(DISTINCT e.media_record_id)::int AS publications
         FROM public.media_analysis_entities e
         WHERE e.is_current = true
           AND e.media_record_id IN (SELECT id FROM filtered)
         GROUP BY 1, 2
         ORDER BY 3 DESC, 2 ASC
         LIMIT 80`,
        base.params
      ),
      query<{ entity_type: string; count: number }>(
        `${base.sql}
         SELECT e.entity_type, COUNT(DISTINCT lower(e.name))::int AS count
         FROM public.media_analysis_entities e
         WHERE e.is_current = true
           AND e.media_record_id IN (SELECT id FROM filtered)
         GROUP BY 1`,
        base.params
      ),
      query<{ interaction_type: string; publications: number }>(
        `${base.sql}
         SELECT COALESCE(interaction_type, 'unknown') AS interaction_type,
                COUNT(*)::int AS publications
         FROM filtered
         WHERE effective_role IS NOT NULL
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        base.params
      ),
    ]);

    return {
      roles,
      roleOutlets,
      rolePublications,
      entities,
      entityTypes,
      interactions,
    };
  });
}

export async function loadMediaIntelligenceFilterOptions() {
  return cached('filters', 120_000, async () => {
    const [topics, languages, outlets, range, kinds, roles] = await Promise.all([
      query<{ value: string }>(
        `SELECT DISTINCT COALESCE(NULLIF(topic, ''), 'Unknown') AS value
         FROM public.media_archive_records
         ORDER BY 1`
      ),
      query<{ value: string }>(
        `SELECT DISTINCT COALESCE(NULLIF(d.language, ''), NULLIF(m.lang, ''), 'unknown') AS value
         FROM public.media_archive_records m
         LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id
         ORDER BY 1`
      ),
      query<{ value: string }>(
        `SELECT DISTINCT outlet AS value
         FROM public.media_archive_records
         WHERE outlet IS NOT NULL AND outlet <> ''
         ORDER BY 1
         LIMIT 500`
      ),
      query<{ from: string | null; to: string | null }>(
        `SELECT
           MIN(COALESCE(m.published_date, d.published_at::date))::text AS from,
           MAX(COALESCE(m.published_date, d.published_at::date))::text AS to
         FROM public.media_archive_records m
         LEFT JOIN public.knowledge_documents d ON d.media_record_id = m.id`
      ),
      query<{ value: string }>(
        `SELECT DISTINCT kind AS value
         FROM public.media_archive_records
         WHERE kind IS NOT NULL AND kind <> ''
         ORDER BY 1`
      ),
      query<{ value: string }>(
        `SELECT DISTINCT role AS value
         FROM public.media_editorial_roles
         WHERE is_current = true
         ORDER BY 1`
      ),
    ]);

    return {
      topics: topics.map((row) => row.value),
      languages: languages.map((row) => row.value),
      outlets: outlets.map((row) => row.value),
      kinds: kinds.map((row) => row.value),
      roles: roles.map((row) => row.value),
      range: range[0] || { from: null, to: null },
    };
  });
}
