import type { SearchAnomaly, SearchBrandSplit, SearchSegmentSummary } from './types';

/**
 * Pure Search Console helpers.
 *
 * These functions never call Google and never invent a missing day. They are
 * shared by the stored-data read model so the dashboard and tests use the same
 * period, brand and anomaly rules.
 */

/** Search Console `type` used by every sync. Kept explicit so it is stored with a slice. */
export const GSC_SEARCH_TYPE = 'web';

/** Search Console normally publishes final data with a 2–3 day lag. */
export const GSC_REPORTING_DELAY_DAYS = 3;

export const DEFAULT_BRAND_TERMS = ['merkurov', 'меркуров'];

export type SearchRowLike = {
  metric_date: string;
  query: string;
  page: string;
  country: string;
  device: string;
  clicks: number;
  impressions: number;
  position: number | null;
};

export type SearchThresholds = {
  /** Total-window thresholds: tiny properties must not produce alarms. */
  totalMinPreviousImpressions: number;
  totalMinPreviousClicks: number;
  totalDropPercent: number;
  /** Page/query thresholds. */
  segmentMinPreviousImpressions: number;
  segmentMinAbsoluteLoss: number;
  segmentDropPercent: number;
  /** CTR can only be compared above a meaningful impression floor. */
  ctrMinPreviousImpressions: number;
  ctrDropPercent: number;
};

export const DEFAULT_SEARCH_THRESHOLDS: SearchThresholds = {
  totalMinPreviousImpressions: 100,
  totalMinPreviousClicks: 10,
  totalDropPercent: 30,
  segmentMinPreviousImpressions: 20,
  segmentMinAbsoluteLoss: 10,
  segmentDropPercent: 50,
  ctrMinPreviousImpressions: 100,
  ctrDropPercent: 25,
};

