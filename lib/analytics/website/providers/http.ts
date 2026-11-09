import type { AnalyticsProvider } from '../types';

export class AnalyticsProviderError extends Error {
  provider: AnalyticsProvider | 'google_oauth';
  code: string;
  status: number | null;
  retryable: boolean;
  details: string | null;

  constructor(input: {
    provider: AnalyticsProvider | 'google_oauth';
    code: string;
    message: string;
    status?: number | null;
    retryable?: boolean;
    details?: string | null;
  }) {
    super(input.message);
    this.name = 'AnalyticsProviderError';
    this.provider = input.provider;
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable ?? false;
    this.details = input.details ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function readErrorBody(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, 800) || null;
  } catch {
    return null;
  }
}

/**
 * One controlled HTTP entry point for external analytics APIs.
 *
 * - retries only on 408/429/5xx and network failures;
 * - honours Retry-After when present;
 * - never logs tokens or request headers;
 * - maps authorization failures to explicit codes so the UI can ask the owner
 *   to reconnect instead of silently showing zero data.
 */
export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  options: {
    provider: AnalyticsProvider | 'google_oauth';
    retries?: number;
    timeoutMs?: number;
    label?: string;
  }
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 3);
  const timeoutMs = options.timeoutMs ?? 25_000;
  let lastError: AnalyticsProviderError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await readErrorBody(response);
      const status = response.status;
      const bodyCode = body && /invalid_grant/i.test(body)
        ? 'invalid_grant'
        : body && /invalid_client/i.test(body)
          ? 'invalid_client'
          : null;
      const code =
        bodyCode ||
        (status === 401
          ? 'unauthorized'
          : status === 403
            ? 'forbidden'
            : status === 429
              ? 'rate_limited'
              : status >= 500
                ? 'upstream_error'
                : 'request_failed');

      lastError = new AnalyticsProviderError({
        provider: options.provider,
        code,
        message:
          code === 'unauthorized' || code === 'invalid_grant'
            ? 'Google authorization expired or was revoked.'
            : code === 'invalid_client'
              ? 'The Google OAuth client is not valid.'
              : code === 'forbidden'
                ? 'The account does not grant access to this resource.'
                : code === 'rate_limited'
                  ? 'The provider rate limit was reached.'
                  : `The provider returned HTTP ${status}.`,
        status,
        retryable: isRetryableStatus(status),
        details: body,
      });

      if (!isRetryableStatus(status) || attempt === retries) {
        throw lastError;
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : Math.min(500 * 2 ** attempt + Math.round(Math.random() * 250), 15_000);

      await sleep(delay);
    } catch (error) {
      clearTimeout(timer);

      if (error instanceof AnalyticsProviderError) {
        if (!error.retryable || attempt === retries) throw error;
        await sleep(Math.min(500 * 2 ** attempt, 15_000));
        continue;
      }

      const aborted = error instanceof Error && error.name === 'AbortError';

      lastError = new AnalyticsProviderError({
        provider: options.provider,
        code: aborted ? 'timeout' : 'network_error',
        message: aborted
          ? 'The provider request timed out.'
          : 'The provider could not be reached.',
        retryable: true,
      });

      if (attempt === retries) throw lastError;

      await sleep(Math.min(500 * 2 ** attempt, 15_000));
    }
  }

  throw (
    lastError ??
    new AnalyticsProviderError({
      provider: options.provider,
      code: 'request_failed',
      message: 'The provider request failed.',
    })
  );
}
