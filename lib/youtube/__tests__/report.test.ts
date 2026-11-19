/** @jest-environment node */

import { formatYouTubeReport } from '../report';
import type { YouTubeMetric, YouTubeReport } from '../types';

function metric(overrides: Partial<YouTubeMetric>): YouTubeMetric {
  return {
    key: 'views',
    label: 'Просмотры за период',
    value: 100,
    previous: 80,
    deltaPercent: 25,
    unit: 'count',
    source: 'youtube_analytics',
    period: 'period',
    available: true,
    ...overrides,
  };
}

function report(overrides: Partial<YouTubeReport> = {}): YouTubeReport {
  return {
    kind: 'compare_periods',
    language: 'ru',
    channel: {
      id: 'UC_shared',
      title: 'Pierrot + UNFRAMED',
      handle: '@shared',
      uploadsPlaylistId: 'UU_shared',
      publicSubscribers: 1200,
      publicViews: 90000,
      publicVideoCount: 44,
      hiddenSubscriberCount: false,
    },
    channelId: 'UC_shared',
    sharedProjects: [
      { slug: 'pierrot', name: 'Pierrot' },
      { slug: 'unframed', name: 'UNFRAMED' },
    ],
    period: {
      key: 'last_30_days',
      label: '1 нояб. 2026 — 30 нояб. 2026',
      timezone: 'Europe/London',
      start: '2026-11-01',
      end: '2026-11-30',
      previousStart: '2026-10-02',
      previousEnd: '2026-10-31',
      previousLabel: '2 окт. 2026 — 31 окт. 2026',
      comparison: true,
    },
    comparisonPeriod: {
      key: 'previous',
      label: '2 окт. 2026 — 31 окт. 2026',
      timezone: 'Europe/London',
      start: '2026-10-02',
      end: '2026-10-31',
      previousStart: '2026-09-02',
      previousEnd: '2026-10-01',
      previousLabel: '2 сент. 2026 — 1 окт. 2026',
      comparison: false,
    },
    metrics: [
      metric({}),
      metric({
        key: 'estimatedMinutesWatched',
        label: 'Минуты просмотра',
        value: null,
        previous: 10,
        deltaPercent: null,
        available: false,
        unavailableReason: 'YouTube Analytics не вернул метрику за этот период.',
      }),
      metric({
        key: 'comments',
        label: 'Комментарии за период',
        value: 0,
        previous: 0,
        deltaPercent: null,
      }),
      metric({
        key: 'public_subscribers',
        label: 'Подписчики канала (публично)',
        source: 'youtube_data_api',
        period: 'cumulative',
        value: 1200,
        previous: null,
        deltaPercent: null,
      }),
    ],
    series: [],
    breakdowns: [],
    videos: [],
    videoAnalytics: [],
    dataState: 'partial',
    analyticsAvailable: true,
    analyticsUnavailableReason: null,
    limitations: ['YouTube Analytics обычно задерживает финальные данные на 2 дн.'],
    provenance: {
      fetchedAt: '2026-12-01T10:00:00.000Z',
      dataApi: ['youtube.v3 channels.list'],
      analyticsApi: ['youtubeanalytics.v2 reports.query (channel totals)'],
      cached: false,
      cacheAgeSeconds: null,
      reportingDelayDays: 2,
      notes: [],
    },
    ...overrides,
  };
}

describe('YouTube report formatting', () => {
  it('states period, freshness, source and never turns unavailable into zero', () => {
    const markdown = formatYouTubeReport(report());

    expect(markdown).toContain('Pierrot + UNFRAMED');
    expect(markdown).toContain('2026-11-01 — 2026-11-30');
    expect(markdown).toContain('Данные получены');
    expect(markdown).toContain('YouTube Data API v3');
    expect(markdown).toContain('YouTube Analytics API v2');
    expect(markdown).toContain('Data API · публично');
    expect(markdown).toContain('Analytics · приватно');
    expect(markdown).toContain('Недоступно (не ноль)');
    expect(markdown).toContain('Минуты просмотра: YouTube Analytics не вернул метрику');
    expect(markdown).toContain('| Комментарии за период | 0 |');
    expect(markdown).toContain('Ограничения');
  });

  it('shows a comparison and factual observations only when deltas exist', () => {
    const markdown = formatYouTubeReport(report());

    expect(markdown).toContain('Сравнение с');
    expect(markdown).toContain('+25%');
    expect(markdown).toContain('Что видно по данным');
  });

  it('renders both videos and their project context in a comparison', () => {
    const markdown = formatYouTubeReport(
      report({
        kind: 'compare_videos',
        videos: [
          {
            videoId: 'TmC6Lr5K4R8',
            title: 'The Spectral Tiger',
            publishedAt: '2026-11-01T10:00:00.000Z',
            durationSeconds: 45,
            publicViews: 1000,
            publicLikes: 10,
            publicComments: 1,
            url: 'https://www.youtube.com/watch?v=TmC6Lr5K4R8',
            project: 'UNFRAMED · Episode 0 — The Spectral Tiger',
            projectSlug: 'unframed',
            isShort: true,
          },
          {
            videoId: 'ZGhmmDVVwQg',
            title: 'Step Out of the Physical Container',
            publishedAt: '2026-11-02T10:00:00.000Z',
            durationSeconds: 70,
            publicViews: 2000,
            publicLikes: 20,
            publicComments: 2,
            url: 'https://www.youtube.com/watch?v=ZGhmmDVVwQg',
            project: 'UNFRAMED · Episode 42 — Step Out of the Physical Container',
            projectSlug: 'unframed',
            isShort: false,
          },
        ],
        videoAnalytics: [
          {
            videoId: 'TmC6Lr5K4R8',
            title: 'The Spectral Tiger',
            project: 'UNFRAMED · Episode 0 — The Spectral Tiger',
            metrics: [metric({ key: 'views', label: 'Просмотры за период', value: 300 })],
          },
          {
            videoId: 'ZGhmmDVVwQg',
            title: 'Step Out of the Physical Container',
            project: 'UNFRAMED · Episode 42 — Step Out of the Physical Container',
            metrics: [metric({ key: 'views', label: 'Просмотры за период', value: 700 })],
          },
        ],
      })
    );

    expect(markdown).toContain('The Spectral Tiger');
    expect(markdown).toContain('Step Out of the Physical Container');
    expect(markdown).toContain('Episode 0');
    expect(markdown).toContain('Episode 42');
    expect(markdown).toContain('Аналитика видео за период');
  });
});
