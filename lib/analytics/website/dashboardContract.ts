import type {
  AnalyticsDataset,
  AnalyticsPeriod,
  AnalyticsProvider,
  BlueskySnapshot,
  BreakdownRow,
  ContentMatch,
  Ga4Snapshot,
  InternalSnapshot,
  MetricComparison,
  MetricUnit,
  ProjectPerformance,
  ProviderHealth,
  SearchAnomaly,
  SearchBrandSplit,
  SearchConsoleSnapshot,
  SearchSegmentSummary,
  SourceCoverage,
  SourceDataState,
  SourceFreshness,
  UmamiSnapshot,
} from './types';

/**
 * Cache and payload contract for the website dashboard.
 *
 * The dashboard is cached as a serialized snapshot. Bumping the schema version
 * (and the cache key in the page) keeps an older snapshot from being rendered
 * as if it had the current shape. Missing sections are normalized to explicit
 * unavailable values, never to invented zeros.
 */
export const WEBSITE_DASHBOARD_SCHEMA_VERSION = 2;
export const WEBSITE_DASHBOARD_CACHE_KEY = 'website-analytics-dashboard-v2';

export type WebsiteDashboardPayload = {
  schemaVersion: typeof WEBSITE_DASHBOARD_SCHEMA_VERSION;
  period: AnalyticsPeriod;
  dataset: AnalyticsDataset;
  sessionsSeries: number[];
  clicksSeries: number[];
  hasExternalData: boolean;
};

type MetricDefinition = {
  key: string;
  label: string;
  unit: MetricUnit;
};

const PROVIDERS: AnalyticsProvider[] = [
  'google_analytics',
  'search_console',
  'umami',
  'bluesky',
  'youtube',
];

const METRIC_UNITS: MetricUnit[] = ['count', 'percent', 'seconds', 'position', 'ratio'];

const DATA_STATES: SourceDataState[] = [
  'complete',
  'partial',
  'stale',
  'unavailable',
  'not_configured',
];

const FRESHNESS_STATES: SourceFreshness[] = ['fresh', 'delayed', 'stale', 'unknown'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function numberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)
  );
}

function isProvider(value: unknown): value is AnalyticsProvider {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value);
}

function isMetricUnit(value: unknown): value is MetricUnit {
  return typeof value === 'string' && (METRIC_UNITS as string[]).includes(value);
}

function isDataState(value: unknown): value is SourceDataState {
  return typeof value === 'string' && (DATA_STATES as string[]).includes(value);
}

function isFreshness(value: unknown): value is SourceFreshness {
  return typeof value === 'string' && (FRESHNESS_STATES as string[]).includes(value);
}

function metricFallback(
  key: string,
  label: string,
  source: MetricComparison['source'],
  unit: MetricUnit = 'count',
  reason = 'Показатель отсутствует в сохранённом снимке.'
): MetricComparison {
  return {
    key,
    label,
    value: null,
    previous: null,
    deltaPercent: null,
    unit,
    source,
    definition: '',
    precision: '',
    available: false,
    unavailableReason: reason,
  };
}

function normalizeMetric(value: unknown, fallback: MetricComparison): MetricComparison {
  if (!isRecord(value)) return fallback;

  const numericValue = numberOrNull(value.value);
  const available =
    typeof value.available === 'boolean' ? value.available : numericValue !== null;

  return {
    key: stringOr(value.key, fallback.key),
    label: stringOr(value.label, fallback.label),
    value: numericValue,
    previous: numberOrNull(value.previous),
    deltaPercent: numberOrNull(value.deltaPercent),
    unit: isMetricUnit(value.unit) ? value.unit : fallback.unit,
    source: isProvider(value.source) || value.source === 'internal' ? value.source : fallback.source,
    definition: stringOr(value.definition, fallback.definition),
    precision: stringOr(value.precision, fallback.precision),
    available,
    ...(typeof value.unavailableReason === 'string'
      ? { unavailableReason: value.unavailableReason }
      : {}),
  };
}

