import { assertServerOnly } from '@/lib/serverOnly';
import { fetchJson } from './http';

assertServerOnly('lib/analytics/website/providers/searchConsole');

const WEBMASTERS_API = 'https://www.googleapis.com/webmasters/v3';

export type SearchConsoleRow = {
  date: string;
  query: string;
  page: string;
  country: string;
  device: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

type RawSearchRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type RawSearchResponse = {
  rows?: RawSearchRow[];
  responseAggregationType?: string;
};

export const SEARCH_DIMENSIONS = ['date', 'query', 'page', 'country', 'device'] as const;

export async function querySearchConsole(input: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  dataState?: 'final' | 'all';
}): Promise<{ rows: RawSearchRow[]; aggregation: string | null; raw: unknown }> {
  const dimensions = input.dimensions ?? [...SEARCH_DIMENSIONS];
  const body = {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions,
    rowLimit: Math.min(input.rowLimit ?? 25_000, 25_000),
    startRow: input.startRow ?? 0,
    dataState: input.dataState ?? 'final',
    type: 'web',
    aggregationType: 'auto',
  };

  const raw = await fetchJson<RawSearchResponse>(
    `${WEBMASTERS_API}/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { provider: 'search_console', retries: 3, label: 'searchAnalytics/query' }
  );

  return {
    rows: raw.rows ?? [],
    aggregation: raw.responseAggregationType ?? null,
    raw,
  };
}

function normalizeRow(row: RawSearchRow): SearchConsoleRow | null {
  const keys = row.keys ?? [];
  const date = keys[0] ?? '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  return {
    date,
    query: keys[1] ?? '',
    page: keys[2] ?? '',
    country: keys[3] ?? '',
    device: keys[4] ?? '',
    clicks: Math.max(0, Math.round(Number(row.clicks ?? 0))),
    impressions: Math.max(0, Math.round(Number(row.impressions ?? 0))),
    ctr: typeof row.ctr === 'number' && Number.isFinite(row.ctr) ? row.ctr : null,
    position:
      typeof row.position === 'number' && Number.isFinite(row.position) ? row.position : null,
  };
}

/**
 * Pages through the Search Console API with a hard cap. Search Console returns
 * at most 25k rows per request; the cap prevents an unbounded sync.
 */
export async function fetchSearchConsoleRows(input: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  maxRows?: number;
  dataState?: 'final' | 'all';
}): Promise<{ rows: SearchConsoleRow[]; truncated: boolean; rawPages: unknown[] }> {
  const maxRows = Math.max(1, Math.min(input.maxRows ?? 50_000, 200_000));
  const pageSize = 25_000;
  const rows: SearchConsoleRow[] = [];
  const rawPages: unknown[] = [];
  let startRow = 0;
  let truncated = false;

  while (startRow < maxRows) {
    const page = await querySearchConsole({
      accessToken: input.accessToken,
      siteUrl: input.siteUrl,
      startDate: input.startDate,
      endDate: input.endDate,
      rowLimit: pageSize,
      startRow,
      dataState: input.dataState,
    });

    rawPages.push(page.raw);

    for (const raw of page.rows) {
      const normalized = normalizeRow(raw);
      if (normalized) rows.push(normalized);
      if (rows.length >= maxRows) break;
    }

    if (page.rows.length < pageSize) break;
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }

    startRow += pageSize;
  }

  return { rows, truncated, rawPages };
}

export function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('sc-domain:')) return trimmed;
  return trimmed.replace(/\/+$/, '') + '/';
}

export function siteMatchesHost(siteUrl: string, host: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/^www\./, '');

  if (siteUrl.startsWith('sc-domain:')) {
    return siteUrl.slice('sc-domain:'.length).toLowerCase() === normalizedHost;
  }

  try {
    return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '') === normalizedHost;
  } catch {
    return false;
  }
}
