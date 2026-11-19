/** @jest-environment node */

import {
  buildAnalyticsQuery,
  classifyYouTubeFailure,
  collectUploadPages,
  parseAnalyticsReport,
  parseIsoDuration,
  validateAnalyticsQuery,
} from '../api';
import { YouTubeError } from '../types';

describe('YouTube Analytics query mapping', () => {
  it('maps a channel report without exposing monetary metrics', () => {
    const params = buildAnalyticsQuery({
      channelId: 'UC_shared_channel',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      metrics: ['views', 'estimatedMinutesWatched', 'subscribersGained', 'averageViewPercentage'],
    });

    expect(params.get('ids')).toBe('channel==UC_shared_channel');
    expect(params.get('startDate')).toBe('2026-11-01');
    expect(params.get('endDate')).toBe('2026-11-30');
    expect(params.get('metrics')).toBe(
      'views,estimatedMinutesWatched,subscribersGained,averageViewPercentage'
    );
    expect(params.toString()).not.toMatch(/estimatedRevenue|monetary/i);
  });

  it('maps a video filter and a day dimension with a bounded maxResults', () => {
    const params = buildAnalyticsQuery({
      channelId: 'UC_shared_channel',
      startDate: '2026-11-01',
      endDate: '2026-11-07',
      metrics: ['views', 'estimatedMinutesWatched'],
      dimensions: ['day'],
      sort: 'day',
      maxResults: 999,
    });

    expect(params.get('dimensions')).toBe('day');
    expect(params.get('sort')).toBe('day');
    expect(params.get('maxResults')).toBe('200');

    const video = buildAnalyticsQuery({
      channelId: 'UC_shared_channel',
      startDate: '2026-11-01',
      endDate: '2026-11-07',
      metrics: ['views'],
      filters: { video: 'TmC6Lr5K4R8' },
    });

    expect(video.get('filters')).toBe('video==TmC6Lr5K4R8');
  });

  it('rejects unsupported dimensions, metrics and incompatible combinations before quota is spent', () => {
    expect(() =>
      validateAnalyticsQuery({
        channelId: 'UC_shared_channel',
        startDate: '2026-11-01',
        endDate: '2026-11-07',
        metrics: ['views'],
        dimensions: ['day', 'video'],
      })
    ).toThrow(YouTubeError);

    expect(() =>
      validateAnalyticsQuery({
        channelId: 'UC_shared_channel',
        startDate: '2026-11-01',
        endDate: '2026-11-07',
        metrics: ['estimatedRevenue' as never],
      })
    ).toThrow(/Unsupported YouTube Analytics metric/);

    expect(() =>
      validateAnalyticsQuery({
        channelId: 'UC_shared_channel',
        startDate: '2026-11-07',
        endDate: '2026-11-01',
        metrics: ['views'],
      })
    ).toThrow(/startDate/);
  });

  it('parses real zero separately from a missing row', () => {
    const report = parseAnalyticsReport({
      columnHeaders: [{ name: 'day' }, { name: 'views' }, { name: 'subscribersGained' }],
      rows: [['2026-11-01', 0, 2]],
    });

    expect(report.rows[0].metrics.views).toBe(0);
    expect(report.totals.views).toBe(0);
    expect(report.totals.subscribersGained).toBe(2);

    const empty = parseAnalyticsReport({ columnHeaders: [], rows: [] });
    expect(empty.totals.views).toBeUndefined();
    expect(empty.rows).toHaveLength(0);
  });

  it('classifies quota, permission and rate-limit failures explicitly', () => {
    const quotaBody = JSON.stringify({
      error: {
        code: 403,
        message: 'The request cannot be completed because you have exceeded your quota.',
        errors: [{ reason: 'quotaExceeded' }],
        details: [{ reason: 'quotaExceeded' }],
      },
    });
    const dataApiQuotaBody = JSON.stringify({
      error: {
        code: 403,
        message: 'The request cannot be completed because you have exceeded your quota.',
        errors: [{ domain: 'youtube.quota', reason: 'quotaExceeded' }],
      },
    });
    const permissionBody = JSON.stringify({
      error: {
        code: 403,
        message: 'The caller does not have permission',
        details: [{ reason: 'forbidden' }],
      },
    });

    expect(classifyYouTubeFailure(403, quotaBody).code).toBe('quota_exceeded');
    expect(classifyYouTubeFailure(403, dataApiQuotaBody).code).toBe('quota_exceeded');
    expect(classifyYouTubeFailure(403, permissionBody).code).toBe('insufficient_permissions');
    expect(classifyYouTubeFailure(429, null).code).toBe('rate_limited');
    expect(classifyYouTubeFailure(401, null).code).toBe('needs_reauthorization');
  });
});

describe('YouTube Data API pagination', () => {
  it('walks every page token and de-duplicates upload ids', async () => {
    const pages: Record<string, { videoIds: string[]; nextPageToken: string | null }> = {
      start: { videoIds: ['one', 'two'], nextPageToken: 'p2' },
      p2: { videoIds: ['two', 'three'], nextPageToken: 'p3' },
      p3: { videoIds: ['four'], nextPageToken: null },
    };
    const fetchPage = jest.fn(async (token: string | null) => pages[token ?? 'start']);

    const result = await collectUploadPages(fetchPage, 10);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.videoIds).toEqual(['one', 'two', 'three', 'four']);
    expect(result.truncated).toBe(false);
  });

  it('stops at the page cap and reports truncation instead of crawling forever', async () => {
    const fetchPage = jest.fn(async () => ({
      videoIds: ['same'],
      nextPageToken: 'more',
    }));

    const result = await collectUploadPages(fetchPage, 3);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.truncated).toBe(true);
    expect(result.videoIds).toEqual(['same']);
  });

  it('parses ISO durations and identifies Shorts without guessing', () => {
    expect(parseIsoDuration('PT1M')).toBe(60);
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('P1DT2S')).toBe(86402);
    expect(parseIsoDuration('not-a-duration')).toBeNull();
  });
});