function normalizeMetricRecord(
  source: Record<string, unknown>,
  definitions: MetricDefinition[],
  provider: MetricComparison['source'],
  reason: string
): Record<string, MetricComparison> {
  const result: Record<string, MetricComparison> = {};
  for (const definition of definitions) {
    result[definition.key] = normalizeMetric(
      source[definition.key],
      metricFallback(definition.key, definition.label, provider, definition.unit, reason)
    );
  }
  return result;
}

function normalizeBreakdown(value: unknown): BreakdownRow[] {
  return recordArray(value)
    .map((row): BreakdownRow => {
      const key = stringOr(row.key, '');
      return {
        key,
        label: stringOr(row.label, key),
        value: numberOrNull(row.value) ?? 0,
        previous: numberOrNull(row.previous),
        deltaPercent: numberOrNull(row.deltaPercent),
        share: numberOrNull(row.share),
        ...(isRecord(row.extra) ? { extra: normalizeExtra(row.extra) } : {}),
      };
    })
    .filter((row) => row.key !== '');
}

function normalizeExtra(value: Record<string, unknown>): Record<string, number | string | null> {
  const extra: Record<string, number | string | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') extra[key] = entry;
    else if (typeof entry === 'number' && Number.isFinite(entry)) extra[key] = entry;
    else if (entry === null) extra[key] = null;
  }
  return extra;
}

function defaultSegment(key: string, label: string): SearchSegmentSummary {
  return {
    key,
    label,
    clicks: 0,
    impressions: 0,
    previousClicks: null,
    previousImpressions: null,
    ctr: null,
    previousCtr: null,
    position: null,
    previousPosition: null,
    clicksDeltaPercent: null,
    impressionsDeltaPercent: null,
    shareOfImpressions: null,
  };
}

function normalizeSearchSegment(
  value: unknown,
  fallback: SearchSegmentSummary
): SearchSegmentSummary {
  if (!isRecord(value)) return fallback;

  return {
    key: stringOr(value.key, fallback.key),
    label: stringOr(value.label, fallback.label),
    clicks: numberOrNull(value.clicks) ?? 0,
    impressions: numberOrNull(value.impressions) ?? 0,
    previousClicks: numberOrNull(value.previousClicks),
    previousImpressions: numberOrNull(value.previousImpressions),
    ctr: numberOrNull(value.ctr),
    previousCtr: numberOrNull(value.previousCtr),
    position: numberOrNull(value.position),
    previousPosition: numberOrNull(value.previousPosition),
    clicksDeltaPercent: numberOrNull(value.clicksDeltaPercent),
    impressionsDeltaPercent: numberOrNull(value.impressionsDeltaPercent),
    shareOfImpressions: numberOrNull(value.shareOfImpressions),
  };
}

export function unavailableSearchBrandSplit(reason?: string): SearchBrandSplit {
  return {
    available: false,
    brandTerms: [],
    brand: defaultSegment('brand', 'Брендовые запросы'),
    nonBrand: defaultSegment('non_brand', 'Небрендовые запросы'),
    heuristic:
      'Бренд/небренд определяется по вхождению термина в запрос. Google не отдаёт измерение brand, поэтому это эвристика, а не поле Search Console.',
    unavailableReason:
      reason ||
      'Разбивка бренд/небренд отсутствует в сохранённом снимке. Значения не подставляются нулём.',
  };
}

export function normalizeSearchBrandSplit(value: unknown): SearchBrandSplit {
  if (!isRecord(value)) return unavailableSearchBrandSplit();

  const hasSegments = isRecord(value.brand) && isRecord(value.nonBrand);
  if (!hasSegments || value.available === false) {
    return unavailableSearchBrandSplit(
      typeof value.unavailableReason === 'string' ? value.unavailableReason : undefined
    );
  }

  const fallback = unavailableSearchBrandSplit();
  return {
    available: true,
    brandTerms: stringArray(value.brandTerms),
    brand: normalizeSearchSegment(value.brand, fallback.brand),
    nonBrand: normalizeSearchSegment(value.nonBrand, fallback.nonBrand),
    heuristic: stringOr(value.heuristic, fallback.heuristic),
  };
}

