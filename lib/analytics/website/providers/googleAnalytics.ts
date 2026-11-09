import { assertServerOnly } from '@/lib/serverOnly';
import { fetchJson } from './http';

assertServerOnly('lib/analytics/website/providers/googleAnalytics');

const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

export const GA4_CORE_METRICS = [
  'sessions',
  'activeUsers',
  'newUsers',
  'screenPageViews',
  'engagedSessions',
  'engagementRate',
  'userEngagementDuration',
  'eventCount',
  'conversions',
  'totalUsers',
] as const;

export type Ga4ReportDefinition = {
  key: string;
  dimensions: string[];
  metrics: string[];
  limit: number;
};

export type Ga4ReportRow = {
  date: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
};

export type Ga4ReportResult = {
  key: string;
  rows: Ga4ReportRow[];
  rowCount: number;
  raw: unknown;
};

export type Ga4PropertySummary = {
  propertyId: string;
  displayName: string;
  accountName: string | null;
  measurementIds: string[];
};

const SESSION_METRICS = [
  'sessions',
  'activeUsers',
  'screenPageViews',
  'engagedSessions',
  'engagementRate',
  'conversions',
];

export function buildGa4Reports(): Ga4ReportDefinition[] {
  return [
    { key: 'total', dimensions: ['date'], metrics: [...GA4_CORE_METRICS], limit: 100_000 },
    {
      key: 'channel',
      dimensions: ['date', 'sessionDefaultChannelGroup'],
      metrics: SESSION_METRICS,
      limit: 50_000,
    },
    {
      key: 'source',
      dimensions: ['date', 'sessionSource', 'sessionMedium'],
      metrics: SESSION_METRICS,
      limit: 50_000,
    },
    {
      key: 'landing_page',
      dimensions: ['date', 'landingPage'],
      metrics: [
        'sessions',
        'activeUsers',
        'newUsers',
        'screenPageViews',
        'engagementRate',
        'conversions',
      ],
      limit: 50_000,
    },
    {
      key: 'page',
      dimensions: ['date', 'pagePath', 'pageTitle'],
      metrics: ['screenPageViews', 'activeUsers', 'eventCount'],
      limit: 50_000,
    },
    {
      key: 'country',
      dimensions: ['date', 'country'],
      metrics: ['sessions', 'activeUsers'],
      limit: 25_000,
    },
    {
      key: 'device',
      dimensions: ['date', 'deviceCategory'],
      metrics: ['sessions', 'activeUsers', 'engagementRate', 'conversions'],
      limit: 10_000,
    },
    {
      key: 'event',
      dimensions: ['date', 'eventName'],
      metrics: ['eventCount', 'conversions'],
      limit: 25_000,
    },
  ];
}

type RawGa4Response = {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  rowCount?: number;
  metadata?: Record<string, unknown>;
};

export function normalizePropertyId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('properties/') ? trimmed.slice('properties/'.length) : trimmed;
}

export async function runGa4Report(input: {
  accessToken: string;
  propertyId: string;
  definition: Ga4ReportDefinition;
  startDate: string;
  endDate: string;
}): Promise<Ga4ReportResult> {
  const propertyId = normalizePropertyId(input.propertyId);

  if (!/^\d+$/.test(propertyId)) {
    throw new Error(
      'GA4_PROPERTY_ID_INVALID: a numeric property id is required, not a measurement id.'
    );
  }

  const body = {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions: input.definition.dimensions.map((name) => ({ name })),
    metrics: input.definition.metrics.map((name) => ({ name })),
    limit: String(input.definition.limit),
    keepEmptyRows: false,
  };

  const raw = await fetchJson<RawGa4Response>(
    `${DATA_API}/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { provider: 'google_analytics', retries: 3, label: input.definition.key }
  );

  const dimensionNames =
    raw.dimensionHeaders?.map((header, index) => header.name || `dimension_${index}`) ?? [];
  const metricNames =
    raw.metricHeaders?.map((header, index) => header.name || `metric_${index}`) ?? [];

  const rows: Ga4ReportRow[] = (raw.rows ?? []).map((row) => {
    const dimensions: Record<string, string> = {};
    const metrics: Record<string, number> = {};

    dimensionNames.forEach((name, index) => {
      dimensions[name] = row.dimensionValues?.[index]?.value ?? '';
    });
    metricNames.forEach((name, index) => {
      const parsed = Number(row.metricValues?.[index]?.value ?? 0);
      metrics[name] = Number.isFinite(parsed) ? parsed : 0;
    });

    return { date: dimensions.date ?? input.endDate, dimensions, metrics };
  });

  return {
    key: input.definition.key,
    rows,
    rowCount: raw.rowCount ?? rows.length,
    raw,
  };
}

export function ga4DateToIso(value: string): string | null {
  if (!/^\d{8}$/.test(value)) return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
