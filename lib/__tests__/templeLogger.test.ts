import { logTempleEvent } from '@/lib/templeLogger';

const getSession = jest.fn();

jest.mock('@/lib/supabase-browser', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
    },
  },
}));

describe('logTempleEvent persistence result', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: null } });
    window.localStorage.clear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true only when the server confirms the write', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true }),
    } as Response);

    await expect(
      logTempleEvent({ event_type: 'ABSOLUTION', message: 'receipt' })
    ).resolves.toBe(true);
  });

  it('returns false for a failed HTTP write', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false }),
    } as Response);

    await expect(
      logTempleEvent({ event_type: 'ABSOLUTION', message: 'receipt' })
    ).resolves.toBe(false);
  });

  it('returns false when the network throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    await expect(
      logTempleEvent({ event_type: 'ABSOLUTION', message: 'receipt' })
    ).resolves.toBe(false);
  });
});
