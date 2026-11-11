import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { parseCalendarDate } from '@/lib/pierrot/reportingPeriod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getBlueskyConfig, getGoogleOAuthConfig, getUmamiConfig } from './config';
import { classifyTrafficPath, isInternalPath, isPublicPath } from './traffic';
import { buildSourceCoverage, coverageIsComparable } from './coverage';
import { getSearchConsoleSiteOverride } from './config';
import {
  getDataCoverage,
  getRecentSyncRuns,
  getStoredConnections,
  readMetricRows,
  readSearchRows,
  type MetricRow,
  type SearchPerformanceRow,
  type StoredConnection,
  type StoredSyncRun,
} from './store';
import {
  PROJECT_DEFINITIONS,
  contentIndexKey,
  domainOf,
  extractContentSlug,
  matchContent,
  normalizePath,
  projectForPath,
  type ContentIndexEntry,
} from './normalize';
import type {
  AnalyticsDataset,
  AnalyticsPeriod,
  AnalyticsProvider,
  BreakdownRow,
  ContentMatch,
  Ga4Snapshot,
  InternalSnapshot,
  MetricComparison,
  MetricUnit,
  ProjectPerformance,
  ProviderHealth,
  SearchConsoleSnapshot,
  UmamiSnapshot,
  BlueskySnapshot,
} from './types';

assertServerOnly('lib/analytics/website/dataset');

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function metric(input: {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  unit: MetricUnit;
  source: MetricComparison['source'];
  definition: string;
  precision: string;
  available?: boolean;
  unavailableReason?: string;
}): MetricComparison {
  const available = input.available ?? input.value !== null;

  return {
    key: input.key,
    label: input.label,
    value: input.value,
    previous: input.previous,
    deltaPercent: deltaPercent(input.value, input.previous),
    unit: input.unit,
    source: input.source,
    definition: input.definition,
    precision: input.precision,
    available,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {}),
  };
}

function sumMetric(
  rows: MetricRow[],
  input: { reportType: string; metric: string; dimensionKey?: string; value?: string }
): number | null {
  const matching = rows.filter(
    (row) =>
      row.report_type === input.reportType &&
      row.metric === input.metric &&
      (!input.dimensionKey || row.dimension_key === input.dimensionKey) &&
      (input.value === undefined || row.dimension_value === input.value)
  );

  if (matching.length === 0) return null;
  return matching.reduce((total, row) => total + Number(row.value || 0), 0);
}

function groupBreakdown(
  rows: MetricRow[],
  input: {
    reportType: string;
    dimensionKey: string;
    metric: string;
    previousRows: MetricRow[];
    limit?: number;
    label?: (value: string, row: MetricRow) => string;
  }
): BreakdownRow[] {
  const current = new Map<
    string,
    { value: number; label: string; extra: Record<string, number | string | null> }
  >();
  const previous = new Map<string, number>();

  for (const row of rows) {
    if (row.report_type !== input.reportType || row.metric !== input.metric) continue;
    if (row.dimension_key !== input.dimensionKey) continue;

    const key = row.dimension_value || '(not set)';
    const entry = current.get(key) ?? {
      value: 0,
      label: input.label ? input.label(key, row) : key,
      extra: {},
    };
    entry.value += Number(row.value || 0);
    current.set(key, entry);
  }

  for (const row of input.previousRows) {
    if (row.report_type !== input.reportType || row.metric !== input.metric) continue;
    if (row.dimension_key !== input.dimensionKey) continue;
    const key = row.dimension_value || '(not set)';
    previous.set(key, (previous.get(key) ?? 0) + Number(row.value || 0));
  }

  const total = Array.from(current.values()).reduce((sum, row) => sum + row.value, 0);

  return Array.from(current.entries())
    .map(([key, row]) => ({
      key,
      label: row.label,
      value: row.value,
      previous: previous.has(key) ? (previous.get(key) as number) : null,
      deltaPercent: deltaPercent(
        row.value,
        previous.has(key) ? (previous.get(key) as number) : null
      ),
      share: total > 0 ? (row.value / total) * 100 : null,
      extra: row.extra,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, input.limit ?? 25);
}

function dailySeries(
  rows: MetricRow[],
  metrics: string[],
  reportType = 'total',
  dimensionKey = 'total'
): Array<Record<string, number | string>> {
  const byDate = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (row.report_type !== reportType || row.dimension_key !== dimensionKey) continue;
    if (!metrics.includes(row.metric)) continue;

    const bucket = byDate.get(row.metric_date) ?? {};
    bucket[row.metric] = (bucket[row.metric] ?? 0) + Number(row.value || 0);
    byDate.set(row.metric_date, bucket);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));
}

function ga4Snapshot(
  rows: MetricRow[],
  previousRows: MetricRow[],
  connection: StoredConnection | null
): Ga4Snapshot {
  const available = rows.length > 0 && Boolean(connection?.external_id);
  const definition = (key: string) => {
    const map: Record<string, [string, MetricUnit, string, string]> = {
      sessions: [
        'Сессии GA4',
        'count',
        'Число сессий по определению GA4. Одна сессия может включать несколько просмотров страниц.',
        'Точность зависит от согласия на cookies и блокировщиков; GA4 может моделировать часть данных.',
      ],
      activeUsers: [
        'Активные пользователи',
        'count',
        'Пользователи с хотя бы одним активным взаимодействием за период (метрика GA4 activeUsers).',
        'Не равно числу людей: один человек на нескольких устройствах считается несколько раз.',
      ],
      newUsers: [
        'Новые пользователи',
        'count',
        'Пользователи, впервые зафиксированные GA4 (метрика newUsers).',
        'Зависит от cookie/consent и идентификации GA4; не равно новым подписчикам.',
      ],
      returningUsersDerived: [
        'Вернувшиеся (расчётно)',
        'count',
        'Расчёт: activeUsers − newUsers. GA4 не отдаёт отдельную метрику returningUsers.',
        'Производная величина, а не измерение GA4. Может быть неточной при моделировании и смене идентификаторов.',
      ],
      screenPageViews: [
        'Просмотры страниц',
        'count',
        'screenPageViews в GA4: число просмотров экранов/страниц.',
        'Не равно числу посетителей и не равно кликам из поиска.',
      ],
      engagementRate: [
        'Вовлечённость',
        'percent',
        'Доля сессий, которые GA4 считает engaged (метрика engagementRate).',
        'Определение GA4: >10 секунд, конверсия или 2+ просмотра; не универсальная метрика качества.',
      ],
      averageEngagementTime: [
        'Среднее время взаимодействия',
        'seconds',
        'userEngagementDuration / activeUsers. Это не время на странице и не «время чтения».',
        'Среднее по пользователям; выбросы и фоновые вкладки влияют на значение.',
      ],
      conversions: [
        'Конверсии GA4',
        'count',
        'Сумма событий, помеченных как конверсии в настройках GA4.',
        'Список конверсионных событий задаётся в GA4; отсутствие значения не означает отсутствие действий.',
      ],
      eventCount: [
        'События',
        'count',
        'Сумма всех событий GA4 за период.',
        'Служебные и автоматические события входят в сумму.',
      ],
      totalUsers: [
        'Всего пользователей',
        'count',
        'Уникальные пользователи по идентификаторам GA4 (totalUsers).',
        'Не равно посетителям Umami и не равно зарегистрированным пользователям сайта.',
      ],
    };
    return map[key] ?? [key, 'count', key, ''];
  };

  const make = (key: string, value: number | null, prev: number | null) => {
    const [label, unit, def, precision] = definition(key);
    let adjusted = value;

    if (key === 'engagementRate' && adjusted !== null) adjusted = adjusted * 100;
    if (key === 'returningUsersDerived' && adjusted !== null && adjusted < 0) adjusted = 0;

    let adjustedPrev = prev;
    if (key === 'engagementRate' && adjustedPrev !== null) adjustedPrev = adjustedPrev * 100;
    if (key === 'returningUsersDerived' && adjustedPrev !== null && adjustedPrev < 0)
      adjustedPrev = 0;

    return metric({
      key,
      label,
      value: adjusted,
      previous: adjustedPrev,
      unit,
      source: 'google_analytics',
      definition: def,
      precision,
      available: available,
      unavailableReason: available ? undefined : 'Нет данных GA4 за выбранный период.',
    });
  };

  const total = (key: string) =>
    sumMetric(rows, { reportType: 'total', metric: key, dimensionKey: 'total' });
  const totalPrev = (key: string) =>
    sumMetric(previousRows, { reportType: 'total', metric: key, dimensionKey: 'total' });

  const activeUsers = total('activeUsers');
  const newUsers = total('newUsers');
  const activeUsersPrev = totalPrev('activeUsers');
  const newUsersPrev = totalPrev('newUsers');
  const engagementRate = safeRatio(total('engagedSessions'), total('sessions'));
  const engagementRatePrev = safeRatio(totalPrev('engagedSessions'), totalPrev('sessions'));
  const engagementTime = safeRatio(total('userEngagementDuration'), activeUsers);
  const engagementTimePrev = safeRatio(totalPrev('userEngagementDuration'), activeUsersPrev);

  const totals: Record<string, MetricComparison> = {
    sessions: make('sessions', total('sessions'), totalPrev('sessions')),
    activeUsers: make('activeUsers', activeUsers, activeUsersPrev),
    newUsers: make('newUsers', newUsers, newUsersPrev),
    returningUsersDerived: make(
      'returningUsersDerived',
      activeUsers !== null && newUsers !== null ? Math.max(0, activeUsers - newUsers) : null,
      activeUsersPrev !== null && newUsersPrev !== null
        ? Math.max(0, activeUsersPrev - newUsersPrev)
        : null
    ),
    screenPageViews: make(
      'screenPageViews',
      total('screenPageViews'),
      totalPrev('screenPageViews')
    ),
    engagementRate: make('engagementRate', engagementRate, engagementRatePrev),
    averageEngagementTime: make('averageEngagementTime', engagementTime, engagementTimePrev),
    conversions: make('conversions', total('conversions'), totalPrev('conversions')),
    eventCount: make('eventCount', total('eventCount'), totalPrev('eventCount')),
    totalUsers: make('totalUsers', total('totalUsers'), totalPrev('totalUsers')),
  };

  const series = dailySeries(rows, ['sessions', 'activeUsers', 'newUsers', 'screenPageViews']).map(
    (point) => ({
      date: String(point.date),
      sessions: Number(point.sessions ?? 0),
      activeUsers: Number(point.activeUsers ?? 0),
      newUsers: Number(point.newUsers ?? 0),
      screenPageViews: Number(point.screenPageViews ?? 0),
    })
  );

  const publicRows = rows.filter((row) => {
    if (row.report_type === 'page' || row.report_type === 'landing_page') {
      return isPublicPath(row.dimension_value);
    }
    return true;
  });
  const trafficPageRows = rows.filter(
    (row) => row.report_type === 'page' && row.dimension_key === 'page'
  );
  const trafficLandingRows = rows.filter(
    (row) => row.report_type === 'landing_page' && row.dimension_key === 'landing_page'
  );
  const sumTraffic = (
    source: MetricRow[],
    metric: string,
    classification: 'public' | 'owner_admin' | 'automated'
  ) =>
    source
      .filter((row) => classifyTrafficPath(row.dimension_value) === classification)
      .filter((row) => row.metric === metric)
      .reduce((sum, row) => sum + Number(row.value || 0), 0);
  const excludedPaths = Array.from(
    new Set(
      [...trafficPageRows, ...trafficLandingRows]
        .filter((row) => classifyTrafficPath(row.dimension_value) !== 'public')
        .map((row) => row.dimension_value)
        .filter(Boolean)
    )
  ).slice(0, 30);
  const traffic = {
    publicPageViews: sumTraffic(trafficPageRows, 'screenPageViews', 'public'),
    ownerAdminPageViews: sumTraffic(trafficPageRows, 'screenPageViews', 'owner_admin'),
    automatedPageViews: sumTraffic(trafficPageRows, 'screenPageViews', 'automated'),
    publicLandingSessions:
      trafficLandingRows.length > 0
        ? sumTraffic(trafficLandingRows, 'sessions', 'public')
        : null,
    ownerAdminLandingSessions:
      trafficLandingRows.length > 0
        ? sumTraffic(trafficLandingRows, 'sessions', 'owner_admin')
        : null,
    automatedLandingSessions:
      trafficLandingRows.length > 0
        ? sumTraffic(trafficLandingRows, 'sessions', 'automated')
        : null,
    excludedPaths,
    note:
      'Totals are source totals and can include owner/admin sessions. Page and landing breakdowns exclude structurally internal paths. Owner conversations are excluded separately by identity.',
  };

  return {
    available,
    totals,
    series,
    traffic,
    channels: groupBreakdown(rows, {
      reportType: 'channel',
      dimensionKey: 'channel',
      metric: 'sessions',
      previousRows,
    }),
    sources: groupBreakdown(rows, {
      reportType: 'source',
      dimensionKey: 'source',
      metric: 'sessions',
      previousRows,
      label: (value) => value.replace('|', ' / '),
    }),
    landingPages: groupBreakdown(publicRows, {
      reportType: 'landing_page',
      dimensionKey: 'landing_page',
      metric: 'sessions',
      previousRows,
    }),
    pages: groupBreakdown(publicRows, {
      reportType: 'page',
      dimensionKey: 'page',
      metric: 'screenPageViews',
      previousRows,
    }),
    countries: groupBreakdown(rows, {
      reportType: 'country',
      dimensionKey: 'country',
      metric: 'sessions',
      previousRows,
    }),
    devices: groupBreakdown(rows, {
      reportType: 'device',
      dimensionKey: 'device',
      metric: 'sessions',
      previousRows,
    }),
    events: groupBreakdown(rows, {
      reportType: 'event',
      dimensionKey: 'event',
      metric: 'eventCount',
      previousRows,
      limit: 40,
    }),
    limitations: available
      ? [
          'GA4 не различает владельца и тестовые сессии автоматически; для этого используется внутренняя identity Pierrot.',
          'Итоговые GA4 sessions могут включать /admin; разбивки по страницам и landing pages исключают структурно внутренние пути.',
          'Метрика «вернувшиеся» рассчитана как activeUsers − newUsers, отдельного измерения returningUsers в GA4 нет.',
          'Конверсии GA4 отражают только события, помеченные как конверсии в настройках свойства.',
        ]
      : ['GA4 не подключён или за выбранный период нет сохранённых данных. Ноль не подставляется.'],
  };
}

