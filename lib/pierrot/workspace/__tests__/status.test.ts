import {
  METRIC_STATUS_THRESHOLDS,
  buildOverviewSummary,
  classifyMetricState,
  metricDotTone,
} from '../status';
import type { WorkspaceMetric } from '../types';

function metric(
  label: string,
  state: WorkspaceMetric['state'],
  key: WorkspaceMetric['key'] = 'users'
): WorkspaceMetric {
  return {
    key,
    label,
    current: 10,
    periodCount: 2,
    previousCount: 1,
    state,
    series: [0, 0, 1, 0, 1, 0, 0],
    available: true,
  };
}

describe('metric status mapping', () => {
  it('uses quiet for tiny absolute numbers', () => {
    expect(classifyMetricState(0, 0)).toBe('тихо');
    expect(classifyMetricState(2, 1)).toBe('тихо');
    expect(classifyMetricState(2, 2)).toBe('тихо');
  });

  it('covers every documented threshold', () => {
    expect(classifyMetricState(11, 10)).toBe('растёт');
    expect(classifyMetricState(15, 10)).toBe('пухнет');
    expect(classifyMetricState(10, 10)).toBe('стоит');
    expect(classifyMetricState(9, 10)).toBe('стоит');
    expect(classifyMetricState(8, 10)).toBe('падает');
    expect(classifyMetricState(5, 10)).toBe('тревога');
  });

  it('keeps thresholds in one documented object', () => {
    expect(METRIC_STATUS_THRESHOLDS).toMatchObject({
      quietMax: 2,
      growAt: 0.1,
      surgeAt: 0.5,
      fallAt: -0.1,
      alarmAt: -0.4,
    });
  });

  it('maps states to dot tones without inventing states', () => {
    expect(metricDotTone('растёт')).toBe('growth');
    expect(metricDotTone('пухнет')).toBe('growth');
    expect(metricDotTone('падает')).toBe('attention');
    expect(metricDotTone('тревога')).toBe('attention');
    expect(metricDotTone('стоит')).toBe('neutral');
    expect(metricDotTone('тихо')).toBe('neutral');
    expect(metricDotTone(null)).toBe('missing');
  });

  it('builds a factual summary with values and change direction', () => {
    const summary = buildOverviewSummary([
      metric('Пользователи', 'растёт', 'users'),
      metric('Подписчики', 'стоит', 'subscribers'),
      metric('Flow', 'падает', 'flow'),
      metric('Диалоги', 'тихо', 'conversations'),
      metric('Медиа', 'тревога', 'media'),
    ]);

    expect(summary).toContain('Пользователи растёт');
    expect(summary).toContain('Flow ниже предыдущего периода');
    expect(summary).toContain('Медиа ниже предыдущего периода');
  });

  it('states missing data explicitly instead of zero', () => {
    const summary = buildOverviewSummary([
      { ...metric('Пользователи', null), available: false, series: null },
    ]);
    expect(summary).toBe('Нет данных для сравнения. Показатели не рассчитаны.');
  });

  it('does not turn an isolated media import into a system alarm', () => {
    const summary = buildOverviewSummary([
      { ...metric('Пользователи', 'тихо', 'users'), current: 0, periodCount: 0, previousCount: 0 },
      {
        ...metric('Подписчики', 'тихо', 'subscribers'),
        current: 0,
        periodCount: 0,
        previousCount: 0,
      },
      {
        ...metric('Flow', 'растёт', 'flow'),
        periodCount: 17,
        previousCount: 15,
        comparisonCurrent: 17,
        comparisonPrevious: 15,
        changeRatio: 2 / 15,
      },
      {
        ...metric('Диалоги', 'падает', 'conversations'),
        periodCount: 51,
        previousCount: 90,
        comparisonCurrent: 51,
        comparisonPrevious: 90,
        changeRatio: -39 / 90,
      },
      {
        ...metric('Медиа', 'пухнет', 'media'),
        periodCount: 42,
        previousCount: 219,
        comparisonCurrent: 42,
        comparisonPrevious: 0,
        changeRatio: null,
        bulkImportPrevious: 219,
      },
    ]);

    expect(summary).toContain('Flow растёт');
    expect(summary).toContain('Диалоги ниже предыдущего периода');
    expect(summary).toContain('разовым импортом 219 записей');
    expect(summary).not.toContain('тревога');
  });
});
