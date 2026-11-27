/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { consumeDistributedRateLimit } from '@/lib/cast/rateLimitServer';

process.env.CAST_CAPTURE_SECRET = 'rate-limit-test-secret';

function client(rpc: jest.Mock) {
  return { rpc } as never;
}

describe('consumeDistributedRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the shared database counter and never logs the raw identifier', async () => {
    const rpc = jest.fn(async () => ({
      data: [
        {
          allowed: true,
          remaining: 4,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
      error: null,
    }));

    const decision = await consumeDistributedRateLimit(client(rpc), {
      scope: 'cast:analysis',
      identifier: 'ip:203.0.113.7',
      limit: 5,
      windowSeconds: 600,
    });

    expect(decision).toMatchObject({ allowed: true, store: 'database' });
    expect(rpc).toHaveBeenCalledTimes(1);

    const args = rpc.mock.calls[0] as unknown as [
      string,
      { p_bucket: string; p_limit: number; p_window_seconds: number },
    ];

    expect(args[0]).toBe('consume_rate_limit');
    expect(args[1].p_bucket).toMatch(/^[a-f0-9]{64}$/);
    expect(args[1].p_bucket).not.toContain('203.0.113.7');
  });

  it('denies when the shared counter is exhausted', async () => {
    const rpc = jest.fn(async () => ({
      data: [
        {
          allowed: false,
          remaining: 0,
          reset_at: new Date(Date.now() + 120_000).toISOString(),
        },
      ],
      error: null,
    }));

    const decision = await consumeDistributedRateLimit(client(rpc), {
      scope: 'cast:capture',
      identifier: 'ip:203.0.113.8',
      limit: 5,
      windowSeconds: 600,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('falls back to the in-process limiter when the migration is absent', async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    }));

    const decision = await consumeDistributedRateLimit(client(rpc), {
      scope: 'cast:fallback',
      identifier: 'ip:198.51.100.4',
      limit: 1,
      windowSeconds: 60,
    });

    expect(decision.store).toBe('memory');
    expect(decision.allowed).toBe(true);
  });
});