function normalizeSignupSpike(
  value: unknown
): InternalSnapshot['newsletter']['signals']['signupSpike'] {
  if (!isRecord(value)) return null;

  return {
    detected: value.detected === true,
    latestHourCount: numberOrNull(value.latestHourCount) ?? 0,
    baselineHourlyAverage: numberOrNull(value.baselineHourlyAverage) ?? 0,
    threshold: numberOrNull(value.threshold) ?? 0,
    minCount: numberOrNull(value.minCount) ?? 0,
    windowHours: numberOrNull(value.windowHours) ?? 0,
  };
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    const number = numberOrNull(entry);
    if (number !== null) result[key] = number;
  }
  return result;
}

export function unavailableNewsletterSignals(
  reason?: string
): InternalSnapshot['newsletter']['signals'] {
  return {
    available: false,
    deliveryFailures: null,
    suspectedAutomated: null,
    rateLimited: null,
    blockedReasons: {},
    confirmationRate: null,
    signupSpike: null,
    unavailableReason:
      reason ||
      'Сигналы рассылки отсутствуют в сохранённом снимке. Значения не подставляются нулём.',
  };
}

export function normalizeNewsletterSignals(
  value: unknown
): InternalSnapshot['newsletter']['signals'] {
  if (!isRecord(value)) return unavailableNewsletterSignals();

  const hasSignal =
    value.available === true ||
    'deliveryFailures' in value ||
    'suspectedAutomated' in value ||
    'rateLimited' in value ||
    'confirmationRate' in value ||
    'signupSpike' in value ||
    'blockedReasons' in value;

  if (!hasSignal || value.available === false) {
    return unavailableNewsletterSignals(
      typeof value.unavailableReason === 'string' ? value.unavailableReason : undefined
    );
  }

  return {
    available: true,
    deliveryFailures: numberOrNull(value.deliveryFailures),
    suspectedAutomated: numberOrNull(value.suspectedAutomated),
    rateLimited: numberOrNull(value.rateLimited),
    blockedReasons: normalizeNumberRecord(value.blockedReasons),
    confirmationRate: numberOrNull(value.confirmationRate),
    signupSpike: normalizeSignupSpike(value.signupSpike),
  };
}

function normalizeSearchSeries(value: unknown): SearchConsoleSnapshot['series'] {
  return recordArray(value)
    .map((row) => {
      const date = stringOrNull(row.date);
      if (!date) return null;
      return {
        date,
        clicks: numberOrNull(row.clicks) ?? 0,
        impressions: numberOrNull(row.impressions) ?? 0,
        ctr: numberOrNull(row.ctr),
        position: numberOrNull(row.position),
      };
    })
    .filter((row): row is SearchConsoleSnapshot['series'][number] => row !== null);
}

function normalizeAnomalies(value: unknown): SearchAnomaly[] {
  return recordArray(value).flatMap((row): SearchAnomaly[] => {
    const scope = row.scope;
    const metric = row.metric;
    const direction = row.direction;
    const severity = row.severity;
    if (
      (scope !== 'total' && scope !== 'query' && scope !== 'page') ||
      (metric !== 'clicks' && metric !== 'impressions' && metric !== 'ctr' && metric !== 'position') ||
      (direction !== 'drop' && direction !== 'rise') ||
      (severity !== 'info' && severity !== 'warning')
    ) {
      return [];
    }

    const current = numberOrNull(row.current);
    const previous = numberOrNull(row.previous);
    if (current === null || previous === null) return [];

    return [
      {
        key: stringOr(row.key, `${scope}:${metric}`),
        scope,
        metric,
        direction,
        label: stringOr(row.label, ''),
        current,
        previous,
        deltaPercent: numberOrNull(row.deltaPercent),
        sample: numberOrNull(row.sample) ?? previous,
        severity,
        note: stringOr(row.note, ''),
      },
    ];
  });
}

type LowCtrRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function normalizeLowCtrRows(value: unknown): LowCtrRow[] {
  return recordArray(value)
    .map((row): LowCtrRow => ({
      key: stringOr(row.page, stringOr(row.query, '')),
      clicks: numberOrNull(row.clicks) ?? 0,
      impressions: numberOrNull(row.impressions) ?? 0,
      ctr: numberOrNull(row.ctr) ?? 0,
      position: numberOrNull(row.position) ?? 0,
    }))
    .filter((row) => row.key !== '');
}

