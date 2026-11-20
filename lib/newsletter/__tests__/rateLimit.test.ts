/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/pierrot/rateLimit', () => ({
  checkPierrotRateLimit: jest.fn(async () => null),
}));

const limiter = require('@/lib/pierrot/rateLimit') as {
  checkPierrotRateLimit: jest.Mock;
};
const {
  checkNewsletterRateLimit,
  checkNewsletterIpRateLimit,
  NEWSLETTER_EMAIL_LIMIT,
} = require('../rateLimit') as typeof import('../rateLimit');

function limited(retryAfter = 30) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'retry-after' ? String(retryAfter) : null),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  limiter.checkPierrotRateLimit.mockResolvedValue(null);
});

describe('durable newsletter rate limits', () => {
  it('applies IP and normalized email buckets', async () => {
    const decision = await checkNewsletterRateLimit({
      ip: '203.0.113.10',
      email: 'Person@Example.com',
    });

    expect(decision).toEqual({ allowed: true });
    const identifiers = limiter.checkPierrotRateLimit.mock.calls.map((call) => call[0].identifier);
    expect(identifiers).toContain('203.0.113.10');
    expect(identifiers).toContain('person@example.com');
    expect(identifiers).not.toContain('Person@Example.com');
  });

  it('returns the IP layer without checking the email bucket when the IP is limited', async () => {
    limiter.checkPierrotRateLimit.mockResolvedValueOnce(limited(45));

    const decision = await checkNewsletterRateLimit({
      ip: '203.0.113.10',
      email: 'person@example.com',
    });

    expect(decision).toMatchObject({ allowed: false, layer: 'ip', retryAfter: 45 });
    expect(limiter.checkPierrotRateLimit).toHaveBeenCalledTimes(1);
  });

  it('blocks email reuse even when the IP rotates', async () => {
    limiter.checkPierrotRateLimit
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(limited(120));

    const decision = await checkNewsletterRateLimit({
      ip: '198.51.100.4',
      email: 'person@example.com',
    });

    expect(decision).toMatchObject({
      allowed: false,
      layer: 'email',
      retryAfter: 120,
      maxRequests: NEWSLETTER_EMAIL_LIMIT.maxRequests,
    });
  });

  it('does not impose a global shared-IP ban when many distinct emails sign up', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        checkNewsletterRateLimit({
          ip: '198.51.100.10',
          email: `colleague${index}@corp.example`,
        })
      )
    );

    expect(decisions.every((decision) => decision.allowed)).toBe(true);
    const ipIdentifiers = limiter.checkPierrotRateLimit.mock.calls
      .map((call) => call[0].identifier)
      .filter((identifier: string) => identifier === '198.51.100.10');
    expect(ipIdentifiers).toHaveLength(10);
  });

  it('stays consistent under concurrent submissions', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 5 }, () =>
        checkNewsletterRateLimit({ ip: '203.0.113.20', email: 'person@example.com' })
      )
    );

    expect(decisions.every((decision) => decision.allowed)).toBe(true);
    expect(limiter.checkPierrotRateLimit).toHaveBeenCalledTimes(15);
  });

  it('supports a separate IP-only limit for confirmation links', async () => {
    limiter.checkPierrotRateLimit.mockResolvedValueOnce(limited(10));

    const decision = await checkNewsletterIpRateLimit('203.0.113.30');

    expect(decision).toMatchObject({ allowed: false, retryAfter: 10 });
  });
});
