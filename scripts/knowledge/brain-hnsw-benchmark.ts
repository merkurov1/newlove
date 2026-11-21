// @ts-nocheck
/**
 * Brain HNSW retrieval benchmark and plan evidence harness.
 *
 * Modes
 * -----
 *   plan     EXPLAIN (ANALYZE, BUFFERS) for the default plan and for the
 *            transaction-local HNSW plan at ef_search 40/80/120, plus an
 *            index-usage check for the target vector path.
 *   recall   Exact vs approximate vector recall@10/20/40 on real query
 *            embeddings, latency medians/P95 and the ef_search chosen by the
 *            documented quality gates.
 *   dump     Anonymised final-ranked chunk ids from the deployed RPC. Run it
 *            before and after applying the migration on a preview database.
 *   compare  Diff two dump files (baseline vs candidate) without query text.
 *
 * Why a query manifest is required
 * --------------------------------
 * brain_retrieval telemetry intentionally stores no query text, so real query
 * embeddings cannot be reconstructed from production telemetry. The harness
 * therefore refuses to substitute chunk embeddings for quality measurements.
 * Provide 30-50 real queries in a local, non-committed JSON file:
 *
 *   BRAIN_BENCH_QUERIES_FILE=/secure/path/brain-queries.json
 *   [
 *     { "id": "q001", "category": "thematic", "text": "..." },
 *     { "id": "q002", "category": "scope", "text": "...", "accessClass": "owner" },
 *     { "id": "q003", "category": "document", "text": "...", "documentIds": ["doc_..."] }
 *   ]
 *
 * The file is read in memory only. Output contains a SHA-256 query hash and
 * category, never the text. For plan mode only, a chunk embedding may be used
 * as a probe vector when the manifest is absent; that is explicitly labelled
 * and must never be reported as a retrieval-quality metric.
 *
 * Usage
 * -----
 *   ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts plan
 *   BRAIN_BENCH_QUERIES_FILE=/secure/queries.json \
 *     ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts recall
 *   BRAIN_BENCH_QUERIES_FILE=/secure/queries.json \
 *     BRAIN_BENCH_DUMP_FILE=/tmp/baseline.json \
 *     ENV_FILE=.env.preview.local npx tsx scripts/knowledge/brain-hnsw-benchmark.ts dump
 *   npx tsx scripts/knowledge/brain-hnsw-benchmark.ts compare /tmp/baseline.json /tmp/candidate.json
 *
 * The harness never writes to the database, never changes settings outside a
 * transaction and never calls a generation model.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import dotenv from 'dotenv';
import { Client } from 'pg';

import {
  chooseEfSearch,
  meetsGates,
  overlapAtK,
  percentile,
  rankChunkIds,
  summarizeEfSearch,
  summarizeLatencies,
  type EfSearchSummary,
  type QueryRanking,
} from '../../lib/knowledge/rag/hnswBenchmark';
import { createOpenRouterEmbeddingClientFromEnv } from '../../lib/knowledge/rag/embeddings';
import { retrieveBrainEvidence } from '../../lib/knowledge/rag/brainRetrieval';
import { retrieveBrainEvidenceWithRefinement } from '../../lib/knowledge/rag/pierrotRetrieval';
import { buildBrainQueryPlan } from '../../lib/knowledge/rag/queryRouting';
import { createSupabaseBrainSearch } from '../../lib/knowledge/rag/supabaseStore';
import type { BrainSearchRow } from '../../lib/knowledge/rag/types';

dotenv.config({ path: process.env.ENV_FILE || '.env.production.local' });

const MODEL = 'baai/bge-m3';
const DIMENSIONS = 1024;
const HNSW_INDEX = 'knowledge_chunks_embedding_hnsw_idx';
const EF_VALUES = [40, 80, 120];
const DEFAULT_REPETITIONS = 5;
const DEFAULT_TOP_K = 40;
const RPC_TOP_K = 10;

const EXACT_VECTOR_SQL = `
select
  c.id as chunk_id,
  c.document_id,
  1 - (c.embedding <=> $1::vector) as similarity
from public.knowledge_chunks c
where c.access_class = $4
  and c.embedding_model = $2
  and c.embedding_dimensions = $3
  and ($5::text[] is null or c.document_id = any ($5::text[]))
order by c.embedding <=> $1::vector
limit $6
`;

// This is the exact query executed inside public.brain_vector_candidates in
// migrations/2026-12-15_brain_hybrid_hnsw_planner.sql. Keep the two in sync.
const ANN_VECTOR_SQL = `
select
  c.id as chunk_id,
  c.document_id,
  1 - (c.embedding <=> $1::vector) as similarity
from public.knowledge_chunks c
where c.access_class = $4
  and c.embedding_model = $2
  and c.embedding_dimensions = $3
  and ($5::text[] is null or c.document_id = any ($5::text[]))
order by c.embedding <=> $1::vector
limit $6
`;

const HELPER_SQL = `
select chunk_id, document_id, similarity
from public.brain_vector_candidates(
  $1::vector, $2, $3, $4, $5::text[], $6, $7
)
`;

const DEPLOYED_RPC_SQL = `
select * from public.brain_search_hybrid(
  $1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
)
`;

type BenchQuery = {
  queryHash: string;
  category: string;
  text: string;
  accessClass: 'owner' | 'public';
  documentIds: string[] | null;
};

type VectorRow = {
  chunk_id: string;
  document_id: string;
  similarity: number;
};

type PlanNode = {
  nodeType: string;
  indexName: string | null;
  actualRows: number | null;
};

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function parseVector(value: unknown): number[] {
  if (typeof value !== 'string') throw new Error('probe vector is not text');
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length !== DIMENSIONS) {
    throw new Error('probe vector has an unexpected shape');
  }
  return parsed.map(Number);
}

function hashValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function safeCategory(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9_-]{1,40}$/.test(text) ? text : 'uncategorized';
}

function loadManifest(): BenchQuery[] {
  const file = (process.env.BRAIN_BENCH_QUERIES_FILE || '').trim();
  if (!file) {
    throw new Error(
      'BRAIN_BENCH_QUERIES_FILE is required. Telemetry stores no query text, so the harness refuses to substitute chunk embeddings for retrieval-quality metrics.'
    );
  }

  const payload = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('query manifest must be a non-empty JSON array');
  }

  return payload.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof entry.text !== 'string') {
      throw new Error(`query manifest entry ${index} has no text`);
    }

    const text = entry.text.trim();
    if (!text || text.length > 2000) {
      throw new Error(`query manifest entry ${index} has an invalid length`);
    }

    const accessClass = entry.accessClass === 'public' ? 'public' : 'owner';
    const filteredDocuments =
      Array.isArray(entry.documentIds) && entry.documentIds.length > 0
        ? entry.documentIds.filter((value: unknown) => typeof value === 'string')
        : [];
    const documentIds = filteredDocuments.length > 0 ? filteredDocuments : null;

    return {
      queryHash: hashValue(typeof entry.id === 'string' ? entry.id : text),
      category: safeCategory(entry.category),
      text,
      accessClass,
      documentIds,
    };
  });
}

function manifestGateEligibility(queries: BenchQuery[]): boolean {
  return queries.length >= 30 && queries.length <= 50;
}

function parseBrainRows(rows: any[]): BrainSearchRow[] {
  return rows.map((row) => ({
    chunk_id: String(row.chunk_id),
    document_id: String(row.document_id),
    document_title: String(row.document_title || ''),
    source_type: String(row.source_type || ''),
    source_domain: typeof row.source_domain === 'string' ? row.source_domain : null,
    author: typeof row.author === 'string' ? row.author : null,
    language: typeof row.language === 'string' ? row.language : null,
    published_at:
      row.published_at instanceof Date
        ? row.published_at.toISOString()
        : typeof row.published_at === 'string'
          ? row.published_at
          : null,
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

function rpcParams(input: any): any[] {
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

function vectorParams(query: BenchQuery, vector: number[], limit: number): any[] {
  return [vectorLiteral(vector), MODEL, DIMENSIONS, query.accessClass, query.documentIds, limit];
}

async function inTransaction<T>(
  client: Client,
  settings: Record<string, string | number>,
  run: () => Promise<T>
): Promise<T> {
  await client.query('begin');
  try {
    for (const [name, value] of Object.entries(settings)) {
      await client.query('select set_config($1, $2, true)', [name, String(value)]);
    }
    const result = await run();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

function collectPlanNodes(plan: any): PlanNode[] {
  if (!plan) return [];

  const node: PlanNode = {
    nodeType: String(plan['Node Type'] || 'unknown'),
    indexName: typeof plan['Index Name'] === 'string' ? plan['Index Name'] : null,
    actualRows: typeof plan['Actual Rows'] === 'number' ? plan['Actual Rows'] : null,
  };

  const children = Array.isArray(plan.Plans) ? plan.Plans : [];
  return [node, ...children.flatMap((child: any) => collectPlanNodes(child))];
}

async function explain(
  client: Client,
  label: string,
  sql: string,
  values: any[],
  settings: Record<string, string | number>
) {
  const startedAt = Date.now();

  const payload = await inTransaction(client, settings, async () => {
    const result = await client.query(`explain (analyze, buffers, format json) ${sql}`, values);
    return result.rows[0]['QUERY PLAN'][0];
  });

  const nodes = collectPlanNodes(payload.Plan);
  const indexNames = nodes
    .map((node) => node.indexName)
    .filter((name): name is string => Boolean(name));

  return {
    label,
    wallMs: Date.now() - startedAt,
    planningMs: payload['Planning Time'] ?? null,
    executionMs: payload['Execution Time'] ?? null,
    nodes,
    indexNames,
    usesHnsw: indexNames.includes(HNSW_INDEX),
  };
}

async function helperAvailable(client: Client): Promise<boolean> {
  try {
    const result = await client.query(
      `select to_regprocedure('public.brain_vector_candidates(vector,text,integer,text,text[],integer,integer)') is not null as present`
    );
    return Boolean(result.rows[0]?.present);
  } catch {
    return false;
  }
}

async function hnswIndexScans(client: Client): Promise<number | null> {
  try {
    await client.query('select pg_stat_force_next_flush()');
  } catch {
    // Older PostgreSQL builds do not expose the flush helper.
  }

  try {
    const result = await client.query(
      `select coalesce(idx_scan, 0)::bigint as idx_scan
       from pg_stat_user_indexes
       where schemaname = 'public'
         and relname = 'knowledge_chunks'
         and indexrelname = $1`,
      [HNSW_INDEX]
    );
    return result.rows.length > 0 ? Number(result.rows[0].idx_scan) : null;
  } catch {
    return null;
  }
}

async function probeVector(
  client: Client,
  queries: BenchQuery[],
  embeddingClient: any
): Promise<{ vector: number[]; source: 'real_query' | 'chunk_embedding_plan_only' }> {
  if (queries.length > 0 && embeddingClient) {
    try {
      const [vector] = await embeddingClient.embed([queries[0].text]);
      if (Array.isArray(vector) && vector.length === DIMENSIONS) {
        return { vector, source: 'real_query' };
      }
    } catch {
      // Fall through to the plan-only probe. The output will label it clearly.
    }
  }

  const result = await client.query(
    `select embedding::text as embedding
     from public.knowledge_chunks
     where embedding_model = $1 and embedding_dimensions = $2
     order by id
     limit 1`,
    [MODEL, DIMENSIONS]
  );

  if (!result.rows[0]?.embedding) {
    throw new Error('no probe vector available (manifest missing and corpus empty)');
  }

  return { vector: parseVector(result.rows[0].embedding), source: 'chunk_embedding_plan_only' };
}

function embeddingClientOrNull() {
  try {
    const env = { ...process.env, UNFRAMED_EMBEDDING_MODEL: MODEL };
    return createOpenRouterEmbeddingClientFromEnv(env);
  } catch {
    return null;
  }
}

function embeddingClientOrThrow() {
  const client = embeddingClientOrNull();
  if (!client) {
    throw new Error(
      'OPENROUTER_API_KEY/UNFRAMED_EMBEDDING_MODEL are not configured; real query embeddings cannot be produced.'
    );
  }
  return client;
}

async function runExact(
  client: Client,
  query: BenchQuery,
  vector: number[],
  limit: number
): Promise<VectorRow[]> {
  const result = await inTransaction(
    client,
    {
      enable_indexscan: 'off',
      enable_bitmapscan: 'off',
      enable_seqscan: 'on',
      enable_sort: 'on',
    },
    () => client.query(EXACT_VECTOR_SQL, vectorParams(query, vector, limit))
  );

  return result.rows.map((row) => ({
    chunk_id: String(row.chunk_id),
    document_id: String(row.document_id),
    similarity: Number(row.similarity),
  }));
}

async function runApprox(
  client: Client,
  query: BenchQuery,
  vector: number[],
  limit: number,
  efSearch: number,
  helper: boolean
): Promise<VectorRow[]> {
  const settings = helper
    ? {}
    : {
        enable_indexscan: 'on',
        enable_bitmapscan: 'on',
        enable_seqscan: 'off',
        enable_sort: 'off',
        'hnsw.ef_search': efSearch,
      };

  const result = await inTransaction(client, settings, () =>
    client.query(
      helper ? HELPER_SQL : ANN_VECTOR_SQL,
      helper
        ? [...vectorParams(query, vector, limit), efSearch]
        : vectorParams(query, vector, limit)
    )
  );

  return result.rows.map((row) => ({
    chunk_id: String(row.chunk_id),
    document_id: String(row.document_id),
    similarity: Number(row.similarity),
  }));
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = performance.now();
  const value = await run();
  return { value, ms: performance.now() - startedAt };
}

async function modePlan(client: Client) {
  const queries = (() => {
    try {
      return loadManifest();
    } catch {
      return [];
    }
  })();
  const embeddingClient = queries.length > 0 ? embeddingClientOrNull() : null;
  const probe = await probeVector(client, queries, embeddingClient);

  const indexDefinition = await client.query(
    `select indexdef from pg_indexes
     where schemaname = 'public' and tablename = 'knowledge_chunks' and indexname = $1`,
    [HNSW_INDEX]
  );
  const extension = await client.query(
    `select extversion from pg_extension where extname = 'vector'`
  );
  const corpus = await client.query(
    `select count(*)::int as chunks, count(embedding)::int as embedded
     from public.knowledge_chunks`
  );
  const helper = await helperAvailable(client);

  const values = vectorParams(
    { accessClass: 'owner', documentIds: null },
    probe.vector,
    DEFAULT_TOP_K
  );

  const scopedDocument = await client.query(
    `select document_id from public.knowledge_chunks order by id limit 1`
  );
  const scopedValues = scopedDocument.rows[0]?.document_id
    ? vectorParams(
        { accessClass: 'owner', documentIds: [String(scopedDocument.rows[0].document_id)] },
        probe.vector,
        DEFAULT_TOP_K
      )
    : null;

  const baseline = await explain(client, 'default_plan', ANN_VECTOR_SQL, values, {
    enable_indexscan: 'on',
    enable_bitmapscan: 'on',
    enable_seqscan: 'on',
    enable_sort: 'on',
    'hnsw.ef_search': 40,
  });

  const scopedBaseline = scopedValues
    ? await explain(client, 'scoped_planner_default', ANN_VECTOR_SQL, scopedValues, {
        enable_indexscan: 'on',
        enable_bitmapscan: 'on',
        enable_seqscan: 'on',
        enable_sort: 'on',
        'hnsw.ef_search': 40,
      })
    : null;

  const candidates = [];
  for (const efSearch of EF_VALUES) {
    candidates.push(
      await explain(client, `hnsw_ef_${efSearch}`, ANN_VECTOR_SQL, values, {
        enable_indexscan: 'on',
        enable_bitmapscan: 'on',
        enable_seqscan: 'off',
        enable_sort: 'off',
        'hnsw.ef_search': efSearch,
      })
    );
  }

  let indexUsage: Record<string, unknown> | null = null;
  if (helper) {
    const before = await hnswIndexScans(client);
    const samples = [];
    for (let index = 0; index < 3; index += 1) {
      samples.push((await timed(() => client.query(HELPER_SQL, [...values, 120]))).ms);
    }
    const after = await hnswIndexScans(client);

    indexUsage = {
      helperInstalled: true,
      calls: samples.length,
      sampleMs: samples,
      idxScanBefore: before,
      idxScanAfter: after,
      idxScanDelta: before !== null && after !== null ? after - before : null,
      note: 'A positive delta proves the target helper path executed the HNSW index, not only a manual EXPLAIN.',
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'plan',
    corpus: 'production-like',
    vectorExtension: extension.rows[0]?.extversion ?? 'unknown',
    chunkCount: corpus.rows[0]?.chunks ?? 0,
    embeddedChunkCount: corpus.rows[0]?.embedded ?? 0,
    hnswIndexExists: indexDefinition.rows.length > 0,
    hnswIndexDefinition: indexDefinition.rows[0]?.indexdef ?? null,
    probeSource: probe.source,
    probeWarning:
      probe.source === 'chunk_embedding_plan_only'
        ? 'Chunk embedding used only to reproduce the SQL plan. It is not a retrieval-quality measurement.'
        : null,
    baseline,
    candidates,
    scopedBaseline,
    indexUsage,
  };
}

async function modeRecall(client: Client) {
  const queries = loadManifest();
  const embeddingClient = embeddingClientOrThrow();
  const repetitions = Math.min(
    20,
    Math.max(1, Number(process.env.BRAIN_BENCH_REPETITIONS || DEFAULT_REPETITIONS))
  );
  const helper = await helperAvailable(client);

  const vectors: number[][] = [];
  for (const query of queries) {
    const [vector] = await embeddingClient.embed([query.text]);
    if (!Array.isArray(vector) || vector.length !== DIMENSIONS) {
      throw new Error('embedding provider returned an invalid vector');
    }
    vectors.push(vector);
  }

  const perQuery = [];
  const rankingsByEf = new Map<number, QueryRanking[]>();
  const scopedRankingsByEf = new Map<number, QueryRanking[]>();
  const latencies = {
    exact: [] as number[],
    approx: new Map<number, number[]>(EF_VALUES.map((ef) => [ef, [] as number[]])),
  };
  const cold = {
    exact: [] as number[],
    approx: new Map<number, number[]>(EF_VALUES.map((ef) => [ef, [] as number[]])),
  };
  const empty = {
    exact: 0,
    approx: new Map<number, number>(EF_VALUES.map((ef) => [ef, 0])),
  };

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const vector = vectors[index];

    const firstExact = await timed(() => runExact(client, query, vector, DEFAULT_TOP_K));
    cold.exact.push(firstExact.ms);

    for (let warmup = 0; warmup < 1; warmup += 1) {
      await runExact(client, query, vector, DEFAULT_TOP_K);
    }

    const exactTimes = [];
    let exactRows = firstExact.value;
    for (let repeat = 0; repeat < repetitions; repeat += 1) {
      const sample = await timed(() => runExact(client, query, vector, DEFAULT_TOP_K));
      exactTimes.push(sample.ms);
      exactRows = sample.value;
    }
    latencies.exact.push(...exactTimes);
    if (exactRows.length === 0) empty.exact += 1;

    const exactIds = rankChunkIds(
      exactRows.map((row) => ({ chunkId: row.chunk_id, similarity: row.similarity })),
      DEFAULT_TOP_K
    );

    const approxSummaries: Record<string, unknown>[] = [];
    const candidateLatencies: Record<number, number[]> = {};

    for (const efSearch of EF_VALUES) {
      const first = await timed(() =>
        runApprox(client, query, vector, DEFAULT_TOP_K, efSearch, helper)
      );
      cold.approx.get(efSearch).push(first.ms);

      await runApprox(client, query, vector, DEFAULT_TOP_K, efSearch, helper);

      const times = [];
      let approxRows = first.value;
      let firstApproxIds: string[] | null = null;

      for (let repeat = 0; repeat < repetitions; repeat += 1) {
        const sample = await timed(() =>
          runApprox(client, query, vector, DEFAULT_TOP_K, efSearch, helper)
        );
        times.push(sample.ms);
        approxRows = sample.value;

        const sampledIds = rankChunkIds(
          sample.value.map((row) => ({ chunkId: row.chunk_id, similarity: row.similarity })),
          DEFAULT_TOP_K
        );
        if (firstApproxIds === null) firstApproxIds = sampledIds;
      }

      latencies.approx.get(efSearch).push(...times);
      candidateLatencies[efSearch] = times;
      if (approxRows.length === 0) empty.approx.set(efSearch, empty.approx.get(efSearch) + 1);

      const approxIds = rankChunkIds(
        approxRows.map((row) => ({ chunkId: row.chunk_id, similarity: row.similarity })),
        DEFAULT_TOP_K
      );

      const ranking: QueryRanking = { exact: exactIds, approx: approxIds };
      const targetRankings = query.documentIds ? scopedRankingsByEf : rankingsByEf;
      if (!targetRankings.has(efSearch)) targetRankings.set(efSearch, []);
      targetRankings.get(efSearch).push(ranking);

      approxSummaries.push({
        efSearch,
        recallAt10: recallFor(exactIds, approxIds, 10),
        recallAt20: recallFor(exactIds, approxIds, 20),
        recallAt40: recallFor(exactIds, approxIds, 40),
        overlapAt10: overlapAtK(exactIds, approxIds, 10),
        overlapAt20: overlapAtK(exactIds, approxIds, 20),
        overlapAt40: overlapAtK(exactIds, approxIds, 40),
        sameTop10Order: exactIds.slice(0, 10).join('|') === approxIds.slice(0, 10).join('|'),
        stableAcrossRepeats:
          firstApproxIds === null ? null : firstApproxIds.join('|') === approxIds.join('|'),
        approxCount: approxRows.length,
      });
    }

    perQuery.push({
      queryHash: query.queryHash,
      category: query.category,
      accessClass: query.accessClass,
      scoped: Boolean(query.documentIds),
      approxPlan: helper ? (query.documentIds ? 'scoped_planner_default' : 'hnsw') : 'inline_hnsw',
      exactCount: exactRows.length,
      exactMs: summarizeLatencies(exactTimes),
      candidateMs: Object.fromEntries(
        EF_VALUES.map((ef) => [ef, summarizeLatencies(candidateLatencies[ef] || [])])
      ),
      approx: approxSummaries,
    });
  }

  const summaries: EfSearchSummary[] = EF_VALUES.map((ef) =>
    summarizeEfSearch(ef, rankingsByEf.get(ef) || [])
  );
  const scopedSummaries: EfSearchSummary[] = EF_VALUES.map((ef) =>
    summarizeEfSearch(ef, scopedRankingsByEf.get(ef) || [])
  );
  // The recall gates apply to the whole-Brain HNSW path only. Document-scoped
  // requests keep the planner's default exact path, so mixing them into the
  // gate would inflate HNSW recall.
  const selected = chooseEfSearch(summaries);
  const wholeBrainPerQuery = perQuery.filter((row) => !row.scoped);
  const scopedPerQuery = perQuery.filter((row) => row.scoped);

  const sameOrderByEf = new Map<number, number[]>(
    EF_VALUES.map((ef) => [
      ef,
      wholeBrainPerQuery.map((row) => {
        const entry = row.approx.find((value) => value.efSearch === ef);
        return entry?.sameTop10Order ? 1 : 0;
      }),
    ])
  );
  const stabilityByEf = new Map<number, number[]>(
    EF_VALUES.map((ef) => [
      ef,
      wholeBrainPerQuery.map((row) => {
        const entry = row.approx.find((value) => value.efSearch === ef);
        return entry?.stableAcrossRepeats === false ? 0 : 1;
      }),
    ])
  );
  const scopedSameOrderByEf = new Map<number, number[]>(
    EF_VALUES.map((ef) => [
      ef,
      scopedPerQuery.map((row) => {
        const entry = row.approx.find((value) => value.efSearch === ef);
        return entry?.sameTop10Order ? 1 : 0;
      }),
    ])
  );

  return {
    generatedAt: new Date().toISOString(),
    mode: 'recall',
    corpus: 'production-like',
    helperInstalled: helper,
    repetitions,
    queries: queries.length,
    queryGateEligible: manifestGateEligibility(queries),
    queryGateNote: manifestGateEligibility(queries)
      ? '30-50 real queries supplied.'
      : 'The 30-50 real-query gate is not eligible with this manifest size.',
    gateScope: 'whole_brain_only',
    qualityGates: {
      recallAt20: 0.95,
      recallAt40: 0.97,
      top10PreservedRate: 0.95,
    },
    summaries: summaries.map((summary) => ({
      ...summary,
      passesGates: meetsGates(summary),
      sameTop10OrderRate:
        sameOrderByEf.get(summary.efSearch)?.reduce((sum, value) => sum + value, 0) /
        Math.max(1, wholeBrainPerQuery.length),
      stableAcrossRepeatsRate:
        stabilityByEf.get(summary.efSearch)?.reduce((sum, value) => sum + value, 0) /
        Math.max(1, wholeBrainPerQuery.length),
    })),
    scopedSummaries: scopedSummaries.map((summary) => ({
      ...summary,
      // Document-scoped calls keep the previous planner-default path and are
      // not part of the HNSW recall gate. Keep the numbers visible.
      passesGates: null,
      sameTop10OrderRate:
        scopedSameOrderByEf.get(summary.efSearch)?.reduce((sum, value) => sum + value, 0) /
        Math.max(1, scopedPerQuery.length),
    })),
    selectedEfSearch: selected,
    selectionNote:
      selected === null
        ? 'No tested ef_search passed every gate. Do not roll out HNSW without further tuning.'
        : `Smallest tested ef_search that passed every gate: ${selected}.`,
    latency: {
      exact: summarizeLatencies(latencies.exact),
      exactCold: summarizeLatencies(cold.exact),
      approx: Object.fromEntries(
        EF_VALUES.map((ef) => [
          ef,
          {
            warm: summarizeLatencies(latencies.approx.get(ef)),
            cold: summarizeLatencies(cold.approx.get(ef)),
          },
        ])
      ),
      note: 'cold is the first run for each query; warm is the repeated run after one warmup. PostgreSQL and OS caches are not reset between queries.',
    },
    emptyResultCounts: {
      exact: empty.exact,
      approx: Object.fromEntries(EF_VALUES.map((ef) => [ef, empty.approx.get(ef)])),
    },
    perQuery,
  };
}

function recallFor(exact: string[], approx: string[], k: number): number | null {
  const exactK = exact.slice(0, k);
  if (exactK.length === 0) return null;
  const approxSet = new Set(approx.slice(0, k));
  return exactK.filter((id) => approxSet.has(id)).length / exactK.length;
}

async function modeDump(client: Client) {
  const queries = loadManifest();
  const embeddingClient = embeddingClientOrThrow();
  const useSupabase = (process.env.BRAIN_BENCH_USE_SUPABASE || '').toLowerCase() === 'true';
  const useRefinement = (process.env.BRAIN_BENCH_WITH_REFINEMENT || '').toLowerCase() === 'true';
  const supabaseSearch = useSupabase ? createSupabaseBrainSearch(process.env) : null;
  const rows = [];

  if (useSupabase && !supabaseSearch) {
    throw new Error(
      'BRAIN_BENCH_USE_SUPABASE=true requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  for (const query of queries) {
    const [vector] = await embeddingClient.embed([query.text]);
    if (!Array.isArray(vector) || vector.length !== DIMENSIONS) {
      throw new Error('embedding provider returned an invalid vector');
    }

    const vectorClient = {
      modelId: MODEL,
      dimensions: DIMENSIONS,
      embed: async () => [vector],
    };

    let serializedRowsBytes: number | null = null;

    const search = async (input: any) => {
      const scopedInput = {
        ...input,
        // Preserve the manifest scope even when it contains several documents.
        documentIds: query.documentIds ?? input.documentIds,
      };

      const searchRows = supabaseSearch
        ? await supabaseSearch(scopedInput)
        : parseBrainRows((await client.query(DEPLOYED_RPC_SQL, rpcParams(scopedInput))).rows);

      serializedRowsBytes = Buffer.byteLength(JSON.stringify(searchRows), 'utf8');
      return searchRows;
    };

    const plan = buildBrainQueryPlan(query.text);
    const runRetrieval = (attempt: {
      query: string;
      plan: ReturnType<typeof buildBrainQueryPlan>;
      topK?: number;
      timeoutMs?: number;
    }) =>
      retrieveBrainEvidence({
        query: attempt.query,
        plan: attempt.plan,
        scope: query.accessClass,
        ownerAuthorized: query.accessClass === 'owner',
        enabled: true,
        env: { ...process.env, UNFRAMED_EMBEDDING_MODEL: MODEL },
        embeddingClient: vectorClient,
        search,
        topK: attempt.topK ?? RPC_TOP_K,
        documentId: query.documentIds?.length === 1 ? query.documentIds[0] : null,
        timeoutMs: attempt.timeoutMs ?? 20_000,
      });

    const result = useRefinement
      ? await retrieveBrainEvidenceWithRefinement({
          query: query.text,
          plan,
          retrieve: runRetrieval,
          topK: RPC_TOP_K,
          maxAttempts: 3,
          totalTimeoutMs: 20_000,
        })
      : await runRetrieval({ query: query.text, plan, topK: RPC_TOP_K, timeoutMs: 20_000 });

    rows.push({
      queryHash: query.queryHash,
      category: query.category,
      accessClass: query.accessClass,
      scoped: Boolean(query.documentIds),
      outcome: result.outcome,
      code: result.code ?? null,
      chunkIds: result.chunkIds,
      documentIds: result.documentIds,
      candidateCount: result.candidateCount,
      empty: result.hits.length === 0,
      latencyMs: result.latencyMs,
      searchMs: result.timings?.searchMs ?? null,
      rankingMs: result.timings?.rankingMs ?? null,
      serializedRowsBytes,
      attempts: 'attempts' in result ? result.attempts : 1,
      refined: 'refined' in result ? result.refined : false,
      attemptLog:
        'attemptLog' in result
          ? result.attemptLog.map((entry) => ({
              label: entry.label,
              outcome: entry.outcome,
              hitCount: entry.hitCount,
            }))
          : null,
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    mode: 'dump',
    rpc: 'public.brain_search_hybrid',
    transport: useSupabase ? 'supabase_postgrest_rpc' : 'pg_direct',
    topK: RPC_TOP_K,
    queries: rows.length,
    rows,
  };

  const file = (process.env.BRAIN_BENCH_DUMP_FILE || '').trim();
  const serialized = JSON.stringify(output, null, 2);

  if (file) {
    writeFileSync(file, `${serialized}\n`, 'utf8');
    return { ...output, rows: undefined, writtenTo: file };
  }

  return output;
}

function modeCompare(baselinePath: string, candidatePath: string) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));

  if (!Array.isArray(baseline.rows) || !Array.isArray(candidate.rows)) {
    throw new Error('both dump files must contain a rows array');
  }

  const candidateByHash = new Map(candidate.rows.map((row: any) => [row.queryHash, row]));
  const matched = baseline.rows.filter((row: any) => candidateByHash.has(row.queryHash));

  const top10 = [];
  const top8 = [];
  const sameOrder = [];
  const regressions = [];
  const outcomeChanges = [];
  let emptyBaseline = 0;
  let emptyCandidate = 0;
  let chunkSetsChanged = 0;

  for (const before of matched) {
    const after: any = candidateByHash.get(before.queryHash);
    const overlap10 = overlapAtK(before.chunkIds || [], after.chunkIds || [], 10);
    const overlap8 = overlapAtK(before.chunkIds || [], after.chunkIds || [], 8);

    top10.push(overlap10);
    top8.push(overlap8);
    sameOrder.push(
      (before.chunkIds || []).slice(0, 10).join('|') ===
        (after.chunkIds || []).slice(0, 10).join('|')
        ? 1
        : 0
    );

    if (overlap10 < 0.9) {
      regressions.push({
        queryHash: before.queryHash,
        category: before.category,
        top10Overlap: overlap10,
      });
    }

    if (before.outcome !== after.outcome) {
      outcomeChanges.push({
        queryHash: before.queryHash,
        category: before.category,
        before: before.outcome,
        after: after.outcome,
      });
    }

    if (before.empty) emptyBaseline += 1;
    if (after.empty) emptyCandidate += 1;
    if (
      (before.chunkIds || []).slice().sort().join('|') !==
      (after.chunkIds || []).slice().sort().join('|')
    ) {
      chunkSetsChanged += 1;
    }
  }

  const mean = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const baselineSearch = matched
    .map((row: any) => row.searchMs)
    .filter((value: any) => typeof value === 'number');
  const candidateSearch = matched
    .map((row: any) => candidateByHash.get(row.queryHash)?.searchMs)
    .filter((value: any) => typeof value === 'number');
  const baselineLatency = matched
    .map((row: any) => row.latencyMs)
    .filter((value: any) => typeof value === 'number');
  const candidateLatency = matched
    .map((row: any) => candidateByHash.get(row.queryHash)?.latencyMs)
    .filter((value: any) => typeof value === 'number');
  const baselineBytes = matched
    .map((row: any) => row.serializedRowsBytes)
    .filter((value: any) => typeof value === 'number');
  const candidateBytes = matched
    .map((row: any) => candidateByHash.get(row.queryHash)?.serializedRowsBytes)
    .filter((value: any) => typeof value === 'number');
  const baselineAttempts = matched
    .map((row: any) => row.attempts)
    .filter((value: any) => typeof value === 'number');
  const candidateAttempts = matched
    .map((row: any) => candidateByHash.get(row.queryHash)?.attempts)
    .filter((value: any) => typeof value === 'number');
  const attemptIncreases = matched
    .filter((row: any) => {
      const after = candidateByHash.get(row.queryHash);
      return typeof row.attempts === 'number' && typeof after?.attempts === 'number'
        ? after.attempts > row.attempts
        : false;
    })
    .map((row: any) => ({
      queryHash: row.queryHash,
      category: row.category,
      before: row.attempts,
      after: candidateByHash.get(row.queryHash)?.attempts,
    }));
  const summarizeBytes = (values: number[]) => ({
    count: values.length,
    medianBytes: percentile(values, 50),
    p95Bytes: percentile(values, 95),
    maxBytes: values.length > 0 ? Math.max(...values) : null,
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: 'compare',
    baselinePath,
    candidatePath,
    matchedQueries: matched.length,
    baselineOnly: baseline.rows.length - matched.length,
    candidateOnly: candidate.rows.length - matched.length,
    top10OverlapMean: mean(top10),
    top8OverlapMean: mean(top8),
    top10PreservedRate: mean(top10.map((value) => (value >= 0.9 ? 1 : 0))),
    sameTop10OrderRate: mean(sameOrder),
    chunkSetsChanged,
    emptyRate: {
      baseline: matched.length > 0 ? emptyBaseline / matched.length : null,
      candidate: matched.length > 0 ? emptyCandidate / matched.length : null,
    },
    latency: {
      baselineSearchMs: summarizeLatencies(baselineSearch),
      candidateSearchMs: summarizeLatencies(candidateSearch),
      baselineLatencyMs: summarizeLatencies(baselineLatency),
      candidateLatencyMs: summarizeLatencies(candidateLatency),
    },
    serializedRowsBytes: {
      baseline: summarizeBytes(baselineBytes),
      candidate: summarizeBytes(candidateBytes),
    },
    attempts: {
      baselineMedian: percentile(baselineAttempts, 50),
      candidateMedian: percentile(candidateAttempts, 50),
      baselineRefinedRate: mean(baselineAttempts.map((value) => (value > 1 ? 1 : 0))),
      candidateRefinedRate: mean(candidateAttempts.map((value) => (value > 1 ? 1 : 0))),
      increases: attemptIncreases,
    },
    outcomeChanges,
    regressions,
    note: 'Dump files contain only query hashes, chunk/document ids and timings; no query text is stored or printed.',
  };
}

async function main() {
  const mode = (process.argv[2] || process.env.BRAIN_BENCH_MODE || 'plan').trim();

  if (mode === 'compare') {
    const baselinePath = process.argv[3] || process.env.BRAIN_BENCH_BASELINE;
    const candidatePath = process.argv[4] || process.env.BRAIN_BENCH_CANDIDATE;

    if (!baselinePath || !candidatePath) {
      throw new Error('compare requires baseline and candidate dump paths');
    }

    const output = modeCompare(baselinePath, candidatePath);
    console.log('BENCHMARK_JSON');
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString,
    ssl:
      (process.env.BRAIN_BENCH_NO_SSL || '').toLowerCase() === 'true'
        ? undefined
        : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const output =
      mode === 'plan'
        ? await modePlan(client)
        : mode === 'recall'
          ? await modeRecall(client)
          : mode === 'dump'
            ? await modeDump(client)
            : (() => {
                throw new Error(`unknown mode: ${mode}`);
              })();

    console.log('BENCHMARK_JSON');
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // Never print query text or credentials. Only the sanitized message.
  console.error(`benchmark failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
