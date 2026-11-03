// @ts-nocheck
/**
 * Reproducible Pierrot reliability benchmark.
 *
 * Runs the verified 31-query set against the production Brain corpus in
 * read-only mode. It compares:
 *   * the currently deployed brain_search_hybrid RPC;
 *   * the candidate HNSW/GIN/RRF query from
 *     migrations/2026-11-03_brain_hybrid_hnsw_fix.sql (executed inline,
 *     not installed).
 *
 * It does not write to the database, change migrations or call a generation
 * model. Query embeddings are batched once and reused.
 *
 * Usage:
 *   ENV_FILE=.env.production.local npx tsx scripts/knowledge/pierrot-reliability-benchmark.ts
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

import { retrieveBrainEvidence } from '../../lib/knowledge/rag/brainRetrieval';
import { retrieveBrainEvidenceWithRefinement } from '../../lib/knowledge/rag/pierrotRetrieval';
import { buildBrainQueryPlan } from '../../lib/knowledge/rag/queryRouting';
import {
  verifiedBenchmarkQueries,
  type ReliabilityBenchmarkQuery,
} from '../../lib/knowledge/evaluation/brain/reliabilityBenchmark';
import type { BrainSearchRow } from '../../lib/knowledge/rag/types';

dotenv.config({ path: process.env.ENV_FILE || '.env.production.local' });

const model = 'baai/bge-m3';
const dimensions = 1024;
const topK = 5;
const totalTimeoutMs = 15_000;
const questions = verifiedBenchmarkQueries();

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function parseRows(rows: any[]): BrainSearchRow[] {
  return rows.map((row) => ({
    chunk_id: String(row.chunk_id),
    document_id: String(row.document_id),
    document_title: String(row.document_title || ''),
    source_type: String(row.source_type || ''),
    source_domain: typeof row.source_domain === 'string' ? row.source_domain : null,
    author: typeof row.author === 'string' ? row.author : null,
    language: typeof row.language === 'string' ? row.language : null,
    published_at: toIso(row.published_at),
    content: String(row.content || ''),
    heading: String(row.heading || ''),
    section_path: Array.isArray(row.section_path) ? row.section_path : [],
    section_index: Number(row.section_index || 0),
    line_start: Number(row.line_start || 0),
    line_end: Number(row.line_end || 0),
    similarity: Number(row.similarity || 0),
    lexical_score: Number(row.lexical_score || 0),
  }));
}

async function embedQueries(texts: string[]): Promise<number[][]> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

  if (!apiKey || apiKey.length < 20 || apiKey.includes('SENSITIVE')) {
    throw new Error('OPENROUTER_API_KEY is not configured with a usable key.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: texts, encoding_format: 'float' }),
  });

  const payload = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
    error?: unknown;
  };

  if (!response.ok || !payload.data) {
    throw new Error(`embedding failed ${response.status} ${JSON.stringify(payload.error)}`);
  }

  return [...payload.data]
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.embedding);
}

const NEW_SEARCH_SQL = `
with vector_candidates as (
  select
    c.id as chunk_id,
    c.document_id,
    1 - (c.embedding <=> $1::vector) as similarity
  from public.knowledge_chunks c
  where c.access_class = $4
    and c.embedding_model = $2
    and c.embedding_dimensions = $3
    and ($10::text[] is null or c.document_id = any ($10::text[]))
  order by c.embedding <=> $1::vector
  limit least(greatest($13 * 2, 40), 120)
),
lexical_candidates as (
  select
    c.id as chunk_id,
    c.document_id,
    1 - (c.embedding <=> $1::vector) as similarity,
    ts_rank_cd(
      to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content),
      plainto_tsquery('simple', $5)
    )::double precision as lexical_score
  from public.knowledge_chunks c
  where $5 is not null
    and btrim($5) <> ''
    and c.access_class = $4
    and c.embedding_model = $2
    and c.embedding_dimensions = $3
    and ($10::text[] is null or c.document_id = any ($10::text[]))
    and to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content)
        @@ plainto_tsquery('simple', $5)
  order by lexical_score desc, c.embedding <=> $1::vector, c.id
  limit least(greatest($13 * 2, 40), 120)
),
vector_ranked as (
  select v.*, row_number() over (order by v.similarity desc, v.chunk_id) as vector_rank
  from vector_candidates v
),
lexical_ranked as (
  select l.*, row_number() over (
    order by l.lexical_score desc, l.similarity desc, l.chunk_id
  ) as lexical_rank
  from lexical_candidates l
),
merged as (
  select
    coalesce(v.chunk_id, l.chunk_id) as chunk_id,
    coalesce(v.document_id, l.document_id) as document_id,
    coalesce(v.similarity, l.similarity) as similarity,
    coalesce(l.lexical_score, 0::double precision) as lexical_score,
    coalesce(1.0 / (60 + v.vector_rank), 0::double precision)
      + coalesce(1.0 / (60 + l.lexical_rank), 0::double precision) as fused_score
  from vector_ranked v
  full outer join lexical_ranked l on l.chunk_id = v.chunk_id
)
select
  m.chunk_id,
  m.document_id,
  d.title as document_title,
  d.source_type,
  coalesce(
    nullif(d.metadata->>'source_domain', ''),
    split_part(regexp_replace(coalesce(d.canonical_url, d.source_url, d.source_path, ''),
      '^https?://', ''), '/', 1)
  ) as source_domain,
  d.author,
  d.language,
  d.published_at,
  c.content,
  c.heading,
  c.section_path,
  c.section_index,
  c.line_start,
  c.line_end,
  m.similarity,
  m.lexical_score
from merged m
join public.knowledge_chunks c on c.id = m.chunk_id
join public.knowledge_documents d
  on d.id = m.document_id
 and d.embedding_model = c.embedding_model
 and d.embedding_dimensions = c.embedding_dimensions
where d.ingestion_status = 'completed'
  and d.access_class = $4
  and d.embedding_model = $2
  and d.embedding_dimensions = $3
  and ($6::text[] is null or d.source_type = any ($6::text[]))
  and ($9::text[] is null or d.language = any ($9::text[]))
  and ($8::text[] is null or lower(coalesce(d.author, '')) = any ($8::text[]))
  and ($11::timestamptz is null or d.published_at >= $11::timestamptz)
  and ($12::timestamptz is null or d.published_at <= $12::timestamptz)
  and ($7::text[] is null or exists (
    select 1
    from unnest($7::text[]) as allowed_domain
    where coalesce(
        nullif(d.metadata->>'source_domain', ''),
        split_part(regexp_replace(coalesce(d.canonical_url, d.source_url, d.source_path, ''),
          '^https?://', ''), '/', 1)
      ) = allowed_domain
      or coalesce(
        nullif(d.metadata->>'source_domain', ''),
        split_part(regexp_replace(coalesce(d.canonical_url, d.source_url, d.source_path, ''),
          '^https?://', ''), '/', 1)
      ) like '%.' || allowed_domain
  ))
  and (m.similarity >= $14 or m.lexical_score > 0)
order by m.fused_score desc, m.similarity desc, m.chunk_id
limit $13
`;

function params(input: any): any[] {
  return [
    vectorLiteral(input.queryEmbedding),
    input.modelId,
    input.dimensions,
    input.accessClass,
    input.queryText || null,
    input.sourceTypes || null,
    input.sourceDomains || null,
    input.authors || null,
    input.languages || null,
    input.documentIds || null,
    input.publishedFrom || null,
    input.publishedTo || null,
    input.matchCount || 40,
    input.minSimilarity,
  ];
}

function average(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function score(question: ReliabilityBenchmarkQuery, result: any) {
  const retrieved = unique(result.hits.map((hit: any) => hit.documentId)).slice(0, topK);
  const expected = question.expectedDocumentIds || [];
  const answerable = question.answerability === 'answerable' && expected.length > 0;
  const relevantRanks = retrieved
    .map((id, index) => (expected.includes(id) ? index + 1 : null))
    .filter((rank): rank is number => rank !== null);
  const relevant = relevantRanks.length;
  const recallAt5 = answerable ? relevant / expected.length : null;
  const precisionAt5 = answerable ? (retrieved.length > 0 ? relevant / retrieved.length : 0) : null;
  const mrr = answerable ? (relevantRanks[0] ? 1 / relevantRanks[0] : 0) : null;
  const dcg = relevantRanks.reduce((sum, rank) => sum + 1 / Math.log2(rank + 1), 0);
  const idealRanks = Math.min(expected.length, topK);
  const idcg =
    idealRanks > 0
      ? Array.from({ length: idealRanks }, (_, index) => 1 / Math.log2(index + 2)).reduce(
          (sum, value) => sum + value,
          0
        )
      : 0;
  const ndcgAt5 = answerable ? (idcg > 0 ? dcg / idcg : 0) : null;

  const sourceClasses = unique(result.hits.map((hit: any) => String(hit.sourceClass || '')));
  const expectedSources = question.expectedSourceClasses.map(String);
  const sourceAccuracy =
    expectedSources.length === 0
      ? result.hits.length === 0
        ? 1
        : 0
      : sourceClasses.length === 0
        ? 0
        : sourceClasses.filter((source) => expectedSources.includes(source)).length /
          sourceClasses.length;

  return {
    id: question.id,
    category: question.category,
    answerability: question.answerability,
    outcome: result.outcome,
    code: result.code || null,
    hits: result.hits.length,
    retrieved,
    expected,
    recallAt5,
    precisionAt5,
    mrr,
    ndcgAt5,
    sourceAccuracy,
    falseAccept: !answerable && result.hits.length > 0,
    timeout: result.outcome === 'unavailable' && result.code === 'timeout',
    latencyMs: result.latencyMs,
    embeddingMs: result.timings?.embeddingMs ?? 0,
    searchMs: result.timings?.searchMs ?? 0,
    rankingMs: result.timings?.rankingMs ?? 0,
  };
}

function summarize(name: string, rows: any[], embeddingAverageMs: number) {
  const answerable = rows.filter((row) => row.answerability === 'answerable');
  const unanswerable = rows.filter((row) => row.answerability === 'unanswerable');
  const latencies = rows.map((row) => row.latencyMs + embeddingAverageMs);

  return {
    name,
    questions: rows.length,
    answerable: answerable.length,
    unanswerable: unanswerable.length,
    recallAt5: average(answerable.map((row) => row.recallAt5 ?? 0)),
    precisionAt5: average(answerable.map((row) => row.precisionAt5 ?? 0)),
    mrr: average(answerable.map((row) => row.mrr ?? 0)),
    ndcgAt5: average(answerable.map((row) => row.ndcgAt5 ?? 0)),
    sourceAccuracy: average(rows.map((row) => row.sourceAccuracy)),
    falsePositiveRate:
      unanswerable.length > 0
        ? average(unanswerable.map((row) => (row.falseAccept ? 1 : 0)))
        : null,
    timeoutRate: average(rows.map((row) => (row.timeout ? 1 : 0))),
    emptyRate: average(rows.map((row) => (row.hits === 0 ? 1 : 0))),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    sqlP50Ms: percentile(rows.map((row) => row.searchMs), 50),
    sqlP95Ms: percentile(rows.map((row) => row.searchMs), 95),
    embeddingAverageMs,
    rows,
  };
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const embeddingStartedAt = Date.now();
    const vectors = await embedQueries(questions.map((question) => question.question));
    const embeddingAverageMs = (Date.now() - embeddingStartedAt) / questions.length;
    const env = { ...process.env, UNFRAMED_EMBEDDING_MODEL: model };

    const oldRows = [];
    const newRows = [];

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const vector = vectors[index];
      const embeddingClient = {
        modelId: model,
        dimensions,
        embed: async () => [vector],
      };

      const run = async (search: any) =>
        retrieveBrainEvidenceWithRefinement({
          query: question.question,
          plan: buildBrainQueryPlan(question.question),
          topK,
          maxAttempts: 1,
          totalTimeoutMs,
          retrieve: (attempt) =>
            retrieveBrainEvidence({
              query: attempt.query,
              plan: attempt.plan,
              scope: 'owner',
              ownerAuthorized: true,
              enabled: true,
              env,
              embeddingClient,
              search,
              topK: attempt.topK,
              timeoutMs: attempt.timeoutMs,
            }),
        });

      const oldResult = await run(async (input: any) => {
        const result = await client.query(
          `select * from public.brain_search_hybrid($1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          params(input)
        );
        return parseRows(result.rows);
      });

      const newResult = await run(async (input: any) => {
        const result = await client.query(NEW_SEARCH_SQL, params(input));
        return parseRows(result.rows);
      });

      oldRows.push(score(question, oldResult));
      newRows.push(score(question, newResult));

      console.log(
        `[${question.id}] old=${oldResult.outcome}:${oldResult.hits.length} new=${newResult.outcome}:${newResult.hits.length}`
      );
    }

    const output = {
      generatedAt: new Date().toISOString(),
      corpus: 'production-like read-only',
      topK,
      embeddingAverageMs,
      old: summarize('deployed brain_search_hybrid', oldRows, embeddingAverageMs),
      new: summarize('candidate HNSW/GIN/RRF query', newRows, embeddingAverageMs),
    };
    console.log('\nBENCHMARK_JSON');
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