export function normalizeSearchConsoleSnapshot(value: unknown): SearchConsoleSnapshot {
  const record = isRecord(value) ? value : {};
  const available = record.available === true;
  const totalsSource = isRecord(record.totals) ? record.totals : {};
  const reason = available ? undefined : 'Нет данных Search Console за выбранный период.';
  const metricReason = reason ?? 'Показатель отсутствует в сохранённом снимке Search Console.';

  return {
    available,
    property: stringOrNull(record.property),
    searchType: 'web',
    reportingDelayDays: numberOrNull(record.reportingDelayDays) ?? 3,
    expectedDataTo: stringOrNull(record.expectedDataTo),
    dataState: isDataState(record.dataState)
      ? record.dataState
      : available
        ? 'complete'
        : 'unavailable',
    freshness: isFreshness(record.freshness)
      ? record.freshness
      : available
        ? 'delayed'
        : 'unknown',
    lastSuccessfulSyncAt: stringOrNull(record.lastSuccessfulSyncAt),
    totals: {
      clicks: normalizeMetric(
        totalsSource.clicks,
        metricFallback('clicks', 'Клики из поиска', 'search_console', 'count', metricReason)
      ),
      impressions: normalizeMetric(
        totalsSource.impressions,
        metricFallback(
          'impressions',
          'Показы в поиске',
          'search_console',
          'count',
          metricReason
        )
      ),
      ctr: normalizeMetric(
        totalsSource.ctr,
        metricFallback('ctr', 'CTR поиска', 'search_console', 'percent', metricReason)
      ),
      position: normalizeMetric(
        totalsSource.position,
        metricFallback('position', 'Средняя позиция', 'search_console', 'position', metricReason)
      ),
    },
    series: normalizeSearchSeries(record.series),
    queries: normalizeBreakdown(record.queries),
    pages: normalizeBreakdown(record.pages),
    countries: normalizeBreakdown(record.countries),
    devices: normalizeBreakdown(record.devices),
    brand: normalizeSearchBrandSplit(record.brand),
    anomalies: normalizeAnomalies(record.anomalies),
    lowCtrPages: normalizeLowCtrRows(record.lowCtrPages).map(({ key, ...rest }) => ({
      page: key,
      ...rest,
    })),
    lowCtrQueries: normalizeLowCtrRows(record.lowCtrQueries).map(({ key, ...rest }) => ({
      query: key,
      ...rest,
    })),
    risingQueries: normalizeBreakdown(record.risingQueries),
    decliningQueries: normalizeBreakdown(record.decliningQueries),
    lostPages: normalizeBreakdown(record.lostPages),
    limitations: stringArray(record.limitations),
  };
}

function normalizeGa4Series(value: unknown): Ga4Snapshot['series'] {
  return recordArray(value)
    .map((row) => {
      const date = stringOrNull(row.date);
      if (!date) return null;
      return {
        date,
        sessions: numberOrNull(row.sessions) ?? 0,
        activeUsers: numberOrNull(row.activeUsers) ?? 0,
        newUsers: numberOrNull(row.newUsers) ?? 0,
        screenPageViews: numberOrNull(row.screenPageViews) ?? 0,
      };
    })
    .filter((row): row is Ga4Snapshot['series'][number] => row !== null);
}

function normalizeGa4Traffic(value: unknown): Ga4Snapshot['traffic'] {
  const record = isRecord(value) ? value : {};
  return {
    publicPageViews: numberOrNull(record.publicPageViews) ?? 0,
    ownerAdminPageViews: numberOrNull(record.ownerAdminPageViews) ?? 0,
    automatedPageViews: numberOrNull(record.automatedPageViews) ?? 0,
    publicLandingSessions: numberOrNull(record.publicLandingSessions),
    ownerAdminLandingSessions: numberOrNull(record.ownerAdminLandingSessions),
    automatedLandingSessions: numberOrNull(record.automatedLandingSessions),
    excludedPaths: stringArray(record.excludedPaths),
    note: stringOr(record.note, ''),
  };
}

