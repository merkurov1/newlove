import { act, renderHook, waitFor } from '@testing-library/react';
import { supabase } from '@/lib/supabase-browser';
import { useTempleChronicles } from '@/hooks/useTempleChronicles';

jest.mock('@/lib/supabase-browser', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

type Handler = (payload: unknown) => void;

const channelHandlers: Record<string, Handler> = {};
let subscribeStatus: ((status: string) => void) | null = null;

const mockChannel = {
  on: jest.fn(
    (
      _event: string,
      filter: { table: string; event: string },
      handler: Handler
    ) => {
      channelHandlers[`${filter.table}:${filter.event}`] = handler;
      return mockChannel;
    }
  ),
  subscribe: jest.fn((handler: (status: string) => void) => {
    subscribeStatus = handler;
    return mockChannel;
  }),
};

function event(id: string, occurredAt: string, visitor: string | null = null) {
  return {
    id,
    ritual: 'ASH',
    ritualLabel: 'Let It Go',
    description: 'Released a burden and let it go.',
    occurredAt,
    visitor,
  };
}

function aggregates() {
  return {
    completedRituals: 12,
    namedAuthors: 2,
    vigilSparks: 3,
    byType: { ASH: 12 },
    windowDays: 30,
    windowStart: '2026-10-25T12:00:00.000Z',
    windowEnd: '2026-11-24T12:00:00.000Z',
    truncated: false,
  };
}

function page(
  events: ReturnType<typeof event>[],
  options: {
    hasMore?: boolean;
    nextCursor?: string | null;
    aggregates?: ReturnType<typeof aggregates> | null;
  } = {}
) {
  return {
    ok: true,
    events,
    pageInfo: {
      nextCursor: options.nextCursor ?? null,
      hasMore: options.hasMore ?? false,
      limit: 20,
    },
    aggregates:
      options.aggregates === undefined ? aggregates() : options.aggregates,
    error: null,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  Object.keys(channelHandlers).forEach((key) => delete channelHandlers[key]);
  subscribeStatus = null;

  (supabase.channel as jest.Mock).mockReturnValue(mockChannel);
  (supabase.removeChannel as jest.Mock).mockImplementation(() => undefined);
  mockChannel.on.mockImplementation(
    (
      _event: string,
      filter: { table: string; event: string },
      handler: Handler
    ) => {
      channelHandlers[`${filter.table}:${filter.event}`] = handler;
      return mockChannel;
    }
  );
  mockChannel.subscribe.mockImplementation((handler: (status: string) => void) => {
    subscribeStatus = handler;
    return mockChannel;
  });

  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('before=cursor-1')) {
      return jsonResponse(
        page([event('c', '2026-11-22T10:00:00.000Z')], {
          aggregates: null,
        })
      );
    }

    return jsonResponse(
      page(
        [
          event('a', '2026-11-24T12:00:00.000Z', 'Alice'),
          event('b', '2026-11-23T12:00:00.000Z'),
        ],
        { hasMore: true, nextCursor: 'cursor-1' }
      )
    );
  });

  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTempleChronicles', () => {
  it('loads the first page and the public aggregates from the allowlisted route', async () => {
    const { result } = renderHook(() => useTempleChronicles());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/temple_logs/chronicles?limit=20',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      })
    );
    expect(result.current.events.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.current.aggregates?.completedRituals).toBe(12);
    expect(result.current.hasMore).toBe(true);
  });

  it('appends older pages without duplicating events', async () => {
    const { result } = renderHook(() => useTempleChronicles());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.events.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('revalidates after a public-safe realtime signal and deduplicates', async () => {
    const { result } = renderHook(() => useTempleChronicles());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockResolvedValue(
      jsonResponse(
        page(
          [
            event('fresh', '2026-11-24T13:00:00.000Z'),
            event('a', '2026-11-24T12:00:00.000Z', 'Alice'),
          ],
          { hasMore: true, nextCursor: 'cursor-1' }
        )
      )
    );

    await act(async () => {
      channelHandlers['temple_chronicle_signals:INSERT']?.({
        new: { event_type: 'ASH', public_name: null },
      });
    });

    await waitFor(
      () => {
        // The newly arrived event is prepended, the repeated event is not
        // duplicated, and the older page already loaded is preserved.
        expect(result.current.events.map((item) => item.id)).toEqual([
          'fresh',
          'a',
          'b',
        ]);
      },
      { timeout: 2_000 }
    );
  });

  it('keeps the last good timeline and marks it stale when revalidation fails', async () => {
    const { result } = renderHook(() => useTempleChronicles());

    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMock.mockRejectedValue(new Error('network down'));

    await act(async () => {
      channelHandlers['temple_chronicle_signals:INSERT']?.({
        new: { event_type: 'ASH' },
      });
    });

    await waitFor(() => expect(result.current.status).toBe('stale'), {
      timeout: 2_000,
    });

    expect(result.current.events.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('falls back to periodic revalidation when Realtime reports a channel error', async () => {
    jest.useFakeTimers();

    const { result } = renderHook(() => useTempleChronicles());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ready');

    await act(async () => {
      subscribeStatus?.('CHANNEL_ERROR');
    });

    expect(result.current.live).toBe(false);

    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it('removes the realtime channel on unmount', async () => {
    const { unmount } = renderHook(() => useTempleChronicles());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    unmount();

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
