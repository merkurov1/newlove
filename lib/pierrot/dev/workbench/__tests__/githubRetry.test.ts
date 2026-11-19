/** @jest-environment node */

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));

import {
  readGitHubRateLimitInfo,
  requestGitHubWithRetry,
  type GitHubApiOperation,
} from '../github';

const OPERATION: GitHubApiOperation = {
  endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
  requiredPermission: 'Pull requests: read',
  fallbackCode: 'GITHUB_PR_STATUS_FAILED',
};

function httpError(
  status: number,
  headers: Record<string, string>,
  message = 'Resource not accessible by personal access token'
): Error {
  return Object.assign(new Error(message), {
    status,
    response: {
      status,
      headers,
      data: { message },
    },
  });
}

function retryOptions(overrides: Record<string, unknown> = {}) {
  const sleep = jest.fn(async (_ms: number) => undefined);
  return {
    sleep,
    options: {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 5_000,
      maxTotalWaitMs: 20_000,
      sleep,
      now: () => 1_700_000_000_000,
      random: () => 0,
      ...overrides,
    },
  };
}

describe('GitHub error diagnosis', () => {
  it('classifies 403 permission failures and does not retry them', async () => {
    const { sleep, options } = retryOptions();
    const request = jest.fn(async () => {
      throw httpError(403, {
        'x-accepted-github-permissions': 'pull_requests=read',
        'x-github-request-id': 'request-123',
      });
    });

    await expect(requestGitHubWithRetry(OPERATION, request, options)).rejects.toMatchObject({
      code: 'GITHUB_PERMISSION_DENIED',
      status: 403,
      endpoint: OPERATION.endpoint,
      requiredPermission: 'pull_requests=read',
      requestId: 'request-123',
      permissionDenied: true,
      rateLimited: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not mistake a permission 403 for a rate limit', async () => {
    const { sleep, options } = retryOptions();
    const request = jest.fn(async () => {
      throw httpError(403, { 'x-ratelimit-remaining': '4999' }, 'Resource not accessible');
    });

    await expect(requestGitHubWithRetry(OPERATION, request, options)).rejects.toMatchObject({
      code: 'GITHUB_PERMISSION_DENIED',
      rateLimited: false,
    });
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('GitHub rate-limit handling', () => {
  it('honours Retry-After before retrying, then succeeds', async () => {
    const { sleep, options } = retryOptions({
      maxAttempts: 2,
      maxDelayMs: 5_000,
      maxTotalWaitMs: 10_000,
    });
    const request = jest
      .fn()
      .mockRejectedValueOnce(
        httpError(403, {
          'retry-after': '2',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-limit': '5000',
        })
      )
      .mockResolvedValue('ok');

    await expect(requestGitHubWithRetry(OPERATION, request, options)).resolves.toBe('ok');
    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(2_000);
    expect(sleep.mock.calls[0][0]).toBeLessThanOrEqual(5_000);
  });

  it('honours X-RateLimit-Reset when Retry-After is absent', async () => {
    const now = 1_700_000_000_000;
    const resetSeconds = Math.floor(now / 1000) + 4;
    const { sleep, options } = retryOptions({ now: () => now, maxAttempts: 2 });
    const request = jest
      .fn()
      .mockRejectedValueOnce(
        httpError(403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-reset': String(resetSeconds),
        })
      )
      .mockResolvedValue('ok');

    await expect(requestGitHubWithRetry(OPERATION, request, options)).resolves.toBe('ok');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(3_000);
    expect(sleep.mock.calls[0][0]).toBeLessThanOrEqual(5_000);
  });

  it('reports the reset time instead of sleeping past the configured cap', async () => {
    const { sleep, options } = retryOptions({ maxDelayMs: 1_000, maxAttempts: 3 });
    const request = jest.fn(async () => {
      throw httpError(429, {
        'retry-after': '120',
        'x-ratelimit-remaining': '0',
      });
    });

    await expect(requestGitHubWithRetry(OPERATION, request, options)).rejects.toMatchObject({
      code: 'GITHUB_RATE_LIMITED',
      rateLimited: true,
      retryAfterMs: 120_000,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('bounds the number of retries for a persistent rate limit', async () => {
    const { sleep, options } = retryOptions({
      maxAttempts: 3,
      baseDelayMs: 0,
      maxDelayMs: 10,
      maxTotalWaitMs: 100,
      random: () => 0,
    });
    const request = jest.fn(async () => {
      throw httpError(403, { 'x-ratelimit-remaining': '0' });
    });

    await expect(requestGitHubWithRetry(OPERATION, request, options)).rejects.toMatchObject({
      code: 'GITHUB_RATE_LIMITED',
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe('rate-limit header parsing', () => {
  it('parses Retry-After, reset and remaining values', () => {
    const now = 1_700_000_000_000;
    const info = readGitHubRateLimitInfo(
      {
        'Retry-After': '30',
        'X-RateLimit-Reset': String(Math.floor(now / 1000) + 60),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Limit': '5000',
      },
      now
    );
    expect(info).toMatchObject({
      remaining: 0,
      limit: 5_000,
      retryAfterMs: 30_000,
    });
    expect(info.retryAt).toBe(new Date(now + 60_000).toISOString());
  });

  it('accepts an HTTP-date Retry-After header', () => {
    const now = Date.parse('2026-11-19T00:00:00.000Z');
    const info = readGitHubRateLimitInfo(
      { 'retry-after': new Date(now + 45_000).toUTCString() },
      now
    );
    expect(info.retryAfterMs).toBe(45_000);
  });
});
