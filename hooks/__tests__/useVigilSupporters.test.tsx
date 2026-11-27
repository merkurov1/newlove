import { act, renderHook, waitFor } from '@testing-library/react';
import { supabase } from '@/lib/supabase-browser';
import { useVigilSupporters } from '@/hooks/useVigilSupporters';

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

function snapshot(count: number) {
  return {
    supporterCount: count,
    lastLitAt: '2026-11-24T12:00:00.000Z',
    flameExpiresAt: '2026-11-25T12:00:00.000Z',
    flameLit: true,
    windowStartedAt: '2026-11-23T12:00:00.000Z',
    updatedAt: '2026-11-24T12:00:01.000Z',
    lifetimeTotal: 321,
    uniqueParticipants: 90,
    returningParticipants: 18,
    repeatRate: 0.2,
    telegramParticipants: 60,
    supabaseParticipants: 30,
    analyticsSince: '2026-11-16T09:00:00.000Z',
    analyticsAvailable: true,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: {
      get: () => 'application/json',
    },
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(channelHandlers).forEach((key) => delete channelHandlers[key]);
  subscribeStatus = null;

  (supabase.channel as jest.Mock).mockReturnValue(mockChannel);
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

  fetchMock.mockResolvedValue(jsonResponse(snapshot(7)));
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('useVigilSupporters', () => {
  it('loads the count from the authoritative Vigil state route', async () => {
    const { result } = renderHook(() => useVigilSupporters());

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vigil/state',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin',
      })
    );
    expect(result.current.supporterCount).toBe(7);
    expect(result.current.lifetimeTotal).toBe(321);
    expect(result.current.uniqueParticipants).toBe(90);
    expect(result.current.returningParticipants).toBe(18);
    expect(result.current.analyticsAvailable).toBe(true);
  });

  it('refreshes after a validated realtime Vigil spark', async () => {
    const { result } = renderHook(() => useVigilSupporters());

    await waitFor(() => expect(result.current.supporterCount).toBe(7));

    fetchMock.mockResolvedValue(jsonResponse(snapshot(11)));

    await act(async () => {
      channelHandlers['temple_chronicle_signals:INSERT']?.({
        new: { event_type: 'VIGIL_SPARK' },
      });
    });

    await waitFor(() => expect(result.current.supporterCount).toBe(11));
  });

  it('ignores unrelated temple log events', async () => {
    const { result } = renderHook(() => useVigilSupporters());

    await waitFor(() => expect(result.current.supporterCount).toBe(7));

    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      channelHandlers['temple_chronicle_signals:INSERT']?.({
        new: { event_type: 'ASH' },
      });
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('keeps the last real count and marks it stale when refresh fails', async () => {
    const { result } = renderHook(() => useVigilSupporters());

    await waitFor(() => expect(result.current.supporterCount).toBe(7));

    fetchMock.mockRejectedValue(new Error('network down'));

    await act(async () => {
      channelHandlers['temple_chronicle_signals:INSERT']?.({
        new: { event_type: 'VIGIL_SPARK' },
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('stale');
      expect(result.current.error).toBe('network down');
    });

    expect(result.current.supporterCount).toBe(7);
  });

  it('reports a realtime channel failure without fabricating a count', async () => {
    const { result } = renderHook(() => useVigilSupporters());

    await waitFor(() => expect(result.current.supporterCount).toBe(7));

    await act(async () => {
      subscribeStatus?.('CHANNEL_ERROR');
    });

    expect(result.current.status).toBe('stale');
    expect(result.current.supporterCount).toBe(7);
  });
});
