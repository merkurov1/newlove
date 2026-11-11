/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { compactOverviewSection } from '../report';
import type { AnalyticsDataset } from '../types';

function metric(value: number | null, previous: number | null = null) {
  return {
    key: 'x',
    label: 'x',
    value,
    previous,
    deltaPercent: previous === null || previous === 0 ? null : ((value! - previous) / previous) * 100,
    unit: 'count' as const,
    source: 'google_analytics' as const,
    definition: 'test',
    precision: 'test',
    available: value !== null,
  };
}

const dataset = {
  period: {
    key: 'last_7_days',
    label: 'last 7 days',
    timezone: 'Europe/London',
    start: '2026-11-04',
    end: '2026-11-10',
    previousStart: '2026-10-28',
    previousEnd: '2026-11-03',
    previousLabel: 'previous 7 days',
    comparisonRequested: true,
  },
  generatedAt: '2026-11-10T12:00:00.000Z',
  coverage: [],
  previousCoverage: [],
  dataGaps: [],
  sources: [
    { label: 'Google Analytics 4', status: 'connected', lastSyncStatus: 'connected' },
    { label: 'Bluesky', status: 'connected', lastSyncStatus: 'connected' },
  ],
  ga4: {
    available: true,
    totals: {
      sessions: metric(215, 78),
      activeUsers: metric(78),
      engagementRate: metric(60.5),
    },
    channels: [{ key: 'Direct', label: 'Direct', value: 90, previous: null, deltaPercent: null, share: 40 }],
    pages: [{ key: '/', label: '/', value: 149, previous: null, deltaPercent: null, share: 50 }],
    traffic: {
      publicPageViews: 1944,
      ownerAdminPageViews: 1062,
      automatedPageViews: 0,
      publicLandingSessions: 154,
      ownerAdminLandingSessions: 55,
      automatedLandingSessions: 0,
      excludedPaths: ['/admin/pierrot'],
      note: 'test',
    },
  },
  gsc: { totals: { clicks: metric(0) } },
  bluesky: {
    available: true,
    totals: { followers: metric(33), engagement: metric(24991) },
  },
  internal: {
    confirmedSubscriptions: 4,
    previousConfirmedSubscriptions: 0,
    donations: { count: 0, available: true },
    newsletter: { subscribers: { ru: 18, en: 7 } },
  },
} as unknown as AnalyticsDataset;

describe('compact public presence report', () => {
  it('never substitutes total GA4 sessions for unavailable public landing sessions', () => {
    const unavailable = {
      ...dataset,
      ga4: {
        ...dataset.ga4,
        traffic: {
          ...dataset.ga4.traffic,
          publicLandingSessions: null,
        },
      },
    } as unknown as AnalyticsDataset;

    const markdown = compactOverviewSection(unavailable, 'ru', []);

    expect(markdown).toContain('публичные landing-сессии недоступны отдельно');
    expect(markdown).toContain('всего GA4 sessions: 215');
    expect(markdown).not.toContain('215 публичных landing-сессий');
  });

  it('returns a short overview using public landing sessions and the unified sources', () => {
    const markdown = compactOverviewSection(dataset, 'ru', []);

    expect(markdown).toContain('PUBLIC PRESENCE');
    expect(markdown).toContain('154 публичных landing-сессий');
    expect(markdown).toContain('Bluesky');
    expect(markdown).toContain('рассылки RU 18 / EN 7');
    expect(markdown).not.toContain('### Источники');
    expect(markdown.length).toBeLessThan(2500);
  });
});
