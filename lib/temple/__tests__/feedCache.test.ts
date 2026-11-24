import {
  TEMPLE_FEED_CACHE_KEY,
  TEMPLE_FEED_TTL_MS,
  type TempleFeedPayload,
} from '@/lib/temple/feed';
import {
  TtlCache,
  clearCachedTempleFeed,
  readCachedTempleFeed,
  writeCachedTempleFeed,
} from '@/lib/temple/feedCache';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');

function payload(generatedAt = new Date(NOW).toISOString()): TempleFeedPayload {
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
      windowStart: new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString(),
      windowEnd: generatedAt,
      excluded: { infrastructure: 2, incomplete: 1 },
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

describe('server TTL cache', () => {
  it('serves a fresh value and expires it after the documented TTL', () => {
    const now = NOW;
    const cache = new TtlCache<string>(60_000, () => now);

    cache.set('first', NOW);

    expect(cache.get(NOW + 1)?.value).toBe('first');
    expect(cache.get(NOW + 60_000)).toBeNull();
    expect(cache.peek()?.value).toBe('first');
  });

  it('invalidates so the next read must refresh', () => {
    const cache = new TtlCache<string>(60_000);

    cache.set('first', NOW);
    expect(cache.size).toBe(1);

    cache.invalidate();

    expect(cache.get(NOW)).toBeNull();
    expect(cache.peek()).toBeNull();
    expect(cache.size).toBe(0);
  });
});

describe('browser feed cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('reuses a fresh cached payload across visits', () => {
    writeCachedTempleFeed(payload(), window.localStorage, NOW);

    const cached = readCachedTempleFeed(
      window.localStorage,
      NOW + TEMPLE_FEED_TTL_MS - 1
    );

    expect(cached?.fresh).toBe(true);
    expect(cached?.payload.data[0].id).toBe('trace-1');
  });

  it('marks an expired payload as not fresh so the UI can still fall back to it', () => {
    writeCachedTempleFeed(payload(), window.localStorage, NOW);

    const cached = readCachedTempleFeed(
      window.localStorage,
      NOW + TEMPLE_FEED_TTL_MS + 1
    );

    expect(cached?.fresh).toBe(false);
    expect(cached?.payload.data).toHaveLength(1);
  });

  it('ignores corrupt or invalid cached data and can clear the entry', () => {
    window.localStorage.setItem(TEMPLE_FEED_CACHE_KEY, '{not-json');

    expect(readCachedTempleFeed(window.localStorage, NOW)).toBeNull();

    window.localStorage.setItem(
      TEMPLE_FEED_CACHE_KEY,
      JSON.stringify({ savedAt: NOW, payload: { ok: false } })
    );

    expect(readCachedTempleFeed(window.localStorage, NOW)).toBeNull();

    writeCachedTempleFeed(payload(), window.localStorage, NOW);
    clearCachedTempleFeed(window.localStorage);

    expect(window.localStorage.getItem(TEMPLE_FEED_CACHE_KEY)).toBeNull();
  });
});