function finite(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function searchDeltaPercent(current: number | null, previous: number | null): number | null {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function normalizeBrandTerm(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Brand detection is intentionally substring-based and documented as a
 * heuristic. Search Console does not expose a brand dimension.
 */
export function isBrandQuery(query: string, terms: string[]): boolean {
  const normalized = normalizeBrandTerm(query);
  if (!normalized) return false;

  return terms
    .map(normalizeBrandTerm)
    .filter(Boolean)
    .some((term) => normalized.includes(term));
}

function weightedPosition(rows: SearchRowLike[]): number | null {
  let impressions = 0;
  let weighted = 0;

  for (const row of rows) {
    const value = row.position;
    if (value === null || !Number.isFinite(value)) continue;
    impressions += row.impressions;
    weighted += value * row.impressions;
  }

  return impressions > 0 ? weighted / impressions : null;
}

export function summarizeSearchSegment(input: {
  key: string;
  label: string;
  rows: SearchRowLike[];
  previousRows: SearchRowLike[];
  totalImpressions: number;
}): SearchSegmentSummary {
  const clicks = input.rows.reduce((sum, row) => sum + finite(row.clicks), 0);
  const impressions = input.rows.reduce((sum, row) => sum + finite(row.impressions), 0);
  const previousClicks = input.previousRows.reduce((sum, row) => sum + finite(row.clicks), 0);
  const previousImpressions = input.previousRows.reduce(
    (sum, row) => sum + finite(row.impressions),
    0
  );

  return {
    key: input.key,
    label: input.label,
    clicks,
    impressions,
    previousClicks,
    previousImpressions,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    previousCtr: previousImpressions > 0 ? (previousClicks / previousImpressions) * 100 : null,
    position: weightedPosition(input.rows),
    previousPosition: weightedPosition(input.previousRows),
    clicksDeltaPercent: searchDeltaPercent(clicks, previousClicks),
    impressionsDeltaPercent: searchDeltaPercent(impressions, previousImpressions),
    shareOfImpressions:
      input.totalImpressions > 0 ? (impressions / input.totalImpressions) * 100 : null,
  };
}

export function buildSearchBrandSplit(
  rows: SearchRowLike[],
  previousRows: SearchRowLike[],
  terms: string[] = DEFAULT_BRAND_TERMS
): SearchBrandSplit {
  const normalizedTerms = terms.map(normalizeBrandTerm).filter(Boolean);
  const isBrand = (row: SearchRowLike) => isBrandQuery(row.query, normalizedTerms);
  const totalImpressions = rows.reduce((sum, row) => sum + finite(row.impressions), 0);

  return {
    available: rows.length > 0 || previousRows.length > 0,
    brandTerms: normalizedTerms,
    brand: summarizeSearchSegment({
      key: 'brand',
      label: 'Брендовые запросы',
      rows: rows.filter(isBrand),
      previousRows: previousRows.filter(isBrand),
      totalImpressions,
    }),
    nonBrand: summarizeSearchSegment({
      key: 'non_brand',
      label: 'Небрендовые запросы',
      rows: rows.filter((row) => !isBrand(row)),
      previousRows: previousRows.filter((row) => !isBrand(row)),
      totalImpressions,
    }),
    heuristic:
      'Бренд/небренд определяется по вхождению термина в запрос. Google не отдаёт измерение brand, поэтому это эвристика, а не поле Search Console.',
  };
}

function aggregateBy(rows: SearchRowLike[], key: 'query' | 'page'): Map<string, SearchRowLike[]> {
  const result = new Map<string, SearchRowLike[]>();

  for (const row of rows) {
    const value = row[key] || '(not set)';
    const list = result.get(value) ?? [];
    list.push(row);
    result.set(value, list);
  }

  return result;
}

function totals(rows: SearchRowLike[]): { clicks: number; impressions: number } {
  return {
    clicks: rows.reduce((sum, row) => sum + finite(row.clicks), 0),
    impressions: rows.reduce((sum, row) => sum + finite(row.impressions), 0),
  };
}

/**
 * Detect only substantial movements. Thresholds are explicit so a property
 * with 10 impressions cannot generate a "collapse" alarm.
 */
export function detectSearchAnomalies(
  rows: SearchRowLike[],
  previousRows: SearchRowLike[],
  thresholds: SearchThresholds = DEFAULT_SEARCH_THRESHOLDS
): SearchAnomaly[] {
  const findings: SearchAnomaly[] = [];
  const current = totals(rows);
  const previous = totals(previousRows);
  const currentCtr = current.impressions > 0 ? current.clicks / current.impressions : null;
  const previousCtr = previous.impressions > 0 ? previous.clicks / previous.impressions : null;

  const totalDelta = searchDeltaPercent(current.impressions, previous.impressions);
  if (
    previous.impressions >= thresholds.totalMinPreviousImpressions &&
    totalDelta !== null &&
    totalDelta <= -thresholds.totalDropPercent
  ) {
    findings.push({
      key: 'total_impressions_drop',
      scope: 'total',
      metric: 'impressions',
      direction: 'drop',
      label: 'Показы',
      current: current.impressions,
      previous: previous.impressions,
      deltaPercent: totalDelta,
      sample: previous.impressions,
      severity: 'warning',
      note: `Порог: не менее ${thresholds.totalMinPreviousImpressions} показов в предыдущем окне и падение не менее ${thresholds.totalDropPercent}%.`,
    });
  }

  const clickDelta = searchDeltaPercent(current.clicks, previous.clicks);
  if (
    previous.clicks >= thresholds.totalMinPreviousClicks &&
    clickDelta !== null &&
    clickDelta <= -thresholds.totalDropPercent
  ) {
    findings.push({
      key: 'total_clicks_drop',
      scope: 'total',
      metric: 'clicks',
      direction: 'drop',
      label: 'Клики',
      current: current.clicks,
      previous: previous.clicks,
      deltaPercent: clickDelta,
      sample: previous.clicks,
      severity: 'warning',
      note: `Порог: не менее ${thresholds.totalMinPreviousClicks} кликов в предыдущем окне и падение не менее ${thresholds.totalDropPercent}%.`,
    });
  }

  if (
    previous.impressions >= thresholds.ctrMinPreviousImpressions &&
    currentCtr !== null &&
    previousCtr !== null &&
    previousCtr > 0
  ) {
    const ctrDelta = ((currentCtr - previousCtr) / previousCtr) * 100;
    if (ctrDelta <= -thresholds.ctrDropPercent) {
      findings.push({
        key: 'total_ctr_drop',
        scope: 'total',
        metric: 'ctr',
        direction: 'drop',
        label: 'CTR',
        current: currentCtr * 100,
        previous: previousCtr * 100,
        deltaPercent: ctrDelta,
        sample: previous.impressions,
        severity: 'warning',
        note: `Порог: не менее ${thresholds.ctrMinPreviousImpressions} показов и падение CTR не менее ${thresholds.ctrDropPercent}%.`,
      });
    }
  }

  for (const key of ['page', 'query'] as const) {
    const currentGroups = aggregateBy(rows, key);
    const previousGroups = aggregateBy(previousRows, key);

    for (const [label, previousGroup] of previousGroups) {
      const previousTotals = totals(previousGroup);
      const currentTotals = currentGroups.has(label)
        ? totals(currentGroups.get(label) ?? [])
        : { clicks: 0, impressions: 0 };
      const loss = previousTotals.impressions - currentTotals.impressions;
      const delta = searchDeltaPercent(currentTotals.impressions, previousTotals.impressions);

      if (
        previousTotals.impressions < thresholds.segmentMinPreviousImpressions ||
        loss < thresholds.segmentMinAbsoluteLoss ||
        delta === null ||
        delta > -thresholds.segmentDropPercent
      ) {
        continue;
      }

      findings.push({
        key: `${key}_impressions_drop:${label}`,
        scope: key,
        metric: 'impressions',
        direction: 'drop',
        label,
        current: currentTotals.impressions,
        previous: previousTotals.impressions,
        deltaPercent: delta,
        sample: previousTotals.impressions,
        severity: 'warning',
        note: `Порог: не менее ${thresholds.segmentMinPreviousImpressions} показов ранее, потеря не менее ${thresholds.segmentMinAbsoluteLoss} показов и падение не менее ${thresholds.segmentDropPercent}%.`,
      });
    }
  }

  return findings
    .sort((a, b) => Math.abs(b.previous - b.current) - Math.abs(a.previous - a.current))
    .slice(0, 12);
}

/** Trim rows after the last day Search Console is expected to have finalised. */
export function rowsUpTo<T extends { metric_date: string }>(
  rows: T[],
  expectedEnd: string | null
): T[] {
  if (!expectedEnd) return rows;
  return rows.filter((row) => row.metric_date <= expectedEnd);
}

export function expectedSearchDataEnd(input: {
  today: string;
  reportingDelayDays?: number;
}): string {
  const delay = Math.max(0, input.reportingDelayDays ?? GSC_REPORTING_DELAY_DAYS);
  const date = new Date(`${input.today}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - delay);
  return date.toISOString().slice(0, 10);
}

export function stripSegmentComparison(segment: SearchSegmentSummary): void {
  segment.previousClicks = null;
  segment.previousImpressions = null;
  segment.previousCtr = null;
  segment.previousPosition = null;
  segment.clicksDeltaPercent = null;
  segment.impressionsDeltaPercent = null;
}

export function stripBrandComparison(split: SearchBrandSplit): void {
  stripSegmentComparison(split.brand);
  stripSegmentComparison(split.nonBrand);
}
