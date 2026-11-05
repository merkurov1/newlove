import { emptyCommercialSummary, type CommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import type { MetricState, WorkspaceMetric } from '../types';
import {
  ACTIVITY_STATE_COPY,
  aggregateActivityState,
  buildOwnerOverallStatus,
  compactBrainStatus,
} from '../status';

function metric(key: WorkspaceMetric['key'], state: MetricState | null): WorkspaceMetric {
  return {
    key,
    label: key,
    current: 10,
    periodCount: 2,
    previousCount: 1,
    state,
    series: state ? [0, 0, 1, 0, 1, 0, 0] : null,
    available: state !== null,
  };
}

function metrics(...states: Array<MetricState | null>): WorkspaceMetric[] {
  return states.map((state, index) => metric((['users', 'subscribers', 'flow', 'conversations', 'media'] as const)[index], state));
}

function commercial(overrides: Partial<CommercialSummary> = {}): CommercialSummary {
  const base = emptyCommercialSummary('last_7_days');
  return { ...base, complete: true, errors: [], ...overrides };
}

function paid(paidCount: number, flowSubscriptions = 0, prior = 0): CommercialSummary {
  const base = commercial();
  return {
    ...base,
    current: { ...base.current, paidCount, flowSubscriptions },
    previous: { ...base.previous, paidCount: prior },
  };
}

function brain(overrides: Partial<BrainStatusSnapshot> = {}): BrainStatusSnapshot {
  return {
    state: 'stable',
    label: 'Stable',
    summary: '',
    checkedAt: new Date().toISOString(),
    stale: false,
    storageAvailable: true,
    retrievalAvailable: true,
    embeddingProviderAvailable: true,
    metrics: {
      activeRecords: 5,
      archivedRecords: 0,
      uncertainRecords: 0,
      openTasks: 0,
      overdueTasks: 0,
      staleTemporary: 0,
      conflicts: 0,
      embeddingsReady: 5,
      embeddingsPending: 0,
      embeddingsFailed: 0,
      linkedSupersessions: 0,
    },
    issues: [],
    ...overrides,
  };
}

describe('owner overall status', () => {
  it('is calm only when every source is healthy and quiet', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('стоит', 'тихо', 'стоит', 'тихо', 'стоит'),
      commercial: commercial(),
      brain: brain(),
    });

    expect(result.state).toBe('calm');
    expect(result.headline).toBe('Всё спокойно.');
  });

  it('reports movement when growth exists without problems', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('растёт', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: commercial(),
      brain: brain(),
    });

    expect(result.state).toBe('movement');
    expect(result.headline).toBe('Есть движение.');
  });

  it('reports questions for a decline', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('падает', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: commercial(),
      brain: brain(),
    });

    expect(result.state).toBe('questions');
    expect(result.headline).toBe('Есть вопросы.');
  });

  it('reports questions for mixed growth and decline', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('растёт', 'падает', 'тихо', 'стоит', 'тихо'),
      commercial: commercial(),
      brain: brain(),
    });

    expect(result.state).toBe('questions');
  });

  it('reports questions for a confirmed revenue drop', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('стоит', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: paid(0, 0, 3),
      brain: brain(),
    });

    expect(result.state).toBe('questions');
  });

  it('reports incomplete when a source is missing', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('стоит', 'стоит', null, 'тихо', 'стоит'),
      commercial: commercial(),
      brain: brain(),
    });

    expect(result.state).toBe('incomplete');
    expect(result.headline).toBe('Данные неполные.');
  });

  it('reports incomplete when commercial sources are partial', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('стоит', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: commercial({ complete: false }),
      brain: brain(),
    });

    expect(result.state).toBe('incomplete');
  });

  it('reports questions for a severe technical or memory error', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('стоит', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: commercial(),
      brain: brain({ state: 'degraded', storageAvailable: false }),
    });

    expect(result.state).toBe('questions');
  });

  it('reports questions for memory that needs attention', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('стоит', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: commercial(),
      brain: brain({ state: 'attention' }),
    });

    expect(result.state).toBe('questions');
  });

  it('reports questions for a severe metric decline', () => {
    const result = buildOwnerOverallStatus({
      metrics: metrics('тревога', 'стоит', 'тихо', 'стоит', 'тихо'),
      commercial: commercial(),
      brain: brain(),
    });

    expect(result.state).toBe('questions');
  });
});

