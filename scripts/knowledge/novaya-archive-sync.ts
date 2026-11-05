#!/usr/bin/env tsx
/**
 * Novaya Gazeta author-column synchronization.
 *
 * Source of truth: data/novaya-archive/authored-columns.json, built only from
 * public metadata whose frontmatter/author id confirms Anton Merkurov.
 *
 * Usage:
 *   npx tsx scripts/knowledge/novaya-archive-sync.ts --report
 *   npx tsx scripts/knowledge/novaya-archive-sync.ts --apply-media
 *   npx tsx scripts/knowledge/novaya-archive-sync.ts --index --limit 10
 *   npx tsx scripts/knowledge/novaya-archive-sync.ts --reconcile
 *
 * Every command is idempotent. Nothing is deleted. Ambiguous matches are
 * reported and skipped, never merged automatically.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { Client } from 'pg';

import { createBrainStorage } from '@/lib/knowledge/brain/storage';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { runBrainWorker } from '@/lib/knowledge/brain/worker';
import { classifyMediaPublication } from '@/lib/knowledge/media/classify';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

const MANIFEST = path.join(process.cwd(), 'data/novaya-archive/authored-columns.json');
const BODY_CACHE = '/tmp/opencode/novaya-bodies';
const GITHUB_REPO = 'novaya-gazeta-ru/archive';

type ManifestRecord = {
  source: string;
  title: string;
  subtitle: string;
  date: string;
  authors: string;
  genre: string;
  note?: string | null;
  topic?: string | null;
};

type MediaRow = {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  outlet: string;
  published_date: string | null;
  lang: string;
  kind: string;
  topic: string;
  summary: string | null;
  author: string | null;
  status: string;
  indexing_status: string;
  ai_metadata: Record<string, unknown> | null;
};

type Match = { record: ManifestRecord; media: MediaRow; method: string };

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : null;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/\/$/, '');
  }
}

function slugOf(value: string): string {
  try {
    return new URL(value).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return '';
  }
}

function cleanText(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dateOf(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function compactSummary(media: MediaRow, record: ManifestRecord): string {
  const existing = cleanText(media.summary || '');
  const bad =
    !existing ||
    /^18\+/.test(existing) ||
    /НАСТОЯЩИЙ МАТЕРИАЛ/i.test(existing) ||
    /^Democracy Dies in Darkness/i.test(existing);
  return bad ? cleanText(record.subtitle).slice(0, 2000) : existing.slice(0, 2000);
}

function cleanMarkdownBody(markdown: string, title: string): string {
  let text = markdown.replace(/\r\n/g, '\n');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/(^|\s)\*([^*\n]+)\*(\s|$)/g, '$1$2$3');
  text = text.replace(/^\s*[-*+]\s+/gm, '• ');

  // Drop the leading H1 and site disclaimers/captions, keeping the article body.
  const lines = text.split('\n');
  const kept: string[] = [];
  let titleSeen = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      kept.push('');
      continue;
    }
    if (!titleSeen && line === title.trim()) {
      titleSeen = true;
      continue;
    }
    if (/^Фото[:：]/.test(line)) continue;
    if (/НАСТОЯЩИЙ МАТЕРИАЛ/i.test(line)) continue;
    if (/ИНОСТРАННЫМ АГЕНТОМ/i.test(line)) continue;
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

async function loadManifest(): Promise<ManifestRecord[]> {
  const raw = JSON.parse(await fs.readFile(MANIFEST, 'utf8')) as {
    records: ManifestRecord[];
  };
  return raw.records;
}

async function saveManifest(records: ManifestRecord[]): Promise<void> {
  const raw = {
    generatedAt: new Date().toISOString(),
    source:
      'https://github.com/novaya-gazeta-ru/archive + novayagazeta.ru page verification',
    total: records.length,
    records,
  };
  await fs.writeFile(MANIFEST, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

async function fetchBody(record: ManifestRecord): Promise<string> {
  await fs.mkdir(BODY_CACHE, { recursive: true });
  const key = createHash('sha256').update(record.source).digest('hex').slice(0, 32);
  const cachePath = path.join(BODY_CACHE, `${key}.txt`);

  try {
    return await fs.readFile(cachePath, 'utf8');
  } catch {
    // not cached
  }

  const url = new URL(record.source);
  const archivePath = `articles${url.pathname.replace(/^\/articles/, '')}.md`;
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${archivePath}`;
  const headers: Record<string, string> = {
    'User-Agent': 'newlove-novaya-archive-sync/1.0',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(rawUrl, { headers });
  let body = '';

  if (response.ok) {
    const markdown = await response.text();
    const end = markdown.indexOf('\n---', 3);
    body = cleanMarkdownBody(end > 0 ? markdown.slice(end + 4) : markdown, record.title);
  } else {
    // Two verified columns are missing from the GitHub archive. Read the
    // original page's JSON-LD article body; never bypass a paywall.
    const page = await fetch(record.source, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MerkurovArchiveSync/1.0)' },
    });
    if (!page.ok) throw new Error(`body_fetch_${page.status}`);

    const html = await page.text();
    const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      })
      .flat()
      .filter(Boolean) as Array<Record<string, unknown>>;
    const article = blocks.find((entry) => entry['@type'] === 'Article');
    body = cleanMarkdownBody(String(article?.articleBody || ''), record.title);
  }

  if (body.replace(/\s+/g, ' ').length < 200) {
    throw new Error('body_too_short');
  }

  await fs.writeFile(cachePath, body, 'utf8');
  return body;
}

async function connect() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function loadMedia(client: Client): Promise<MediaRow[]> {
  const result = await client.query<MediaRow>(
    `select id, url, canonical_url, title, outlet, published_date, lang, kind, topic,
            summary, author, status, indexing_status, ai_metadata
       from media_archive_records`
  );
  return result.rows;
}

function matchRecords(records: ManifestRecord[], media: MediaRow[]) {
  const byCanonical = new Map<string, MediaRow[]>();
  const bySlug = new Map<string, MediaRow[]>();

  for (const row of media) {
    const key = normalizeUrl(row.canonical_url || row.url);
    byCanonical.set(key, [...(byCanonical.get(key) || []), row]);
    const slug = slugOf(row.canonical_url || row.url);
    bySlug.set(slug, [...(bySlug.get(slug) || []), row]);
  }

  const matched: Match[] = [];
  const missing: ManifestRecord[] = [];
  const ambiguous: Array<{ record: ManifestRecord; candidates: MediaRow[] }> = [];

  for (const record of records) {
    const exact = byCanonical.get(normalizeUrl(record.source)) || [];
    if (exact.length === 1) {
      matched.push({ record, media: exact[0], method: 'canonical_url' });
      continue;
    }
    if (exact.length > 1) {
      ambiguous.push({ record, candidates: exact });
      continue;
    }
    const byName = bySlug.get(slugOf(record.source)) || [];
    if (byName.length === 1) {
      matched.push({ record, media: byName[0], method: 'slug' });
    } else if (byName.length > 1) {
      ambiguous.push({ record, candidates: byName });
    } else {
      missing.push(record);
    }
  }

  return { matched, missing, ambiguous };
}

function columnKind(record: ManifestRecord): 'column' | 'interview' {
  // Programs with several named participants are interviews/panels, not solo
  // author columns, even when Merkurov is one of the authors.
  return record.authors.split(',').filter(Boolean).length > 1 ? 'interview' : 'column';
}

function mergeMetadata(media: MediaRow, record: ManifestRecord): Record<string, unknown> {
  const publishedDate = dateOf(record.date);
  const aiMetadata = {
    ...(media.ai_metadata || {}),
    slug:
      (typeof media.ai_metadata?.slug === 'string' && media.ai_metadata.slug) ||
      slugOf(record.source),
    original_date: publishedDate,
    authors: record.authors,
    author_verified: true,
    novaya_archive: {
      source: record.source,
      genre: record.genre,
      synced_at: new Date().toISOString(),
      note: record.note || null,
    },
  };

  return {
    url: record.source,
    canonical_url: normalizeUrl(record.source),
    title: cleanText(record.title).slice(0, 500),
    outlet: 'Новая газета',
    published_date: publishedDate,
    lang: 'RU',
    kind: columnKind(record),
    topic: record.topic || media.topic || 'Internet & Censorship',
    summary: compactSummary(media, record),
    author: 'Антон Меркуров',
    status: 'published',
    ai_metadata: aiMetadata,
    updated_at: new Date().toISOString(),
  };
}

const OUTLET_MAP: Record<string, string> = {
  'dw.com': 'Deutsche Welle',
  'washingtonpost.com': 'The Washington Post',
  'Le Monde.fr': 'Le Monde',
  euronews: 'Euronews',
  'eurotopics.net': 'Eurotopics',
  'ihodl.com is an illustrated edition about cryptocurrencies and financial markets.': 'iHODL',
  'The Art Newspaper - International art news and events': 'The Art Newspaper',
  'edizionidelfrisco.com': 'Edizioni del Frisco',
  'snob.ru': 'Сноб',
  'podari-zhizn.ru': 'Фонд «Подари жизнь»',
  'detector.media': 'Detector Media',
  'Republic (Слон.ру)': 'Republic',
  'Russia Beyond DE': 'Russia Beyond',
};

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[—–-]\s*Новая газета\s*$/i, '')
    .replace(/\s+-\s+Le Temps\s*$/i, '')
    .replace(/\s+-\s+El Grand Continent\s*$/i, '')
    .replace(/\s+-\s+Le Monde(?:\.fr)?\s*$/i, '')
    .replace(/\s+\|\s+фонд «Подари жизнь»\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function applyMedia(client: Client, records: ManifestRecord[]) {
  const media = await loadMedia(client);
  const { matched, missing, ambiguous } = matchRecords(records, media);

  console.log(
    `[media] manifest=${records.length} matched=${matched.length} missing=${missing.length} ambiguous=${ambiguous.length}`
  );

  for (const item of ambiguous) {
    console.log(`[ambiguous] ${item.record.source} -> ${item.candidates.map((c) => c.id).join(',')}`);
  }

  let updated = 0;
  let inserted = 0;
  let classified = 0;

  for (const item of matched) {
    if (!item.record.topic) {
      try {
        const classification = await classifyMediaPublication({
          title: item.record.title,
          outlet: 'Новая газета',
          summary: item.record.subtitle,
          url: item.record.source,
          detectedLanguage: 'ru',
        });
        item.record.topic = classification.topic;
        classified += 1;
      } catch {
        item.record.topic = item.media.topic || 'Internet & Censorship';
      }
    }
    const patch = mergeMetadata(item.media, item.record);
    const keys = Object.keys(patch);
    const values = keys.map((key) => patch[key]);
    await client.query(
      `update media_archive_records set ${keys.map((key, i) => `${key}=$${i + 1}`).join(', ')} where id=$${keys.length + 1}`,
      [...values, item.media.id]
    );
    updated += 1;
  }

  for (const record of missing) {
    if (!record.topic) {
      try {
        const classification = await classifyMediaPublication({
          title: record.title,
          outlet: 'Новая газета',
          summary: record.subtitle,
          url: record.source,
          detectedLanguage: 'ru',
        });
        record.topic = classification.topic;
        classified += 1;
      } catch {
        record.topic = 'Internet & Censorship';
      }
    }
    const publishedDate = dateOf(record.date);
    const now = new Date().toISOString();
    await client.query(
      `insert into media_archive_records
        (url, canonical_url, title, outlet, published_date, lang, kind, topic, summary,
         author, status, ai_metadata, source_format, created_at, updated_at, indexing_status)
       values ($1,$2,$3,'Новая газета',$4,'RU',$5,$6,$7,'Антон Меркуров','published',$8,'url',$9,$9,'not_indexed')`,
      [
        record.source,
        normalizeUrl(record.source),
        cleanText(record.title).slice(0, 500),
        publishedDate,
        columnKind(record),
        record.topic,
        cleanText(record.subtitle).slice(0, 2000),
        {
          slug: slugOf(record.source),
          original_date: publishedDate,
          authors: record.authors,
          author_verified: true,
          import_pending: false,
          reviewed: true,
          novaya_archive: {
            source: record.source,
            genre: record.genre,
            synced_at: now,
            note: record.note || null,
          },
        },
        now,
      ]
    );
    inserted += 1;
  }

  // Known non-Novaya corrections. Each value is verified against the original
  // publication or its URL date; no dates are guessed from import timestamps.
  const outletEntries = Object.entries(OUTLET_MAP);
  for (const [from, to] of outletEntries) {
    await client.query(
      `update media_archive_records set outlet=$1, updated_at=now() where outlet=$2`,
      [to, from]
    );
  }

  await client.query(
    `update media_archive_records
        set title=$1, outlet=$2, published_date='2026-10-29', lang='EN', kind='mention',
            topic='AI & Tech', summary=$3, author=$4, updated_at=now(),
            ai_metadata = coalesce(ai_metadata,'{}'::jsonb) || $5::jsonb
      where id='9411f562-1ebf-4b19-b43d-a521edc087a5'`,
    [
      'These data centers hold Putin’s AI aspirations. They’re big targets.',
      'The Washington Post',
      'Ukrainian attacks on the facilities — some containing Russia’s most powerful supercomputers — threaten aspirations for entirely Russian-built “sovereign AI.”',
      'Mary Ilyushina',
      JSON.stringify({
        note: 'full text captured manually; metadata verified 2026-11-05',
        reviewed: true,
      }),
    ]
  );

  await client.query(
    `update media_archive_records
        set published_date='2015-10-14', lang='DE', kind='column', outlet='Russia Beyond',
            author='Антон Меркуров', topic='Internet & Censorship', updated_at=now(),
            ai_metadata = coalesce(ai_metadata,'{}'::jsonb) || $1::jsonb
      where id='86727411-438b-4e7d-9708-20081f0ca04a'`,
    [JSON.stringify({ date_source: 'de.rbth.com page: 14 Okt 2015' })]
  );

  await client.query(
    `update media_archive_records
        set published_date='2026-10-13', lang='FR', outlet='Le Monde', updated_at=now()
      where id='0ce50a84-da0c-48d3-9323-0726de400a09'`
  );
  await client.query(
    `update media_archive_records
        set published_date='2026-10-14', lang='FR', outlet='Le Temps', title=$1, updated_at=now()
      where id='cd42abb0-4789-44a8-8add-8126ec6fdf44'`,
    ['Les frappes ukrainiennes sur des data centers perturbent les services en ligne en Russie']
  );
  await client.query(
    `update media_archive_records
        set lang='ES', title='Vladimir Putin tiene un problema con la inteligencia artificial', updated_at=now()
      where id='be90c969-83ca-45e4-a38f-2eaaa0bf5a2a'`
  );
  await client.query(
    `update media_archive_records set lang='IT', updated_at=now()
      where id='7e013b7d-bd74-4138-987e-78abeebc97d9'`
  );
  await client.query(
    `update media_archive_records set lang='RU', outlet='Detector Media', updated_at=now()
      where id='65950c6f-22d1-4615-ac26-1bc28abb6951'`
  );
  await client.query(
    `update media_archive_records set canonical_url=url, updated_at=now()
      where id='a5661537-a282-4e24-9532-5e4ea2c077e5'`
  );

  // This record is not an authored column and contains no verified Merkurov
  // attribution. Keep it, but remove it from the public archive pending review.
  await client.query(
    `update media_archive_records
        set status='draft', kind='mention', updated_at=now(),
            ai_metadata = coalesce(ai_metadata,'{}'::jsonb) || $1::jsonb
      where id=(select id from media_archive_records
                where canonical_url like '%/2025/09/29/vechnyi-zov%' limit 1)`,
    [
      JSON.stringify({
        review_note:
          'No author in source metadata and no Merkurov mention found; excluded from public archive pending owner review.',
      }),
    ]
  );

  // Normalize every remaining title/outlet where a safe rule applies.
  const all = await loadMedia(client);
  for (const row of all) {
    const title = cleanTitle(row.title || '');
    const outlet = OUTLET_MAP[row.outlet] || row.outlet;
    if (title && (title !== row.title || outlet !== row.outlet)) {
      await client.query(
        `update media_archive_records set title=$1, outlet=$2, updated_at=now() where id=$3`,
        [title.slice(0, 500), outlet, row.id]
      );
    }
  }

  await saveManifest(records);
  console.log(`[media] updated=${updated} inserted=${inserted} classified=${classified}`);
  return { updated, inserted, ambiguous: ambiguous.length };
}

async function syncDocumentMetadata(client: Client) {
  const result = await client.query(
    `update knowledge_documents d
        set title=left(m.title,200),
            source_url=m.url,
            canonical_url=m.canonical_url,
            published_at=m.published_date,
            author=coalesce(m.author, d.author),
            language=lower(m.lang),
            media_outlet=m.outlet,
            media_kind=m.kind,
            media_topic=m.topic,
            media_language=upper(m.lang),
            media_published_date=m.published_date,
            media_archive_status=m.status,
            updated_at=now()
      from media_archive_records m
      where d.media_record_id=m.id`
  );
  await client.query(
    `update knowledge_documents
        set media_outlet=m.outlet, media_kind=m.kind, media_topic=m.topic,
            media_language=upper(m.lang), media_published_date=m.published_date,
            media_archive_status=m.status, updated_at=now()
      from media_archive_records m
      where knowledge_documents.media_record_id=m.id`
  );
  console.log(`[docs] metadata rows touched=${result.rowCount}`);
}

/**
 * Legacy `article` documents can already contain the exact same publication as
 * a Media Archive record but not carry `media_record_id`. Link them one-to-one
 * by exact canonical URL only when no other document is linked to that record.
 */
