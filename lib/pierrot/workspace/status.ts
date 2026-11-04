import type { MetricState, WorkspaceMetric } from './types';

/**
 * Deterministic status thresholds for the five workspace metrics.
 *
 * All comparisons use the same-length previous period. Small absolute numbers
 * are treated as quiet so two isolated events cannot masquerade as a trend.
 * The vocabulary is intentionally tiny and must not be extended in UI copy.
 */
export const METRIC_STATUS_THRESHOLDS = {
  /** Both periods at or below this count are "тихо". */
  quietMax: 2,
  /** Growth at or above +10% is "растёт". */
  growAt: 0.1,
  /** Growth at or above +50% is "пухнет". */
  surgeAt: 0.5,
  /** Decline deeper than -10% is "падает". */
  fallAt: -0.1,
  /** Decline at or below -40% is "тревога". */
  alarmAt: -0.4,
} as const;

export const METRIC_STATE_COPY: Record<MetricState, string> = {
  'растёт': 'растёт',
  'стоит': 'стоит',
  'падает': 'падает',
  'тихо': 'тихо',
  'пухнет': 'пухнет',
  'тревога': 'тревога',
};

export type MetricDotTone = 'growth' | 'attention' | 'neutral' | 'missing';

export function metricDotTone(state: MetricState | null): MetricDotTone {
  if (!state) return 'missing';
  if (state === 'растёт' || state === 'пухнет') return 'growth';
  if (state === 'падает' || state === 'тревога') return 'attention';
  return 'neutral';
}

export function classifyMetricState(
  current: number,
  previous: number
): MetricState {
  const safeCurrent = Number.isFinite(current) ? Math.max(0, current) : 0;
  const safePrevious = Number.isFinite(previous) ? Math.max(0, previous) : 0;

  if (
    safeCurrent <= METRIC_STATUS_THRESHOLDS.quietMax &&
    safePrevious <= METRIC_STATUS_THRESHOLDS.quietMax
  ) {
    return 'тихо';
  }

  if (safePrevious === 0) {
    return safeCurrent >= METRIC_STATUS_THRESHOLDS.quietMax + 1 ? 'пухнет' : 'растёт';
  }

  const change = (safeCurrent - safePrevious) / safePrevious;

  if (change >= METRIC_STATUS_THRESHOLDS.surgeAt) return 'пухнет';
  if (change >= METRIC_STATUS_THRESHOLDS.growAt) return 'растёт';
  if (change >= METRIC_STATUS_THRESHOLDS.fallAt) return 'стоит';
  if (change > METRIC_STATUS_THRESHOLDS.alarmAt) return 'падает';
  return 'тревога';
}

/**
 * The empty-chat and DASH summary is built only from the five fixed states.
 * It never introduces a fact, number, cause or event that is not present in
 * the metric list.
 */
export function buildOverviewSummary(metrics: WorkspaceMetric[]): string {
  const available = metrics.filter((metric) => metric.state !== null);

  if (available.length === 0) {
    return 'Нет данных для сравнения. Показатели не рассчитаны.';
  }

  const noteworthy = available.filter(
    (metric) => metric.state !== 'стоит' && metric.state !== 'тихо'
  );

  if (noteworthy.length === 0) {
    return 'Показатели держатся ровно. Ничего не требует внимания.';
  }

  return noteworthy
    .map((metric) => `${metric.label} — ${metric.state}`)
    .join(', ')
    .replace(/,([^,]*)$/, ' и$1')
    .concat('.');
}
