import { act, renderHook, waitFor } from '@testing-library/react';
import {
  TEMPLE_FEED_TTL_MS,
  type TempleFeedPayload,
} from '@/lib/temple/feed';
import { writeCachedTempleFeed } from '@/lib/temple/feedCache';
import { useTempleFeed } from '@/hooks/useTempleFeed';

function payload(generatedAt = new Date().toISOString()): TempleFeedPayload {
  return {
    ok: true,
    data: [
      {
        id: 'trace-1',
        event_type: 'ASH',
        canonical_type: 'ASH',
        category: 'ritual',
        author: 'Alice',
        message: 'Released a burden',
        created_at: generatedAt,
        audio_url: null,
      },
    ],
    stats: {
      completedRituals: 1,
      namedAuthors: 1,
      vigilSparks: 0,
      byType: { ASH: 1 },
      windowDays: 30,
      windowStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      windowEnd: generatedAt,
      excluded: { infrastructure: 0, incomplete: 0 },
      truncated: false,
    },
    meta: {
      generatedAt,
      cachedAt: generatedAt,
      ttlSeconds: 60,
      traceLimit: 7,
      windowDays: 30,
      stale: false,
      cache: 'miss',
      truncated: false,
      definitions: {},
    },
    error: null,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('useTempleFeed', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    window.localStorage.clear();
  });

  it('reuses a fresh browser cache without calling the API', async () => {
    const now = Date.now();
    writeCachedTempleFeed(
      payload(new Date(now).toISOString()),
      window.localStorage,
      now
    );

    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useTempleFeed());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.payload?.data[0].id).toBe('trace-1');
    expect(result.current.fromCache).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the last known good payload when a refresh fails', async () => {
    const staleAt = Date.now() - TEMPLE_FEED_TTL_MS - 1_000;
    writeCachedTempleFeed(
      payload(new Date(staleAt).toISOString()),
      window.localStorage,
      staleAt
    );

    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useTempleFeed());

    await waitFor(() => expect(result.current.status).toBe('stale'));

    expect(result.current.error).toBe('network down');
    expect(result.current.payload?.data[0].id).toBe('trace-1');
  });

  it('does not poll and only refreshes after the documented TTL', async () => {
    jest.useFakeTimers();

    const fetchMock = jest.fn(async () => jsonResponse(payload()));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useTempleFeed());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');

    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(TEMPLE_FEED_TTL_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
