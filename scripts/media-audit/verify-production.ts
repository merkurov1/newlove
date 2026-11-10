import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local', quiet: true });

import {
  getMediaArchiveStats,
  getMediaDiagnostics,
  getMediaMentionsSummary,
  getMediaRecordDetail,
  listMediaCatalog,
} from '@/lib/knowledge/media/catalog';
import { mediaQuery } from '@/lib/knowledge/media/database';
import { answerMediaArchiveQuestion } from '@/lib/pierrot/mediaAnswer';
import { detectMediaCatalogQuestion } from '@/lib/pierrot/mediaCatalogIntent';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

const checks: Check[] = [];

function check(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

function expect(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function scenario(
  question: string,
  expectedKind: string,
  expectedTotal: number | null
): Promise<void> {
  const plan = detectMediaCatalogQuestion(question);
  check(
    `${question} · classifier`,
    plan?.kind === expectedKind,
    `expected kind ${expectedKind}, got ${plan?.kind || 'null'}`
  );

  const answer = await answerMediaArchiveQuestion(question, 'ru');

  if (!answer) {
    check(`${question} · answer`, false, 'no answer produced');
    return;
  }

  check(
    `${question} · answer kind`,
    answer.structured.kind === expectedKind,
    `answer kind ${answer.structured.kind}`
  );

  if (expectedTotal !== null) {
    check(
      `${question} · exact total`,
      answer.structured.totalMatching === expectedTotal,
      `expected ${expectedTotal}, got ${answer.structured.totalMatching}`
    );
  }

  console.log(`\n--- ${question} ---\n${answer.text.slice(0, 700)}\n`);
}

async function main(): Promise<void> {
  const unfiltered = await getMediaArchiveStats({ status: 'all' });
  console.log(
    'BASE',
    JSON.stringify({
      total: unfiltered.total,
      own: unfiltered.own,
      mentions: unfiltered.mentions,
      published: unfiltered.published,
      draft: unfiltered.draft,
      coverage: unfiltered.coverage,
      indexing: unfiltered.indexing,
    })
  );

  const own2026 = await getMediaArchiveStats({ scope: 'own', year: 2026 });
  const all2026 = await getMediaArchiveStats({ year: 2026 });
  const foreign2026 = await getMediaMentionsSummary({
    filters: { year: 2026, foreign: true },
    limit: 200,
  });
  const leMonde = await getMediaMentionsSummary({ filters: { outlet: 'Le Monde' }, limit: 200 });
  const wapo = await listMediaCatalog({
    filters: { outlet: 'The Washington Post' },
    page: 1,
    pageSize: 100,
  });

  await scenario('Сделай анализ медиа за 2026 год', 'analysis', all2026.total);
  await scenario('Сколько у меня публикаций за 2026 год?', 'count', own2026.total);
  await scenario('Покажи все мои публикации за 2026 год', 'own_period', own2026.total);
  await scenario(
    'В каких зарубежных СМИ меня упоминали в 2026 году?',
    'mentions',
    foreign2026.total
  );
  await scenario('Сколько раз меня упоминали в Le Monde?', 'count', leMonde.total);
  await scenario('Покажи все публикации The Washington Post', 'outlet_search', wapo.total);
  await scenario(
    'Найди публикации, в которых обсуждается регулирование интернета',
    'topic_search',
    null
  );
  await scenario('Сравни мои колонки за октябрь 2026 года', 'compare', null);
  await scenario('Какие публикации ещё не проиндексированы?', 'diagnostics', null);
  await scenario('Статистика Media Archive', 'analytics', null);

  // Mandatory correction sequence: the final plan must remain the original
  // Media analysis task, including the 2026 year filter.
  const seqFirst = 'Сделай анализ медиа за 2026 год';
  const seqSecond = 'Нет, ты всё выдумал, поищи по базе медиа';
  const seqThird = 'Ещё раз посмотри в базу медиа какие последние записи';
  const seqPlan2 = detectMediaCatalogQuestion(seqSecond, { contextMessages: [seqFirst] });
  const seqPlan3 = detectMediaCatalogQuestion(seqThird, {
    contextMessages: [seqFirst, seqSecond],
  });
  check(
    'correction sequence preserves the Media analysis task',
    seqPlan2?.kind === 'analysis' &&
      seqPlan2.year === 2026 &&
      seqPlan3?.kind === 'analysis' &&
      seqPlan3.year === 2026,
    JSON.stringify({
      second: { kind: seqPlan2?.kind, year: seqPlan2?.year },
      third: { kind: seqPlan3?.kind, year: seqPlan3?.year },
    })
  );

  check(
    'own 2026 count is an exact SQL count',
    own2026.total === own2026.own && own2026.total > 0,
    `total=${own2026.total}, own=${own2026.own}`
  );
  check(
    '2026 total splits into own + external',
    all2026.total === all2026.own + all2026.mentions,
    `${all2026.total} = ${all2026.own} + ${all2026.mentions}`
  );

  // Pagination: every page has the same total, and the union covers it.
  const pageSize = 10;
  const page1 = await listMediaCatalog({
    filters: { scope: 'own', year: 2026 },
    page: 1,
    pageSize,
  });
  const page2 = await listMediaCatalog({
    filters: { scope: 'own', year: 2026 },
    page: 2,
    pageSize,
  });
  const seen = new Set([...page1.items, ...page2.items].map((row) => row.id));
  check(
    'catalogue pagination keeps the exact total',
    page1.total === own2026.total && page2.total === own2026.total,
    `page1=${page1.total}, page2=${page2.total}`
  );
  check(
    'catalogue pagination returns distinct rows',
    seen.size === page1.items.length + page2.items.length,
    `unique=${seen.size}, rows=${page1.items.length + page2.items.length}`
  );
  check(
    'first page advertises more results',
    page1.hasMore === true && page1.items.length === pageSize,
    `hasMore=${page1.hasMore}, items=${page1.items.length}`
  );

  check(
    'more than 12 records are available without semantic search',
    own2026.total > 12 && page1.items.length > 0,
    `own2026=${own2026.total}`
  );

  const diagnostics = await getMediaDiagnostics({ limit: 300 });
  const classes = new Set(diagnostics.rows.map((row) => row.failure.class));
  check(
    'every diagnostic row is classified',
    diagnostics.rows.every((row) => Boolean(row.failure.class)),
    `rows=${diagnostics.rows.length}, classes=${[...classes].join(',')}`
  );
  check(
    'duplicate invariants are checked',
    diagnostics.summary.duplicateCanonical === 0 &&
      diagnostics.summary.duplicateTitle === 0 &&
      diagnostics.summary.duplicateContentHash === 0 &&
      diagnostics.summary.duplicateQuotes === 0,
    JSON.stringify({
      canonical: diagnostics.summary.duplicateCanonical,
      title: diagnostics.summary.duplicateTitle,
      hash: diagnostics.summary.duplicateContentHash,
      quotes: diagnostics.summary.duplicateQuotes,
    })
  );

  const metadataOnly = diagnostics.rows.find((row) => row.textQuality === 'metadata_only');
  if (metadataOnly) {
    const detail = await getMediaRecordDetail({ id: metadataOnly.id });
    check(
      'metadata_only record never claims full text',
      detail.status === 'found' &&
        detail.detail.text.quality === 'metadata_only' &&
        detail.detail.text.available === false,
      detail.status === 'found'
        ? `quality=${detail.detail.text.quality}, available=${detail.detail.text.available}`
        : 'record not found'
    );
  } else {
    check('metadata_only record exists', false, 'none found');
  }

  const paywall = diagnostics.rows.find((row) => row.failure.class === 'paywall');
  if (paywall) {
    const detail = await getMediaRecordDetail({ id: paywall.id });
    check(
      'paywall record is blocked and text is unavailable',
      detail.status === 'found' &&
        detail.detail.text.quality !== 'full_text' &&
        detail.detail.text.available === false,
      detail.status === 'found'
        ? `quality=${detail.detail.text.quality}, available=${detail.detail.text.available}`
        : 'record not found'
    );
  } else {
    check('paywall record exists', false, 'none found');
  }

  const missingEmbeddings = await mediaQuery<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.knowledge_chunks WHERE embedding IS NULL`
  );
  check(
    'no chunk is missing an embedding',
    missingEmbeddings[0]?.n === 0,
    `missing=${missingEmbeddings[0]?.n ?? 'unknown'}`
  );

  const empty = await listMediaCatalog({
    filters: { title: '__definitely_no_such_publication_2026__' },
    page: 1,
    pageSize: 10,
  });
  check(
    'zero-result catalogue query is exact and complete',
    empty.total === 0 && empty.provenance.complete === true,
    `total=${empty.total}, complete=${empty.provenance.complete}`
  );

  const content = await getMediaRecordDetail({ title: 'Не только MAX', maxTextChars: 5000 });
  check(
    'exact title resolves to one document with chunks',
    content.status === 'found' &&
      content.detail.text.chunks > 0 &&
      content.detail.text.available === true,
    content.status === 'found'
      ? `chunks=${content.detail.text.chunks}, chars=${content.detail.text.length}`
      : 'not found'
  );

  // Semantic RPC: use an existing chunk vector so this remains read-only and
  // deterministic even when the embedding API secret is unavailable.
  const source = await mediaQuery<{ emb: string; doc: string }>(
    `SELECT ch.embedding::text AS emb, d.id AS doc
     FROM public.knowledge_chunks ch
     JOIN public.knowledge_documents d ON d.id = ch.document_id
     JOIN public.media_archive_records m ON m.id = d.media_record_id
     WHERE m.published_date >= '2026-01-01'
       AND d.media_text_quality = 'full_text'
     ORDER BY ch.id LIMIT 1`
  );

  if (source[0]) {
    const rows = await mediaQuery<{ document_id: string; similarity: number }>(
      `SELECT document_id, similarity
       FROM public.media_search($1::vector, 'baai/bge-m3', 1024, 'owner', 10, 0.25, NULL, NULL, NULL, NULL, NULL)`,
      [source[0].emb]
    );
    const unique = new Set(rows.map((row) => row.document_id));
    check(
      'media_search returns one row per publication',
      rows.length === unique.size,
      `rows=${rows.length}, unique=${unique.size}`
    );
    check(
      'media_search respects the similarity threshold',
      rows.every((row) => Number(row.similarity) >= 0.25),
      `min=${Math.min(...rows.map((row) => Number(row.similarity))).toFixed(3)}`
    );

    let zeroRejected = false;
    try {
      await mediaQuery(
        `SELECT * FROM public.media_search($1::vector, 'baai/bge-m3', 1024, 'owner', 10, 0.25, NULL, NULL, NULL, NULL, NULL)`,
        [`[${Array.from({ length: 1024 }, () => 0).join(',')}]`]
      );
    } catch {
      zeroRejected = true;
    }
    check('zero query embedding is rejected', zeroRejected, `rejected=${zeroRejected}`);
  } else {
    check('semantic source chunk exists', false, 'none found');
  }

  const failed = checks.filter((item) => !item.ok);
  console.log(`\nRESULT: ${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    console.log(JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