describe('project activity aggregation', () => {
  it('is quiet when all activity is low', () => {
    expect(aggregateActivityState(metrics('тихо', 'тихо', 'тихо', 'тихо', 'тихо'))).toBe(
      'тихо'
    );
  });

  it('is stable when indicators hold', () => {
    expect(aggregateActivityState(metrics('стоит', 'стоит', 'тихо', 'стоит', 'тихо'))).toBe(
      'ровно'
    );
  });

  it('grows when positive movement dominates', () => {
    expect(aggregateActivityState(metrics('растёт', 'стоит', 'тихо', 'стоит', 'тихо'))).toBe(
      'растёт'
    );
  });

  it('surges when exceptional growth is present', () => {
    expect(aggregateActivityState(metrics('пухнет', 'стоит', 'тихо', 'стоит', 'тихо'))).toBe(
      'пухнет'
    );
  });

  it('falls when negative trends dominate', () => {
    expect(aggregateActivityState(metrics('падает', 'стоит', 'тихо', 'стоит', 'тихо'))).toBe(
      'падает'
    );
  });

  it('is mixed when growth and decline coexist', () => {
    expect(aggregateActivityState(metrics('растёт', 'падает', 'тихо', 'стоит', 'тихо'))).toBe(
      'смешанно'
    );
  });

  it('prioritises alarm above growth', () => {
    expect(aggregateActivityState(metrics('растёт', 'тревога', 'тихо', 'стоит', 'тихо'))).toBe(
      'тревога'
    );
  });

  it('does not invent a trend from insufficient data', () => {
    expect(aggregateActivityState(metrics(null, null, null, null, null))).toBe('нет данных');
    expect(aggregateActivityState(metrics('растёт', 'стоит', null, null, null))).toBe(
      'нет данных'
    );
  });

  it('keeps a severe negative signal even with missing sources', () => {
    expect(aggregateActivityState(metrics('тревога', null, null, null, null))).toBe('тревога');
  });

  it('has one short word for every state', () => {
    expect(ACTIVITY_STATE_COPY['нет данных']).toBe('Нет данных');
    expect(ACTIVITY_STATE_COPY.смешанно).toBe('Смешанно');
  });
});

describe('compact memory status', () => {
  it('shows one short healthy line with the real active count', () => {
    expect(compactBrainStatus(brain())).toEqual({
      label: 'Память актуальна · 5 активных записей · OK',
      tone: 'positive',
    });
  });

  it('uses correct Russian plural forms', () => {
    const one = brain();
    one.metrics.activeRecords = 1;
    expect(compactBrainStatus(one).label).toContain('1 активная запись');

    const two = brain();
    two.metrics.activeRecords = 2;
    expect(compactBrainStatus(two).label).toContain('2 активные записи');
  });

  it('shows an explicit storage error', () => {
    const result = compactBrainStatus(brain({ state: 'degraded', storageAvailable: false }));
    expect(result.label).toBe('Память недоступна');
    expect(result.tone).toBe('negative');
  });

  it('shows unresolved conflicts', () => {
    const snapshot = brain({ state: 'attention' });
    snapshot.metrics.conflicts = 2;
    expect(compactBrainStatus(snapshot)).toEqual({
      label: 'Противоречия · 2',
      tone: 'attention',
    });
  });

  it('shows indexing failures', () => {
    const snapshot = brain({ state: 'attention' });
    snapshot.metrics.embeddingsFailed = 3;
    expect(compactBrainStatus(snapshot).label).toBe('Ошибка индексации · 3');
  });

  it('shows a stale snapshot without pretending it is fresh', () => {
    const result = compactBrainStatus(brain({ stale: true }));
    expect(result.label).toContain('Последнее известное');
    expect(result.tone).toBe('attention');
  });
});
