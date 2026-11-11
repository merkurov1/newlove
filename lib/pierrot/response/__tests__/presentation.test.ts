/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildGraphResponse,
  buildJournalFlowResponse,
  buildWebsiteResponse,
  timelineFromEvents,
} from '../select';
import type { AnalyticsDataset, AnalyticsReport } from '@/lib/analytics/website/types';
import type { BrainGraphPayload } from '@/lib/knowledge/graph/types';
import type { JournalFlowEvidence } from '@/lib/knowledge/rag/journalFlowRetrieval';

function metric(
  key: string,
  label: string,
  value: number | null,
  options: Partial<AnalyticsReport['dataset']['ga4']['totals'][string]> = {}
) {
  return {
    key,
    label,
    value,
    previous: null,
    deltaPercent: null,
    unit: 'count' as const,
    source: 'google_analytics' as const,
    definition: `${label} definition`,
    precision: 'Direct rows.',
    available: value !== null,
    ...options,
  };
}

function report(overrides: Partial<AnalyticsDataset> & { scope?: string; pagePath?: string | null }) {
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
      totals: {
        sessions: metric('sessions', 'Sessions', 215),
        activeUsers: metric('activeUsers', 'Active users', 78),
        screenPageViews: metric('screenPageViews', 'Page views', 1800),
        engagementRate: metric('engagementRate', 'Engagement rate', 60.5, { unit: 'percent' }),
      },
      series: [
        { date: '2026-11-08', sessions: 20, activeUsers: 12, newUsers: 4, screenPageViews: 90 },
        { date: '2026-11-09', sessions: 30, activeUsers: 18, newUsers: 7, screenPageViews: 120 },
      ],
      channels: [
        { key: 'Direct', label: 'Direct', value: 90, previous: null, deltaPercent: null, share: 40 },
      ],
      sources: [],
      landingPages: [
        { key: '/flow', label: '/flow', value: 42, previous: null, deltaPercent: null, share: 10 },
      ],
      pages: [
        { key: '/flow', label: '/flow', value: 120, previous: null, deltaPercent: null, share: 20 },
        { key: '/', label: '/', value: 500, previous: null, deltaPercent: null, share: 80 },
      ],
      countries: [],
      devices: [],
      events: [],
      traffic: {
        publicPageViews: 1800,
        ownerAdminPageViews: 10,
        automatedPageViews: 0,
        publicLandingSessions: 200,
        ownerAdminLandingSessions: 2,
        automatedLandingSessions: 0,
        excludedPaths: ['/admin'],
        note: 'test',
      },
      limitations: [],
    },
    gsc: {
      available: true,
      totals: {
        clicks: metric('clicks', 'Clicks', 9, { source: 'search_console' }),
        impressions: metric('impressions', 'Impressions', 240, { source: 'search_console' }),
      },
      series: [],
      queries: [
        { key: 'digital temple', label: 'digital temple', value: 9, previous: null, deltaPercent: null, share: 100 },
      ],
      pages: [
        {
          key: '/flow',
          label: '/flow',
          value: 9,
          previous: null,
          deltaPercent: null,
          share: 100,
          extra: { impressions: 240, ctr: 0.0375, position: 8.4 },
        },
      ],
      countries: [],
      devices: [],
      lowCtrPages: [],
      lowCtrQueries: [],
      risingQueries: [],
      decliningQueries: [],
      lostPages: [],
      limitations: [],
    },
    umami: { available: false, totals: {}, series: [], pages: [], referrers: [], limitations: [] },
    bluesky: {
      available: true,
      profile: { handle: 'merkurov.bsky.social', displayName: 'Anton', did: null, followers: 33, follows: 10, posts: 12 },
      totals: {
        followers: metric('followers', 'Подписчики Bluesky', 33, { source: 'bluesky' }),
        posts: metric('posts', 'Посты Bluesky', 12, { source: 'bluesky' }),
        likes: metric('likes', 'Лайки постов', 50, { source: 'bluesky' }),
        reposts: metric('reposts', 'Репосты', 6, { source: 'bluesky' }),
        replies: metric('replies', 'Ответы', 3, { source: 'bluesky' }),
        engagement: metric('engagement', 'Взаимодействия (расчётно)', 59, {
          source: 'bluesky',
          definition: 'Расчёт: лайки + репосты + ответы. Это не охват.',
        }),
      },
      posts: [
        {
          uri: 'at://1',
          text: 'Digital Temple',
          createdAt: '2026-11-01T10:00:00.000Z',
          url: '/post/1',
          likes: 12,
          reposts: 2,
          replies: 1,
          quotes: 0,
          links: 1,
          siteLinks: 1,
          engagement: 15,
        },
        {
          uri: 'at://2',
          text: 'UNFRAMED',
          createdAt: '2026-11-02T10:00:00.000Z',
          url: '/post/2',
          likes: 8,
          reposts: 1,
          replies: 0,
          quotes: 0,
          links: 0,
          siteLinks: 0,
          engagement: 9,
        },
      ],
      topPosts: [],
      siteLinkedPosts: [],
      limitations: ['Bluesky отдаёт публичные счётчики, но не уникальный охват.'],
    },
    internal: {
      available: true,
      confirmedSubscriptions: 4,
      previousConfirmedSubscriptions: 0,
      confirmedSubscriptionsByStartPage: [],
      subscriptionEvents: [],
      donations: { count: 0, amountMinor: 0, currency: 'GBP', byOffer: [], available: true },
      purchases: { count: 0, available: true },
      conversations: { total: 3, previousTotal: 1, byStartPage: [], byReferrer: [], events: [] },
      events: [],
      newsletter: {
        available: true,
        subscribers: { total: 25, active: 20, unsubscribed: 5, ru: 14, en: 6 },
        jobs: { total: 2, sent: 2, failed: 0, emailsSent: 25, emailsFailed: 0 },
        byLanguage: [],
        recentIssues: [],
        limitations: [],
      },
      content: {
        articlesTotal: 10,
        lettersTotal: 5,
        itemsPublished: 20,
        knowledgeDocuments: 100,
        mediaRecords: 50,
      },
      limitations: [],
    },
    projects: [
      {
        key: 'flow',
        name: 'Flow',
        path: '/flow',
        sessions: 42,
        activeUsers: 30,
        pageViews: 120,
        searchClicks: 9,
        searchImpressions: 240,
        internalConversations: 3,
        confirmedSubscriptions: 2,
        confirmedDonations: 0,
        revenueMinor: 0,
        currency: 'GBP',
        facts: [],
        interpretation: [],
        hypothesis: [],
        recommendations: [],
        attribution: 'unknown',
      },
    ],
    contentMatches: [],
    ...overrides,
  } as unknown as AnalyticsDataset;

  return {
    scope: overrides.scope || 'bluesky',
    question: {
      website: true,
      scope: overrides.scope || 'bluesky',
      wantsComparison: false,
      wantsProblems: false,
      wantsRecommendations: false,
      project: null,
      pagePath: overrides.pagePath ?? null,
      periodKey: 'last_7_days',
    },
    period: dataset.period,
    markdown: '# fallback',
    evidence: {
      verifiedFacts: [],
      interpretation: [],
      hypotheses: [],
      recommendations: [],
      limitations: [],
    },
    dataset,
  } as unknown as AnalyticsReport;
}

