import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { Client } from 'pg';

import {
  normalizeSourceUrl,
  getSourceDomain,
  publishedDateFromUrl,
} from '@/lib/knowledge/brain/url';
import { normalizeMediaLanguage } from '@/lib/knowledge/media/classify';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

type DocRow = {
  id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  canonical_url: string | null;
  normalized_url: string | null;
  published_at: string | null;
  language: string | null;
  author: string | null;
  content_hash: string | null;
  chunk_count: number;
  ingestion_status: string;
  extraction_status: string | null;
  media_record_id: string | null;
  metadata: Record<string, unknown> | null;
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
  status: string;
  ai_metadata: Record<string, unknown> | null;
};

type Match = {
  media: MediaRow;
  method: 'canonical_url' | 'normalized_url' | 'explicit_id' | 'title_outlet_date';
  confidence: number;
};

type PlannedLink = {
  doc: DocRow;
  media: MediaRow;
  method: Match['method'];
  confidence: number;
};

type PlannedCreate = {
  doc: DocRow;
  media: Omit<MediaRow, 'id'>;
};

type PlannedEnqueue = {
  media: MediaRow;
  normalizedUrl: string;
};

type PlannedConversion = {
  media: MediaRow;
  jobId: string;
  normalizedUrl: string;
};

type PlannedMetadataFix = {
  media: MediaRow;
  title?: string;
  outlet?: string;
  publishedDate?: string | null;
  reason: string;
};

type Unresolved = {
  kind: 'article_doc' | 'media_record';
  id: string;
  title: string;
  url: string | null;
  reason: string;
  candidates: Array<{ id: string; title: string; url: string | null; score: number }>;
};

// These kinds can produce meaningful full text. Profile pages, radio and video
// entries remain bibliographic records and are not sent to the article fetcher.
const ENQUEUE_KINDS = new Set(['column', 'quote', 'mention', 'interview', 'blog']);
const ENQUEUE_SKIP_KINDS = new Set(['profile', 'radio', 'video']);

const TOPICS = ['Internet & Censorship', 'AI & Tech', 'Art & Culture', 'Fintech & Crypto'] as const;

type Topic = (typeof TOPICS)[number];

const OUTLET_MAP: Record<string, string> = {
  'novayagazeta.ru': 'Новая газета',
  'novayagazeta.eu': 'Новая газета',
  'merkurov.substack.com': 'Substack',
  'substack.com': 'Substack',
  'medium.com': 'Medium',
  'lemonde.fr': 'Le Monde',
  'letemps.ch': 'Le Temps',
  'legrandcontinent.eu': 'El Grand Continent',
  'csmonitor.com': 'The Christian Science Monitor',
  'svoboda.org': 'Радио Свобода',
  'echo.msk.ru': 'Эхо Москвы',
  'kommersant.ru': 'Коммерсантъ',
  'vedomosti.ru': 'Ведомости',
  'rbc.ru': 'РБК',
  'forbes.ru': 'Forbes.ru',
  'theartnewspaper.com': 'The Art Newspaper',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'bbc.com': 'BBC News',
  'dw.com': 'Deutsche Welle',
  'zeit.de': 'DIE ZEIT',
};