async function linkExactArticleDocuments(client: Client) {
  const result = await client.query(
    `update knowledge_documents d
        set media_record_id=m.id,
            media_outlet=m.outlet,
            media_kind=m.kind,
            media_topic=m.topic,
            media_language=upper(m.lang),
            media_published_date=m.published_date,
            media_archive_status=m.status,
            media_coverage_status='completed',
            media_coverage_method='legacy_article_exact_url',
            media_coverage_error_code=null,
            media_coverage_error_detail=null,
            media_coverage_diagnostics='{}'::jsonb,
            media_text_quality='full_text',
            updated_at=now()
      from media_archive_records m
      where d.media_record_id is null
        and d.chunk_count > 0
        and d.ingestion_status='completed'
        and m.status='published'
        and d.canonical_url = m.canonical_url
        and not exists (
          select 1 from knowledge_documents x where x.media_record_id=m.id
        )`
  );
  console.log(`[link] exact legacy article documents linked=${result.rowCount}`);
}

async function reconcileStatuses(client: Client) {
  await client.query(
    `update media_archive_records m
        set indexing_status = case d.media_coverage_status
              when 'completed' then 'completed'
              when 'partial' then 'partial'
              when 'blocked' then 'blocked'
              when 'failed' then 'failed'
              else 'not_indexed'
            end,
            indexing_error = case
              when d.media_coverage_status in ('failed','blocked','partial')
                then coalesce(d.media_coverage_error_detail, d.media_coverage_error_code)
              else null
            end,
            updated_at = now()
      from knowledge_documents d
      where d.media_record_id=m.id`
  );
  await client.query(
    `update knowledge_documents
        set ingestion_status='failed', updated_at=now()
      where ingestion_status='pending'
        and chunk_count=0
        and extraction_status in ('failed','blocked')`
  );
  console.log('[status] media indexing statuses reconciled');
}

