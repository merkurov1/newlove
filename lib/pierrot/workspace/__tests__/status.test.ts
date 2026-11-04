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

  it('builds a summary only from the five states', () => {
    const summary = buildOverviewSummary([
      metric('Пользователи', 'растёт', 'users'),
      metric('Подписчики', 'стоит', 'subscribers'),
      metric('Flow', 'падает', 'flow'),
      metric('Диалоги', 'тихо', 'conversations'),
      metric('Медиа', 'тревога', 'media'),
    ]);

    expect(summary).toBe('Пользователи — растёт, Flow — падает и Медиа — тревога.');
    expect(summary).not.toMatch(/\d/);
  });

  it('states missing data explicitly instead of zero', () => {
    const summary = buildOverviewSummary([
      { ...metric('Пользователи', null), available: false, series: null },
    ]);
    expect(summary).toBe('Нет данных для сравнения. Показатели не рассчитаны.');
  });
});