function normalizeGa4(value: unknown): Ga4Snapshot {
  const record = isRecord(value) ? value : {};
  const totalsSource = isRecord(record.totals) ? record.totals : {};

  return {
    available: record.available === true,
    totals: normalizeMetricRecord(
      totalsSource,
      [
        { key: 'sessions', label: 'Сессии GA4', unit: 'count' },
        { key: 'activeUsers', label: 'Активные пользователи', unit: 'count' },
        { key: 'newUsers', label: 'Новые пользователи', unit: 'count' },
        { key: 'returningUsersDerived', label: 'Вернувшиеся (расчётно)', unit: 'count' },
        { key: 'screenPageViews', label: 'Просмотры страниц', unit: 'count' },
        { key: 'engagementRate', label: 'Вовлечённость', unit: 'percent' },
        { key: 'averageEngagementTime', label: 'Среднее время взаимодействия', unit: 'seconds' },
        { key: 'conversions', label: 'Конверсии GA4', unit: 'count' },
        { key: 'eventCount', label: 'События', unit: 'count' },
        { key: 'totalUsers', label: 'Всего пользователей', unit: 'count' },
      ],
      'google_analytics',
      'Нет сохранённых данных GA4 за выбранный период.'
    ),
    series: normalizeGa4Series(record.series),
    channels: normalizeBreakdown(record.channels),
    sources: normalizeBreakdown(record.sources),
    landingPages: normalizeBreakdown(record.landingPages),
    pages: normalizeBreakdown(record.pages),
    countries: normalizeBreakdown(record.countries),
    devices: normalizeBreakdown(record.devices),
    events: normalizeBreakdown(record.events),
    traffic: normalizeGa4Traffic(record.traffic),
    limitations: stringArray(record.limitations),
  };
}

function normalizeUmami(value: unknown): UmamiSnapshot {
  const record = isRecord(value) ? value : {};
  const totalsSource = isRecord(record.totals) ? record.totals : {};

  return {
    available: record.available === true,
    totals: normalizeMetricRecord(
      totalsSource,
      [
        { key: 'pageviews', label: 'Просмотры Umami', unit: 'count' },
        { key: 'visits', label: 'Визиты Umami', unit: 'count' },
        { key: 'visitors', label: 'Посетители Umami', unit: 'count' },
      ],
      'umami',
      'Umami не подключён или нет сохранённых данных.'
    ),
    series: recordArray(record.series)
      .map((row) => {
        const date = stringOrNull(row.date);
        if (!date) return null;
        return { date, value: numberOrNull(row.value) ?? 0 };
      })
      .filter((row): row is UmamiSnapshot['series'][number] => row !== null),
    pages: normalizeBreakdown(record.pages),
    referrers: normalizeBreakdown(record.referrers),
    limitations: stringArray(record.limitations),
  };
}

function normalizeBlueskyPosts(value: unknown): BlueskySnapshot['posts'] {
  return recordArray(value)
    .map((row): BlueskySnapshot['posts'][number] => {
      const kind =
        row.kind === 'post' || row.kind === 'reply' || row.kind === 'repost'
          ? row.kind
          : 'unknown';
      const authorship =
        row.authorship === 'owner' || row.authorship === 'other' ? row.authorship : 'unknown';
      return {
        uri: stringOr(row.uri, ''),
        kind,
        authorship,
        text: stringOr(row.text, ''),
        createdAt: stringOrNull(row.createdAt),
        observedAt: stringOrNull(row.observedAt),
        url: stringOrNull(row.url),
        flowItemId: stringOrNull(row.flowItemId),
        flowUrl: stringOrNull(row.flowUrl),
        likes: numberOrNull(row.likes) ?? 0,
        reposts: numberOrNull(row.reposts) ?? 0,
        replies: numberOrNull(row.replies) ?? 0,
        quotes: numberOrNull(row.quotes) ?? 0,
        links: numberOrNull(row.links) ?? 0,
        siteLinks: numberOrNull(row.siteLinks) ?? 0,
        engagement: numberOrNull(row.engagement) ?? 0,
      };
    })
    .filter((row) => row.uri !== '');
}