function aggregateSearchDimension(
  rows: SearchPerformanceRow[],
  key: 'query' | 'page' | 'country' | 'device'
): Map<string, { clicks: number; impressions: number; positionWeight: number }> {
  const result = new Map<string, { clicks: number; impressions: number; positionWeight: number }>();

  for (const row of rows) {
    const value = row[key] || '(not set)';
    const entry = result.get(value) ?? { clicks: 0, impressions: 0, positionWeight: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.positionWeight += (row.position ?? 0) * row.impressions;
    result.set(value, entry);
  }

  return result;
}

function searchBreakdown(
  current: Map<string, { clicks: number; impressions: number; positionWeight: number }>,
  previous: Map<string, { clicks: number; impressions: number; positionWeight: number }>,
  limit = 25
): BreakdownRow[] {
  return Array.from(current.entries())
    .map(([key, value]) => {
      const prev = previous.get(key);
      const currentCtr = value.impressions > 0 ? value.clicks / value.impressions : null;
      const previousCtr = prev && prev.impressions > 0 ? prev.clicks / prev.impressions : null;

      return {
        key,
        label: key,
        value: value.clicks,
        previous: prev?.clicks ?? null,
        deltaPercent: deltaPercent(value.clicks, prev?.clicks ?? null),
        share: null,
        extra: {
          impressions: value.impressions,
          previousImpressions: prev?.impressions ?? null,
          ctr: currentCtr,
          previousCtr,
          position: value.impressions > 0 ? value.positionWeight / value.impressions : null,
          previousPosition:
            prev && prev.impressions > 0 ? prev.positionWeight / prev.impressions : null,
        },
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function gscSnapshot(
  rows: SearchPerformanceRow[],
  previousRows: SearchPerformanceRow[],
  siteUrl: string | null
): SearchConsoleSnapshot {
  const available = rows.length > 0 && Boolean(siteUrl);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const previousClicks = previousRows.reduce((sum, row) => sum + row.clicks, 0);
  const previousImpressions = previousRows.reduce((sum, row) => sum + row.impressions, 0);
  const positionWeight = rows.reduce((sum, row) => sum + (row.position ?? 0) * row.impressions, 0);
  const previousPositionWeight = previousRows.reduce(
    (sum, row) => sum + (row.position ?? 0) * row.impressions,
    0
  );

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
  const previousCtr = previousImpressions > 0 ? (previousClicks / previousImpressions) * 100 : null;
  const position = impressions > 0 ? positionWeight / impressions : null;
  const previousPosition =
    previousImpressions > 0 ? previousPositionWeight / previousImpressions : null;

  const reason = available ? undefined : 'Нет данных Search Console за выбранный период.';

  const totals: Record<string, MetricComparison> = {
    clicks: metric({
      key: 'clicks',
      label: 'Клики из поиска',
      value: available ? clicks : null,
      previous: available ? previousClicks : null,
      unit: 'count',
      source: 'search_console',
      definition: 'Клики по результатам Google Search, по данным Search Console.',
      precision:
        'Search Console показывает клики с задержкой 2–3 дня; анонимизированные запросы могут не попадать в разбивку.',
      available,
      unavailableReason: reason,
    }),
    impressions: metric({
      key: 'impressions',
      label: 'Показы в поиске',
      value: available ? impressions : null,
      previous: available ? previousImpressions : null,
      unit: 'count',
      source: 'search_console',
      definition: 'Показы ссылок сайта в результатах Google Search.',
      precision:
        'Показы не равны посещениям: пользователь мог увидеть ссылку и не перейти. Часть запросов не раскрывается.',
      available,
      unavailableReason: reason,
    }),
    ctr: metric({
      key: 'ctr',
      label: 'CTR поиска',
      value: ctr,
      previous: previousCtr,
      unit: 'percent',
      source: 'search_console',
      definition: 'Клики / показы × 100 по данным Search Console.',
      precision: 'Средневзвешенный CTR; скрытые запросы и задержка данных влияют на значение.',
      available,
      unavailableReason: reason,
    }),
    position: metric({
      key: 'position',
      label: 'Средняя позиция',
      value: position,
      previous: previousPosition,
      unit: 'position',
      source: 'search_console',
      definition: 'Средневзвешенная по показам позиция в результатах поиска.',
      precision:
        'Позиция — средняя по всем показам, а не позиция конкретной страницы в конкретный момент.',
      available,
      unavailableReason: reason,
    }),
  };

  const byDate = new Map<string, { clicks: number; impressions: number; positionWeight: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.metric_date) ?? {
      clicks: 0,
      impressions: 0,
      positionWeight: 0,
    };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.positionWeight += (row.position ?? 0) * row.impressions;
    byDate.set(row.metric_date, entry);
  }

  const series = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: value.impressions > 0 ? (value.clicks / value.impressions) * 100 : null,
      position: value.impressions > 0 ? value.positionWeight / value.impressions : null,
    }));

  const currentQueries = aggregateSearchDimension(rows, 'query');
  const previousQueries = aggregateSearchDimension(previousRows, 'query');
  const currentPages = aggregateSearchDimension(rows, 'page');
  const previousPages = aggregateSearchDimension(previousRows, 'page');

  const siteCtr = impressions > 0 ? clicks / impressions : null;
  const impressionFloor = Math.max(5, Math.round(impressions * 0.001));

  const toOpportunity = (
    entry: [string, { clicks: number; impressions: number; positionWeight: number }]
  ) => {
    const [key, value] = entry;
    const rowCtr = value.impressions > 0 ? value.clicks / value.impressions : 0;
    return {
      page: key,
      query: key,
      clicks: value.clicks,
      impressions: value.impressions,
      ctr: rowCtr,
      position: value.impressions > 0 ? value.positionWeight / value.impressions : 0,
    };
  };

  const lowCtrEntries = (
    source: Map<string, { clicks: number; impressions: number; positionWeight: number }>
  ) =>
    Array.from(source.entries())
      .filter(([, value]) => value.impressions >= impressionFloor)
      .filter(([, value]) => {
        const rowCtr = value.impressions > 0 ? value.clicks / value.impressions : 0;
        return siteCtr === null ? rowCtr < 0.02 : rowCtr < siteCtr * 0.7;
      })
      .sort((a, b) => b[1].impressions - a[1].impressions)
      .slice(0, 10)
      .map(toOpportunity);

  const lowCtrPages = lowCtrEntries(currentPages).map((row) => ({
    page: row.page,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));

  const lowCtrQueries = lowCtrEntries(currentQueries).map((row) => ({
    query: row.query,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));

  const movement = (
    current: Map<string, { clicks: number; impressions: number; positionWeight: number }>,
    previous: Map<string, { clicks: number; impressions: number; positionWeight: number }>,
    direction: 'rising' | 'declining'
  ): BreakdownRow[] =>
    Array.from(current.entries())
      .map(([key, value]): BreakdownRow | null => {
        const prev = previous.get(key);
        if (!prev) return null;
        if (value.impressions < 5 && prev.impressions < 5) return null;

        const delta = deltaPercent(value.impressions, prev.impressions);
        if (delta === null) return null;
        if (direction === 'rising' && delta < 20) return null;
        if (direction === 'declining' && delta > -20) return null;

        return {
          key,
          label: key,
          value: value.impressions,
          previous: prev.impressions,
          deltaPercent: delta,
          share: null,
          extra: {
            clicks: value.clicks,
            previousClicks: prev.clicks,
          },
        };
      })
      .filter((row): row is BreakdownRow => row !== null)
      .sort((a, b) =>
        direction === 'rising'
          ? (b.deltaPercent ?? 0) - (a.deltaPercent ?? 0)
          : (a.deltaPercent ?? 0) - (b.deltaPercent ?? 0)
      )
      .slice(0, 10);

  const lostPages = Array.from(previousPages.entries())
    .map(([key, prev]): BreakdownRow | null => {
      const current = currentPages.get(key);
      const currentImpressions = current?.impressions ?? 0;
      if (prev.impressions < 20) return null;
      const delta = deltaPercent(currentImpressions, prev.impressions);
      if (delta === null || delta > -20) return null;
      return {
        key,
        label: key,
        value: currentImpressions,
        previous: prev.impressions,
        deltaPercent: delta,
        share: null,
        extra: { clicks: current?.clicks ?? 0, previousClicks: prev.clicks },
      };
    })
    .filter((row): row is BreakdownRow => row !== null)
    .sort((a, b) => (b.previous ?? 0) - (a.previous ?? 0))
    .slice(0, 10);

  return {
    available,
    totals,
    series,
    queries: searchBreakdown(currentQueries, previousQueries),
    pages: searchBreakdown(currentPages, previousPages),
    countries: searchBreakdown(
      aggregateSearchDimension(rows, 'country'),
      aggregateSearchDimension(previousRows, 'country')
    ),
    devices: searchBreakdown(
      aggregateSearchDimension(rows, 'device'),
      aggregateSearchDimension(previousRows, 'device')
    ),
    lowCtrPages,
    lowCtrQueries,
    risingQueries: movement(currentQueries, previousQueries, 'rising'),
    decliningQueries: movement(currentQueries, previousQueries, 'declining'),
    lostPages,
    limitations: available
      ? [
          'Search Console не отдаёт search appearance и часть данных об индексации через Search Analytics API.',
          'Данные Search Console отстают на 2–3 дня; последние дни могут быть неполными.',
          'Запросы с малым числом показов могут быть скрыты Google и не попадать в разбивку.',
          'Показы — не посещения, а CTR — не конверсия.',
        ]
      : ['Search Console не подключён или за выбранный период нет сохранённых данных.'],
  };
}

function umamiSnapshot(
  rows: MetricRow[],
  previousRows: MetricRow[],
  period: AnalyticsPeriod,
  connection: StoredConnection | null
): UmamiSnapshot {
  const available = rows.length > 0 && Boolean(connection?.external_id);
  const pageviews = sumMetric(rows, {
    reportType: 'total',
    metric: 'pageviews',
    dimensionKey: 'total',
  });
  const visits = sumMetric(rows, { reportType: 'total', metric: 'visits', dimensionKey: 'total' });
  const previousPageviews = sumMetric(previousRows, {
    reportType: 'total',
    metric: 'pageviews',
    dimensionKey: 'total',
  });
  const previousVisits = sumMetric(previousRows, {
    reportType: 'total',
    metric: 'visits',
    dimensionKey: 'total',
  });

  // Umami period totals are stored only for the exact synced range. They are
  // used only when their metadata matches the requested reporting period.
  const periodRows = rows.filter(
    (row) =>
      row.report_type === 'period_total' &&
      row.dimension_key === 'total' &&
      row.metadata?.period_start === period.start &&
      row.metadata?.period_end === period.end
  );
  const visitors = periodRows.find((row) => row.metric === 'visitors')?.value ?? null;
  const previousPeriodRows = previousRows.filter(
    (row) =>
      row.report_type === 'period_total' &&
      row.dimension_key === 'total' &&
      row.metadata?.period_start === period.previousStart &&
      row.metadata?.period_end === period.previousEnd
  );
  const previousVisitors =
    previousPeriodRows.find((row) => row.metric === 'visitors')?.value ?? null;

  const reason = available ? undefined : 'Umami не подключён или нет сохранённых данных.';

  const totals: Record<string, MetricComparison> = {
    pageviews: metric({
      key: 'pageviews',
      label: 'Просмотры Umami',
      value: pageviews,
      previous: previousPageviews,
      unit: 'count',
      source: 'umami',
      definition: 'Просмотры страниц по независимому счётчику Umami.',
      precision:
        'Umami и GA4 используют разные определения и разные блокировщики/cookie; расхождение ожидаемо.',
      available,
      unavailableReason: reason,
    }),
    visits: metric({
      key: 'visits',
      label: 'Визиты Umami',
      value: visits,
      previous: previousVisits,
      unit: 'count',
      source: 'umami',
      definition: 'Визиты (сессии) по данным Umami.',
      precision: 'Визит Umami не равен сессии GA4. Источники не взаимозаменяемы.',
      available,
      unavailableReason: reason,
    }),
    visitors: metric({
      key: 'visitors',
      label: 'Посетители Umami',
      value: visitors,
      previous: previousVisitors,
      unit: 'count',
      source: 'umami',
      definition: 'Уникальные посетители Umami за период.',
      precision:
        'Umami возвращает visitors только для периода синхронизации; для произвольного окна значение может быть недоступно.',
      available: visitors !== null,
      unavailableReason:
        visitors === null ? 'Нет сохранённого агрегата Umami за этот период — не ноль.' : undefined,
    }),
  };

  const series = dailySeries(rows, ['pageviews', 'visits']).map((point) => ({
    date: String(point.date),
    value: Number(point.pageviews ?? 0),
  }));

  const pageRows = rows.filter(
    (row) =>
      row.report_type === 'page' &&
      row.metadata?.period_start === period.start &&
      row.metadata?.period_end === period.end
  );
  const previousPageRows = previousRows.filter(
    (row) =>
      row.report_type === 'page' &&
      row.metadata?.period_start === period.previousStart &&
      row.metadata?.period_end === period.previousEnd
  );
  const referrerRows = rows.filter(
    (row) =>
      row.report_type === 'referrer' &&
      row.metadata?.period_start === period.start &&
      row.metadata?.period_end === period.end
  );
  const previousReferrerRows = previousRows.filter(
    (row) =>
      row.report_type === 'referrer' &&
      row.metadata?.period_start === period.previousStart &&
      row.metadata?.period_end === period.previousEnd
  );

  return {
    available,
    totals,
    series,
    pages: groupBreakdown(pageRows, {
      reportType: 'page',
      dimensionKey: 'page',
      metric: 'pageviews',
      previousRows: previousPageRows,
    }),
    referrers: groupBreakdown(referrerRows, {
      reportType: 'referrer',
      dimensionKey: 'referrer',
      metric: 'pageviews',
      previousRows: previousReferrerRows,
    }),
    limitations: available
      ? [
          'Umami не заменяет GA4. Показатели сравниваются как независимые наблюдения, а не суммируются.',
          'Если Umami синхронизировался за другой интервал, разбивка по страницам и реферерам за это окно недоступна.',
        ]
      : ['Umami не подключён или нет сохранённых данных.'],
  };
}

export function blueskySnapshot(
  rows: MetricRow[],
  previousRows: MetricRow[],
  connection: StoredConnection | null,
  period: AnalyticsPeriod,
  flowLinks: Map<string, { id: string; url: string | null; title: string | null }> = new Map()
): BlueskySnapshot {
  const available = rows.length > 0 && Boolean(connection);
  const profileRows = (source: MetricRow[], metric: string): MetricRow[] =>
    source
      .filter(
        (row) =>
          row.provider === 'bluesky' && row.report_type === 'profile' && row.metric === metric
      )
      .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const latestProfileRow = (source: MetricRow[], metric: string): MetricRow | null => {
    const matching = profileRows(source, metric);
    return matching.length > 0 ? matching[matching.length - 1] : null;
  };
  const profileMetric = (source: MetricRow[], metric: string): number | null => {
    const row = latestProfileRow(source, metric);
    return row ? Number(row.value) : null;
  };

  type ArchivePost = BlueskySnapshot['posts'][number];
  const postsByUri = new Map<string, ArchivePost>();

  // Rows are read in ascending metric_date order, so the final value for a
  // URI is its latest observed snapshot. The identity key is the stable post
  // URI, never the text or the sync date.
  for (const row of rows) {
    if (row.provider !== 'bluesky' || row.report_type !== 'post') continue;
    const uri = row.dimension_value;
    if (!uri) continue;
    const metadata = row.metadata ?? {};
    const rawKind = metadata.post_kind;
    const kind: ArchivePost['kind'] =
      rawKind === 'post' || rawKind === 'reply' || rawKind === 'repost'
        ? rawKind
        : 'unknown';
    const authorDid = typeof metadata.author_did === 'string' ? metadata.author_did : null;
    const ownerDid =
      connection && typeof connection.external_id === 'string'
        ? connection.external_id
        : null;
    const authorship: ArchivePost['authorship'] =
      authorDid && ownerDid && authorDid === ownerDid
        ? 'owner'
        : authorDid
          ? 'other'
          : 'unknown';
    const post = postsByUri.get(uri) ?? {
      uri,
      kind,
      authorship,
      text: typeof metadata.text === 'string' ? metadata.text : '',
      createdAt:
        typeof metadata.post_created_at === 'string' ? metadata.post_created_at : null,
      // The row is an observation, not just a counter. Keep the exact time of
      // the latest observation so Pierrot can explain freshness.
      observedAt:
        (typeof metadata.observed_at === 'string' ? metadata.observed_at : null) ||
        row.synced_at ||
        row.metric_date ||
        null,
      url: typeof metadata.permalink === 'string' ? metadata.permalink : null,
      flowItemId: null,
      flowUrl: null,
      likes: 0,
      reposts: 0,
      replies: 0,
      quotes: 0,
      links: 0,
      siteLinks: 0,
      engagement: 0,
    };
    post.observedAt =
      (typeof metadata.observed_at === 'string' ? metadata.observed_at : null) ||
      row.synced_at ||
      row.metric_date ||
      post.observedAt;
    if (post.kind === 'unknown' && kind !== 'unknown') post.kind = kind;
    if (post.authorship === 'unknown' && authorship !== 'unknown') {
      post.authorship = authorship;
    }

    const value = Number(row.value || 0);
    if (row.metric === 'likes') post.likes = value;
    else if (row.metric === 'reposts') post.reposts = value;
    else if (row.metric === 'replies') post.replies = value;
    else if (row.metric === 'quotes') post.quotes = value;
    else if (row.metric === 'links') post.links = value;
    else if (row.metric === 'site_links') post.siteLinks = value;
    else if (row.metric === 'engagement') post.engagement = value;
    postsByUri.set(uri, post);
  }

  const archivePosts = [...postsByUri.values()]
    .map((post) => {
      const flow = flowLinks.get(post.uri);
      return {
        ...post,
        flowItemId: flow?.id ?? null,
        flowUrl: flow?.url ?? null,
        engagement:
          post.engagement ||
          post.likes + post.reposts + post.replies + post.quotes,
      };
    })
    .sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    );

  const timezone = period.timezone;
  const dayOf = (value: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  };

  const isPublication = (post: ArchivePost) =>
    post.kind !== 'reply' &&
    post.kind !== 'repost' &&
    post.authorship !== 'other';
  const periodPosts = archivePosts.filter((post) => {
    const day = dayOf(post.createdAt);
    return isPublication(post) && day !== null && day >= period.start && day <= period.end;
  });
  const previousPeriodPosts = archivePosts.filter((post) => {
    const day = dayOf(post.createdAt);
    return (
      isPublication(post) &&
      day !== null &&
      day >= period.previousStart &&
      day <= period.previousEnd
    );
  });

  const sum = (items: ArchivePost[], key: keyof Pick<ArchivePost, 'likes' | 'reposts' | 'replies' | 'quotes' | 'engagement'>) =>
    items.reduce((total, item) => total + item[key], 0);

  const metricDates = rows
    .map((row) => row.metric_date)
    .filter((value): value is string => Boolean(value))
    .sort();
  const lastMetricDate = metricDates.length > 0 ? metricDates[metricDates.length - 1] : null;
  const lastSyncedAt = rows
    .map((row) => row.synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop() || null;
  const profilePostsEarly = profileMetric(rows, 'posts');
  const emptyFeedWithoutEvidence =
    archivePosts.length === 0 && (profilePostsEarly ?? 0) > 0;
  const coverageComplete =
    Boolean(lastMetricDate && lastMetricDate >= period.end) &&
    !emptyFeedWithoutEvidence;
  const coverageFrom =
    archivePosts
      .map((post) => dayOf(post.createdAt))
      .filter((value): value is string => Boolean(value))
      .sort()[0] || null;
  const coverageTo = lastMetricDate;

  const profilePosts = profilePostsEarly;
  const followers = profileMetric(rows, 'followers');
  const follows = profileMetric(rows, 'follows');
  const latestFollowersRow = latestProfileRow(rows, 'followers');
  const followersCapturedAt =
    latestFollowersRow?.synced_at || latestFollowersRow?.metric_date || null;
  const previousFollowers = profileMetric(previousRows, 'followers');
  const previousPosts = profileMetric(previousRows, 'posts');

  const makeMetric = (
    key: string,
    label: string,
    value: number | null,
    previous: number | null,
    definition: string
  ) =>
    metric({
      key,
      label,
      value,
      previous,
      unit: 'count',
      source: 'bluesky',
      definition,
      precision:
        'Публичные счётчики Bluesky на момент синхронизации. Не равно охвату, просмотрам или уникальным читателям.',
      available,
      unavailableReason: available ? undefined : 'Bluesky не подключён или нет данных.',
    });

  const truncated =
    connection?.external_meta &&
    typeof connection.external_meta === 'object' &&
    typeof (connection.external_meta as Record<string, unknown>).feed_truncated === 'boolean'
      ? Boolean((connection.external_meta as Record<string, unknown>).feed_truncated)
      : null;

  const limitations = available
    ? [
        'Bluesky отдаёт публичные счётчики, но не уникальный охват и не число просмотров.',
        'Лайки, репосты и ответы на посты выбранного периода — текущие наблюдаемые счётчики. Они могли накопиться за всё время жизни поста, а не только за период.',
        'Реальный прирост взаимодействий за период не рассчитывается: для этого нужны сопоставимые снимки на границах периода.',
        '«Посты в профиле» — общий postsCount профиля; он не равен числу постов в выборке или за период.',
        'Загружаются последние доступные посты автора; репосты чужих постов исключены. Лента ограничена пагинацией.',
        archivePosts.some((post) => post.kind === 'unknown' || post.authorship === 'unknown')
          ? 'Часть старых записей не содержит тип публикации или автора; они считаются публикациями, но могут включать ответы. Это legacy-ограничение.'
          : 'Ответы и репосты сохранены в архиве, но не входят в число собственных публикаций.',
        emptyFeedWithoutEvidence
          ? 'Профиль сообщает о публикациях, но лента вернула 0 постов. Это может быть пустой профиль или ограничение API; отсутствие постов не подтверждено.'
          : coverageComplete
            ? `Покрытие архива: по ${coverageTo || 'неизвестную дату'}.`
            : `Покрытие архива заканчивается ${coverageTo || 'неизвестной датой'} — данные за конец периода могут быть неполными.`,
        ...(truncated ? ['Последняя синхронизация была частичной: лента не была загружена до конца.'] : []),
      ]
    : ['Bluesky не подключён или нет сохранённых данных.'];

  return {
    available,
    profile: {
      handle: connection?.external_meta?.handle
        ? String(connection.external_meta.handle)
        : connection?.account_label ?? null,
      displayName: connection?.account_label ?? null,
      did: connection?.external_id ?? null,
      followers,
      follows,
      posts: profilePosts,
      capturedAt: followersCapturedAt,
    },
    totals: {
      followers: makeMetric(
        'followers',
        'Подписчики Bluesky (всего)',
        followers,
        previousFollowers,
        'followersCount из публичного профиля Bluesky. Текущий совокупный показатель, не за период.'
      ),
      follows: makeMetric(
        'follows',
        'Подписки Bluesky (всего)',
        follows,
        null,
        'followsCount из публичного профиля Bluesky. Текущий совокупный показатель, не за период.'
      ),
      posts: makeMetric(
        'posts',
        'Посты в профиле (всего)',
        profilePosts,
        previousPosts,
        'postsCount из публичного профиля Bluesky. Это общий счётчик профиля, не число постов за период.'
      ),
      likes: makeMetric(
        'likes',
        'Лайки (архив, текущие счётчики)',
        sum(archivePosts, 'likes'),
        null,
        'Сумма likeCount по всем постам в сохранённом архиве. Не активность за выбранный период.'
      ),
      reposts: makeMetric(
        'reposts',
        'Репосты (архив, текущие счётчики)',
        sum(archivePosts, 'reposts'),
        null,
        'Сумма repostCount по всем постам в сохранённом архиве. Не активность за выбранный период.'
      ),
      replies: makeMetric(
        'replies',
        'Ответы (архив, текущие счётчики)',
        sum(archivePosts, 'replies'),
        null,
        'Сумма replyCount по всем постам в сохранённом архиве. Не активность за выбранный период.'
      ),
      engagement: makeMetric(
        'engagement',
        'Взаимодействия (архив, расчётно)',
        sum(archivePosts, 'engagement'),
        null,
        'Расчёт: лайки + репосты + ответы + цитаты по всему архиву. Это не охват и не период.'
      ),
    },
    posts: archivePosts,
    topPosts: [...archivePosts]
      .filter(isPublication)
      .sort((left, right) => right.engagement - left.engagement)
      .slice(0, 10),
    siteLinkedPosts: archivePosts
      .filter((post) => isPublication(post) && post.siteLinks > 0)
      .slice(0, 10),
    period: {
      start: period.start,
      end: period.end,
      label: period.label,
      timezone,
      posts: periodPosts,
      totals: {
        posts: periodPosts.length,
        likes: sum(periodPosts, 'likes'),
        reposts: sum(periodPosts, 'reposts'),
        replies: sum(periodPosts, 'replies'),
        quotes: sum(periodPosts, 'quotes'),
        engagement: sum(periodPosts, 'engagement'),
      },
      previousPosts: previousPeriodPosts.length,
      coverageComplete,
      coverageEndsAt: coverageTo,
      limitation: coverageComplete
        ? 'Лайки, репосты и ответы — текущие наблюдаемые счётчики постов, опубликованных в периоде; они могли накопиться за всё время жизни поста. Прирост взаимодействий за период не рассчитывается.'
        : `Архив синхронизирован по ${coverageTo || 'неизвестную дату'}. Посты и взаимодействия после этой даты могут отсутствовать; данные за конец периода могут быть неполными. Прирост взаимодействий за период не рассчитывается.`,
    },
    archive: {
      total: archivePosts.length,
      coverageFrom,
      coverageTo,
      lastSyncedAt,
      truncated,
    },
    limitations,
  };
}

function dateBounds(period: AnalyticsPeriod) {
  const start = parseCalendarDate(period.start, period.timezone);
  const end = parseCalendarDate(period.end, period.timezone, true);
  const previousStart = parseCalendarDate(period.previousStart, period.timezone);
  const previousEnd = parseCalendarDate(period.previousEnd, period.timezone, true);

  return {
    startIso: start?.toISOString() ?? `${period.start}T00:00:00.000Z`,
    endIso: end?.toISOString() ?? `${period.end}T23:59:59.999Z`,
    previousStartIso: previousStart?.toISOString() ?? `${period.previousStart}T00:00:00.000Z`,
    previousEndIso: previousEnd?.toISOString() ?? `${period.previousEnd}T23:59:59.999Z`,
  };
}

async function countQuery(
  store: SupabaseClient,
  table: string,
  // Dynamic table helpers cannot express PostgREST's generic builder without
  // deep type instantiation; the call sites below are all simple filters.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (query: any) => any
): Promise<number | null> {
  try {
    let query = store.from(table).select('id', { count: 'exact', head: true });
    const configured = apply(query);
    if (configured) query = configured;
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

function orderColumnFor(table: string): string {
  const map: Record<string, string> = {
    pierrot_v_subscription_conversions: 'confirmed_at',
    subscription_events: 'created_at',
    pierrot_v_donations: 'created_at',
    pierrot_v_purchases: 'created_at',
    pierrot_conversations: 'started_at',
    pierrot_events: 'created_at',
    subscribers: 'id',
    newsletter_jobs: 'created_at',
    newsletter_logs: 'sent_at',
    letters: 'createdAt',
  };
  return map[table] ?? 'id';
}

type SafeRows<T> = { rows: T[]; error: string | null };

/**
 * Paginated, error-aware read. A failed query is never converted into "zero
 * rows"; the caller receives the failure and must record an explicit gap.
 *
 * Ordering is stable on the requested column. Pagination continues until the
 * provider returns a short page, so more than 1,000 internal events are not
 * silently truncated at the PostgREST response limit.
 */
export async function readRowsSafe<T>(
  store: SupabaseClient,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply: (query: any) => any,
  options: { orderBy?: string; ascending?: boolean; pageSize?: number; maxRows?: number } = {}
): Promise<SafeRows<T>> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 1000, 1), 5000);
  const maxRows = Math.min(Math.max(options.maxRows ?? 100_000, 1), 500_000);
  const orderBy = options.orderBy ?? 'id';
  const ascending = options.ascending ?? true;
  const rows: T[] = [];

  try {
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      let query = store
        .from(table)
        .select('*')
        .order(orderBy, { ascending })
        .range(offset, Math.min(offset + pageSize - 1, maxRows - 1));
      const configured = apply(query);
      if (configured) query = configured;

      const { data, error } = await query;
      if (error) {
        return {
          rows,
          error: `${table}: ${error.message || 'query failed'}`,
        };
      }

      const page = (data ?? []) as T[];
      rows.push(...page);
      if (page.length < pageSize) return { rows, error: null };
    }

    return { rows, error: null };
  } catch (error) {
    return {
      rows,
      error: `${table}: ${error instanceof Error ? error.message : 'unexpected query failure'}`,
    };
  }
}

function breakdownFromCounts(
  current: Map<string, number>,
  previous: Map<string, number>
): BreakdownRow[] {
  const total = Array.from(current.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(current.entries())
    .map(([key, value]) => ({
      key,
      label: key,
      value,
      previous: previous.get(key) ?? null,
      deltaPercent: deltaPercent(value, previous.get(key) ?? null),
      share: total > 0 ? (value / total) * 100 : null,
    }))
    .sort((a, b) => b.value - a.value);
}

async function internalSnapshot(
  store: SupabaseClient,
  period: AnalyticsPeriod
): Promise<InternalSnapshot> {
  const bounds = dateBounds(period);
  const limitations: string[] = [];
  const dataGaps: string[] = [];
  const readRows = async <T,>(
    _store: SupabaseClient,
    table: string,
    // Dynamic PostgREST filters cannot be typed without deep instantiation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: (query: any) => any,
    options?: { orderBy?: string; ascending?: boolean; maxRows?: number }
  ): Promise<T[]> => {
    const result = await readRowsSafe<T>(store, table, apply, {
      ...options,
      orderBy: options?.orderBy ?? orderColumnFor(table),
    });
    if (result.error) {
      dataGaps.push(`${table}: ${result.error}`);
      limitations.push(
        `Не удалось полностью прочитать ${table}. Недостающие записи неизвестны и не считаются нулём.`
      );
    }
    return result.rows;
  };

  const [
    confirmedRows,
    previousConfirmedSubscriptions,
    subscriptionEvents,
    previousSubscriptionEvents,
    donations,
    purchases,
    conversations,
    previousConversations,
    events,
    articlesTotal,
    lettersTotal,
    itemsPublished,
    knowledgeDocuments,
    mediaRecords,
    subscriberRows,
    newsletterJobRows,
    newsletterLogRows,
    newsletterLetterRows,
  ] = await Promise.all([
    readRows<{ conversation_id: string | null; confirmed_at: string | null }>(
      store,
      'pierrot_v_subscription_conversions',
      (query) =>
        query.gte('confirmed_at', bounds.startIso).lt('confirmed_at', bounds.endIso)
    ),
    countQuery(store, 'pierrot_v_subscription_conversions', (query) =>
      query.gte('confirmed_at', bounds.previousStartIso).lt('confirmed_at', bounds.previousEndIso)
    ),
    readRows<{ event_name: string | null; created_at: string | null }>(
      store,
      'subscription_events',
      (query) =>
        query.gte('created_at', bounds.startIso).lt('created_at', bounds.endIso)
    ),
    readRows<{ event_name: string | null; created_at: string | null }>(
      store,
      'subscription_events',
      (query) =>
        query
          .gte('created_at', bounds.previousStartIso)
          .lt('created_at', bounds.previousEndIso)
    ),
    readRows<{
      offer_id: string | null;
      amount_total: number | string | null;
      currency: string | null;
      created_at: string | null;
    }>(store, 'pierrot_v_donations', (query) =>
      query.gte('created_at', bounds.startIso).lt('created_at', bounds.endIso)
    ),
    readRows<{ id: string | null; created_at: string | null }>(
      store,
      'pierrot_v_purchases',
      (query) => query.gte('created_at', bounds.startIso).lt('created_at', bounds.endIso)
    ),
    readRows<{
      id: string;
      start_page: string | null;
      referrer: string | null;
      identity_type: string | null;
      started_at: string | null;
    }>(store, 'pierrot_conversations', (query) =>
      query.gte('started_at', bounds.startIso).lt('started_at', bounds.endIso)
    ),
    readRows<{
      id: string;
      start_page: string | null;
      referrer: string | null;
      identity_type: string | null;
      started_at: string | null;
    }>(store, 'pierrot_conversations', (query) =>
      query
        .gte('started_at', bounds.previousStartIso)
        .lt('started_at', bounds.previousEndIso)
    ),
    readRows<{ event_name: string | null; conversation_id: string | null; created_at: string | null }>(
      store,
      'pierrot_events',
      (query) =>
        query.gte('created_at', bounds.startIso).lt('created_at', bounds.endIso)
    ),
    countQuery(store, 'articles', (query) => query.eq('published', true)),
    countQuery(store, 'letters', (query) => query.eq('published', true)),
    countQuery(store, 'items', (query) => query.eq('status', 'published')),
    countQuery(store, 'knowledge_documents', () => undefined),
    countQuery(store, 'media_archive_records', () => undefined),
    readRows<{
      id: string;
      locale: string | null;
      isActive: boolean | null;
      unsubscribedAt: string | null;
      confirmedAt: string | null;
    }>(store, 'subscribers', (query) => query),
    readRows<{
      id: string;
      letter_id: string;
      status: string | null;
      total_count: number | null;
      sent_count: number | null;
      failed_count: number | null;
      created_at: string | null;
    }>(store, 'newsletter_jobs', (query) =>
      query.gte('created_at', bounds.startIso).lt('created_at', bounds.endIso)
    ),
    readRows<{ id: string; status: string | null; sent_at: string | null }>(
      store,
      'newsletter_logs',
      (query) =>
        query.gte('sent_at', bounds.startIso).lt('sent_at', bounds.endIso)
    ),
    readRows<{
      id: string;
      title: string | null;
      lang: string | null;
      status: string | null;
      sentAt: string | null;
    }>(store, 'letters', (query) => query.order('createdAt', { ascending: false })),
  ]);

  const nonOwnerConversations = conversations.filter(
    (row) => row.identity_type !== 'owner' && !isInternalPath(row.start_page)
  );
  const nonOwnerPrevious = previousConversations.filter(
    (row) => row.identity_type !== 'owner' && !isInternalPath(row.start_page)
  );

  if (conversations.length !== nonOwnerConversations.length) {
    limitations.push(
      `Из внутренних диалогов исключены сессии владельца и внутренние /admin-страницы: ${
        conversations.length - nonOwnerConversations.length
      } за период.`
    );
  }

  if (conversations.length === 0) {
    limitations.push('Внутренние диалоги Pierrot: данных за период нет.');
  }

  const subEventCounts = new Map<string, number>();
  for (const row of subscriptionEvents) {
    const key = row.event_name || '(not set)';
    subEventCounts.set(key, (subEventCounts.get(key) ?? 0) + 1);
  }
  const previousSubEventCounts = new Map<string, number>();
  for (const row of previousSubscriptionEvents) {
    const key = row.event_name || '(not set)';
    previousSubEventCounts.set(key, (previousSubEventCounts.get(key) ?? 0) + 1);
  }

  const donationByOffer = new Map<string, number>();
  let donationAmount = 0;
  let donationCurrency: string | null = null;
  for (const row of donations) {
    const offer = row.offer_id || '(not set)';
    donationByOffer.set(offer, (donationByOffer.get(offer) ?? 0) + 1);
    const amount = safeNumber(row.amount_total);
    if (amount !== null) {
      donationAmount += amount;
      donationCurrency = donationCurrency || row.currency || null;
    }
  }

  const ownerIds = new Set(
    [...conversations, ...previousConversations]
      .filter((row) => row.identity_type === 'owner')
      .map((row) => row.id)
  );

  const eventCounts = new Map<string, number>();
  for (const row of events) {
    if (row.conversation_id && ownerIds.has(row.conversation_id)) continue;
    const key = row.event_name || '(not set)';
    eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
  }

  const startPageCounts = new Map<string, number>();
  const previousStartPageCounts = new Map<string, number>();
  for (const row of nonOwnerConversations) {
    const key = normalizePath(row.start_page || '') || '(unknown)';
    startPageCounts.set(key, (startPageCounts.get(key) ?? 0) + 1);
  }
  for (const row of nonOwnerPrevious) {
    const key = normalizePath(row.start_page || '') || '(unknown)';
    previousStartPageCounts.set(key, (previousStartPageCounts.get(key) ?? 0) + 1);
  }

  const referrerCounts = new Map<string, number>();
  const previousReferrerCounts = new Map<string, number>();
  for (const row of nonOwnerConversations) {
    const key = row.referrer ? domainOf(row.referrer) : '(direct / unknown)';
    referrerCounts.set(key, (referrerCounts.get(key) ?? 0) + 1);
  }
  for (const row of nonOwnerPrevious) {
    const key = row.referrer ? domainOf(row.referrer) : '(direct / unknown)';
    previousReferrerCounts.set(key, (previousReferrerCounts.get(key) ?? 0) + 1);
  }

  // Confirmed subscriptions are correlated to the conversation that started
  // the flow. This is a conversation_id link, not proof of the traffic source.
  const confirmedSubscriptions = confirmedRows.filter(
    (row) => !(row.conversation_id && ownerIds.has(row.conversation_id))
  ).length;
  const knownStartPages = new Map<string, string | null>(
    conversations.map((row) => [row.id, row.start_page])
  );
  const missingIds = Array.from(
    new Set(
      confirmedRows
        .map((row) => row.conversation_id)
        .filter((id): id is string => Boolean(id) && !knownStartPages.has(id as string))
    )
  );

  for (let index = 0; index < missingIds.length; index += 200) {
    const chunk = missingIds.slice(index, index + 200);
    const extra = await readRows<{ id: string; start_page: string | null }>(
      store,
      'pierrot_conversations',
      (query) => query.in('id', chunk)
    );
    for (const row of extra) knownStartPages.set(row.id, row.start_page);
  }

  const confirmedPageCounts = new Map<string, number>();
  for (const row of confirmedRows) {
    if (row.conversation_id && ownerIds.has(row.conversation_id)) continue;
    const page = row.conversation_id ? (knownStartPages.get(row.conversation_id) ?? '') : '';
    const key = normalizePath(page || '') || '(unknown)';
    confirmedPageCounts.set(key, (confirmedPageCounts.get(key) ?? 0) + 1);
  }

  if (donations.length === 0) {
    limitations.push(
      'Подтверждённых пожертвований за период нет (это ноль строк, а не ошибка источника).'
    );
  }
  if (purchases.length === 0) {
    limitations.push(
      'Подтверждённых покупок за период нет (это ноль строк, а не ошибка источника).'
    );
  }

  const newsletterSubscribers = subscriberRows;
  const localeGroup = (row: { locale: string | null }) =>
    (row.locale || '').toLowerCase().startsWith('en') ? 'en' : 'ru';
  const activeSubscribers = newsletterSubscribers.filter((row) => row.isActive === true);
  const unsubscribedSubscribers = newsletterSubscribers.filter(
    (row) => Boolean(row.unsubscribedAt)
  );
  const newsletterJobs = newsletterJobRows;
  const newsletterLogs = newsletterLogRows;
  const newsletterLetters = new Map(
    newsletterLetterRows.map((row) => [row.id, row] as const)
  );
  const newsletterByLanguage = new Map<string, number>();
  for (const row of activeSubscribers) {
    const key = localeGroup(row);
    newsletterByLanguage.set(key, (newsletterByLanguage.get(key) ?? 0) + 1);
  }
  const newsletterLanguageRows = Array.from(newsletterByLanguage.entries()).map(
    ([key, value]) => ({
      key,
      label: key === 'en' ? 'English' : 'Russian',
      value,
      previous: null,
      deltaPercent: null,
      share:
        activeSubscribers.length > 0 ? (value / activeSubscribers.length) * 100 : null,
    })
  );
  const recentIssues = newsletterJobs
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 8)
    .map((job) => {
      const letter = newsletterLetters.get(job.letter_id);
      return {
        id: job.letter_id,
        title: letter?.title || '(письмо не найдено)',
        language: letter?.lang || null,
        status: job.status,
        sentAt: job.created_at,
        sentCount: job.sent_count,
        failedCount: job.failed_count,
      };
    });
  const newsletterEmailsSent = newsletterLogs.filter((row) => row.status === 'sent').length;
  const newsletterEmailsFailed = newsletterLogs.filter(
    (row) => row.status === 'failed' || row.status === 'bounced'
  ).length;
  const internalDates = [
    ...confirmedRows.map((row) => row.confirmed_at),
    ...subscriptionEvents.map((row) => row.created_at),
    ...donations.map((row) => row.created_at),
    ...conversations.map((row) => row.started_at),
    ...events.map((row) => row.created_at),
    ...newsletterJobs.map((row) => row.created_at),
    ...newsletterLogs.map((row) => row.sent_at),
  ].filter((value): value is string => typeof value === 'string' && Boolean(value));
  const internalCoverage = buildSourceCoverage({
    provider: 'internal',
    period,
    dataDates: internalDates,
    lastSyncAt: new Date().toISOString(),
    configured: true,
    connected: true,
    reportingDelayDays: 0,
  });
  // The internal database is authoritative: a day without rows is a real
  // zero, not an unknown external gap. Only query failures make it partial.
  internalCoverage.state = dataGaps.length > 0 ? 'partial' : 'complete';
  internalCoverage.completeness = dataGaps.length > 0 ? null : 1;
  internalCoverage.freshness = dataGaps.length > 0 ? 'unknown' : 'fresh';
  const previousInternalDates = [
    ...previousSubscriptionEvents.map((row) => row.created_at),
    ...previousConversations.map((row) => row.started_at),
  ].filter((value): value is string => typeof value === 'string' && Boolean(value));
  const previousInternalCoverage = buildSourceCoverage({
    provider: 'internal',
    period: {
      start: period.previousStart,
      end: period.previousEnd,
      timezone: period.timezone,
    },
    dataDates: previousInternalDates,
    lastSyncAt: new Date().toISOString(),
    configured: true,
    connected: true,
    reportingDelayDays: 0,
  });
  previousInternalCoverage.state = dataGaps.length > 0 ? 'partial' : 'complete';
  previousInternalCoverage.completeness = dataGaps.length > 0 ? null : 1;
  previousInternalCoverage.freshness = dataGaps.length > 0 ? 'unknown' : 'fresh';

  const newsletterLimitations: string[] = [];
  if (newsletterLogs.length > 0 && newsletterLogs.every((row) => row.status === 'sent')) {
    newsletterLimitations.push(
      'Resend logs in this database contain delivery status only; opens and clicks are not stored here. No open/click rate is inferred.'
    );
  }
  if (newsletterJobs.length === 0) {
    newsletterLimitations.push('За выбранный период нет запусков рассылки (это ноль строк, а не ошибка).');
  }

  return {
    available: true,
    confirmedSubscriptions,
    previousConfirmedSubscriptions,
    confirmedSubscriptionsByStartPage: breakdownFromCounts(confirmedPageCounts, new Map()),
    subscriptionEvents: breakdownFromCounts(subEventCounts, previousSubEventCounts),
    donations: {
      count: donations.length,
      amountMinor: donations.length > 0 ? donationAmount : null,
      currency: donationCurrency,
      byOffer: breakdownFromCounts(donationByOffer, new Map()),
      available: true,
    },
    purchases: { count: purchases.length, available: true },
    conversations: {
      total: nonOwnerConversations.length,
      previousTotal: nonOwnerPrevious.length,
      byStartPage: breakdownFromCounts(startPageCounts, previousStartPageCounts),
      byReferrer: breakdownFromCounts(referrerCounts, previousReferrerCounts),
    },
    events: breakdownFromCounts(eventCounts, new Map()),
    newsletter: {
      available: true,
      subscribers: {
        total: newsletterSubscribers.length,
        active: activeSubscribers.length,
        unsubscribed: unsubscribedSubscribers.length,
        ru: activeSubscribers.filter((row) => localeGroup(row) === 'ru').length,
        en: activeSubscribers.filter((row) => localeGroup(row) === 'en').length,
      },
      jobs: {
        total: newsletterJobs.length,
        sent: newsletterJobs.reduce((sum, row) => sum + Number(row.sent_count || 0), 0),
        failed: newsletterJobs.reduce((sum, row) => sum + Number(row.failed_count || 0), 0),
        emailsSent: newsletterEmailsSent,
        emailsFailed: newsletterEmailsFailed,
      },
      byLanguage: newsletterLanguageRows,
      recentIssues,
      limitations: newsletterLimitations,
    },
    content: {
      articlesTotal,
      lettersTotal,
      itemsPublished,
      knowledgeDocuments,
      mediaRecords,
    },
    limitations,
    raw: {
      confirmedSubscriptions: confirmedRows.length,
      subscriptionEvents: subscriptionEvents.length,
      donations: donations.length,
      purchases: purchases.length,
      conversations: conversations.length,
      events: events.length,
      newsletterJobs: newsletterJobs.length,
      newsletterLogs: newsletterLogs.length,
    },
    dataGaps,
    coverage: internalCoverage,
    previousCoverage: previousInternalCoverage,
  };
}

function projectPerformance(
  projects: typeof PROJECT_DEFINITIONS,
  ga4: Ga4Snapshot,
  gsc: SearchConsoleSnapshot,
  internal: InternalSnapshot
): ProjectPerformance[] {
  return projects.map((project) => {
    const landing = ga4.landingPages.filter((row) => projectForPath(row.key)?.key === project.key);
    const pages = ga4.pages.filter((row) => projectForPath(row.key)?.key === project.key);
    const searchPages = gsc.pages.filter((row) => projectForPath(row.key)?.key === project.key);
    const internalPage = internal.conversations.byStartPage.filter(
      (row) => projectForPath(row.key)?.key === project.key
    );

    const sessions = landing.length > 0 ? landing.reduce((sum, row) => sum + row.value, 0) : null;
    const pageViews = pages.length > 0 ? pages.reduce((sum, row) => sum + row.value, 0) : null;
    const searchClicks =
      searchPages.length > 0 ? searchPages.reduce((sum, row) => sum + row.value, 0) : null;
    const searchImpressions =
      searchPages.length > 0
        ? searchPages.reduce((sum, row) => sum + Number(row.extra?.impressions ?? 0), 0)
        : null;
    const internalConversations =
      internalPage.length > 0 ? internalPage.reduce((sum, row) => sum + row.value, 0) : null;
    const relatedConfirmedRows = internal.confirmedSubscriptionsByStartPage.filter(
      (row) => projectForPath(row.key)?.key === project.key
    );
    const relatedConfirmed =
      project.key === 'flow' && internal.confirmedSubscriptions !== null
        ? relatedConfirmedRows.length > 0
          ? relatedConfirmedRows.reduce((sum, row) => sum + row.value, 0)
          : 0
        : null;
    const relatedDonations =
      project.key === 'heart'
        ? internal.donations.available
          ? (internal.donations.byOffer.find((row) => /heart|angel|postcard/i.test(row.key))
              ?.value ?? 0)
          : null
        : null;

    const facts: string[] = [];
    if (sessions !== null)
      facts.push(`${project.name}: ${Math.round(sessions)} сессий GA4 на landing pages проекта.`);
    if (pageViews !== null)
      facts.push(`${Math.round(pageViews)} просмотров страниц проекта в GA4.`);
    if (searchClicks !== null)
      facts.push(
        `${Math.round(searchClicks)} кликов и ${Math.round(searchImpressions ?? 0)} показов в Google Search.`
      );
    if (internalConversations !== null)
      facts.push(
        `${internalConversations} диалогов Pierrot, начатых на страницах проекта (без владельца).`
      );
    if (relatedConfirmed !== null && relatedConfirmed > 0) {
      facts.push(
        `${relatedConfirmed} подтверждённых подписок связаны с диалогами, начатыми на страницах проекта (связь по conversation_id, не атрибуция источника).`
      );
    }

    const interpretation: string[] = [];
    if (sessions !== null && searchClicks !== null && searchClicks > 0 && sessions > 0) {
      interpretation.push(
        'Поиск приводит клики, но связь клика с конкретной подпиской или покупкой не подтверждена.'
      );
    }
    if (relatedConfirmed !== null || relatedDonations !== null) {
      interpretation.push(
        'Подтверждённое действие связано с conversation_id или offer_id, но не с источником перехода. Атрибуция остаётся неизвестной.'
      );
    }

    return {
      key: project.key,
      name: project.name,
      path: project.paths[0],
      sessions,
      activeUsers: null,
      pageViews,
      searchClicks,
      searchImpressions,
      internalConversations,
      confirmedSubscriptions: relatedConfirmed,
      confirmedDonations: relatedDonations,
      revenueMinor: null,
      currency: null,
      facts,
      interpretation,
      hypothesis: [],
      recommendations: [],
      attribution: 'unknown',
    };
  });
}


/**
 * Resolve a Bluesky post URI back to the Flow item that produced it. The
 * canonical link is already stored by crossposting in `items.bluesky_uri`;
 * this is a read-only join, not a second publication registry.
 */
async function loadBlueskyFlowLinks(
  store: SupabaseClient
): Promise<{
  links: Map<string, { id: string; url: string | null; title: string | null }>;
  error: string | null;
}> {
  const result = await readRowsSafe<{
    id: string;
    slug: string | null;
    title: string | null;
    bluesky_uri: string | null;
  }>(store, 'items', (query) => query.not('bluesky_uri', 'is', null), {
    orderBy: 'id',
    maxRows: 20_000,
  });
  const links = new Map<string, { id: string; url: string | null; title: string | null }>();

  for (const item of result.rows) {
    const uri = typeof item.bluesky_uri === 'string' ? item.bluesky_uri.trim() : '';
    if (!uri || links.has(uri)) continue;
    links.set(uri, {
      id: item.id,
      url: item.slug ? `/flow/${encodeURIComponent(item.slug)}` : '/flow',
      title: item.title,
    });
  }

  return { links, error: result.error };
}

async function contentMatches(
  store: SupabaseClient,
  ga4: Ga4Snapshot,
  gsc: SearchConsoleSnapshot
): Promise<{
  matches: ContentMatch[];
  index: Map<string, ContentIndexEntry>;
  limitations: string[];
}> {
  const limitations: string[] = [];
  const paths = new Set<string>();
  for (const row of [...ga4.pages, ...ga4.landingPages, ...gsc.pages]) {
    if (row.key && !row.key.startsWith('(')) paths.add(normalizePath(row.key));
  }

  const index = new Map<string, ContentIndexEntry>();

  const [articlesResult, lettersResult, itemsResult, knowledgeResult] = await Promise.all([
    readRowsSafe<{
      id: string;
      title: string | null;
      slug: string | null;
      publishedAt: string | null;
    }>(store, 'articles', (query) => query, { orderBy: 'id' }),
    readRowsSafe<{
      id: string;
      title: string | null;
      slug: string | null;
      publishedAt: string | null;
    }>(store, 'letters', (query) => query, { orderBy: 'id' }),
    readRowsSafe<{
      id: string;
      title: string | null;
      slug: string | null;
      type: string | null;
      source_url: string | null;
      published_at: string | null;
      bluesky_uri: string | null;
    }>(store, 'items', (query) => query, { orderBy: 'id' }),
    readRowsSafe<{
      id: string;
      title: string | null;
      normalized_url: string | null;
      canonical_url: string | null;
      source_url: string | null;
      source_type: string | null;
    }>(store, 'knowledge_documents', (query) => query, { orderBy: 'id' }),
  ]);

  for (const [label, result] of [
    ['articles', articlesResult],
    ['letters', lettersResult],
    ['items', itemsResult],
    ['knowledge_documents', knowledgeResult],
  ] as const) {
    if (result.error) {
      limitations.push(
        `Не удалось полностью прочитать ${label}; часть связей контента может отсутствовать.`
      );
    }
  }
  const articles = articlesResult.rows;
  const letters = lettersResult.rows;
  const items = itemsResult.rows;
  const knowledge = knowledgeResult.rows;

  for (const article of articles) {
    if (!article.slug) continue;
    const path = `/journal/${article.slug}`;
    index.set(path, {
      path,
      type: 'article',
      slug: article.slug,
      title: article.title,
      url: path,
      publishedAt: article.publishedAt,
      brainDocumentId: null,
      channels: ['site', 'journal'],
    });
  }

  for (const letter of letters) {
    if (!letter.slug) continue;
    const path = `/letters/${letter.slug}`;
    index.set(path, {
      path,
      type: 'letter',
      slug: letter.slug,
      title: letter.title,
      url: path,
      publishedAt: letter.publishedAt,
      brainDocumentId: null,
      channels: ['site', 'newsletter'],
    });
  }

  for (const item of items) {
    if (!item.slug) continue;
    const path = normalizePath(item.source_url || `/items/${item.slug}`);
    if (!path) continue;
    index.set(path, {
      path,
      type: 'item',
      slug: item.slug,
      title: item.title,
      url: item.source_url,
      publishedAt: item.published_at,
      brainDocumentId: null,
      channels: ['site', 'flow', ...(item.bluesky_uri ? ['bluesky'] : [])],
    });
  }

  for (const document of knowledge) {
    const path = normalizePath(
      document.normalized_url || document.canonical_url || document.source_url || ''
    );
    if (!path) continue;
    const existing = index.get(path);
    if (existing) {
      index.set(path, { ...existing, brainDocumentId: document.id });
    } else {
      index.set(path, {
        path,
        type: 'page',
        slug: null,
        title: document.title,
        url: document.canonical_url || document.normalized_url || document.source_url,
        publishedAt: null,
        brainDocumentId: document.id,
      });
    }
  }

  for (const project of PROJECT_DEFINITIONS) {
    for (const projectPath of project.paths) {
      if (!index.has(projectPath)) {
        index.set(projectPath, {
          path: projectPath,
          type: 'project',
          slug: project.key,
          title: project.name,
          url: projectPath,
          publishedAt: null,
          brainDocumentId: null,
        });
      }
    }
  }

  const matches: ContentMatch[] = Array.from(paths)
    .map((path) => {
      const match = matchContent(path, index);
      const extracted = extractContentSlug(path);

      if (match) {
        return {
          path,
          type: match.type,
          slug: match.slug,
          title: match.title,
          url: match.url,
          publishedAt: match.publishedAt,
          brainDocumentId: match.brainDocumentId,
          channels: match.channels ?? ['site'],
        } satisfies ContentMatch;
      }

      return {
        path,
        type: extracted?.type === 'project' ? 'project' : 'unknown',
        slug: extracted?.slug ?? null,
        title: null,
        url: null,
        publishedAt: null,
        brainDocumentId: null,
      } satisfies ContentMatch;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return { matches, index, limitations };
}

function stripMetricComparison(
  metrics: Record<string, { previous: number | null; deltaPercent: number | null }>
): void {
  for (const metric of Object.values(metrics)) {
    metric.previous = null;
    metric.deltaPercent = null;
  }
}

function stripBreakdownComparison(
  rows: Array<{ previous: number | null; deltaPercent: number | null }>
): void {
  for (const row of rows) {
    row.previous = null;
    row.deltaPercent = null;
  }
}

function providerHealth(
  provider: AnalyticsProvider,
  connection: StoredConnection | null,
  runs: StoredSyncRun[],
  coverage: { from: string | null; to: string | null } | null,
  configured: boolean,
  extraAction: string | null = null,
  periodCoverage: import('./types').SourceCoverage | null = null
): ProviderHealth {
  const label =
    provider === 'google_analytics'
      ? 'Google Analytics 4'
      : provider === 'search_console'
        ? 'Google Search Console'
        : provider === 'bluesky'
          ? 'Bluesky'
          : 'Umami';

  const providerRuns = runs.filter((run) => run.provider === provider);
  const lastSuccess = providerRuns.find((run) => run.status === 'completed');
  const lastRun = providerRuns[0] ?? null;

  let status: ProviderHealth['status'] = 'not_connected';
  if (!configured) status = 'not_configured';
  else if (!connection) status = 'not_connected';
  else if (connection.status === 'disabled') status = 'disabled';
  else if (connection.status === 'needs_reauthorization') status = 'needs_reauthorization';
  else if (connection.status === 'error') status = 'error';
  else if (connection.status === 'connected') status = 'connected';

  let actionRequired: string | null = extraAction;

  if (!configured) {
    actionRequired =
      provider === 'umami'
        ? 'Добавьте ANALYTICS_UMAMI_API_URL, ANALYTICS_UMAMI_API_KEY и ANALYTICS_UMAMI_WEBSITE_ID.'
        : provider === 'bluesky'
          ? 'Добавьте BLUESKY_IDENTIFIER и BLUESKY_PASSWORD (app password).'
          : 'Добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.';
  } else if (status === 'not_connected') {
    actionRequired = extraAction || 'Подключите источник и выдайте доступ только на чтение.';
  } else if (status === 'needs_reauthorization') {
    actionRequired = 'Разрешение Google отозвано или истекло. Подключите источник заново.';
  } else if (status === 'error') {
    actionRequired =
      connection?.last_error_message || 'Последняя синхронизация завершилась ошибкой.';
  }

  const externalMeta =
    connection?.external_meta && typeof connection.external_meta === 'object'
      ? connection.external_meta
      : null;
  const discovery =
    externalMeta && typeof externalMeta.discovery === 'object' && externalMeta.discovery
      ? (externalMeta.discovery as Record<string, unknown>)
      : null;
  const lastCheckedAt =
    typeof discovery?.checked_at === 'string'
      ? discovery.checked_at
      : (connection?.last_error_at ?? null);

  return {
    provider,
    label,
    status,
    configured,
    connected: status === 'connected' || status === 'error' || status === 'needs_reauthorization',
    externalId: connection?.external_id ?? null,
    accountLabel: connection?.account_label ?? null,
    scopes: connection?.scopes ?? [],
    externalMeta,
    lastCheckedAt,
    lastSyncAt: connection?.last_sync_at ?? lastRun?.started_at ?? null,
    lastSuccessAt: lastSuccess?.finished_at ?? lastSuccess?.started_at ?? null,
    lastSyncStatus: connection?.last_sync_status ?? lastRun?.status ?? null,
    lastErrorCode: connection?.last_error_code ?? lastRun?.error_code ?? null,
    lastErrorMessage: connection?.last_error_message ?? lastRun?.error_message ?? null,
    dataFrom: coverage?.from ?? null,
    dataTo: coverage?.to ?? null,
    actionRequired,
    coverage: periodCoverage,
    dataState: periodCoverage
      ? periodCoverage.state
      : !configured
        ? 'not_configured'
        : status === 'connected'
          ? 'stale'
          : 'unavailable',
    freshness: periodCoverage?.freshness ?? 'unknown',
  };
}

export async function loadSourceHealth(store?: SupabaseClient): Promise<{
  sources: ProviderHealth[];
  coverage: Array<{ provider: string; from: string | null; to: string | null; rows: number }>;
  runs: StoredSyncRun[];
}> {
  const client = store ?? getServerSupabaseClient({ useServiceRole: true });
  const [connections, runs, coverage] = await Promise.all([
    getStoredConnections(client).catch(() => [] as StoredConnection[]),
    getRecentSyncRuns(client, 50).catch(() => [] as StoredSyncRun[]),
    getDataCoverage(client).catch(() => []),
  ]);

  const connectionFor = (provider: AnalyticsProvider) =>
    connections.find((connection) => connection.provider === provider) ?? null;

  const googleOAuth = getGoogleOAuthConfig();
  const umamiConfig = getUmamiConfig();
  const blueskyConfig = getBlueskyConfig();
  const gaConnection = connectionFor('google_analytics');
  const gscConnection = connectionFor('search_console');
  const umamiConnection = connectionFor('umami');
  const blueskyConnection = connectionFor('bluesky');
  const gscConfigured = googleOAuth.configured;

  return {
    sources: [
      providerHealth(
        'google_analytics',
        gaConnection,
        runs,
        coverage.find((row) => row.provider === 'google_analytics') ?? null,
        googleOAuth.configured,
        googleOAuth.configured && !gaConnection?.external_id
          ? 'OAuth настроен. Подключите Google и выберите GA4 property.'
          : null
      ),
      providerHealth(
        'search_console',
        gscConnection,
        runs,
        coverage.find((row) => row.provider === 'search_console') ?? null,
        gscConfigured,
        googleOAuth.configured && !gscConnection?.external_id
          ? 'OAuth настроен. Подключите Google и выберите Search Console property.'
          : null
      ),
      providerHealth(
        'umami',
        umamiConnection,
        runs,
        coverage.find((row) => row.provider === 'umami') ?? null,
        umamiConfig.configured,
        !umamiConfig.configured ? `Не заданы: ${umamiConfig.missing.join(', ')}.` : null
      ),
      providerHealth(
        'bluesky',
        blueskyConnection,
        runs,
        coverage.find((row) => row.provider === 'bluesky') ?? null,
        blueskyConfig.configured,
        !blueskyConfig.configured ? `Не заданы: ${blueskyConfig.missing.join(', ')}.` : null
      ),
    ],
    coverage,
    runs,
  };
}

export async function loadAnalyticsDataset(input: {
  period: AnalyticsPeriod;
  store?: SupabaseClient;
}): Promise<AnalyticsDataset> {
  const store = input.store ?? getServerSupabaseClient({ useServiceRole: true });
  const period = input.period;

  const [connections, runs, dataCoverage] = await Promise.all([
    getStoredConnections(store).catch(() => [] as StoredConnection[]),
    getRecentSyncRuns(store, 50).catch(() => [] as StoredSyncRun[]),
    getDataCoverage(store).catch(() => []),
  ]);

  const connectionFor = (provider: AnalyticsProvider) =>
    connections.find((connection) => connection.provider === provider) ?? null;

  const gaConnection = connectionFor('google_analytics');
  const gscConnection = connectionFor('search_console');
  const umamiConnection = connectionFor('umami');
  const blueskyConnection = connectionFor('bluesky');
  const blueskyArchiveFrom = '2010-01-01';
  const blueskyArchiveTo = new Intl.DateTimeFormat('en-CA', {
    timeZone: period.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const readMetrics = async (
    provider: 'google_analytics' | 'umami' | 'bluesky',
    from: string,
    to: string
  ): Promise<SafeRows<MetricRow>> => {
    try {
      return {
        rows: await readMetricRows(store, { provider, from, to }),
        error: null,
      };
    } catch (error) {
      return {
        rows: [],
        error: `${provider} ${from}..${to}: ${
          error instanceof Error ? error.message : 'metric read failed'
        }`,
      };
    }
  };
  const readSearch = async (
    siteUrl: string,
    from: string,
    to: string
  ): Promise<SafeRows<SearchPerformanceRow>> => {
    try {
      return {
        rows: await readSearchRows(store, { siteUrl, from, to }),
        error: null,
      };
    } catch (error) {
      return {
        rows: [],
        error: `search_console ${from}..${to}: ${
          error instanceof Error ? error.message : 'search read failed'
        }`,
      };
    }
  };

  const [
    gaResult,
    gaPreviousResult,
    umamiResult,
    umamiPreviousResult,
    searchResult,
    previousSearchResult,
    blueskyResult,
    previousBlueskyResult,
  ] = await Promise.all([
    gaConnection?.external_id
      ? readMetrics('google_analytics', period.start, period.end)
      : Promise.resolve({ rows: [] as MetricRow[], error: null }),
    gaConnection?.external_id
      ? readMetrics('google_analytics', period.previousStart, period.previousEnd)
      : Promise.resolve({ rows: [] as MetricRow[], error: null }),
    umamiConnection?.external_id
      ? readMetrics('umami', period.start, period.end)
      : Promise.resolve({ rows: [] as MetricRow[], error: null }),
    umamiConnection?.external_id
      ? readMetrics('umami', period.previousStart, period.previousEnd)
      : Promise.resolve({ rows: [] as MetricRow[], error: null }),
    gscConnection?.external_id
      ? readSearch(gscConnection.external_id, period.start, period.end)
      : Promise.resolve({ rows: [] as SearchPerformanceRow[], error: null }),
    gscConnection?.external_id
      ? readSearch(gscConnection.external_id, period.previousStart, period.previousEnd)
      : Promise.resolve({ rows: [] as SearchPerformanceRow[], error: null }),
    blueskyConnection
      ? readMetrics('bluesky', blueskyArchiveFrom, blueskyArchiveTo)
      : Promise.resolve({ rows: [] as MetricRow[], error: null }),
    blueskyConnection
      ? readMetrics('bluesky', period.previousStart, period.previousEnd)
      : Promise.resolve({ rows: [] as MetricRow[], error: null }),
  ]);

  const dataGaps = [
    gaResult.error,
    gaPreviousResult.error,
    umamiResult.error,
    umamiPreviousResult.error,
    searchResult.error,
    previousSearchResult.error,
    blueskyResult.error,
    previousBlueskyResult.error,
  ].filter((value): value is string => Boolean(value));

  const gaRows = gaResult.rows;
  const gaPreviousRows = gaPreviousResult.rows;
  const umamiRows = umamiResult.rows;
  const umamiPreviousRows = umamiPreviousResult.rows;
  const searchRows = searchResult.rows;
  const previousSearchRows = previousSearchResult.rows;
  const blueskyRows = blueskyResult.rows;
  const previousBlueskyRows = previousBlueskyResult.rows;

  const publicSearchRows = searchRows.filter((row) => isPublicPath(row.page));
  const publicPreviousSearchRows = previousSearchRows.filter((row) => isPublicPath(row.page));
  const ga4 = ga4Snapshot(gaRows, gaPreviousRows, gaConnection);
  const gsc = gscSnapshot(
    publicSearchRows,
    publicPreviousSearchRows,
    gscConnection?.external_id ?? null
  );
  const umami = umamiSnapshot(umamiRows, umamiPreviousRows, period, umamiConnection);
  const [internal, flowLinksResult] = await Promise.all([
    internalSnapshot(store, period),
    loadBlueskyFlowLinks(store),
  ]);
  const bluesky = blueskySnapshot(
    blueskyRows,
    previousBlueskyRows,
    blueskyConnection,
    period,
    flowLinksResult.links
  );
  const { matches, limitations: contentLimitations } = await contentMatches(store, ga4, gsc);
  if (flowLinksResult.error) {
    dataGaps.push(`Bluesky → Flow link resolution: ${flowLinksResult.error}`);
  }

  const googleOAuth = getGoogleOAuthConfig();
  const umamiConfig = getUmamiConfig();
  const blueskyConfig = getBlueskyConfig();

  const gscSiteConfigured = Boolean(gscConnection?.external_id);
  const gscConfigured = googleOAuth.configured;
  const previousPeriod = {
    start: period.previousStart,
    end: period.previousEnd,
    timezone: period.timezone,
  };
  const blueskyObservationDates = blueskyRows
    .map((row) => row.metric_date)
    .filter((value): value is string => Boolean(value))
    .filter((date) => date >= period.start && date <= period.end);
  const previousBlueskyObservationDates = blueskyRows
    .map((row) => row.metric_date)
    .filter((value): value is string => Boolean(value))
    .filter((date) => date >= period.previousStart && date <= period.previousEnd);

  const gaCoverage = buildSourceCoverage({
    provider: 'google_analytics',
    period,
    dataDates: gaRows.map((row) => row.metric_date),
    lastSyncAt: gaConnection?.last_sync_at ?? null,
    configured: googleOAuth.configured,
    connected: Boolean(gaConnection?.external_id),
    error: gaConnection?.last_error_message ?? null,
    reportingDelayDays: 0,
  });
  const gaPreviousCoverage = buildSourceCoverage({
    provider: 'google_analytics',
    period: previousPeriod,
    dataDates: gaPreviousRows.map((row) => row.metric_date),
    lastSyncAt: gaConnection?.last_sync_at ?? null,
    configured: googleOAuth.configured,
    connected: Boolean(gaConnection?.external_id),
    error: gaConnection?.last_error_message ?? null,
    reportingDelayDays: 0,
  });
  const gscCoverage = buildSourceCoverage({
    provider: 'search_console',
    period,
    dataDates: publicSearchRows.map((row) => row.metric_date),
    lastSyncAt: gscConnection?.last_sync_at ?? null,
    configured: gscConfigured,
    connected: Boolean(gscConnection?.external_id),
    error: gscConnection?.last_error_message ?? null,
    reportingDelayDays: 3,
  });
  const gscPreviousCoverage = buildSourceCoverage({
    provider: 'search_console',
    period: previousPeriod,
    dataDates: publicPreviousSearchRows.map((row) => row.metric_date),
    lastSyncAt: gscConnection?.last_sync_at ?? null,
    configured: gscConfigured,
    connected: Boolean(gscConnection?.external_id),
    error: gscConnection?.last_error_message ?? null,
    reportingDelayDays: 3,
  });
  const umamiCoverage = buildSourceCoverage({
    provider: 'umami',
    period,
    dataDates: umamiRows.map((row) => row.metric_date),
    lastSyncAt: umamiConnection?.last_sync_at ?? null,
    configured: umamiConfig.configured,
    connected: Boolean(umamiConnection?.external_id),
    error: umamiConnection?.last_error_message ?? null,
    reportingDelayDays: 0,
  });
  const umamiPreviousCoverage = buildSourceCoverage({
    provider: 'umami',
    period: previousPeriod,
    dataDates: umamiPreviousRows.map((row) => row.metric_date),
    lastSyncAt: umamiConnection?.last_sync_at ?? null,
    configured: umamiConfig.configured,
    connected: Boolean(umamiConnection?.external_id),
    error: umamiConnection?.last_error_message ?? null,
    reportingDelayDays: 0,
  });
  const blueskyCoverage = buildSourceCoverage({
    provider: 'bluesky',
    period,
    dataDates: blueskyObservationDates,
    lastSyncAt: bluesky.archive.lastSyncedAt,
    configured: blueskyConfig.configured,
    connected: Boolean(blueskyConnection) || blueskyConfig.configured,
    error: blueskyConnection?.last_error_message ?? null,
    reportingDelayDays: 0,
  });
  const blueskyPreviousCoverage = buildSourceCoverage({
    provider: 'bluesky',
    period: previousPeriod,
    dataDates: previousBlueskyObservationDates,
    lastSyncAt: bluesky.archive.lastSyncedAt,
    configured: blueskyConfig.configured,
    connected: Boolean(blueskyConnection) || blueskyConfig.configured,
    error: blueskyConnection?.last_error_message ?? null,
    reportingDelayDays: 0,
  });

  // A delta is meaningful only when both windows have complete coverage.
  // Otherwise the previous value remains visible as unavailable, not as growth.
  if (!coverageIsComparable(gaCoverage, gaPreviousCoverage)) {
    stripMetricComparison(ga4.totals);
    [
      ga4.channels,
      ga4.sources,
      ga4.landingPages,
      ga4.pages,
      ga4.countries,
      ga4.devices,
      ga4.events,
    ].forEach(stripBreakdownComparison);
  }
  if (!coverageIsComparable(gscCoverage, gscPreviousCoverage)) {
    stripMetricComparison(gsc.totals);
    [gsc.queries, gsc.pages, gsc.countries, gsc.devices].forEach(stripBreakdownComparison);
  }
  if (!coverageIsComparable(umamiCoverage, umamiPreviousCoverage)) {
    stripMetricComparison(umami.totals);
    [umami.pages, umami.referrers].forEach(stripBreakdownComparison);
  }
  if (!coverageIsComparable(blueskyCoverage, blueskyPreviousCoverage)) {
    stripMetricComparison(bluesky.totals);
  }
  if (!coverageIsComparable(internal.coverage, internal.previousCoverage)) {
    internal.previousConfirmedSubscriptions = null;
  }

  const periodCoverage = [
    gaCoverage,
    gscCoverage,
    umamiCoverage,
    blueskyCoverage,
    internal.coverage,
  ];
  const previousCoverage = [
    gaPreviousCoverage,
    gscPreviousCoverage,
    umamiPreviousCoverage,
    blueskyPreviousCoverage,
    internal.previousCoverage,
  ];

  const sources = [
    providerHealth(
      'google_analytics',
      gaConnection,
      runs,
      dataCoverage.find((row) => row.provider === 'google_analytics') ?? null,
      googleOAuth.configured,
      googleOAuth.configured && !gaConnection?.external_id
        ? 'OAuth настроен. Подключите Google и выберите GA4 property.'
        : null,
      gaCoverage
    ),
    providerHealth(
      'search_console',
      gscConnection,
      runs,
      dataCoverage.find((row) => row.provider === 'search_console') ?? null,
      gscConfigured,
      googleOAuth.configured && !gscSiteConfigured
        ? 'OAuth настроен. Подключите Google и выберите Search Console property.'
        : null,
      gscCoverage
    ),
    providerHealth(
      'umami',
      umamiConnection,
      runs,
      dataCoverage.find((row) => row.provider === 'umami') ?? null,
      umamiConfig.configured,
      !umamiConfig.configured ? `Не заданы: ${umamiConfig.missing.join(', ')}.` : null,
      umamiCoverage
    ),
    providerHealth(
      'bluesky',
      blueskyConnection,
      runs,
      dataCoverage.find((row) => row.provider === 'bluesky') ?? null,
      blueskyConfig.configured,
      !blueskyConfig.configured ? `Не заданы: ${blueskyConfig.missing.join(', ')}.` : null,
      blueskyCoverage
    ),
  ];

  return {
    period,
    generatedAt: new Date().toISOString(),
    sources,
    coverage: periodCoverage,
    previousCoverage,
    dataGaps: [...dataGaps, ...internal.dataGaps, ...contentLimitations],
    ga4,
    gsc,
    umami,
    bluesky,
    internal,
    projects: projectPerformance(PROJECT_DEFINITIONS, ga4, gsc, internal),
    contentMatches: matches,
  };
}

export { contentIndexKey, getSearchConsoleSiteOverride };
