import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { WorkspaceOverview } from '../types';
import {
  OVERVIEW_CACHE_TTL_MS,
  OVERVIEW_CACHE_VERSION,
  clearOverviewCaches,
  overviewCacheKey,
  parseOverviewCache,
  readOverviewCache,
  serializeOverviewCache,
  writeOverviewCache,
} from '../cache';

const OWNER = 'owner-1';

function overview(overrides: Partial<WorkspaceOverview> = {}): WorkspaceOverview {
  return {
    period: 7,
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-08T00:00:00.000Z',
    metrics: [
      ['users', 'Пользователи'],
      ['subscribers', 'Подписчики'],
      ['flow', 'Flow'],
      ['conversations', 'Диалоги'],
      ['media', 'Медиа'],
    ].map(([key, label]) => ({
      key: key as WorkspaceOverview['metrics'][number]['key'],
      label,
      current: 10,
      periodCount: 2,
      previousCount: 1,
      state: 'стоит' as const,
      series: [0, 0, 1, 0, 1, 0, 0],
      available: true,
    })),
    commercial: emptyCommercialSummary('last_7_days'),
    summary: 'Показатели держатся ровно.',
    generatedAt: '2026-11-08T00:00:00.000Z',
    ...overrides,
  };
}

describe('owner overview cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a valid owner snapshot', () => {
    writeOverviewCache(OWNER, overview(), '2026-11-08T00:00:00.000Z');

    const cached = readOverviewCache(OWNER, Date.parse('2026-11-08T01:00:00.000Z'));
    expect(cached?.overview.metrics).toHaveLength(5);
    expect(cached?.stale).toBe(false);
    expect(window.localStorage.getItem(overviewCacheKey(OWNER))).toBeTruthy();
  });

  it('marks a snapshot stale after the 24-hour window', () => {
    writeOverviewCache(OWNER, overview(), '2026-11-08T00:00:00.000Z');

    const cached = readOverviewCache(
      OWNER,
      Date.parse('2026-11-08T00:00:00.000Z') + OVERVIEW_CACHE_TTL_MS + 1
    );
    expect(cached?.stale).toBe(true);
  });

  it('rejects malformed, foreign and obsolete caches safely', () => {
    expect(parseOverviewCache('not-json', OWNER)).toBeNull();
    expect(parseOverviewCache(serializeOverviewCache('another-owner', overview()), OWNER)).toBeNull();

    const obsolete = JSON.parse(serializeOverviewCache(OWNER, overview()));
    obsolete.v = OVERVIEW_CACHE_VERSION + 1;
    expect(parseOverviewCache(JSON.stringify(obsolete), OWNER)).toBeNull();

    const brokenMetrics = JSON.parse(serializeOverviewCache(OWNER, overview()));
    brokenMetrics.overview.metrics = [];
    expect(parseOverviewCache(JSON.stringify(brokenMetrics), OWNER)).toBeNull();
  });

  it('clears every namespaced cache on logout', () => {
    writeOverviewCache(OWNER, overview());
    writeOverviewCache('owner-2', overview());
    clearOverviewCaches();

    expect(window.localStorage.getItem(overviewCacheKey(OWNER))).toBeNull();
    expect(window.localStorage.getItem(overviewCacheKey('owner-2'))).toBeNull();
  });
});