function text(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function normalizeTitle(value: string): string {
  return cleanTitle(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*[—–|-]\s*Новая газета\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeTitle(value)
      .split(' ')
      .filter((token) => token.length >= 4)
  );
}

function similarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function docPublicationDate(doc: DocRow): string {
  return (
    dateOnly(doc.published_at) ||
    publishedDateFromUrl(doc.canonical_url || doc.source_url || '') ||
    ''
  );
}

function inferTopic(title: string): Topic {
  const value = title.toLowerCase();

  if (
    /(ии|искусственн|нейросет|chatgpt|openai|робот|алгоритм|machine learning|ai |нейро)/i.test(
      value
    )
  ) {
    return 'AI & Tech';
  }

  if (/(крипт|биткоин|блокчейн|финтех|банк|платеж|деньг|финанс|fintech|crypto)/i.test(value)) {
    return 'Fintech & Crypto';
  }

  if (/(культур|искусств|выстав|театр|кино|музык|музей|художник|литератур)/i.test(value)) {
    return 'Art & Culture';
  }

  return 'Internet & Censorship';
}

function safeNormalize(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  try {
    return normalizeSourceUrl(raw);
  } catch {
    return raw;
  }
}

function docUrls(doc: DocRow): string[] {
  const metadata = doc.metadata || {};
  return [
    doc.canonical_url,
    doc.normalized_url,
    doc.source_url,
    typeof metadata.canonical_url === 'string' ? metadata.canonical_url : null,
    typeof metadata.source_url === 'string' ? metadata.source_url : null,
  ]
    .map((value) => safeNormalize(value))
    .filter(Boolean);
}

function mediaUrls(media: MediaRow): string[] {
  return [media.canonical_url, media.url].map((value) => safeNormalize(value)).filter(Boolean);
}

function outletForDoc(doc: DocRow): string {
  const metadata = doc.metadata || {};
  const siteName = text(metadata.site_name, 200);
  if (siteName) return siteName;

  const url = doc.canonical_url || doc.source_url || '';
  const domain = getSourceDomain(url) || '';
  return OUTLET_MAP[domain] || domain || 'Unknown publication';
}

function titleKey(title: string, outlet: string, date: string): string {
  return `${normalizeTitle(title)}|${normalizeTitle(outlet)}|${date}`;
}

function docTitleKey(doc: DocRow): string {
  return titleKey(doc.title, outletForDoc(doc), docPublicationDate(doc));
}

function mediaTitleKey(media: MediaRow): string {
  return titleKey(media.title, media.outlet, dateOnly(media.published_date));
}

function inferKind(doc: DocRow): string {
  const domain = getSourceDomain(doc.canonical_url || doc.source_url || '') || '';
  if (domain.includes('novayagazeta')) return 'column';
  if (domain.includes('substack') || domain.includes('medium')) return 'blog';
  if (doc.author && normalizeTitle(doc.author).includes('антон меркуров')) return 'column';
  return 'mention';
}

function buildMediaFromDoc(doc: DocRow, method: string): Omit<MediaRow, 'id'> {
  const url = doc.canonical_url || doc.source_url || '';
  const canonical = safeNormalize(url) || url;
  const title = cleanTitle(text(doc.title, 500)) || 'Untitled publication';
  const metadataTopic =
    doc.metadata &&
    typeof doc.metadata.topic === 'string' &&
    (TOPICS as readonly string[]).includes(doc.metadata.topic)
      ? (doc.metadata.topic as Topic)
      : null;

  return {
    url: url.slice(0, 4000),
    canonical_url: canonical,
    title,
    outlet: outletForDoc(doc).slice(0, 300),
    published_date: docPublicationDate(doc) || null,
    lang: normalizeMediaLanguage(doc.language, 'EN'),
    kind: inferKind(doc),
    topic: metadataTopic || inferTopic(title),
    status: 'published',
    ai_metadata: {
      reconciled_from: 'knowledge_documents',
      source_document_id: doc.id,
      source_type: doc.source_type,
      link_method: method,
      reconciliation_version: 'media-rag-reconciliation-v1',
      eligibility: inferKind(doc) === 'blog' ? 'author_blog' : 'author_publication',
    },
  };
}

function mediaStatusForDoc(doc: DocRow): { status: string; quality: string } {
  const chunkCount = Number(doc.chunk_count || 0);
  if (chunkCount === 0) {
    return { status: 'failed', quality: 'metadata_only' };
  }
  if (doc.extraction_status === 'complete') {
    return { status: 'completed', quality: 'full_text' };
  }
  return { status: 'partial', quality: 'partial_text' };
}

function uniqueMatches(matches: Match[]): Match[] {
  const seen = new Set<string>();
  const result: Match[] = [];
  for (const match of matches) {
    if (seen.has(match.media.id)) continue;
    seen.add(match.media.id);
    result.push(match);
  }
  return result;
}

function resolveMediaForDoc(
  doc: DocRow,
  mediaByCanonical: Map<string, MediaRow[]>,
  mediaByNormalized: Map<string, MediaRow[]>,
  mediaByTitle: Map<string, MediaRow[]>,
  mediaById: Map<string, MediaRow>
): { match: Match | null; ambiguous: MediaRow[] } {
  const urls = docUrls(doc);
  const canonicalMatches = uniqueMatches(
    urls.flatMap((url) =>
      (mediaByCanonical.get(url) || []).map((media) => ({
        media,
        method: 'canonical_url' as const,
        confidence: 1,
      }))
    )
  );

  if (canonicalMatches.length === 1) return { match: canonicalMatches[0], ambiguous: [] };
  if (canonicalMatches.length > 1) {
    return { match: null, ambiguous: canonicalMatches.map((item) => item.media) };
  }

  const normalizedMatches = uniqueMatches(
    urls.flatMap((url) =>
      (mediaByNormalized.get(url) || []).map((media) => ({
        media,
        method: 'normalized_url' as const,
        confidence: 0.98,
      }))
    )
  );

  if (normalizedMatches.length === 1) return { match: normalizedMatches[0], ambiguous: [] };
  if (normalizedMatches.length > 1) {
    return { match: null, ambiguous: normalizedMatches.map((item) => item.media) };
  }

  const explicit = text(doc.metadata?.media_record_id, 100);
  if (explicit && mediaById.has(explicit)) {
    return {
      match: { media: mediaById.get(explicit) as MediaRow, method: 'explicit_id', confidence: 1 },
      ambiguous: [],
    };
  }

  const titleMatches = uniqueMatches(
    (mediaByTitle.get(docTitleKey(doc)) || []).map((media) => ({
      media,
      method: 'title_outlet_date' as const,
      confidence: 0.9,
    }))
  );

  if (titleMatches.length === 1) return { match: titleMatches[0], ambiguous: [] };
  if (titleMatches.length > 1) {
    return { match: null, ambiguous: titleMatches.map((item) => item.media) };
  }

  return { match: null, ambiguous: [] };
}

function resolveDocForMedia(
  media: MediaRow,
  docsByCanonical: Map<string, DocRow[]>,
  docsByNormalized: Map<string, DocRow[]>,
  docsByTitle: Map<string, DocRow[]>,
  docById: Map<string, DocRow>
): { doc: DocRow | null; ambiguous: DocRow[] } {
  const urls = mediaUrls(media);
  const canonical = urls.flatMap((url) => docsByCanonical.get(url) || []);
  const canonicalUnique = [...new Map(canonical.map((doc) => [doc.id, doc])).values()];
  if (canonicalUnique.length === 1) return { doc: canonicalUnique[0], ambiguous: [] };
  if (canonicalUnique.length > 1) return { doc: null, ambiguous: canonicalUnique };

  const normalized = urls.flatMap((url) => docsByNormalized.get(url) || []);
  const normalizedUnique = [...new Map(normalized.map((doc) => [doc.id, doc])).values()];
  if (normalizedUnique.length === 1) return { doc: normalizedUnique[0], ambiguous: [] };
  if (normalizedUnique.length > 1) return { doc: null, ambiguous: normalizedUnique };

  const title = docsByTitle.get(mediaTitleKey(media)) || [];
  if (title.length === 1) return { doc: title[0], ambiguous: [] };
  if (title.length > 1) return { doc: null, ambiguous: title };

  return { doc: null, ambiguous: [] };
}

function fuzzySuggestions(
  title: string,
  candidates: Array<{ id: string; title: string; url: string | null }>
) {
  const sourceTokens = tokens(title);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: similarity(sourceTokens, tokens(candidate.title)),
    }))
    .filter((candidate) => candidate.score >= 0.55)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function csvCell(value: unknown): string {
  const stringValue = String(value ?? '');
  return `"${stringValue.replace(/"/g, '""')}"`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const retryFailed = process.argv.includes('--retry-failed');
  const csvPathArg = process.argv.find((arg) => arg.startsWith('--csv='));
  const jsonPathArg = process.argv.find((arg) => arg.startsWith('--json='));
  const csvPath =
    csvPathArg?.slice('--csv='.length) || 'docs/audits/media-rag-reconciliation-actions.csv';
  const jsonPath =
    jsonPathArg?.slice('--json='.length) || 'docs/audits/media-rag-reconciliation.json';

  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('localhost')
      ? undefined
      : { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const docsResult = await client.query(
      `SELECT id,title,source_type,source_url,canonical_url,normalized_url,published_at,
              language,author,content_hash,chunk_count,ingestion_status,extraction_status,
              media_record_id,metadata
       FROM public.knowledge_documents
       WHERE source_type IN ('article','media_coverage')
       ORDER BY created_at`
    );
    const mediaResult = await client.query(
      `SELECT id,url,canonical_url,title,outlet,published_date,lang,kind,topic,status,ai_metadata
       FROM public.media_archive_records
       ORDER BY created_at`
    );
    const jobsResult = await client.query(
      `SELECT id,status,source_type,media_record_id,normalized_url,created_at
       FROM public.brain_ingestion_jobs
       WHERE status IN ('queued','processing')
          OR media_record_id IS NOT NULL
       ORDER BY created_at DESC`
    );

    const docs = docsResult.rows as DocRow[];
    const media = mediaResult.rows as MediaRow[];
    const articleDocs = docs.filter((doc) => doc.source_type === 'article');
    const coverageDocs = docs.filter((doc) => doc.source_type === 'media_coverage');
    const linkedDocs = docs.filter((doc) => Boolean(doc.media_record_id));

    const latestJobByMedia = new Map<
      string,
      {
        id: string;
        status: string;
        sourceType: string;
        normalizedUrl: string | null;
        createdAt: string;
      }
    >();
    const activeJobByMedia = new Map<string, { id: string; sourceType: string }>();
    const activeJobByUrl = new Map<
      string,
      { id: string; status: string; sourceType: string; mediaRecordId: string | null }
    >();

    for (const row of jobsResult.rows as Array<{
      id: string;
      status: string;
      source_type: string;
      media_record_id: string | null;
      normalized_url: string | null;
      created_at: string;
    }>) {
      const job = {
        id: row.id,
        status: row.status,
        sourceType: row.source_type,
        normalizedUrl: row.normalized_url,
        createdAt: row.created_at,
      };

      if (row.media_record_id && !latestJobByMedia.has(row.media_record_id)) {
        latestJobByMedia.set(row.media_record_id, job);
      }

      if (row.status === 'queued' || row.status === 'processing') {
        if (row.media_record_id && !activeJobByMedia.has(row.media_record_id)) {
          activeJobByMedia.set(row.media_record_id, {
            id: row.id,
            sourceType: row.source_type,
          });
        }
        if (row.normalized_url && !activeJobByUrl.has(row.normalized_url)) {
          activeJobByUrl.set(row.normalized_url, {
            id: row.id,
            status: row.status,
            sourceType: row.source_type,
            mediaRecordId: row.media_record_id,
          });
        }
      }
    }

    const mediaById = new Map(media.map((row) => [row.id, row]));
    const docById = new Map(docs.map((row) => [row.id, row]));
    const docByMediaId = new Map(
      docs
        .filter((row) => Boolean(row.media_record_id))
        .map((row) => [String(row.media_record_id), row])
    );

    // Repair only known-incomplete metadata. Do not replace richer fields with
    // guesses; existing dates and clean outlet names are preserved.
    const metadataFixes: PlannedMetadataFix[] = [];
    for (const row of media) {
      const doc = docByMediaId.get(row.id);
      const reasons: string[] = [];
      let title = row.title;
      let outlet = row.outlet;
      let publishedDate = row.published_date;

      if (/^Pending import:/i.test(row.title) && doc?.title) {
        title = cleanTitle(text(doc.title, 500));
        reasons.push('pending_import_title');
      } else {
        const cleaned = cleanTitle(row.title);
        if (cleaned && cleaned !== row.title) {
          title = cleaned;
          reasons.push('outlet_suffix');
        }
      }

      const domain = getSourceDomain(row.canonical_url || row.url) || '';
      const outletLooksLikeDomain =
        Boolean(row.outlet) && !/\s/.test(row.outlet) && row.outlet.includes('.');
      if (outletLooksLikeDomain && OUTLET_MAP[domain] && row.outlet !== OUTLET_MAP[domain]) {
        outlet = OUTLET_MAP[domain];
        reasons.push('outlet_domain');
      }

      if (!publishedDate) {
        const derived = publishedDateFromUrl(row.canonical_url || row.url);
        if (derived) {
          publishedDate = derived;
          reasons.push('date_from_url');
        }
      }

      if (reasons.length > 0) {
        metadataFixes.push({
          media: row,
          title,
          outlet,
          publishedDate,
          reason: reasons.join(','),
        });
      }
    }

    const mediaByCanonical = new Map<string, MediaRow[]>();
    const mediaByNormalized = new Map<string, MediaRow[]>();
    const mediaByTitle = new Map<string, MediaRow[]>();

    for (const row of media) {
      const urls = mediaUrls(row);
      for (const url of urls) {
        mediaByCanonical.set(url, [...(mediaByCanonical.get(url) || []), row]);
        mediaByNormalized.set(url, [...(mediaByNormalized.get(url) || []), row]);
      }
      mediaByTitle.set(mediaTitleKey(row), [...(mediaByTitle.get(mediaTitleKey(row)) || []), row]);
    }

    const docsByCanonical = new Map<string, DocRow[]>();
    const docsByNormalized = new Map<string, DocRow[]>();
    const docsByTitle = new Map<string, DocRow[]>();

    for (const row of articleDocs) {
      if (row.media_record_id) continue;
      for (const url of docUrls(row)) {
        docsByCanonical.set(url, [...(docsByCanonical.get(url) || []), row]);
        docsByNormalized.set(url, [...(docsByNormalized.get(url) || []), row]);
      }
      docsByTitle.set(docTitleKey(row), [...(docsByTitle.get(docTitleKey(row)) || []), row]);
    }

    const links: PlannedLink[] = [];
    const creates: PlannedCreate[] = [];
    const unresolved: Unresolved[] = [];
    const matchedDocIds = new Set<string>();
    const matchedMediaIds = new Set<string>();
    const claimedDocIds = new Set<string>();
    const claimedMediaIds = new Set<string>();
    const claimedCanonicalKeys = new Set<string>();

    for (const doc of articleDocs) {
      if (doc.media_record_id) {
        matchedDocIds.add(doc.id);
        matchedMediaIds.add(doc.media_record_id);
        continue;
      }

      const resolved = resolveMediaForDoc(
        doc,
        mediaByCanonical,
        mediaByNormalized,
        mediaByTitle,
        mediaById
      );

      if (resolved.match && claimedMediaIds.has(resolved.match.media.id)) {
        unresolved.push({
          kind: 'article_doc',
          id: doc.id,
          title: doc.title,
          url: doc.canonical_url || doc.source_url,
          reason: 'media_already_claimed',
          candidates: [
            {
              id: resolved.match.media.id,
              title: resolved.match.media.title,
              url: resolved.match.media.canonical_url,
              score: resolved.match.confidence,
            },
          ],
        });
      } else if (resolved.match) {
        links.push({
          doc,
          media: resolved.match.media,
          method: resolved.match.method,
          confidence: resolved.match.confidence,
        });
        matchedDocIds.add(doc.id);
        matchedMediaIds.add(resolved.match.media.id);
        claimedDocIds.add(doc.id);
        claimedMediaIds.add(resolved.match.media.id);
      } else if (resolved.ambiguous.length > 0) {
        unresolved.push({
          kind: 'article_doc',
          id: doc.id,
          title: doc.title,
          url: doc.canonical_url || doc.source_url,
          reason: 'ambiguous_media_match',
          candidates: resolved.ambiguous.map((row) => ({
            id: row.id,
            title: row.title,
            url: row.canonical_url,
            score: 1,
          })),
        });
      } else {
        const created = buildMediaFromDoc(doc, 'created_from_legacy_article');
        if (claimedCanonicalKeys.has(created.canonical_url)) {
          unresolved.push({
            kind: 'article_doc',
            id: doc.id,
            title: doc.title,
            url: created.canonical_url,
            reason: 'duplicate_document_for_media_url',
            candidates: [],
          });
        } else {
          creates.push({ doc, media: created });
          matchedDocIds.add(doc.id);
          claimedDocIds.add(doc.id);
          claimedCanonicalKeys.add(created.canonical_url);
        }
      }
    }

    const enqueues: PlannedEnqueue[] = [];
    const conversions: PlannedConversion[] = [];
    let skippedNonText = 0;
    let skippedExistingJob = 0;
    let skippedFailedJob = 0;
    let skippedProcessingJob = 0;
    const queuedKeys = new Set<string>();
    for (const doc of coverageDocs) {
      if (doc.media_record_id) matchedMediaIds.add(doc.media_record_id);
    }

    const mediaWithoutDoc = media.filter((row) => !matchedMediaIds.has(row.id));

    for (const row of mediaWithoutDoc) {
      const resolved = resolveDocForMedia(
        row,
        docsByCanonical,
        docsByNormalized,
        docsByTitle,
        docById
      );

      if (resolved.doc && claimedDocIds.has(resolved.doc.id)) {
        unresolved.push({
          kind: 'media_record',
          id: row.id,
          title: row.title,
          url: row.canonical_url,
          reason: 'document_already_claimed',
          candidates: [
            {
              id: resolved.doc.id,
              title: resolved.doc.title,
              url: resolved.doc.canonical_url,
              score: 1,
            },
          ],
        });
      } else if (resolved.doc) {
        links.push({
          doc: resolved.doc,
          media: row,
          method: 'canonical_url',
          confidence: 0.98,
        });
        matchedDocIds.add(resolved.doc.id);
        matchedMediaIds.add(row.id);
        claimedDocIds.add(resolved.doc.id);
        claimedMediaIds.add(row.id);
      } else if (resolved.ambiguous.length > 0) {
        unresolved.push({
          kind: 'media_record',
          id: row.id,
          title: row.title,
          url: row.canonical_url,
          reason: 'ambiguous_document_match',
          candidates: resolved.ambiguous.map((doc) => ({
            id: doc.id,
            title: doc.title,
            url: doc.canonical_url,
            score: 1,
          })),
        });
      } else {
        const normalized = safeNormalize(row.canonical_url || row.url);

        if (!normalized) {
          unresolved.push({
            kind: 'media_record',
            id: row.id,
            title: row.title,
            url: row.canonical_url,
            reason: 'invalid_url',
            candidates: [],
          });
          continue;
        }

        if (!ENQUEUE_KINDS.has(row.kind) || ENQUEUE_SKIP_KINDS.has(row.kind)) {
          skippedNonText += 1;
          continue;
        }

        const activeForMedia = activeJobByMedia.get(row.id);
        if (activeForMedia) {
          skippedExistingJob += 1;
          continue;
        }

        const activeForUrl = activeJobByUrl.get(normalized);
        if (activeForUrl) {
          if (
            activeForUrl.sourceType === 'article' &&
            !activeForUrl.mediaRecordId &&
            activeForUrl.status === 'queued'
          ) {
            conversions.push({ media: row, jobId: activeForUrl.id, normalizedUrl: normalized });
            continue;
          }

          if (activeForUrl.status === 'processing') {
            skippedProcessingJob += 1;
          } else {
            skippedExistingJob += 1;
          }
          continue;
        }

        const latestJob = latestJobByMedia.get(row.id);

        if (latestJob && !['failed', 'blocked'].includes(latestJob.status)) {
          skippedExistingJob += 1;
          continue;
        }

        if (latestJob && ['failed', 'blocked'].includes(latestJob.status) && !retryFailed) {
          skippedFailedJob += 1;
          continue;
        }

        const key = `${row.id}|${normalized}`;
        if (queuedKeys.has(key)) continue;
        queuedKeys.add(key);
        enqueues.push({ media: row, normalizedUrl: normalized });
      }
    }

    // Suggestions only; never auto-applied.
    const suggestions = unresolved.map((row) => {
      const candidates =
        row.kind === 'article_doc'
          ? media.map((mediaRow) => ({
              id: mediaRow.id,
              title: mediaRow.title,
              url: mediaRow.canonical_url,
            }))
          : articleDocs.map((doc) => ({
              id: doc.id,
              title: doc.title,
              url: doc.canonical_url,
            }));

      return {
        ...row,
        fuzzySuggestions: fuzzySuggestions(row.title, candidates),
      };
    });

    let created = 0;
    let linked = 0;
    let enqueued = 0;
    let converted = 0;
    let metadataFixed = 0;
    let runId: string | null = null;

    if (apply) {
      for (const fix of metadataFixes) {
        const updated = await client.query(
          `UPDATE public.media_archive_records
           SET title=COALESCE($1,title),
               outlet=COALESCE($2,outlet),
               published_date=COALESCE($3,published_date),
               updated_at=now()
           WHERE id=$4`,
          [fix.title || null, fix.outlet || null, fix.publishedDate || null, fix.media.id]
        );
        metadataFixed += updated.rowCount || 0;
      }

      for (const link of links) {
        const status = mediaStatusForDoc(link.doc);
        const updated = await client.query(
          `UPDATE public.knowledge_documents
           SET media_record_id=$1,
               media_outlet=$2,
               media_kind=$3,
               media_topic=$4,
               media_language=$5,
               media_published_date=$6,
               media_archive_status=$7,
               media_coverage_status=$8,
               media_text_quality=$9,
               media_coverage_method='reconciled_link',
               media_coverage_error_code=NULL,
               media_coverage_error_detail=NULL,
               media_coverage_diagnostics=jsonb_build_object(
                 'reconciliation_version','media-rag-reconciliation-v1',
                 'link_method',$10::text,
                 'link_confidence',$11::numeric
               ),
               processed_at=now(),
               updated_at=now()
           WHERE id=$12 AND media_record_id IS NULL
           RETURNING id`,
          [
            link.media.id,
            text(link.media.outlet, 300),
            text(link.media.kind, 60),
            text(link.media.topic, 120),
            text(link.media.lang, 16),
            link.media.published_date,
            text(link.media.status, 40),
            status.status,
            status.quality,
            link.method,
            link.confidence,
            link.doc.id,
          ]
        );
        linked += updated.rowCount || 0;
      }

      for (const create of creates) {
        const inserted = await client.query(
          `INSERT INTO public.media_archive_records
             (url,canonical_url,title,outlet,published_date,lang,kind,topic,summary,image_url,status,ai_metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11)
           ON CONFLICT (canonical_url) DO NOTHING
           RETURNING id`,
          [
            create.media.url,
            create.media.canonical_url,
            create.media.title,
            create.media.outlet,
            create.media.published_date,
            create.media.lang,
            create.media.kind,
            create.media.topic,
            '',
            create.media.status,
            create.media.ai_metadata,
          ]
        );

        let mediaId = inserted.rows[0]?.id as string | undefined;

        if (!mediaId) {
          const existing = await client.query(
            `SELECT id FROM public.media_archive_records WHERE canonical_url=$1`,
            [create.media.canonical_url]
          );
          mediaId = existing.rows[0]?.id as string | undefined;
        }

        if (!mediaId) {
          unresolved.push({
            kind: 'article_doc',
            id: create.doc.id,
            title: create.doc.title,
            url: create.media.canonical_url,
            reason: 'media_record_create_failed',
            candidates: [],
          });
          continue;
        }

        const status = mediaStatusForDoc(create.doc);
        const updated = await client.query(
          `UPDATE public.knowledge_documents
           SET media_record_id=$1,
               media_outlet=$2,
               media_kind=$3,
               media_topic=$4,
               media_language=$5,
               media_published_date=$6,
               media_archive_status=$7,
               media_coverage_status=$8,
               media_text_quality=$9,
               media_coverage_method='reconciled_create',
               media_coverage_diagnostics=jsonb_build_object(
                 'reconciliation_version','media-rag-reconciliation-v1',
                 'created_media_record',true
               ),
               processed_at=now(),
               updated_at=now()
           WHERE id=$10 AND media_record_id IS NULL`,
          [
            mediaId,
            create.media.outlet,
            create.media.kind,
            create.media.topic,
            create.media.lang,
            create.media.published_date,
            create.media.status,
            status.status,
            status.quality,
            create.doc.id,
          ]
        );
        if (inserted.rowCount) created += 1;
        linked += updated.rowCount || 0;
      }

      for (const conversion of conversions) {
        const updated = await client.query(
          `UPDATE public.brain_ingestion_jobs
           SET source_type='media_coverage',
               media_record_id=$1,
               requested_by=COALESCE(requested_by,'media_reconciliation')
           WHERE id=$2
             AND source_type='article'
             AND status='queued'
             AND media_record_id IS NULL`,
          [conversion.media.id, conversion.jobId]
        );
        converted += updated.rowCount || 0;
      }

      if (enqueues.length > 0) {
        const run = await client.query(
          `INSERT INTO public.brain_ingestion_runs (status, metadata)
           VALUES ('running', $1::jsonb) RETURNING id`,
          [
            JSON.stringify({
              source: 'media_reconciliation',
              requested: enqueues.length,
              version: 'media-rag-reconciliation-v1',
            }),
          ]
        );
        runId = run.rows[0].id as string;

        for (const item of enqueues) {
          const active = await client.query(
            `SELECT 1 FROM public.brain_ingestion_jobs
             WHERE status IN ('queued','processing')
               AND (media_record_id=$1 OR normalized_url=$2)
             LIMIT 1`,
            [item.media.id, item.normalizedUrl]
          );
          if (active.rowCount) continue;

          const inserted = await client.query(
            `INSERT INTO public.brain_ingestion_jobs
               (run_id,input_url,normalized_url,source_type,media_record_id,status)
             VALUES ($1,$2,$3,'media_coverage',$4,'queued')
             ON CONFLICT DO NOTHING`,
            [runId, item.media.url, item.normalizedUrl, item.media.id]
          );
          enqueued += inserted.rowCount || 0;
        }

        // Leave the run in "running": the jobs are queued and the existing
        // admin worker resumes them one by one. Completing the run here would
        // hide queued work and prevent "Continue run" in the admin UI.
        if (enqueued > 0) {
          await client.query(
            `UPDATE public.brain_ingestion_runs
             SET status='running', completed_at=NULL, updated_at=now()
             WHERE id=$1`,
            [runId]
          );
        }
      }
    }

    const fullTextNoEmbeddings = await client.query(
      `SELECT count(*)::int AS count
       FROM public.knowledge_documents d
       WHERE d.media_record_id IS NOT NULL
         AND COALESCE(d.source_char_count,0) > 0
         AND (
           COALESCE(d.chunk_count,0) = 0
           OR NOT EXISTS (
             SELECT 1 FROM public.knowledge_chunks c
             WHERE c.document_id=d.id
               AND c.embedding_model='baai/bge-m3'
               AND c.embedding_dimensions=1024
           )
         )`
    );
    const searchablePublications = await client.query(
      `SELECT count(DISTINCT d.media_record_id)::int AS count
       FROM public.knowledge_documents d
       JOIN public.media_archive_records m ON m.id=d.media_record_id
       WHERE d.ingestion_status='completed'
         AND COALESCE(d.chunk_count,0) > 0`
    );
    const fullTextNoChunks = await client.query(
      `SELECT count(*)::int AS count
       FROM public.knowledge_documents d
       WHERE d.media_record_id IS NOT NULL
         AND COALESCE(d.source_char_count,0) > 0
         AND COALESCE(d.chunk_count,0) = 0`
    );

    const linkedLegacyBefore = linkedDocs.filter((doc) => doc.source_type === 'article').length;
    const linkedLegacyAfter = articleDocs.length;
    const linkedLegacyByRun = linkedLegacyAfter - linkedLegacyBefore;
    const linkedNewDocuments = linkedDocs.filter(
      (doc) => doc.source_type === 'media_coverage'
    ).length;
    const metadataOnlyMediaRecords = media.length - linkedDocs.length - links.length;

    const report = {
      mode: apply ? 'apply' : 'dry_run',
      generatedAt: new Date().toISOString(),
      counts: {
        articleDocuments: articleDocs.length,
        mediaCoverageDocuments: coverageDocs.length,
        mediaRecords: media.length,
        totalEligiblePublications: media.length + creates.length,
        linkedDocumentsBefore: linkedDocs.length,
        unlinkedArticleDocuments: articleDocs.filter((doc) => !doc.media_record_id).length,
        mediaRecordsWithoutDocument: mediaWithoutDoc.length,
        plannedLinks: links.length,
        plannedCreates: creates.length,
        plannedEnqueues: enqueues.length,
        plannedConversions: conversions.length,
        plannedMetadataFixes: metadataFixes.length,
        skippedNonTextMediaRecords: skippedNonText,
        skippedExistingJobs: skippedExistingJob,
        skippedProcessingJobs: skippedProcessingJob,
        skippedPreviouslyFailed: skippedFailedJob,
        unresolvedMatches: suggestions.length,
        duplicatesPrevented: links.length,
        linkedLegacyBefore,
        linkedLegacyByRun,
        linkedLegacyAfter,
        linkedNewDocuments,
        newlyCreatedMediaRecords: creates.length,
        newlyIngestedDocuments: 0,
        metadataOnlyMediaRecords,
        appliedCreatedMediaRecords: created,
        appliedLinkedDocuments: linked,
        appliedEnqueuedJobs: enqueued,
        appliedConvertedJobs: converted,
        appliedMetadataFixes: metadataFixed,
        fullTextWithoutEmbeddings: fullTextNoEmbeddings.rows[0]?.count || 0,
        fullTextWithoutChunks: fullTextNoChunks.rows[0]?.count || 0,
        searchablePublications: searchablePublications.rows[0]?.count || 0,
      },
      runId,
      links: links.map((link) => ({
        docId: link.doc.id,
        mediaRecordId: link.media.id,
        method: link.method,
        confidence: link.confidence,
        title: link.doc.title,
        url: link.media.canonical_url,
      })),
      creates: creates.map((create) => ({
        docId: create.doc.id,
        title: create.doc.title,
        canonicalUrl: create.media.canonical_url,
        outlet: create.media.outlet,
        kind: create.media.kind,
        status: create.media.status,
      })),
      enqueues: enqueues.map((item) => ({
        mediaRecordId: item.media.id,
        title: item.media.title,
        outlet: item.media.outlet,
        canonicalUrl: item.media.canonical_url,
      })),
      conversions: conversions.map((item) => ({
        mediaRecordId: item.media.id,
        jobId: item.jobId,
        title: item.media.title,
        outlet: item.media.outlet,
        canonicalUrl: item.normalizedUrl,
      })),
      metadataFixes: metadataFixes.map((fix) => ({
        mediaRecordId: fix.media.id,
        reason: fix.reason,
        before: {
          title: fix.media.title,
          outlet: fix.media.outlet,
          publishedDate: fix.media.published_date,
        },
        after: {
          title: fix.title,
          outlet: fix.outlet,
          publishedDate: fix.publishedDate,
        },
      })),
      unresolved: suggestions,
    };

    if (apply) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    await fs.mkdir(path.dirname(csvPath), { recursive: true });
    await fs.mkdir(path.dirname(jsonPath), { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

    const rows = [
      ['type', 'id', 'title', 'url', 'action', 'detail'],
      ...links.map((link) => [
        'link',
        link.doc.id,
        link.doc.title,
        link.media.canonical_url,
        'link_document',
        `${link.method}:${link.media.id}`,
      ]),
      ...creates.map((create) => [
        'create_media',
        create.doc.id,
        create.doc.title,
        create.media.canonical_url,
        'create_media_record',
        create.media.outlet,
      ]),
      ...enqueues.map((item) => [
        'enqueue',
        item.media.id,
        item.media.title,
        item.media.canonical_url,
        'enqueue_ingestion',
        item.media.outlet,
      ]),
      ...conversions.map((item) => [
        'convert_job',
        item.media.id,
        item.media.title,
        item.normalizedUrl,
        'convert_article_job_to_media',
        item.jobId,
      ]),
      ...metadataFixes.map((fix) => [
        'metadata_fix',
        fix.media.id,
        fix.media.title,
        fix.media.canonical_url,
        'update_metadata',
        fix.reason,
      ]),
      ...suggestions.map((row) => [
        'unresolved',
        row.id,
        row.title,
        row.url,
        row.reason,
        row.fuzzySuggestions.map((suggestion) => suggestion.id).join('|'),
      ]),
    ];

    if (rows.length > 1) {
      await fs.writeFile(csvPath, rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n');
    } else {
      console.log('REPORT_CSV_SKIPPED=no_actions');
    }

    console.log(JSON.stringify(report.counts, null, 2));
    console.log(`REPORT_JSON=${jsonPath}`);
    console.log(`REPORT_CSV=${csvPath}`);
    console.log(`MODE=${report.mode}`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors.
    }
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('MEDIA_RECONCILIATION_FAILED', error);
  process.exitCode = 1;
});
