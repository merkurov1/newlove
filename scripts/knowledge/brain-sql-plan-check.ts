// @ts-nocheck
/**
 * Read-only SQL plan and latency check for Brain retrieval.
 *
 * This script does not need an embedding API key. It takes one real chunk
 * embedding from the production corpus and uses it as a fixed probe vector.
 * Therefore it measures SQL/candidate-selection behaviour and latency, not
 * semantic query quality.
 *
 * It compares:
 *   * the deployed brain_search_hybrid RPC;
 *   * the old candidate shape (computed similarity alias + document join);
 *   * the candidate HNSW + GIN + RRF query.
 *
 * Usage:
 *   ENV_FILE=.env.production.local npx tsx scripts/knowledge/brain-sql-plan-check.ts
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: process.env.ENV_FILE || '.env.production.local' });

const targetDocumentId =
  process.env.PLAN_DOCUMENT_ID || 'doc_article_d94db17b590415578c09971b541e4629';
const queryText = process.env.PLAN_QUERY_TEXT || 'Новая газета';
const model = 'baai/bge-m3';
const dimensions = 1024;
const iterations = 5;

function vectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

function planNodes(plan: any): string[] {
  if (!plan) return [];
  const nodes = [`${plan['Node Type']}${plan['Index Name'] ? `[${plan['Index Name']}]` : ''}`];
  for (const child of plan.Plans || []) nodes.push(...planNodes(child));
  return nodes;
}

async function explain(client: Client, label: string, sql: string, values: any[]) {
  const startedAt = Date.now();
  const result = await client.query(`explain (analyze, buffers, format json) ${sql}`, values);
  const elapsedMs = Date.now() - startedAt;
  const payload = result.rows[0]['QUERY PLAN'][0];
  return {
    label,
    elapsedMs,
    planningMs: payload['Planning Time'],
    executionMs: payload['Execution Time'],
    rows: payload.Plan?.['Actual Rows'] ?? null,
    nodes: planNodes(payload.Plan),
  };
}

const NEW_SEARCH_SQL = `
with vector_candidates as (
  select c.id as chunk_id, c.document_id, 1 - (c.embedding <=> $1::vector) as similarity
  from public.knowledge_chunks c
  where c.access_class = $4 and c.embedding_model = $2 and c.embedding_dimensions = $3
    and ($10::text[] is null or c.document_id = any ($10::text[]))
  order by c.embedding <=> $1::vector
  limit least(greatest($13 * 2, 40), 120)
),
lexical_candidates as (
  select c.id as chunk_id, c.document_id, 1 - (c.embedding <=> $1::vector) as similarity,
    ts_rank_cd(to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content),
      plainto_tsquery('simple', $5))::double precision as lexical_score
  from public.knowledge_chunks c
  where $5 is not null and btrim($5) <> ''
    and c.access_class = $4 and c.embedding_model = $2 and c.embedding_dimensions = $3
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
  select coalesce(v.chunk_id, l.chunk_id) as chunk_id,
    coalesce(v.document_id, l.document_id) as document_id,
    coalesce(v.similarity, l.similarity) as similarity,
    coalesce(l.lexical_score, 0::double precision) as lexical_score,
    coalesce(1.0 / (60 + v.vector_rank), 0::double precision)
      + coalesce(1.0 / (60 + l.lexical_rank), 0::double precision) as fused_score
  from vector_ranked v full outer join lexical_ranked l on l.chunk_id = v.chunk_id
)
select m.chunk_id, m.document_id, d.title as document_title, d.source_type,
  coalesce(nullif(d.metadata->>'source_domain', ''),
    split_part(regexp_replace(coalesce(d.canonical_url, d.source_url, d.source_path, ''),
      '^https?://', ''), '/', 1)) as source_domain,
  d.author, d.language, d.published_at, c.content, c.heading, c.section_path,
  c.section_index, c.line_start, c.line_end, m.similarity, m.lexical_score
from merged m
join public.knowledge_chunks c on c.id = m.chunk_id
join public.knowledge_documents d on d.id = m.document_id
 and d.embedding_model = c.embedding_model and d.embedding_dimensions = c.embedding_dimensions
where d.ingestion_status = 'completed' and d.access_class = $4
  and d.embedding_model = $2 and d.embedding_dimensions = $3
  and ($6::text[] is null or d.source_type = any ($6::text[]))
  and ($9::text[] is null or d.language = any ($9::text[]))
  and ($8::text[] is null or lower(coalesce(d.author, '')) = any ($8::text[]))
  and ($11::timestamptz is null or d.published_at >= $11::timestamptz)
  and ($12::timestamptz is null or d.published_at <= $12::timestamptz)
  and ($7::text[] is null or exists (
    select 1 from unnest($7::text[]) as allowed_domain
    where coalesce(nullif(d.metadata->>'source_domain', ''),
      split_part(regexp_replace(coalesce(d.canonical_url, d.source_url, d.source_path, ''),
        '^https?://', ''), '/', 1)) = allowed_domain
      or coalesce(nullif(d.metadata->>'source_domain', ''),
      split_part(regexp_replace(coalesce(d.canonical_url, d.source_url, d.source_path, ''),
        '^https?://', ''), '/', 1)) like '%.' || allowed_domain
  ))
  and (m.similarity >= $14 or m.lexical_score > 0)
order by m.fused_score desc, m.similarity desc, m.chunk_id
limit $13
`;

const OLD_CANDIDATE_SQL = `
with base as (
  select c.id, c.document_id, 1 - (c.embedding <=> $1::vector) as similarity,
    ts_rank_cd(to_tsvector('simple', coalesce(c.heading, '') || ' ' || c.content),
      plainto_tsquery('simple', $5))::double precision as lexical_score
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
   and d.embedding_model = c.embedding_model
   and d.embedding_dimensions = c.embedding_dimensions
  where d.ingestion_status = 'completed'
    and c.access_class = $4 and d.access_class = $4
    and c.embedding_model = $2 and c.embedding_dimensions = $3
    and d.embedding_model = $2 and d.embedding_dimensions = $3
    and ($6::text[] is null or d.source_type = any ($6::text[]))
)
select * from base order by similarity desc limit $7
`;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const vectorResult = await client.query(
      `select embedding::text as embedding from public.knowledge_chunks where document_id = $1 order by chunk_index limit 1`,
      [targetDocumentId]
    );
    const vector = vectorResult.rows[0]?.embedding;

    if (!vector) throw new Error(`no chunk embedding for ${targetDocumentId}`);

    const values = [
      vector,
      model,
      dimensions,
      'owner',
      queryText,
      ['article'],
      null,
      null,
      null,
      null,
      null,
      null,
      40,
      -1,
    ];

    const oldValues = [vector, model, dimensions, 'owner', queryText, ['article'], 40];
    const oldRpc = `select * from public.brain_search_hybrid($1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
    const results = [];

    for (let index = 0; index < iterations; index += 1) {
      results.push(await explain(client, 'deployed_rpc', oldRpc, values));
      results.push(await explain(client, 'old_candidate_shape', OLD_CANDIDATE_SQL, oldValues));
      results.push(await explain(client, 'new_candidate_query', NEW_SEARCH_SQL, values));
    }

    console.log(
      JSON.stringify(
        {
          targetDocumentId,
          queryText,
          iterations,
          probe: 'one real chunk embedding from the target document',
          note: 'SQL plan/latency only; not a semantic retrieval-quality benchmark.',
          results,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
