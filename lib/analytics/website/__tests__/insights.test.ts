/** @jest-environment node */

import {
  buildEvidence,
  buildFunnel,
  detectAnomalies,
  findContentOpportunities,
  formatMetricValue,
  formatNumber,
} from '../insights';
import type {
  AnalyticsDataset,
  MetricComparison,
  MetricUnit,
} from '../types';

function metric(
  key: string,
  value: number | null,
  previous: number | null = null,
  unit: MetricUnit = 'count'
): MetricComparison {
  return {
    key,
    label: key,
    value,
    previous,
    deltaPercent:
      value === null || previous === null
        ? null
        : previous === 0
          ? null
          : ((value - previous) / previous) * 100,
    unit,
    source: 'google_analytics',
    definition: `${key} definition`,
    precision: `${key} precision`,
    available: value !== null,
  };
}

function dataset(): AnalyticsDataset {
  return {
    period: {
      key: 'last_7_days',
      label: '3 нояб. 2026 — 9 нояб. 2026',
      timezone: 'Europe/London',
      start: '2026-11-03',
      end: '2026-11-09',
      previousStart: '2026-10-27',
      previousEnd: '2026-11-02',
      previousLabel: '27 окт. 2026 — 2 нояб. 2026',
      comparisonRequested: true,
    },
    generatedAt: '2026-11-09T12:00:00.000Z',
    sources: [
      {
        provider: 'google_analytics',
        label: 'Google Analytics 4',
        status: 'connected',
        configured: true,
        connected: true,
        externalId: '123',
        accountLabel: 'Merkurov',
        lastSyncAt: '2026-11-09T11:00:00.000Z',
        lastSuccessAt: '2026-11-09T11:00:00.000Z',
        lastSyncStatus: 'completed',
        lastErrorCode: null,
        lastErrorMessage: null,
        dataFrom: '2026-10-01',
        dataTo: '2026-11-09',
        actionRequired: null,
      },
      {
        provider: 'search_console',
        label: 'Google Search Console',
        status: 'not_connected',
        configured: true,
        connected: false,
        externalId: null,
        accountLabel: null,
        lastSyncAt: null,
        lastSuccessAt: null,
        lastSyncStatus: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        dataFrom: null,
        dataTo: null,
        actionRequired: 'Connect Search Console.',
      },
      {
        provider: 'umami',
        label: 'Umami',
        status: 'not_configured',
        configured: false,
        connected: false,
        externalId: null,
        accountLabel: null,
        lastSyncAt: null,
        lastSuccessAt: null,
        lastSyncStatus: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        dataFrom: null,
        dataTo: null,
        actionRequired: 'Set Umami env vars.',
      },
    ],
    ga4: {
      available: true,
      totals: {
        sessions: metric('sessions', 100, 80),
        activeUsers: metric('activeUsers', 70, 60),
        newUsers: metric('newUsers', 45, 40),
        returningUsersDerived: metric('returningUsersDerived', 25, 20),
        screenPageViews: metric('screenPageViews', 300, 220),
        engagementRate: metric('engagementRate', 62, 58, 'percent'),
        averageEngagementTime: metric('averageEngagementTime', 74, 60, 'seconds'),
        conversions: metric('conversions', 4, 3),
        eventCount: metric('eventCount', 900, 700),
        totalUsers: metric('totalUsers', 72, 62),
      },
      series: [
        { date: '2026-11-03', sessions: 10, activeUsers: 8, newUsers: 5, screenPageViews: 30 },
        { date: '2026-11-04', sessions: 12, activeUsers: 9, newUsers: 6, screenPageViews: 34 },
        { date: '2026-11-05', sessions: 14, activeUsers: 10, newUsers: 6, screenPageViews: 40 },
        { date: '2026-11-06', sessions: 30, activeUsers: 20, newUsers: 12, screenPageViews: 91 },
        { date: '2026-11-07', sessions: 36, activeUsers: 24, newUsers: 14, screenPageViews: 110 },
        { date: '2026-11-08', sessions: 40, activeUsers: 26, newUsers: 15, screenPageViews: 120 },
        { date: '2026-11-09', sessions: 44, activeUsers: 30, newUsers: 16, screenPageViews: 140 },
      ],
      channels: [
        { key: 'Organic Search', label: 'Organic Search', value: 55, previous: 40, deltaPercent: 37.5, share: 55 },
        { key: 'Direct', label: 'Direct', value: 45, previous: 40, deltaPercent: 12.5, share: 45 },
      ],
      sources: [],
      landingPages: [],
      pages: [
        { key: '/flow', label: '/flow', value: 40, previous: 20, deltaPercent: 100, share: 40 },
        { key: '/journal/post', label: '/journal/post', value: 30, previous: 20, deltaPercent: 50, share: 30 },
      ],
      countries: [],
      devices: [],
      events: [],
      limitations: ['GA4 limitation.'],
    },
    gsc: {
      available: true,
      totals: {
        clicks: metric('clicks', 20, 10),
        impressions: metric('impressions', 1000, 500),
        ctr: metric('ctr', 2, 2, 'percent'),
        position: metric('position', 12, 10, 'position'),
      },
      series: [
        { date: '2026-11-03', clicks: 1, impressions: 50, ctr: 2, position: 12 },
        { date: '2026-11-04', clicks: 2, impressions: 70, ctr: 2.8, position: 11 },
        { date: '2026-11-05', clicks: 3, impressions: 90, ctr: 3.3, position: 11 },
        { date: '2026-11-06', clicks: 6, impressions: 300, ctr: 2, position: 12 },
        { date: '2026-11-07', clicks: 8, impressions: 490, ctr: 1.6, position: 13 },
      ],
      queries: [],
      pages: [],
      countries: [],
      devices: [],
      lowCtrPages: [
        {
          page: '/flow',
          clicks: 3,
          impressions: 500,
          ctr: 0.006,
          position: 9,
        },
      ],
      lowCtrQueries: [],
      risingQueries: [
        {
          key: 'how to subscribe to flow',
          label: 'how to subscribe to flow',
          value: 300,
          previous: 100,
          deltaPercent: 200,
          share: null,
        },
      ],
      decliningQueries: [],
      lostPages: [],
      limitations: ['Search Console limitation.'],
    },
    umami: {
      available: false,
      totals: {
        pageviews: metric('pageviews', null),
        visits: metric('visits', null),
        visitors: metric('visitors', null),
      },
      series: [],
      pages: [],
      referrers: [],
      limitations: ['Umami not connected.'],
    },
    internal: {
      available: true,
      confirmedSubscriptions: 3,
      previousConfirmedSubscriptions: 1,
      confirmedSubscriptionsByStartPage: [],
      subscriptionEvents: [
        { key: 'subscription_submitted', label: 'subscription_submitted', value: 10, previous: 4, deltaPercent: 150, share: null },
        { key: 'subscription_confirmed', label: 'subscription_confirmed', value: 2, previous: 1, deltaPercent: 100, share: null },
      ],
      donations: {
        count: 1,
        amountMinor: 2500,
        currency: 'GBP',
        byOffer: [],
        available: true,
      },
      purchases: { count: 0, available: true },
      conversations: {
        total: 12,
        previousTotal: 8,
        byStartPage: [],
        byReferrer: [],
      },
      events: [],
      content: {
        articlesTotal: 30,
        lettersTotal: 40,
        itemsPublished: 80,
        knowledgeDocuments: 200,
        mediaRecords: 100,
      },
      limitations: ['Internal limitation.'],
    },
    projects: [],
    contentMatches: [],
  };
}

