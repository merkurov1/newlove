import { assertServerOnly } from '@/lib/serverOnly';
import { fetchJson } from './http';

assertServerOnly('lib/analytics/website/providers/umami');

export type UmamiStats = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
};

export type UmamiMetricRow = {
  x: string;
  y: number;
};

function apiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

function headers(apiKey: string): Record<string, string> {
  return {
    'x-umami-api-key': apiKey,
    Accept: 'application/json',
  };
}

function timestamp(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function fetchUmamiStats(input: {
  baseUrl: string;
  apiKey: string;
  websiteId: string;
  startAt: string | number | Date;
  endAt: string | number | Date;
}): Promise<UmamiStats> {
  const start = timestamp(input.startAt);
  const end = timestamp(input.endAt);
  const raw = await fetchJson<Partial<UmamiStats>>(
    `${apiBase(input.baseUrl)}/websites/${encodeURIComponent(input.websiteId)}/stats?startAt=${start}&endAt=${end}`,
    { headers: headers(input.apiKey) },
    { provider: 'umami', retries: 2, label: 'stats' }
  );

  return {
    pageviews: Number(raw.pageviews ?? 0) || 0,
    visitors: Number(raw.visitors ?? 0) || 0,
    visits: Number(raw.visits ?? 0) || 0,
    bounces: Number(raw.bounces ?? 0) || 0,
    totaltime: Number(raw.totaltime ?? 0) || 0,
  };
}

export async function fetchUmamiPageviews(input: {
  baseUrl: string;
  apiKey: string;
  websiteId: string;
  startAt: string | number | Date;
  endAt: string | number | Date;
  timezone?: string;
}): Promise<{ pageviews: Array<{ date: string; value: number }>; sessions: Array<{ date: string; value: number }> }> {
  const start = timestamp(input.startAt);
  const end = timestamp(input.endAt);
  const timezone = encodeURIComponent(input.timezone || 'Europe/London');

  const raw = await fetchJson<{
    pageviews?: Array<{ x?: string | number; y?: number }>;
    sessions?: Array<{ x?: string | number; y?: number }>;
  }>(
    `${apiBase(input.baseUrl)}/websites/${encodeURIComponent(input.websiteId)}/pageviews?startAt=${start}&endAt=${end}&unit=day&timezone=${timezone}`,
    { headers: headers(input.apiKey) },
    { provider: 'umami', retries: 2, label: 'pageviews' }
  );

  const toPoint = (row: { x?: string | number; y?: number }) => {
    const rawDate = row.x;
    let date = '';

    if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
      date = rawDate.slice(0, 10);
    } else if (typeof rawDate === 'number') {
      date = new Date(rawDate).toISOString().slice(0, 10);
    } else if (typeof rawDate === 'string') {
      const parsed = Date.parse(rawDate);
      if (Number.isFinite(parsed)) date = new Date(parsed).toISOString().slice(0, 10);
    }

    return { date, value: Number(row.y ?? 0) || 0 };
  };

  return {
    pageviews: (raw.pageviews ?? []).map(toPoint).filter((row) => row.date),
    sessions: (raw.sessions ?? []).map(toPoint).filter((row) => row.date),
  };
}

export async function fetchUmamiMetrics(input: {
  baseUrl: string;
  apiKey: string;
  websiteId: string;
  startAt: string | number | Date;
  endAt: string | number | Date;
  type: 'url' | 'referrer' | 'country' | 'device' | 'browser' | 'os';
  limit?: number;
}): Promise<UmamiMetricRow[]> {
  const start = timestamp(input.startAt);
  const end = timestamp(input.endAt);
  const limit = Math.min(input.limit ?? 50, 200);

  const raw = await fetchJson<Array<{ x?: string; y?: number }>>(
    `${apiBase(input.baseUrl)}/websites/${encodeURIComponent(input.websiteId)}/metrics?startAt=${start}&endAt=${end}&type=${encodeURIComponent(input.type)}&limit=${limit}`,
    { headers: headers(input.apiKey) },
    { provider: 'umami', retries: 2, label: `metrics:${input.type}` }
  );

  return (Array.isArray(raw) ? raw : [])
    .map((row) => ({ x: String(row.x ?? ''), y: Number(row.y ?? 0) || 0 }))
    .filter((row) => row.x);
}

export function umamiDateRange(
  startDate: string,
  endDate: string
): { startAt: string; endAt: string } {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  return { startAt: start.toISOString(), endAt: end.toISOString() };
}
