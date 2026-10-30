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
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function lexicalMatches(records: MediaRecord[], query: string): MediaRecord[] {
  const terms = words(query);
  if (terms.length === 0) return [];

  return records.filter((record) => {
    const haystack = [
      record.title,
      record.outlet,
      record.summary,
      record.topic,
      record.derivedTopic,
      record.lang,
      record.kind,
      ...(record.subtopics || []),
      ...(record.verifiedQuotes || []).map((quote) => quote.text),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

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

  let records = await getMediaRecords();
  records = records.filter((record) => record.id);

  const filtered = records.filter((record) => {
    if (filters.topic && (record.derivedTopic || record.topic) !== filters.topic) return false;
    if (filters.language && record.lang !== filters.language) return false;
    if (filters.outlet && record.outlet !== filters.outlet) return false;
    if (filters.from && record.date < filters.from) return false;
    if (filters.to && record.date > filters.to) return false;
    return true;
  });

  let ids: string[] = [];
  let semanticUsed = false;

  try {
    const result = await searchMediaIntelligence({
      query,
      filters,
      limit: MAX_RESULTS,
      answerMode: 'none',
    });

    ids = Array.from(new Set(result.results.map((hit) => hit.mediaRecordId)));
    semanticUsed = result.results.length > 0;
  } catch {
    // Public search must still work with metadata and verified quotes when
    // embeddings are unavailable.
  }

  const byId = new Map(filtered.map((record) => [record.id || '', record]));
  let results = ids
    .map((id) => byId.get(id))
    .filter((record): record is MediaRecord => Boolean(record));

  if (results.length === 0) {
    results = lexicalMatches(filtered, query);
  }

  results = results.slice(0, MAX_RESULTS);

  return json({
    status: 'ok',
    query,
    semantic: semanticUsed,
    count: results.length,
    summary:
      results.length === 0
        ? 'No publications match this query.'
        : `${results.length} publications match this query. Only verified quotes are shown.`,
    results: results.map(mapRecord),
  });
}