describe('website insights', () => {
  it('formats values by their real unit', () => {
    expect(formatMetricValue(metric('sessions', 1234), 'ru')).toMatch(/1.?234/);
    expect(formatMetricValue(metric('engagementRate', 62.4, 50, 'percent'), 'ru')).toBe('62,4%');
    expect(formatMetricValue(metric('averageEngagementTime', 74, 50, 'seconds'), 'ru')).toBe(
      '1 мин 14 сек'
    );
    expect(formatNumber(null, 'ru')).toBe('—');
  });

  it('builds a funnel without blending sources', () => {
    const stages = buildFunnel(dataset(), 'ru');
    const submitted = stages.find((stage) => stage.key === 'subscription_submitted');
    const confirmed = stages.find((stage) => stage.key === 'subscription_confirmed');

    expect(submitted).toMatchObject({ value: 10, source: 'internal' });
    expect(confirmed).toMatchObject({ value: 2, source: 'internal' });
    expect(stages.find((stage) => stage.key === 'sessions')).toMatchObject({
      value: 100,
      source: 'google_analytics',
    });
  });

  it('detects a subscription confirmation gap with facts and hypotheses', () => {
    const findings = detectAnomalies(dataset(), 'ru');
    const gap = findings.find((finding) => finding.key === 'subscription_confirmation_gap');

    expect(gap).toBeDefined();
    expect(gap?.facts.join(' ')).toContain('10');
    expect(gap?.hypothesis.length).toBeGreaterThan(0);
    expect(gap?.recommendation.length).toBeGreaterThan(0);
  });

  it('finds low-CTR pages and rising queries as opportunities', () => {
    const findings = findContentOpportunities(dataset(), 'ru');
    expect(findings.some((finding) => finding.key.startsWith('low_ctr_page:'))).toBe(true);
    expect(findings.some((finding) => finding.key.startsWith('rising_query:'))).toBe(true);
  });

  it('separates verified facts, interpretation and limitations', () => {
    const evidence = buildEvidence(dataset(), 'ru');
    expect(evidence.verifiedFacts.join(' ')).toContain('sessions');
    expect(evidence.interpretation.join(' ').toLowerCase()).toContain('не подключены');
    expect(evidence.limitations.length).toBeGreaterThan(0);
  });
});
