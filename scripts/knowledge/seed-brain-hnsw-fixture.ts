#!/usr/bin/env npx tsx
/**
 * Deterministic disposable corpus for the Brain HNSW benchmark harness.
 *
 * This is NOT a production corpus and NOT retrieval-quality evidence. It seeds
 * a small owner/public corpus with a deterministic text-hashing "embedding"
 * (see deterministicTextEmbedding) so the exact SQL path, the production
 * hybrid RPC, the HNSW helper, recall/latency aggregation and the ef_search
 * restoration checks can be exercised without any API key or real user data.
 *
 * Safety: the script only writes to a database when
 * BRAIN_HNSW_FIXTURE_ALLOW_WRITE=true is set explicitly. It deletes only rows
 * whose ids start with `bench_`, never real rows. Point it at a disposable
 * local or CI database, never production.
 *
 *   BRAIN_HNSW_FIXTURE_ALLOW_WRITE=true \
 *   BRAIN_HNSW_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/brain \
 *   BRAIN_HNSW_FIXTURE_APPLY_MIGRATION=true \
 *     npx tsx scripts/knowledge/seed-brain-hnsw-fixture.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Client } from 'pg';

import { deterministicTextEmbedding } from '../../lib/knowledge/rag/hnswBenchmark';

const MODEL = 'baai/bge-m3';
const DIMENSIONS = 1024;
const CHUNKS_PER_DOCUMENT = 40;

type Topic = {
  key: string;
  language: string;
  accessClass: 'owner' | 'public';
  title: string;
  heading: string;
  vocabulary: string[];
};

const TOPICS: Topic[] = [
  {
    key: 'change',
    language: 'ru',
    accessClass: 'owner',
    title: 'Страх перемен и новые начала',
    heading: 'Страх перемен',
    vocabulary: ['страх', 'перемены', 'новое', 'начало', 'неопределённость', 'решение'],
  },
  {
    key: 'baking',
    language: 'ru',
    accessClass: 'owner',
    title: 'Рецепты выпечки',
    heading: 'Выпечка',
    vocabulary: ['рецепт', 'выпечка', 'тесто', 'хлеб', 'духовка', 'мука'],
  },
  {
    key: 'lisbon',
    language: 'ru',
    accessClass: 'owner',
    title: 'Поездка в Лиссабон',
    heading: 'Лиссабон',
    vocabulary: ['Лиссабон', 'поездка', 'место', 'улица', 'океан', 'прогулка'],
  },
  {
    key: 'sleep',
    language: 'ru',
    accessClass: 'owner',
    title: 'Сон и восстановление',
    heading: 'Сон',
    vocabulary: ['сон', 'усталость', 'восстановление', 'энергия', 'отдых', 'бессонница'],
  },
  {
    key: 'pgvector',
    language: 'ru',
    accessClass: 'owner',
    title: 'Postgres и pgvector',
    heading: 'Поиск по смыслу',
    vocabulary: ['Postgres', 'pgvector', 'вектор', 'индекс', 'HNSW', 'поиск', 'смысл'],
  },
  {
    key: 'finance',
    language: 'ru',
    accessClass: 'owner',
    title: 'Деньги и независимость',
    heading: 'Финансы',
    vocabulary: ['деньги', 'накопления', 'финансовая', 'независимость', 'бюджет', 'инвестиции'],
  },
  {
    key: 'trust',
    language: 'ru',
    accessClass: 'owner',
    title: 'Доверие и границы',
    heading: 'Отношения',
    vocabulary: ['доверие', 'близость', 'границы', 'разговор', 'отношения', 'честность'],
  },
  {
    key: 'burnout',
    language: 'ru',
    accessClass: 'owner',
    title: 'Фокус и выгорание',
    heading: 'Работа',
    vocabulary: ['фокус', 'выгорание', 'план', 'неделя', 'работа', 'усталость'],
  },
  {
    key: 'art',
    language: 'ru',
    accessClass: 'owner',
    title: 'Искусство и тишина',
    heading: 'Искусство',
    vocabulary: ['искусство', 'цвет', 'тишина', 'форма', 'свет', 'практика'],
  },
  {
    key: 'philosophy',
    language: 'ru',
    accessClass: 'owner',
    title: 'Смысл и время',
    heading: 'Философия',
    vocabulary: ['смысл', 'память', 'время', 'запись', 'жизнь', 'вопрос'],
  },
  {
    key: 'kyoto',
    language: 'en',
    accessClass: 'owner',
    title: 'Japan and quiet places in Kyoto',
    heading: 'Kyoto travel',
    vocabulary: ['Japan', 'Kyoto', 'travel', 'quiet', 'temple', 'place', 'walk'],
  },
  {
    key: 'sourdough',
    language: 'en',
    accessClass: 'owner',
    title: 'Sourdough and slow cooking',
    heading: 'Sourdough',
    vocabulary: ['sourdough', 'starter', 'bread', 'slow', 'cooking', 'recipe', 'oven'],
  },
  {
    key: 'deepwork',
    language: 'en',
    accessClass: 'owner',
    title: 'Deep work and weekly planning',
    heading: 'Deep work',
    vocabulary: ['deep', 'work', 'focus', 'weekly', 'planning', 'attention', 'burnout'],
  },
  {
    key: 'boundaries',
    language: 'en',
    accessClass: 'owner',
    title: 'Trust, boundaries and conversations',
    heading: 'Boundaries',
    vocabulary: ['trust', 'boundaries', 'conversation', 'relationship', 'honesty', 'care'],
  },
  {
    key: 'unvisited',
    language: 'en',
    accessClass: 'owner',
    title: 'The feeling of an unvisited place',
    heading: 'Anticipation',
    vocabulary: ['feeling', 'place', 'unvisited', 'anticipation', 'memory', 'imagination'],
  },
  {
    key: 'public-recipes',
    language: 'ru',
    accessClass: 'public',
    title: 'Публичные рецепты и практика',
    heading: 'Публичные рецепты',
    vocabulary: ['рецепт', 'практика', 'повседневность', 'кухня', 'простота', 'привычка'],
  },
  {
    key: 'public-art',
    language: 'en',
    accessClass: 'public',
    title: 'Public notes about art and silence',
    heading: 'Public art',
    vocabulary: ['art', 'color', 'silence', 'practice', 'public', 'making'],
  },
];

function vectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => value.toFixed(8)).join(',')}]`;
}

function chunkText(topic: Topic, index: number): string {
  const words = topic.vocabulary;
  const first = words[index % words.length];
  const second = words[(index * 3 + 1) % words.length];
  const third = words[(index * 5 + 2) % words.length];

  return `${topic.title}. ${first} ${second} ${third}. ${topic.heading} note ${index + 1}. ${first} ${second}.`;
}

async function main() {
  if ((process.env.BRAIN_HNSW_FIXTURE_ALLOW_WRITE || '').toLowerCase() !== 'true') {
    throw new Error(
      'refusing to write: set BRAIN_HNSW_FIXTURE_ALLOW_WRITE=true and point BRAIN_HNSW_TEST_DATABASE_URL at a disposable database'
    );
  }

  const connectionString =
    process.env.BRAIN_HNSW_TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/brain';
  const client = new Client({
    connectionString,
    ssl:
      (process.env.BRAIN_HNSW_TEST_NO_SSL || '').toLowerCase() === 'true'
        ? undefined
        : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(`
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
    `);

    await client.query(`delete from public.knowledge_chunks where id like 'bench_chunk_%'`);
    await client.query(`delete from public.knowledge_documents where id like 'bench_doc_%'`);

    let chunkNumber = 0;
    for (const [topicIndex, topic] of TOPICS.entries()) {
      const documentId = `bench_doc_${String(topicIndex + 1).padStart(2, '0')}_${topic.key}`;

      await client.query(
        `insert into public.knowledge_documents
           (id, title, source_type, canonical_url, metadata, author, language, published_at,
            ingestion_status, access_class, embedding_model, embedding_dimensions)
         values ($1,$2,'note',$3,$4::jsonb,'Fixture',$5,$6,'completed',$7,$8,$9)`,
        [
          documentId,
          topic.title,
          `https://example.test/${topic.key}`,
          JSON.stringify({ source_domain: 'example.test', fixture: 'brain-hnsw' }),
          topic.language,
          new Date(Date.UTC(2026, 0, 1 + topicIndex)).toISOString(),
          topic.accessClass,
          MODEL,
          DIMENSIONS,
        ]
      );

      for (let index = 0; index < CHUNKS_PER_DOCUMENT; index += 1) {
        chunkNumber += 1;
        const content = chunkText(topic, index);
        const heading = `${topic.heading} ${index + 1}`;
        const embedding = deterministicTextEmbedding(`${heading} ${content}`, DIMENSIONS);

        await client.query(
          `insert into public.knowledge_chunks
             (id, document_id, content, heading, section_path, section_index,
              line_start, line_end, access_class, embedding_model, embedding_dimensions, embedding)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector)`,
          [
            `bench_chunk_${String(chunkNumber).padStart(4, '0')}`,
            documentId,
            content,
            heading,
            [`Section ${index % 4}`],
            index % 4,
            index * 3,
            index * 3 + 2,
            topic.accessClass,
            MODEL,
            DIMENSIONS,
            vectorLiteral(embedding),
          ]
        );
      }
    }

    await client.query(`analyze public.knowledge_chunks`);
    await client.query(`analyze public.knowledge_documents`);

    if ((process.env.BRAIN_HNSW_FIXTURE_APPLY_MIGRATION || '').toLowerCase() === 'true') {
      const migration = readFileSync(
        path.join(process.cwd(), 'migrations', '2026-12-15_brain_hybrid_hnsw_planner.sql'),
        'utf8'
      );
      await client.query(migration);
      console.log('applied migration 2026-12-15_brain_hybrid_hnsw_planner.sql');
    }

    const counts = await client.query(
      `select count(*)::int as chunks, count(distinct document_id)::int as documents,
              count(*) filter (where access_class = 'owner')::int as owner_chunks,
              count(*) filter (where access_class = 'public')::int as public_chunks
       from public.knowledge_chunks`
    );
    console.log(
      JSON.stringify({
        seeded: true,
        synthetic: true,
        corpus: counts.rows[0],
        note: 'Disposable deterministic fixture. Not production data and not retrieval-quality evidence.',
      })
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`seed failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
