/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { pageDetailSection, renderReport } from '../report';
import type { AnalyticsDataset, WebsiteQuestion } from '../types';

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
    comparisonRequested: false,
  },
  generatedAt: '2026-11-10T12:00:00.000Z',
  sources: [],
  ga4: {
    available: true,
    pages: [
      { key: '/flow', label: '/flow', value: 120, previous: null, deltaPercent: null, share: 20 },
      { key: '/', label: '/', value: 500, previous: null, deltaPercent: null, share: 80 },
    ],
    landingPages: [
      { key: '/flow', label: '/flow', value: 42, previous: null, deltaPercent: null, share: 10 },
    ],
    traffic: {
      publicPageViews: 620,
      ownerAdminPageViews: 20,
      automatedPageViews: 0,
      publicLandingSessions: 300,
      ownerAdminLandingSessions: 4,
      automatedLandingSessions: 0,
      excludedPaths: ['/admin'],
      note: 'test',
    },
  },
  gsc: {
    available: true,
    pages: [
      {
        key: '/flow',
        label: '/flow',
        value: 9,
        previous: null,
        deltaPercent: null,
        share: 3,
        extra: { impressions: 240, ctr: 0.0375, position: 8.4 },
      },
    ],
  },
  internal: {
    conversations: {
      byStartPage: [
        { key: '/flow', label: '/flow', value: 7, previous: null, deltaPercent: null, share: 10 },
      ],
    },
    confirmedSubscriptionsByStartPage: [
      { key: '/flow', label: '/flow', value: 2, previous: null, deltaPercent: null, share: 5 },
    ],
  },
  contentMatches: [],
} as unknown as AnalyticsDataset;

describe('exact page analytics', () => {
  it('uses only the requested URL for each metric', () => {
    const markdown = pageDetailSection(dataset, 'ru', '/flow');

    expect(markdown).toContain('Страница: /flow');
    expect(markdown).toContain('120');
    expect(markdown).toContain('42');
    expect(markdown).toContain('9');
    expect(markdown).toContain('240');
    expect(markdown).toContain('7');
    expect(markdown).not.toContain('500');
    expect(markdown).toContain('не суммируются');
  });

  it('does not present missing page rows as zero traffic', () => {
    const markdown = pageDetailSection(dataset, 'ru', '/unframed');

    expect(markdown).toContain('нет строк');
    expect(markdown).toContain('не означает');
    expect(markdown).not.toContain('| 0 |');
  });

  it('keeps a Bluesky report focused on Bluesky instead of the site headline', () => {
    const metric = (label: string, value: number) => ({
      key: label,
      label,
      value,
      previous: null,
      deltaPercent: null,
      unit: 'count' as const,
      source: 'bluesky' as const,
      definition: label,
      precision: 'not reach',
      available: true,
    });
    const blueskyDataset = {
      period: dataset.period,
      generatedAt: dataset.generatedAt,
      sources: [
        {
          provider: 'bluesky',
          label: 'Bluesky',
          status: 'connected',
          configured: true,
          connected: true,
          externalId: null,
          accountLabel: null,
          scopes: [],
          externalMeta: null,
          lastCheckedAt: null,
          lastSyncAt: null,
          lastSuccessAt: null,
          lastSyncStatus: 'connected',
          lastErrorCode: null,
          lastErrorMessage: null,
          dataFrom: null,
          dataTo: null,
          actionRequired: null,
        },
      ],
      ga4: { available: false, limitations: [] },
      gsc: { available: false, limitations: [] },
      umami: { available: false, limitations: [] },
      internal: { limitations: [] },
      bluesky: {
        available: true,
        profile: {
          handle: 'merkurov.bsky.social',
          displayName: 'Anton Merkurov',
          did: null,
          followers: 33,
          follows: 10,
          posts: 12,
        },
        totals: {
          followers: metric('Подписчики Bluesky', 33),
          posts: metric('Посты Bluesky', 12),
          likes: metric('Лайки постов', 50),
          reposts: metric('Репосты', 6),
          replies: metric('Ответы', 3),
          engagement: metric('Взаимодействия (расчётно)', 59),
        },
        posts: [],
        topPosts: [],
        siteLinkedPosts: [],
        limitations: ['Bluesky отдаёт публичные счётчики, но не уникальный охват.'],
      },
    } as unknown as AnalyticsDataset;
    const question = {
      website: true,
      scope: 'bluesky',
      wantsComparison: false,
      wantsProblems: false,
      wantsRecommendations: false,
      project: null,
      periodKey: 'last_7_days',
    } as WebsiteQuestion;

    const markdown = renderReport(
      blueskyDataset,
      question,
      'ru',
      {
        verifiedFacts: [],
        interpretation: [],
        hypotheses: [],
        recommendations: [],
        limitations: [],
      },
      [],
      []
    );

    expect(markdown.startsWith('## Bluesky')).toBe(true);
    expect(markdown).toContain('Подписчики Bluesky');
    expect(markdown).toContain('не уникальный охват');
    expect(markdown).not.toContain('Состояние сайта');
    expect(markdown).not.toContain('PUBLIC PRESENCE');
  });
});
