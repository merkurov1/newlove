export const MEDIA_INTELLIGENCE_TOPICS = [
  'Internet & Censorship',
  'AI & Tech',
  'Art & Culture',
  'Fintech & Crypto',
] as const;

export type MediaIntelligenceFilters = {
  from: string | null;
  to: string | null;
  topic: string | null;
  language: string | null;
  outlet: string | null;
  status: 'draft' | 'published' | null;
  page: number;
  pageSize: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LANGUAGE_PATTERN = /^[A-Za-z-]{2,16}$/;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || null;
}

function validDate(value: string | null): string | null {
  if (!value || !DATE_PATTERN.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function boundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function parseMediaIntelligenceFilters(
  params: Record<string, string | string[] | undefined>
): MediaIntelligenceFilters {
  const from = validDate(first(params.from));
  const to = validDate(first(params.to));
  const topic = first(params.topic);
  const language = first(params.language);
  const outlet = first(params.outlet);
  const status = first(params.status);

  return {
    from,
    to: to && from && to < from ? from : to,
    topic: topic && (MEDIA_INTELLIGENCE_TOPICS as readonly string[]).includes(topic) ? topic : null,
    language: language && LANGUAGE_PATTERN.test(language) ? language.toUpperCase() : null,
    outlet: outlet ? outlet.slice(0, 200) : null,
    status: status === 'draft' || status === 'published' ? status : null,
    page: boundedInt(first(params.page), 1, 1, 10_000),
    pageSize: boundedInt(first(params.pageSize), 20, 1, 100),
  };
}

export function mediaIntelligenceCacheKey(
  section: string,
  filters: MediaIntelligenceFilters
): string {
  return [
    section,
    filters.from || '',
    filters.to || '',
    filters.topic || '',
    filters.language || '',
    filters.outlet || '',
    filters.status || '',
    filters.page,
    filters.pageSize,
  ].join('|');
}

export function safePercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function emptyOverview() {
  return {
    total: 0,
    byStatus: { published: 0, draft: 0 },
    outlets: 0,
    languages: [] as Array<{ language: string; count: number }>,
    range: { from: null as string | null, to: null as string | null },
    quotes: {
      direct: 0,
      indirect: 0,
      mentions: 0,
      verifiedDirect: 0,
      pending: 0,
      unconfirmedAttribution: 0,
    },
    fullTextShare: null as number | null,
    awaitingReviewShare: null as number | null,
    awaitingReviewPublications: 0,
    missingDates: 0,
    extractionErrors: 0,
  };
}
