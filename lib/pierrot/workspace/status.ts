import {
  commercialHomeStatus,
  russianCountLabel,
  type CommercialSummary,
} from '@/lib/pierrot/commercialSummary';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
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
  растёт: 'растёт',
  стоит: 'стоит',
  падает: 'падает',
  тихо: 'тихо',
  пухнет: 'пухнет',
  тревога: 'тревога',
};

export type MetricDotTone = 'growth' | 'attention' | 'neutral' | 'missing';

export function metricDotTone(state: MetricState | null): MetricDotTone {
  if (!state) return 'missing';
  if (state === 'растёт' || state === 'пухнет') return 'growth';
  if (state === 'падает' || state === 'тревога') return 'attention';
  return 'neutral';
}

export function classifyMetricState(current: number, previous: number): MetricState {
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
export type OwnerOverallState = 'calm' | 'movement' | 'questions' | 'incomplete';

export type OwnerOverallStatus = {
  state: OwnerOverallState;
  headline: 'Всё спокойно.' | 'Есть движение.' | 'Есть вопросы.' | 'Данные неполные.';
};

const OVERALL_HEADLINE: Record<OwnerOverallState, OwnerOverallStatus['headline']> = {
  calm: 'Всё спокойно.',
  movement: 'Есть движение.',
  questions: 'Есть вопросы.',
  incomplete: 'Данные неполные.',
};

/**
 * Deterministic owner-home summary. No model call and no invented cause: each
 * branch only reflects a state that is present in the supplied snapshot.
 *
 * Order matters. Real problems (storage errors, severe decline, confirmed
 * revenue drop) win over missing data, missing data wins over growth, and
 * calm is only possible when every source is healthy and quiet.
 */
export function buildOwnerOverallStatus(input: {
  metrics: WorkspaceMetric[];
  commercial: CommercialSummary;
  brain: BrainStatusSnapshot | null;
  projects?: {
    activeProjects: number | null;
    activeTasks: number | null;
    activeDevTasks: number | null;
  } | null;
}): OwnerOverallStatus {
  const { metrics, commercial, brain, projects } = input;

  const missingMetrics = metrics.filter((metric) => metric.state === null).length;
  const hasGrowth = metrics.some(
    (metric) => metric.state === 'растёт' || metric.state === 'пухнет'
  );
  const hasDecline = metrics.some(
    (metric) => metric.state === 'падает' || metric.state === 'тревога'
  );
  const hasSevereDecline = metrics.some((metric) => metric.state === 'тревога');

  const money = commercialHomeStatus(commercial);

  const brainError = Boolean(
    brain &&
    (brain.state === 'degraded' ||
      !brain.storageAvailable ||
      brain.issues.some((issue) => issue.severity === 'error'))
  );
  const brainConcern = Boolean(
    brain &&
    (brain.state === 'attention' ||
      brain.metrics.conflicts > 0 ||
      brain.metrics.overdueTasks > 0 ||
      brain.metrics.embeddingsFailed > 0)
  );
  const brainIncomplete = Boolean(
    !brain ||
    brain.stale ||
    brain.state === 'updating' ||
    (brain.metrics.embeddingsPending > 0 &&
      !brain.metrics.embeddingsFailed &&
      brain.metrics.conflicts === 0)
  );

  if (brainError || brainConcern || hasSevereDecline || money.label === 'Нет денег') {
    return { state: 'questions', headline: OVERALL_HEADLINE.questions };
  }

  if (hasDecline) {
    return { state: 'questions', headline: OVERALL_HEADLINE.questions };
  }

  const projectsIncomplete = Boolean(
    projects &&
    (projects.activeProjects === null ||
      projects.activeTasks === null ||
      projects.activeDevTasks === null)
  );
  const hasProjectWork = Boolean(
    projects &&
    ((projects.activeTasks ?? 0) > 0 || (projects.activeDevTasks ?? 0) > 0)
  );

  if (
    missingMetrics > 0 ||
    !commercial.complete ||
    money.label === 'Данные неполные' ||
    brainIncomplete ||
    projectsIncomplete
  ) {
    return { state: 'incomplete', headline: OVERALL_HEADLINE.incomplete };
  }

  if (hasGrowth || money.label === 'Разбогатели!' || hasProjectWork) {
    return { state: 'movement', headline: OVERALL_HEADLINE.movement };
  }

  return { state: 'calm', headline: OVERALL_HEADLINE.calm };
}

export type ActivityState =
  'тревога' | 'смешанно' | 'падает' | 'пухнет' | 'растёт' | 'ровно' | 'тихо' | 'нет данных';

export const ACTIVITY_STATE_COPY: Record<ActivityState, string> = {
  тревога: 'Тревога',
  смешанно: 'Смешанно',
  падает: 'Падает',
  пухнет: 'Пухнет',
  растёт: 'Растёт',
  ровно: 'Ровно',
  тихо: 'Тихо',
  'нет данных': 'Нет данных',
};

/** Fewer available metrics than this are not enough for one aggregate word. */
export const MIN_ACTIVITY_METRICS = 3;

/**
 * One-word aggregation for the home screen. All five source metrics are still
 * loaded and all negative signals are preserved; missing metrics are reflected
 * when there is not enough data for a responsible aggregate.
 */
export function aggregateActivityState(metrics: WorkspaceMetric[]): ActivityState {
  const available = metrics.filter((metric) => metric.state !== null);
  const states = available.map((metric) => metric.state as MetricState);

  const declines = states.filter((state) => state === 'падает' || state === 'тревога').length;
  const growths = states.filter((state) => state === 'растёт' || state === 'пухнет').length;
  const surges = states.filter((state) => state === 'пухнет').length;
  const alarms = states.filter((state) => state === 'тревога').length;

  if (available.length < MIN_ACTIVITY_METRICS) return 'нет данных';
  if (declines > 0 && growths > 0) return 'смешанно';
  // A single metric can be noisy (or represent a one-off import). The
  // aggregate only escalates to an alarm when several independent metrics
  // confirm a severe decline; otherwise it remains a factual decline.
  if (alarms >= 2 && declines >= 3) return 'тревога';
  if (declines > 0) return 'падает';
  if (surges > 0) return 'пухнет';
  if (growths > 0) return 'растёт';
  if (states.every((state) => state === 'тихо')) return 'тихо';

  return 'ровно';
}

export type BrainCompactTone = 'positive' | 'attention' | 'negative' | 'missing';

export type BrainCompactStatus = {
  label: string;
  tone: BrainCompactTone;
};

function activeRecordsLabel(count: number): string {
  return russianCountLabel(count, 'активная запись', 'активные записи', 'активных записей');
}

/**
 * Closed-state memory line. Healthy memory is exactly one short sentence:
 * no paragraphs, no redundant timestamps, no repeated status labels.
 * Deviations replace that sentence with one explicit reason.
 */
export function compactBrainStatus(snapshot: BrainStatusSnapshot | null): BrainCompactStatus {
  if (!snapshot) {
    return { label: 'Память недоступна', tone: 'missing' };
  }

  const records = activeRecordsLabel(snapshot.metrics.activeRecords);

  if (!snapshot.storageAvailable || snapshot.state === 'degraded') {
    return { label: 'Память недоступна', tone: 'negative' };
  }

  if (!snapshot.retrievalAvailable) {
    return { label: 'Поиск по памяти недоступен', tone: 'negative' };
  }

  if (snapshot.metrics.conflicts > 0) {
    return {
      label: `Противоречия · ${snapshot.metrics.conflicts}`,
      tone: 'attention',
    };
  }

  if (snapshot.metrics.embeddingsFailed > 0) {
    return {
      label: `Ошибка индексации · ${snapshot.metrics.embeddingsFailed}`,
      tone: 'attention',
    };
  }

  if (snapshot.metrics.overdueTasks > 0) {
    return {
      label: `Просрочено · ${snapshot.metrics.overdueTasks}`,
      tone: 'attention',
    };
  }

  if (snapshot.metrics.embeddingsPending > 0) {
    return {
      label: `Индексация · ${snapshot.metrics.embeddingsPending}`,
      tone: 'attention',
    };
  }

  if (snapshot.stale) {
    return { label: `Последнее известное · ${records}`, tone: 'attention' };
  }

  if (!snapshot.embeddingProviderAvailable) {
    return { label: 'Индексация недоступна', tone: 'attention' };
  }

  if (snapshot.metrics.staleTemporary > 0) {
    return {
      label: `Устаревшие заметки · ${snapshot.metrics.staleTemporary}`,
      tone: 'attention',
    };
  }

  if (snapshot.state !== 'stable') {
    return { label: `Память требует внимания · ${records}`, tone: 'attention' };
  }

  return {
    label: `Память актуальна · ${records} · OK`,
    tone: 'positive',
  };
}

export function buildOverviewSummary(metrics: WorkspaceMetric[]): string {
  const available = metrics.filter((metric) => metric.state !== null);

  if (available.length === 0) {
    return 'Нет данных для сравнения. Показатели не рассчитаны.';
  }

  const noteworthy = available.filter((metric) => {
    if (metric.state === 'стоит' || metric.state === 'тихо') return false;
    return Boolean(
      metric.bulkImportCurrent ||
      metric.bulkImportPrevious ||
      metric.changeRatio === undefined ||
      (metric.changeRatio !== null && Math.abs(metric.changeRatio) >= 0.1)
    );
  });

  if (noteworthy.length === 0) {
    return 'Показатели держатся ровно. Ничего не требует внимания.';
  }

  const sentences = noteworthy.map((metric) => {
    const current = metric.comparisonCurrent ?? metric.periodCount;
    const previous = metric.comparisonPrevious ?? metric.previousCount;
    const ratio = metric.changeRatio;
    const percent =
      ratio !== undefined && ratio !== null
        ? ` (${ratio >= 0 ? '+' : '−'}${Math.round(Math.abs(ratio) * 100)}%, ${current} против ${previous})`
        : ` (${current} сейчас, ${previous} ранее)`;
    if (metric.bulkImportPrevious) {
      return `${metric.label} пополняется${percent}; предыдущий период искажён разовым импортом ${metric.bulkImportPrevious} записей`;
    }
    if (metric.state === 'падает' || metric.state === 'тревога') {
      return `${metric.label} ниже предыдущего периода${percent}`;
    }
    return `${metric.label} ${metric.state}${percent}`;
  });
  if (sentences.length === 1) return `${sentences[0]}.`;
  if (sentences.length === 2) return `${sentences[0]} и ${sentences[1]}.`;
  return `${sentences.slice(0, -1).join(', ')} и ${sentences[sentences.length - 1]}.`;
}
