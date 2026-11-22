import { NextResponse } from 'next/server';

import { parseMediaIntelligenceFilters } from '@/lib/analytics/mediaIntelligenceFilters';
import { getMediaRecords } from '@/lib/mediaRecords';
import { searchMediaIntelligence } from '@/lib/knowledge/media/search';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import type { MediaRecord, PublicMediaQuote } from '@/data/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RESULTS = 12;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    // Keep short numeric tokens so a full date such as 2026-10-13 is matched
    // as a whole instead of degrading to its year only.
    .filter((word) => word.length >= 3 || /^\d+$/.test(word));
}

function lexicalMatches(records: MediaRecord[], query: string): MediaRecord[] {
  const terms = words(query);
  if (terms.length === 0) return [];

  return records.filter((record) => {
    const haystack = [
      record.title,
      record.author,
      record.outlet,
      record.program,
      record.summary,
      record.topic,
      record.derivedTopic,
      record.lang,
      record.kind,
      record.date,
      ...(record.subtopics || []),
      ...(record.verifiedQuotes || []).map((quote) => quote.text),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/ё/g, 'е');

    return terms.every((term) => haystack.includes(term));
  });
}

function publicQuotes(record: MediaRecord): PublicMediaQuote[] {
  return (record.verifiedQuotes || []).slice(0, 4);
}

function mapRecord(record: MediaRecord) {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    outlet: record.outlet,
    author: record.author,
    date: record.date,
    lang: record.lang,
    kind: record.kind,
    topic: record.derivedTopic || record.topic,
    summary: record.summary,
    url: record.url,
    href: `/media/record/${encodeURIComponent(record.slug)}`,
    quotes: publicQuotes(record),
    related: (record.related || []).slice(0, 3),
  };
}

export async function POST(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60_000,
    maxRequests: 20,
    keyPrefix: 'media-search',
  });

  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const query =
    body && typeof body === 'object' && typeof body.query === 'string'
      ? body.query.trim()
      : '';

  if (!query || query.length > 500) {
    return json({ error: 'Provide a search query between 1 and 500 characters.' }, 400);
  }

  const filters = parseMediaIntelligenceFilters(
    body && typeof body === 'object' && body.filters && typeof body.filters === 'object'
      ? { ...(body.filters as Record<string, string>), status: 'published' }
      : { status: 'published' }
  );

  const records = await getMediaRecords();

  const filtered = records.filter((record) => {
    if (filters.topic && (record.derivedTopic || record.topic) !== filters.topic) return false;
    if (filters.language && record.lang !== filters.language) return false;
    if (filters.outlet && record.outlet !== filters.outlet) return false;
    if (filters.from && record.date < filters.from) return false;
    if (filters.to && record.date > filters.to) return false;
    return true;
  });

  // Database ids are used by semantic search. The local verified fallback has
  // no database id, so it must remain addressable by slug for metadata search;
  // otherwise a record visible on /media could not be found through the API.
  const byKey = new Map<string, MediaRecord>();
  for (const record of filtered) {
    if (record.id) byKey.set(`id:${record.id}`, record);
    byKey.set(`slug:${record.slug}`, record);
  }

  let ids: string[] = [];
  let semanticUsed = false;
  let semanticProvenance: {
    count: number;
    scannedChunks: number;
    minSimilarity: number;
    caveats: string[];
  } | null = null;

  try {
    const result = await searchMediaIntelligence({
      query,
      filters,
      limit: MAX_RESULTS,
      answerMode: 'none',
    });

    ids = Array.from(new Set(result.results.map((hit) => hit.mediaRecordId)));
    semanticProvenance = {
      count: result.results.length,
      scannedChunks: result.scannedChunks,
      minSimilarity: result.minSimilarity,
      caveats: result.caveats,
    };
  } catch {
    // Public search must still work with metadata and verified quotes when
    // embeddings are unavailable.
  }

  let results = ids
    .map((id) => byKey.get(`id:${id}`))
    .filter((record): record is MediaRecord => Boolean(record));

  semanticUsed = results.length > 0;

  if (results.length === 0) {
    // The semantic RPC may only return ids that are not in the public set
    // (for example after an archive record becomes a draft). In that case the
    // response must not claim a semantic sample.
    semanticProvenance = null;
    results = lexicalMatches(filtered, query);
  }

  results = results.slice(0, MAX_RESULTS);

  const catalogueTotal = filtered.length;

  return json({
    status: 'ok',
    query,
    semantic: semanticUsed,
    count: results.length,
    catalogueTotal,
    complete: !semanticUsed && results.length >= catalogueTotal,
    provenance: {
      mode: semanticUsed ? 'semantic_sample' : 'metadata_search',
      catalogueTotal,
      returned: results.length,
      complete: !semanticUsed && results.length >= catalogueTotal,
      caveats: semanticUsed
        ? [
            'Semantic search returns a relevance sample, not a complete catalogue.',
            ...(semanticProvenance?.caveats || []),
          ]
        : ['Metadata/verified-quote search. It is not a semantic statement about the whole archive.'],
      semantic: semanticProvenance,
    },
    summary:
      results.length === 0
        ? `No publications match this query. The catalogue has ${catalogueTotal} records for these filters; the semantic search did not return a complete list.`
        : semanticUsed
          ? `${results.length} relevant publications found (semantic sample, catalogue has ${catalogueTotal}). Only verified quotes are shown.`
          : `${results.length} publications match this query in metadata. Only verified quotes are shown.`,
    results: results.map(mapRecord),
  });
}