function normalizeBluesky(value: unknown, period: AnalyticsPeriod): BlueskySnapshot {
  const record = isRecord(value) ? value : {};
  const profile = isRecord(record.profile) ? record.profile : {};
  const periodRecord = isRecord(record.period) ? record.period : {};
  const periodTotals = isRecord(periodRecord.totals) ? periodRecord.totals : {};
  const archive = isRecord(record.archive) ? record.archive : {};
  const totalsSource = isRecord(record.totals) ? record.totals : {};
  const periodStart = stringOr(periodRecord.start, period.start);
  const periodEnd = stringOr(periodRecord.end, period.end);

  return {
    available: record.available === true,
    profile: {
      handle: stringOrNull(profile.handle),
      displayName: stringOrNull(profile.displayName),
      did: stringOrNull(profile.did),
      followers: numberOrNull(profile.followers),
      follows: numberOrNull(profile.follows),
      posts: numberOrNull(profile.posts),
      capturedAt: stringOrNull(profile.capturedAt),
    },
    totals: normalizeMetricRecord(
      totalsSource,
      [
        { key: 'followers', label: 'Подписчики Bluesky (всего)', unit: 'count' },
        { key: 'follows', label: 'Подписки Bluesky (всего)', unit: 'count' },
        { key: 'posts', label: 'Посты в профиле (всего)', unit: 'count' },
        { key: 'likes', label: 'Лайки (архив, текущие счётчики)', unit: 'count' },
        { key: 'reposts', label: 'Репосты (архив, текущие счётчики)', unit: 'count' },
        { key: 'replies', label: 'Ответы (архив, текущие счётчики)', unit: 'count' },
        { key: 'engagement', label: 'Взаимодействия (архив, расчётно)', unit: 'count' },
      ],
      'bluesky',
      'Bluesky не подключён или нет сохранённых данных.'
    ),
    posts: normalizeBlueskyPosts(record.posts),
    topPosts: normalizeBlueskyPosts(record.topPosts),
    siteLinkedPosts: normalizeBlueskyPosts(record.siteLinkedPosts),
    period: {
      start: periodStart,
      end: periodEnd,
      label: stringOr(periodRecord.label, `${periodStart} — ${periodEnd}`),
      timezone: stringOr(periodRecord.timezone, period.timezone),
      available: periodRecord.available === true,
      posts: normalizeBlueskyPosts(periodRecord.posts),
      totals: {
        posts: numberOrNull(periodTotals.posts) ?? 0,
        likes: numberOrNull(periodTotals.likes) ?? 0,
        reposts: numberOrNull(periodTotals.reposts) ?? 0,
        replies: numberOrNull(periodTotals.replies) ?? 0,
        quotes: numberOrNull(periodTotals.quotes) ?? 0,
        engagement: numberOrNull(periodTotals.engagement) ?? 0,
      },
      previousPosts: numberOrNull(periodRecord.previousPosts) ?? 0,
      coverageComplete: periodRecord.coverageComplete === true,
      coverageEndsAt: stringOrNull(periodRecord.coverageEndsAt),
      interactionsAreCurrentSnapshot: true,
      limitation: stringOr(periodRecord.limitation, ''),
    },
    archive: {
      total: numberOrNull(archive.total) ?? 0,
      coverageFrom: stringOrNull(archive.coverageFrom),
      coverageTo: stringOrNull(archive.coverageTo),
      lastSyncedAt: stringOrNull(archive.lastSyncedAt),
      truncated: typeof archive.truncated === 'boolean' ? archive.truncated : null,
    },
    limitations: stringArray(record.limitations),
  };
}

function normalizeCoverage(
  value: unknown,
  provider: SourceCoverage['provider'],
  period: AnalyticsPeriod
): SourceCoverage {
  const record = isRecord(value) ? value : {};

  return {
    provider:
      record.provider === 'internal' || isProvider(record.provider) ? record.provider : provider,
    requestedStart: stringOr(record.requestedStart, period.start),
    requestedEnd: stringOr(record.requestedEnd, period.end),
    expectedEnd: stringOr(record.expectedEnd, period.end),
    actualDataFrom: stringOrNull(record.actualDataFrom),
    actualDataTo: stringOrNull(record.actualDataTo),
    coveredDays: numberOrNull(record.coveredDays) ?? 0,
    expectedDays: numberOrNull(record.expectedDays) ?? 0,
    completeness: numberOrNull(record.completeness),
    lastSyncAt: stringOrNull(record.lastSyncAt),
    dataLagDays: numberOrNull(record.dataLagDays),
    reportingDelayDays: numberOrNull(record.reportingDelayDays) ?? 0,
    freshness: isFreshness(record.freshness) ? record.freshness : 'unknown',
    state: isDataState(record.state) ? record.state : 'unavailable',
    note: stringOrNull(record.note),
  };
}

