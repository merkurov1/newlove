/** @jest-environment node */

import { afterEach, describe, expect, it } from '@jest/globals';

import { getTrustedClientIp } from '../clientIp';

function headers(values: Record<string, string>) {
  return {
    get: (name: string) => values[name.toLowerCase()] ?? null,
  };
}

const originalHops = process.env.TRUSTED_PROXY_HOPS;
const originalHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
const originalProvider = process.env.TRUSTED_PROXY_PROVIDER;
const originalVercel = process.env.VERCEL;

afterEach(() => {
  process.env.TRUSTED_PROXY_HOPS = originalHops;
  process.env.TRUSTED_CLIENT_IP_HEADER = originalHeader;
  process.env.TRUSTED_PROXY_PROVIDER = originalProvider;
  process.env.VERCEL = originalVercel;
});

describe('trusted client IP resolution', () => {
  it('uses the platform real IP header when present', () => {
    expect(
      getTrustedClientIp(headers({ 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '1.2.3.4' }))
    ).toBe('203.0.113.8');
  });

  it('parses X-Forwarded-For from the trusted end of the chain', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';

    expect(
      getTrustedClientIp(
        headers({ 'x-forwarded-for': '198.51.100.99, 203.0.113.9, 10.0.0.1' })
      )
    ).toBe('203.0.113.9');
  });

  it('supports an explicitly configured edge header', () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-client-ip';

    expect(getTrustedClientIp(headers({ 'x-client-ip': '192.0.2.44' }))).toBe('192.0.2.44');
  });

  it('does not trust Cloudflare headers unless the provider is configured', () => {
    delete process.env.TRUSTED_PROXY_PROVIDER;
    delete process.env.CF_PAGES;

    expect(
      getTrustedClientIp(headers({ 'cf-connecting-ip': '192.0.2.55' }))
    ).toBe('unknown');

    process.env.TRUSTED_PROXY_PROVIDER = 'cloudflare';
    expect(
      getTrustedClientIp(headers({ 'cf-connecting-ip': '192.0.2.55' }))
    ).toBe('192.0.2.55');
  });

  it('returns unknown for malformed values', () => {
    expect(getTrustedClientIp(headers({ 'x-forwarded-for': 'not-an-ip' }))).toBe('unknown');
  });
});
