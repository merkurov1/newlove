#!/usr/bin/env node
/**
 * Apply and roll back the Brain HNSW planner migration against a disposable
 * PostgreSQL + pgvector database.
 *
 * Intended for local verification and CI only. It creates fixture tables,
 * roles and indexes in the `public` schema. Never point it at production.
 *
 *   BRAIN_HNSW_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/brain \
 *     node scripts/knowledge/verify-brain-hnsw-migration.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import pg from 'pg';

const { Client } = pg;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(root, 'migrations', '2026-12-15_brain_hybrid_hnsw_planner.sql');
const rollbackPath = path.join(
  root,
  'migrations',
  'rollback',
  '2026-12-15_brain_hybrid_hnsw_planner_rollback.sql'
);

const connectionString =
  process.env.BRAIN_HNSW_TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/brain';

const MODEL = 'baai/bge-m3';
const DIMENSIONS = 1024;

const HYBRID_SQL = `
select * from public.brain_search_hybrid(
  $1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
)
`;

const fixtureSql = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end;
$$;
create extension if not exists vector;
create table if not exists public.knowledge_documents (
  id text primary key, title text, source_type text, source_url text, source_path text,
  canonical_url text, metadata jsonb not null default '{}'::jsonb, author text, language text,
  published_at timestamptz, ingestion_status text not null default 'completed',
  access_class text not null default 'owner', embedding_model text not null,
  embedding_dimensions integer not null
);
create table if not exists public.knowledge_chunks (
  id text primary key, document_id text not null references public.knowledge_documents(id) on delete cascade,
  content text not null default '', heading text, section_path text[], section_index integer,
  line_start integer, line_end integer, access_class text not null default 'owner',
  embedding_model text not null, embedding_dimensions integer not null, embedding vector(1024)
);
create index if not exists knowledge_chunks_embedding_hnsw_idx on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists knowledge_chunks_scope_idx on public.knowledge_chunks
  (document_id, access_class, embedding_model, embedding_dimensions);
analyze public.knowledge_chunks;
`;

const seedSql = `
insert into public.knowledge_documents
  (id, title, source_type, canonical_url, metadata, author, language, access_class, embedding_model, embedding_dimensions)
values
  ('doc_owner', 'Owner doc', 'note', 'https://example.test/owner', '{"source_domain":"example.test"}', 'Owner', 'ru', 'owner', '${MODEL}', ${DIMENSIONS}),
  ('doc_public', 'Public doc', 'note', 'https://example.test/public', '{"source_domain":"example.test"}', 'Owner', 'en', 'public', '${MODEL}', ${DIMENSIONS})
on conflict (id) do nothing;

insert into public.knowledge_chunks
  (id, document_id, content, heading, section_path, section_index, line_start, line_end,
   access_class, embedding_model, embedding_dimensions, embedding)
select
  'chunk_' || lpad(n::text, 4, '0'),
  case when n <= 60 then 'doc_owner' else 'doc_public' end,
  'Synthetic migration check token_' || (n % 11) || ' ' || md5(n::text),
  'Heading ' || (n % 7),
  array['Section ' || (n % 3)],
  n % 3,
  n,
  n + 2,
  case when n <= 60 then 'owner' else 'public' end,
  '${MODEL}',
  ${DIMENSIONS},
  (select array_agg((random() * 2 - 1)::real)::vector
   from generate_series(1, ${DIMENSIONS}) as g where n > 0)
from generate_series(1, 120) as n
on conflict (id) do nothing;
analyze public.knowledge_chunks;
`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function procedureExists(client, signature) {
  const result = await client.query(`select to_regprocedure($1) is not null as present`, [
    signature,
  ]);
  return Boolean(result.rows[0]?.present);
}

async function plannerSettings(client) {
  const result = await client.query(
    `select current_setting('enable_seqscan') as seqscan,
            current_setting('enable_sort') as sort,
            coalesce(current_setting('hnsw.ef_search', true), '') as ef`
  );
  return result.rows[0];
}

async function efSetting(client) {
  const result = await client.query(`select current_setting('hnsw.ef_search', true) as ef`);
  return result.rows[0]?.ef ?? null;
}

async function main() {
  const migration = readFileSync(migrationPath, 'utf8');
  const rollback = readFileSync(rollbackPath, 'utf8');
  const client = new Client({
    connectionString,
    ssl:
      (process.env.BRAIN_HNSW_TEST_NO_SSL || '').toLowerCase() === 'true'
        ? undefined
        : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(fixtureSql);
    await client.query(seedSql);

    const probe = await client.query(
      `select embedding::text as embedding, document_id, access_class
       from public.knowledge_chunks
       where access_class = 'owner' and embedding_model = $1 and embedding_dimensions = $2
       order by id limit 1`,
      [MODEL, DIMENSIONS]
    );
    assert(probe.rows[0]?.embedding, 'fixture has no owner probe chunk');
    const probeVector = probe.rows[0].embedding;
    const probeDocument = String(probe.rows[0].document_id);

    await client.query(migration);
    assert(
      await procedureExists(
        client,
        'public.brain_vector_candidates(vector,text,integer,text,text[],integer,integer)'
      ),
      'migration did not create brain_vector_candidates'
    );
    assert(
      await procedureExists(
        client,
        'public.brain_search_hybrid(vector,text,integer,text,text,text[],text[],text[],text[],text[],timestamptz,timestamptz,integer,double precision)'
      ),
      'migration did not create brain_search_hybrid'
    );

    const settingsBefore = await plannerSettings(client);
    const candidates = await client.query(
      `select chunk_id, document_id, similarity
       from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
      [probeVector, MODEL, DIMENSIONS, 'owner', null, 40, 120]
    );
    assert(
      candidates.rows.length > 0 && candidates.rows.length <= 40,
      'whole-Brain helper returned no bounded rows'
    );

    await client.query('begin');
    try {
      const before = await plannerSettings(client);
      await client.query(
        `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
        [probeVector, MODEL, DIMENSIONS, 'owner', null, 40, 120]
      );
      assert(
        JSON.stringify(await plannerSettings(client)) === JSON.stringify(before),
        'planner settings leaked inside the transaction'
      );
    } finally {
      await client.query('rollback');
    }
    const settingsAfter = await plannerSettings(client);
    assert(
      JSON.stringify(settingsAfter) === JSON.stringify(settingsBefore),
      'planner settings leaked after the helper returned'
    );

    // The task explicitly requires verifying restoration when the prior value
    // is unset (NULL). Once pgvector is loaded the placeholder GUC has the
    // documented default (40); before that it is NULL/empty. Accept NULL,
    // empty and 40, but never the probe value 80/120.
    await client.query('begin');
    try {
      await client.query(`select set_config('hnsw.ef_search', null, true)`);
      const before = await efSetting(client);
      assert(
        before === null || before === '' || before === '40',
        'unset ef_search was not observed as NULL/empty/default'
      );
      await client.query(
        `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
        [probeVector, MODEL, DIMENSIONS, 'owner', null, 40, 80]
      );
      const after = await efSetting(client);
      assert(
        after === null || after === '' || after === '40',
        'ef_search leaked after an unset prior value'
      );
      assert(after !== '80' && after !== '120', 'ef_search leaked the probe value');
    } finally {
      await client.query('rollback');
    }

    // Exception path: a dimension-mismatched vector fails after the planner
    // hints are applied. A failed statement aborts the transaction, so recover
    // to a savepoint before reading the caller-visible setting.
    await client.query('begin');
    try {
      await client.query(`select set_config('hnsw.ef_search', '77', true)`);
      await client.query('savepoint helper_call');
      let raised = false;
      try {
        await client.query(
          `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
          ['[0.1,0.2,0.3]', MODEL, DIMENSIONS, 'owner', null, 40, 120]
        );
      } catch {
        raised = true;
      }
      assert(raised, 'dimension-mismatched helper call did not raise');
      await client.query('rollback to savepoint helper_call');
      assert((await efSetting(client)) === '77', 'ef_search was not restored after an exception');
    } finally {
      await client.query('rollback');
    }

    const ownerDocuments = await client.query(
      `select distinct document_id from public.knowledge_chunks where access_class = 'owner'`
    );
    const publicDocuments = await client.query(
      `select distinct document_id from public.knowledge_chunks where access_class = 'public'`
    );
    const ownerIds = new Set(ownerDocuments.rows.map((row) => String(row.document_id)));
    const publicIds = new Set(publicDocuments.rows.map((row) => String(row.document_id)));

    const hybridParams = (accessClass) => [
      probeVector,
      MODEL,
      DIMENSIONS,
      accessClass,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      40,
      -1,
    ];

    if (publicIds.size > 0) {
      const publicRows = (await client.query(HYBRID_SQL, hybridParams('public'))).rows;
      assert(
        publicRows.every((row) => publicIds.has(String(row.document_id))),
        'public hybrid query returned a document outside the public access class'
      );
    }

    if (ownerIds.size > 0) {
      const ownerRows = (await client.query(HYBRID_SQL, hybridParams('owner'))).rows;
      assert(
        ownerRows.every((row) => ownerIds.has(String(row.document_id))),
        'owner hybrid query returned a document outside the owner access class'
      );
    }

    const scoped = await client.query(
      `select chunk_id, document_id
       from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
      [probeVector, MODEL, DIMENSIONS, 'owner', [probeDocument], 40, 120]
    );
    assert(scoped.rows.length > 0, 'document-scoped helper returned no rows');
    assert(
      scoped.rows.every((row) => String(row.document_id) === probeDocument),
      'document-scoped helper returned another document'
    );

    await client.query('begin');
    try {
      await client.query(`select set_config('enable_seqscan','off',true)`);
      await client.query(`select set_config('enable_sort','off',true)`);
      await client.query(`select set_config('hnsw.ef_search','120',true)`);
      const plan = await client.query(
        `explain (analyze, buffers, format json)
         select c.id as chunk_id, c.document_id, 1 - (c.embedding <=> $1::vector) as similarity
         from public.knowledge_chunks c
         where c.access_class = $4 and c.embedding_model = $2 and c.embedding_dimensions = $3
           and ($5::text[] is null or c.document_id = any ($5::text[]))
         order by c.embedding <=> $1::vector
         limit $6`,
        [probeVector, MODEL, DIMENSIONS, 'owner', null, 40]
      );
      assert(
        JSON.stringify(plan.rows[0]).includes('knowledge_chunks_embedding_hnsw_idx'),
        'migration check did not observe the HNSW index'
      );
    } finally {
      await client.query('rollback');
    }

    await client.query(rollback);
    assert(
      !(await procedureExists(
        client,
        'public.brain_vector_candidates(vector,text,integer,text,text[],integer,integer)'
      )),
      'rollback did not drop brain_vector_candidates'
    );
    assert(
      await procedureExists(
        client,
        'public.brain_search_hybrid(vector,text,integer,text,text,text[],text[],text[],text[],text[],timestamptz,timestamptz,integer,double precision)'
      ),
      'rollback did not restore brain_search_hybrid'
    );

    // Leave the disposable database in the migrated state for any follow-up
    // check in the same CI job.
    await client.query(migration);
    console.log(
      'brain-hnsw migration check passed: apply, helper, settings (incl. unset/NULL and exception), access isolation, scoped, plan, rollback, re-apply'
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(
    `brain-hnsw migration check failed: ${error instanceof Error ? error.message : 'unknown error'}`
  );
  process.exitCode = 1;
});