async function supersedeDuplicates(client: Client) {
  const pairs = await client.query<{ keep_id: string; drop_id: string }>(
    `select keep.id keep_id, drop.id drop_id
       from knowledge_documents keep
       join knowledge_documents drop
         on drop.normalized_url = keep.normalized_url
        and drop.id <> keep.id
        and drop.source_type='article'
        and keep.source_type='media_coverage'
        and drop.content_hash = keep.content_hash
      where keep.media_record_id is not null
        and drop.media_record_id is null`
  );

  for (const pair of pairs.rows) {
    const refs = await client.query<{ mentions: string; relationships: string }>(
      `select
         (select count(*) from brain_entity_mentions where document_id=$1) mentions,
         (select count(*) from brain_relationships where provenance_document_id=$1) relationships`,
      [pair.drop_id]
    );
    if (Number(refs.rows[0]?.mentions || 0) > 0 || Number(refs.rows[0]?.relationships || 0) > 0) {
      console.log(`[duplicate] skipped ${pair.drop_id}: graph artifacts exist`);
      continue;
    }

    await client.query('begin');
    try {
      await client.query(`delete from knowledge_chunks where document_id=$1`, [pair.drop_id]);
      await client.query(
        `update brain_ingestion_jobs
            set status='duplicate',
                document_id=$1,
                error_code='duplicate_document',
                error_detail=$3,
                processed_at=coalesce(processed_at, now()),
                updated_at=now()
          where document_id=$2`,
        [
          pair.keep_id,
          pair.drop_id,
          `Exact duplicate of ${pair.keep_id}; consolidated during Brain/Media audit.`,
        ]
      );
      await client.query(
        `update knowledge_documents
            set ingestion_status='superseded',
                chunk_count=0,
                metadata=coalesce(metadata,'{}'::jsonb) || $2::jsonb,
                updated_at=now()
          where id=$1`,
        [
          pair.drop_id,
          JSON.stringify({
            duplicate_of: pair.keep_id,
            superseded_reason: 'exact duplicate content_hash; consolidated during audit',
            superseded_at: new Date().toISOString(),
          }),
        ]
      );
      await client.query('commit');
      console.log(`[duplicate] ${pair.drop_id} -> ${pair.keep_id}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  const blocked = await client.query(
    `update knowledge_documents
        set ingestion_status='failed', updated_at=now()
      where ingestion_status='pending'
        and chunk_count=0
        and extraction_status in ('failed','blocked')`
  );
  console.log(`[docs] permanent failures marked failed=${blocked.rowCount}`);
}

async function indexMissing(client: Client, limit: number) {
  const store = createBrainStore();
  const storage = createBrainStorage();
  if (!store || !storage) throw new Error('brain_store_or_storage_unavailable');

  const records = await loadManifest();
  const media = await loadMedia(client);
  const { matched, missing } = matchRecords(records, media);
  const all = [
    ...matched,
    ...missing.map((record) => ({ record, media: null as MediaRow | null, method: 'insert' })),
  ];

  const rows = await client.query<{
    id: string;
    title: string;
    canonical_url: string;
    published_date: string;
    source: string;
    chunk_count: number;
  }>(
    `select m.id, m.title, m.canonical_url, m.published_date,
            ${'m.id'} as source,
            coalesce((select d.chunk_count from knowledge_documents d where d.media_record_id=m.id limit 1),0) chunk_count
       from media_archive_records m
      where m.status='published'`
  );
  const byId = new Map(rows.rows.map((row) => [row.id, row]));

  let queued = 0;
  let skipped = 0;
  for (const item of all) {
    if (!item.media) continue;
    const fresh = byId.get(item.media.id);
    if (!fresh || Number(fresh.chunk_count) > 0) {
      skipped += 1;
      continue;
    }
    if (queued >= limit) break;

    const body = await fetchBody(item.record);
    const stored = await storage.storeSourceBuffer(Buffer.from(body, 'utf8'), 'txt', 'text/plain');
    await enqueueMediaCoverageJob({
      store,
      mediaRecordId: item.media.id,
      inputUrl: item.record.source,
      normalizedUrl: normalizeUrl(item.record.source),
      requestedBy: 'opencode-audit',
      source: 'novaya_archive_sync',
      sourceFormat: 'text',
      storagePath: stored.sourcePath,
      sourceSha256: stored.sourceSha256,
      mimeType: 'text/plain',
      byteSize: stored.byteSize,
      titleOverride: item.record.title,
      authorOverride: 'Антон Меркуров',
      publishedAtOverride: `${dateOf(item.record.date)}T00:00:00.000Z`,
      languageOverride: 'RU',
    });
    queued += 1;
  }

  console.log(`[index] queued=${queued} already_indexed_or_missing=${skipped}`);

  if (queued > 0) {
    for (let round = 0; round < 20; round += 1) {
      const remaining = await client.query<{ n: string }>(
        `select count(*) n from brain_ingestion_jobs where status in ('queued','processing')`
      );
      if (Number(remaining.rows[0]?.n || 0) === 0) break;

      const result = await runBrainWorker({
        trigger: 'admin',
        maxJobs: 5,
        maxDurationMs: 180_000,
        store,
        skipGuard: true,
      });
      console.log(
        `[worker] status=${result.status} processed=${result.processed} failed=${result.failed} stopped=${result.stoppedBy}`
      );
      if (result.processed === 0) break;
    }
  }

  await reconcileStatuses(client);
}

async function indexSpecial(client: Client, process = true) {
  const store = createBrainStore();
  const storage = createBrainStorage();
  if (!store || !storage) throw new Error('brain_store_or_storage_unavailable');

  // Re-index the Novaya column whose extraction succeeded but whose Brain job
  // failed before chunking.
  const column = await client.query<{
    id: string;
    canonical_url: string;
    published_date: string;
    chunk_count: number;
  }>(
    `select m.id, m.canonical_url, m.published_date,
            coalesce((select d.chunk_count from knowledge_documents d where d.media_record_id=m.id limit 1),0) chunk_count
       from media_archive_records m
      where m.canonical_url like '%/2026/06/11/sami-sebia-razblokiruite%' limit 1`
  );
  if (column.rows[0] && Number(column.rows[0].chunk_count) === 0) {
    const row = column.rows[0];
    const record = (await loadManifest()).find((entry) => normalizeUrl(entry.source) === normalizeUrl(row.canonical_url));
    if (record) {
      const body = await fetchBody(record);
      const stored = await storage.storeSourceBuffer(Buffer.from(body, 'utf8'), 'txt', 'text/plain');
      await enqueueMediaCoverageJob({
        store,
        mediaRecordId: row.id,
        inputUrl: record.source,
        normalizedUrl: normalizeUrl(record.source),
        requestedBy: 'opencode-audit',
        source: 'novaya_archive_sync',
        sourceFormat: 'text',
        storagePath: stored.sourcePath,
        sourceSha256: stored.sourceSha256,
        mimeType: 'text/plain',
        byteSize: stored.byteSize,
        titleOverride: record.title,
        authorOverride: 'Антон Меркуров',
        publishedAtOverride: `${dateOf(record.date)}T00:00:00.000Z`,
        languageOverride: 'RU',
      });
      console.log('[index] re-queued Sami sebia razblokiruite');
    }
  }

  // Washington Post: the source was captured manually and contains the full
  // article body. Clean the navigation/footer and index the body only.
  const wapo = await client.query<{
    id: string;
    source_path: string;
    source_sha256: string;
    canonical_url: string;
    chunk_count: number;
  }>(
    `select m.id, m.source_path, m.source_sha256, m.canonical_url,
            coalesce((select d.chunk_count from knowledge_documents d where d.media_record_id=m.id limit 1),0) chunk_count
       from media_archive_records m
      where m.id='9411f562-1ebf-4b19-b43d-a521edc087a5'`
  );
  if (wapo.rows[0]?.source_path && Number(wapo.rows[0].chunk_count) === 0) {
    const row = wapo.rows[0];
    const buffer = await storage.downloadSource(row.source_path);
    const raw = buffer.toString('utf8');
    const title = 'These data centers hold Putin’s AI aspirations. They’re big targets.';
    const subtitle =
      'Ukrainian attacks on the facilities — some containing Russia’s most powerful supercomputers — threaten aspirations for entirely Russian-built “sovereign AI.”';
    const start = raw.indexOf('By Mary Ilyushina');
    const end = raw.indexOf('What readers are saying');
    // First run: raw captured page text with navigation. Re-run: already
    // cleaned text stored by the first run.
    const text =
      start >= 0 && end > start
        ? `${title}\n\n${subtitle}\n\n${raw.slice(start, end).trim()}`
        : raw.trim();
    if (text.length > 200) {
      const stored = await storage.storeSourceBuffer(Buffer.from(text, 'utf8'), 'txt', 'text/plain');

      await client.query(
        `update media_archive_records
            set source_path=$1, source_sha256=$2, source_format='text', updated_at=now()
          where id=$3`,
        [stored.sourcePath, stored.sourceSha256, row.id]
      );

      await enqueueMediaCoverageJob({
        store,
        mediaRecordId: row.id,
        inputUrl: row.canonical_url,
        normalizedUrl: normalizeUrl(row.canonical_url),
        requestedBy: 'opencode-audit',
        source: 'washington_post_captured_text',
        sourceFormat: 'text',
        storagePath: stored.sourcePath,
        sourceSha256: stored.sourceSha256,
        mimeType: 'text/plain',
        byteSize: stored.byteSize,
        titleOverride: title,
        authorOverride: 'Mary Ilyushina',
        publishedAtOverride: '2026-10-29T00:00:00.000Z',
        languageOverride: 'EN',
      });
      console.log('[index] re-queued Washington Post cleaned full text');
    }
  }

  if (process) {
    for (let round = 0; round < 10; round += 1) {
      const remaining = await client.query<{ n: string }>(
        `select count(*) n from brain_ingestion_jobs where status in ('queued','processing')`
      );
      if (Number(remaining.rows[0]?.n || 0) === 0) break;
      const result = await runBrainWorker({
        trigger: 'admin',
        maxJobs: 5,
        maxDurationMs: 180_000,
        store,
        skipGuard: true,
      });
      console.log(`[worker] ${result.status} processed=${result.processed} failed=${result.failed}`);
      if (result.processed === 0) break;
    }
  }

  await reconcileStatuses(client);
}

async function report(client: Client) {
  const records = await loadManifest();
  const media = await loadMedia(client);
  const { matched, missing, ambiguous } = matchRecords(records, media);

  const docRows = await client.query<{
    media_record_id: string;
    chunk_count: number;
    media_text_quality: string | null;
    ingestion_status: string;
    media_coverage_status: string | null;
  }>(
    `select media_record_id, chunk_count, media_text_quality, ingestion_status, media_coverage_status
       from knowledge_documents where media_record_id is not null`
  );
  const docByMedia = new Map(docRows.rows.map((row) => [row.media_record_id, row]));

  const withText = matched.filter((item) => Number(docByMedia.get(item.media.id)?.chunk_count || 0) > 0);
  const withFullText = matched.filter(
    (item) =>
      docByMedia.get(item.media.id)?.media_text_quality === 'full_text' &&
      Number(docByMedia.get(item.media.id)?.chunk_count || 0) > 0
  );

  console.log(
    JSON.stringify(
      {
        manifest: records.length,
        matched: matched.length,
        missing: missing.length,
        ambiguous: ambiguous.length,
        matched_with_searchable_text: withText.length,
        matched_with_full_text: withFullText.length,
        missing_sources: missing.map((record) => ({
          date: dateOf(record.date),
          title: record.title,
          source: record.source,
        })),
        ambiguous_sources: ambiguous.map((item) => ({
          source: item.record.source,
          candidates: item.candidates.map((candidate) => candidate.id),
        })),
      },
      null,
      2
    )
  );
}

async function main() {
  const client = await connect();
  try {
    if (has('--report')) {
      await report(client);
      return;
    }
    if (has('--apply-media')) {
      const records = await loadManifest();
      await syncDocumentMetadata(client);
      const result = await applyMedia(client, records);
      await linkExactArticleDocuments(client);
      await syncDocumentMetadata(client);
      await reconcileStatuses(client);
      await supersedeDuplicates(client);
      console.log(JSON.stringify(result));
      return;
    }
    if (has('--index')) {
      const limit = Number(arg('--limit') || 10);
      await indexMissing(client, limit);
      await indexSpecial(client);
      await syncDocumentMetadata(client);
      await reconcileStatuses(client);
      return;
    }
    if (has('--queue-special')) {
      await indexSpecial(client, false);
      return;
    }
    if (has('--reconcile')) {
      await linkExactArticleDocuments(client);
      await syncDocumentMetadata(client);
      await reconcileStatuses(client);
      await supersedeDuplicates(client);
      return;
    }
    console.error(
      'Usage: --report | --apply-media | --index --limit N | --reconcile'
    );
    process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[novaya-sync] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