function normalizeRecentIssues(value: unknown): InternalSnapshot['newsletter']['recentIssues'] {
  return recordArray(value)
    .map((row) => ({
      id: stringOr(row.id, ''),
      title: stringOr(row.title, ''),
      language: stringOrNull(row.language),
      status: stringOrNull(row.status),
      sentAt: stringOrNull(row.sentAt),
      sentCount: numberOrNull(row.sentCount),
      failedCount: numberOrNull(row.failedCount),
    }))
    .filter((row) => row.id !== '');
}

function normalizeInternalSnapshot(
  value: unknown,
  period: AnalyticsPeriod
): InternalSnapshot {
  const record = isRecord(value) ? value : {};
  const donations = isRecord(record.donations) ? record.donations : {};
  const purchases = isRecord(record.purchases) ? record.purchases : {};
  const conversations = isRecord(record.conversations) ? record.conversations : {};
  const newsletter = isRecord(record.newsletter) ? record.newsletter : {};
  const subscribers = isRecord(newsletter.subscribers) ? newsletter.subscribers : {};
  const jobs = isRecord(newsletter.jobs) ? newsletter.jobs : {};
  const content = isRecord(record.content) ? record.content : {};
  const raw = isRecord(record.raw) ? record.raw : {};

  return {
    available: record.available === true,
    confirmedSubscriptions: numberOrNull(record.confirmedSubscriptions),
    previousConfirmedSubscriptions: numberOrNull(record.previousConfirmedSubscriptions),
    confirmedSubscriptionsByStartPage: normalizeBreakdown(
      record.confirmedSubscriptionsByStartPage
    ),
    subscriptionEvents: normalizeBreakdown(record.subscriptionEvents),
    donations: {
      count: numberOrNull(donations.count),
      amountMinor: numberOrNull(donations.amountMinor),
      currency: stringOrNull(donations.currency),
      byOffer: normalizeBreakdown(donations.byOffer),
      available: donations.available === true,
    },
    purchases: {
      count: numberOrNull(purchases.count),
      available: purchases.available === true,
    },
    conversations: {
      total: numberOrNull(conversations.total),
      previousTotal: numberOrNull(conversations.previousTotal),
      byStartPage: normalizeBreakdown(conversations.byStartPage),
      byReferrer: normalizeBreakdown(conversations.byReferrer),
    },
    events: normalizeBreakdown(record.events),
    newsletter: {
      available: newsletter.available === true,
      subscribers: {
        total: numberOrNull(subscribers.total),
        active: numberOrNull(subscribers.active),
        confirmed: numberOrNull(subscribers.confirmed),
        pending: numberOrNull(subscribers.pending),
        unsubscribed: numberOrNull(subscribers.unsubscribed),
        ru: numberOrNull(subscribers.ru),
        en: numberOrNull(subscribers.en),
      },
      signals: normalizeNewsletterSignals(newsletter.signals),
      jobs: {
        total: numberOrNull(jobs.total),
        sent: numberOrNull(jobs.sent),
        failed: numberOrNull(jobs.failed),
        emailsSent: numberOrNull(jobs.emailsSent),
        emailsFailed: numberOrNull(jobs.emailsFailed),
      },
      byLanguage: normalizeBreakdown(newsletter.byLanguage),
      recentIssues: normalizeRecentIssues(newsletter.recentIssues),
      limitations: stringArray(newsletter.limitations),
    },
    content: {
      articlesTotal: numberOrNull(content.articlesTotal),
      lettersTotal: numberOrNull(content.lettersTotal),
      itemsPublished: numberOrNull(content.itemsPublished),
      knowledgeDocuments: numberOrNull(content.knowledgeDocuments),
      mediaRecords: numberOrNull(content.mediaRecords),
    },
    limitations: stringArray(record.limitations),
    raw: {
      confirmedSubscriptions: numberOrNull(raw.confirmedSubscriptions) ?? 0,
      subscriptionEvents: numberOrNull(raw.subscriptionEvents) ?? 0,
      donations: numberOrNull(raw.donations) ?? 0,
      purchases: numberOrNull(raw.purchases) ?? 0,
      conversations: numberOrNull(raw.conversations) ?? 0,
      events: numberOrNull(raw.events) ?? 0,
      newsletterJobs: numberOrNull(raw.newsletterJobs) ?? 0,
      newsletterLogs: numberOrNull(raw.newsletterLogs) ?? 0,
    },
    dataGaps: stringArray(record.dataGaps),
    coverage: normalizeCoverage(record.coverage, 'internal', period),
    previousCoverage: normalizeCoverage(record.previousCoverage, 'internal', period),
  };
}