function evidence(): JournalFlowEvidence {
  return {
    outcome: 'relevant_results',
    code: null,
    latencyMs: 2,
    request: {
      sources: ['journal', 'flow'],
      limit: 3,
      language: 'ru',
      year: null,
      wantsComparison: true,
      query: 'Сравни Journal и Flow',
    },
    journal: [
      {
        id: 'j1',
        title: 'Issue 24',
        slug: 'issue-24',
        number: 24,
        language: 'ru',
        publishedAt: '2026-11-01T00:00:00.000Z',
        periodStart: null,
        periodEnd: null,
        url: '/letters/issue-24',
        excerpt: 'Выпуск о редакционной системе.',
        contentChars: 100,
      },
    ],
    flow: [
      {
        id: 'f1',
        type: 'note',
        title: 'Digital Temple note',
        body: 'Короткая запись.',
        language: 'ru',
        publishedAt: '2026-11-02T00:00:00.000Z',
        sourceUrl: null,
        url: '/flow/item',
      },
    ],
    totalJournal: 24,
    totalFlow: 90,
  };
}

describe('Pierrot presentation selection', () => {
  it('builds a Bluesky metrics + real chart composition', () => {
    const response = buildWebsiteResponse(report({ scope: 'bluesky' }), 'ru');
    const types = response?.blocks.map((block) => block.type);

    expect(types).toContain('metric');
    expect(types).toContain('chart');
    expect(types).toContain('insight');
    const chart = response?.blocks.find((block) => block.type === 'chart');
    expect(chart?.type === 'chart' && chart.data[0]).toMatchObject({
      likes: 12,
      reposts: 2,
      replies: 1,
    });
  });

  it('uses exact page rows for /flow and not the site total', () => {
    const response = buildWebsiteResponse(
      report({ scope: 'page', pagePath: '/flow' }),
      'ru'
    );
    const metrics = response?.blocks.find((block) => block.type === 'metric');

    expect(metrics?.type === 'metric' && metrics.metrics[0].value).toBe(120);
    expect(metrics?.type === 'metric' && metrics.metrics[1].value).toBe(42);
    expect(JSON.stringify(response)).not.toContain('500');
  });

  it('does not manufacture a chart for a simple health report', () => {
    const response = buildWebsiteResponse(report({ scope: 'health' }), 'ru');
    expect(response).toBeNull();
  });

  it('turns real graph edges into a safe diagram and separates inference', () => {
    const payload = {
      nodes: [
        { id: 'entity:a', kind: 'concept', label: 'Digital Temple', subtitle: null },
        { id: 'entity:b', kind: 'art_project', label: 'UNFRAMED', subtitle: null },
      ],
      edges: [
        {
          id: 'r1',
          source: 'entity:a',
          target: 'entity:b',
          relation: 'part_of',
          label: 'part of',
          confidence: 0.9,
          inference: false,
          provenance: null,
        },
        {
          id: 'r2',
          source: 'entity:b',
          target: 'entity:a',
          relation: 'related_to',
          label: 'related to',
          confidence: 0.5,
          inference: true,
          provenance: null,
        },
      ],
      stats: { documents: 0, entities: 2, relationships: 2, mentions: 2, shownNodes: 2, shownEdges: 2 },
    } as unknown as BrainGraphPayload;

    const response = buildGraphResponse(payload, 'Digital Temple', 'ru');
    const diagram = response?.blocks.find((block) => block.type === 'diagram');

    expect(diagram?.type === 'diagram' && diagram.edges.map((edge) => edge.kind)).toEqual([
      'direct',
      'inference',
    ]);
    expect(JSON.stringify(response)).not.toContain('Очередь Graph');
  });

  it('adds a timeline only for a history question and keeps the prose answer', () => {
    const response = buildJournalFlowResponse(
      evidence(),
      'Короткий ответ о хронологии.',
      'ru',
      'Покажи историю выпусков'
    );

    expect(response?.blocks[0].type).toBe('text');
    expect(response?.blocks.some((block) => block.type === 'timeline')).toBe(true);
  });

  it('builds a Journal/Flow comparison instead of a table', () => {
    const response = buildJournalFlowResponse(
      evidence(),
      'Сравнение.',
      'ru',
      'Сравни Journal и Flow'
    );

    expect(response?.blocks.some((block) => block.type === 'comparison')).toBe(true);
    expect(response?.blocks.some((block) => block.type === 'timeline')).toBe(false);
  });

  it('does not add a visual to an ordinary Journal prose answer', () => {
    const response = buildJournalFlowResponse(
      evidence(),
      'Последний выпуск рассказывает о редакционной системе.',
      'ru',
      'Что в последнем выпуске?'
    );

    expect(response).toBeNull();
  });

  it('builds a metric + timeline from real project events', () => {
    const response = timelineFromEvents([
      { date: '2026-01-01', title: 'Project start', source: '/project' },
      { date: '2026-02-01', title: 'First issue', source: '/letters/1' },
    ]);

    expect(response?.blocks[0].type).toBe('timeline');
  });
});