function normalizePeriod(value: unknown): AnalyticsPeriod | null {
  if (!isRecord(value)) return null;

  const start = stringOrNull(value.start);
  const end = stringOrNull(value.end);
  const previousStart = stringOrNull(value.previousStart);
  const previousEnd = stringOrNull(value.previousEnd);
  if (!start || !end || !previousStart || !previousEnd) return null;

  return {
    key: stringOr(value.key, 'custom'),
    label: stringOr(value.label, `${start} — ${end}`),
    timezone: stringOr(value.timezone, 'UTC'),
    start,
    end,
    previousStart,
    previousEnd,
    previousLabel: stringOr(value.previousLabel, `${previousStart} — ${previousEnd}`),
    comparisonRequested: value.comparisonRequested === true,
  };
}

export function normalizeAnalyticsDataset(value: unknown): AnalyticsDataset | null {
  if (!isRecord(value)) return null;

  const period = normalizePeriod(value.period);
  if (!period) return null;

  return {
    period,
    generatedAt: stringOr(value.generatedAt, ''),
    sources: Array.isArray(value.sources) ? (value.sources as ProviderHealth[]) : [],
    coverage: recordArray(value.coverage).map((entry) =>
      normalizeCoverage(entry, 'internal', period)
    ),
    previousCoverage: recordArray(value.previousCoverage).map((entry) =>
      normalizeCoverage(entry, 'internal', period)
    ),
    dataGaps: stringArray(value.dataGaps),
    ga4: normalizeGa4(value.ga4),
    gsc: normalizeSearchConsoleSnapshot(value.gsc),
    umami: normalizeUmami(value.umami),
    bluesky: normalizeBluesky(value.bluesky, period),
    internal: normalizeInternalSnapshot(value.internal, period),
    projects: Array.isArray(value.projects) ? (value.projects as ProjectPerformance[]) : [],
    contentMatches: Array.isArray(value.contentMatches)
      ? (value.contentMatches as ContentMatch[])
      : [],
  };
}

/**
 * Normalize a cached dashboard snapshot. Any payload without the current
 * schema version is rejected instead of being rendered as current data.
 */
export function normalizeWebsiteDashboard(value: unknown): WebsiteDashboardPayload | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== WEBSITE_DASHBOARD_SCHEMA_VERSION) return null;

  const dataset = normalizeAnalyticsDataset(value.dataset);
  if (!dataset) return null;

  const sessionsSeries = numberArray(value.sessionsSeries);
  const clicksSeries = numberArray(value.clicksSeries);

  return {
    schemaVersion: WEBSITE_DASHBOARD_SCHEMA_VERSION,
    period: dataset.period,
    dataset,
    sessionsSeries: sessionsSeries ?? dataset.ga4.series.map((point) => point.sessions),
    clicksSeries: clicksSeries ?? dataset.gsc.series.map((point) => point.clicks),
    hasExternalData:
      typeof value.hasExternalData === 'boolean'
        ? value.hasExternalData
        : dataset.ga4.available || dataset.gsc.available || dataset.umami.available,
  };
}
