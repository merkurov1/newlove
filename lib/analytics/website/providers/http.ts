import type { AnalyticsProvider } from '../types';

export type AnalyticsProviderErrorCode =
  | 'unauthorized'
  | 'insufficient_permissions'
  | 'api_not_enabled'
  | 'invalid_grant'
  | 'invalid_client'
  | 'redirect_uri_mismatch'
  | 'resource_not_found'
  | 'network_error'
  | 'timeout'
  | 'rate_limited'
  | 'upstream_error'
  | 'request_failed';

export type ProviderErrorDiagnostic = {
  provider: AnalyticsProvider | 'google_oauth';
  code: string;
  httpStatus: number | null;
  googleErrorCode: string | null;
  googleErrorMessage: string | null;
  message: string;
  scope: string | null;
  stage: string | null;
  timestamp: string;
  retryable: boolean;
};

export class AnalyticsProviderError extends Error {
  provider: AnalyticsProvider | 'google_oauth';
  code: string;
  status: number | null;
  retryable: boolean;
  details: string | null;
  googleCode: string | null;
  googleMessage: string | null;
  scope: string | null;
  stage: string | null;
  timestamp: string;

  constructor(input: {
    provider: AnalyticsProvider | 'google_oauth';
    code: string;
    message: string;
    status?: number | null;
    retryable?: boolean;
    details?: string | null;
    googleCode?: string | null;
    googleMessage?: string | null;
    scope?: string | null;
    stage?: string | null;
    timestamp?: string;
  }) {
    super(input.message);
    this.name = 'AnalyticsProviderError';
    this.provider = input.provider;
    this.code = input.code;
    this.status = input.status ?? null;
    this.retryable = input.retryable ?? false;
    this.details = input.details ?? null;
    this.googleCode = input.googleCode ?? null;
    this.googleMessage = input.googleMessage ?? null;
    this.scope = input.scope ?? null;
    this.stage = input.stage ?? null;
    this.timestamp = input.timestamp ?? new Date().toISOString();
  }
}

type ParsedGoogleError = {
  googleCode: string | null;
  googleMessage: string | null;
  safeDetails: string | null;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 800) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Google APIs return two different error envelopes:
 *   OAuth: { error: "invalid_grant", error_description: "..." }
 *   API:   { error: { code, status, message, details: [{ reason: "..." }] } }
 *
 * Keep only the safe diagnostic fields. Offsets, request bodies and credentials
 * are never copied into the stored message.
 */
function parseGoogleErrorBody(body: string | null): ParsedGoogleError {
  if (!body) {
    return { googleCode: null, googleMessage: null, safeDetails: null };
  }

  try {
    const root = record(JSON.parse(body));
    if (!root) {
      return { googleCode: null, googleMessage: null, safeDetails: null };
    }

    const rawError = root.error;
    const errorObject = record(rawError);
    const details = Array.isArray(errorObject?.details) ? errorObject.details : [];
    const reasons = details
      .map((detail) => text(record(detail)?.reason))
      .filter((value): value is string => Boolean(value));

    const googleCode =
      reasons[0] ||
      text(typeof rawError === 'string' ? rawError : errorObject?.status) ||
      (typeof root.code === 'number' ? String(root.code) : null);

    const googleMessage =
      text(errorObject?.message) || text(root.error_description) || text(root.message) || null;

    const safeDetails = JSON.stringify({
      error: typeof rawError === 'string' ? rawError.slice(0, 120) : undefined,
      error_description: text(root.error_description) || undefined,
      code: typeof root.code === 'number' ? root.code : undefined,
      status: text(errorObject?.status) || undefined,
      message: googleMessage || undefined,
      reasons: reasons.length ? reasons.slice(0, 8) : undefined,
    });

    return { googleCode, googleMessage, safeDetails: safeDetails.slice(0, 1200) };
  } catch {
    // Non-JSON bodies are deliberately not persisted: they can contain
    // arbitrary request details. The status code remains available.
    return { googleCode: null, googleMessage: null, safeDetails: null };
  }
}

function classifyHttpFailure(
  status: number,
  parsed: ParsedGoogleError
): { code: AnalyticsProviderErrorCode; message: string } {
  const probe = `${parsed.googleCode || ''} ${parsed.googleMessage || ''}`.toLowerCase();

  if (status === 400 && (probe.includes('invalid_grant') || probe.includes('expired or revoked'))) {
    return {
      code: 'invalid_grant',
      message: 'Google authorization is no longer valid. Reconnect the source.',
    };
  }

  if (status === 400 && probe.includes('redirect_uri_mismatch')) {
    return {
      code: 'redirect_uri_mismatch',
      message: 'The Google OAuth redirect URI is not registered for this client.',
    };
  }

  if (status === 400 && probe.includes('invalid_client')) {
    return {
      code: 'invalid_client',
      message: 'The Google OAuth client is not valid.',
    };
  }

  if (status === 401) {
    return {
      code: 'unauthorized',
      message: 'Google authorization expired or was revoked.',
    };
  }

  if (status === 403) {
    if (
      /accessnotconfigured|service_disabled|api_not_enabled|api has not been used|has not been used in project|is disabled/.test(
        probe
      )
    ) {
      return {
        code: 'api_not_enabled',
        message: 'The required Google API is not enabled for this project.',
      };
    }

    return {
      code: 'insufficient_permissions',
      message: 'The Google account does not grant access to this resource.',
    };
  }

  if (status === 404) {
    return {
      code: 'resource_not_found',
      message: 'The requested Google resource was not found or is not accessible.',
    };
  }

  if (status === 408) {
    return { code: 'timeout', message: 'The provider request timed out.' };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'The provider rate limit was reached.',
    };
  }

  if (status >= 500) {
    return {
      code: 'upstream_error',
      message: 'Google returned a temporary server error.',
    };
  }

  return {
    code: 'request_failed',
    message: `The provider returned HTTP ${status}.`,
  };
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

export function diagnosticFromError(
  error: unknown,
  fallback: {
    provider: AnalyticsProvider | 'google_oauth';
    stage?: string | null;
    scope?: string | null;
  }
): ProviderErrorDiagnostic {
  const providerError =
    error instanceof AnalyticsProviderError
      ? error
      : new AnalyticsProviderError({
          provider: fallback.provider,
          code: 'request_failed',
          message: error instanceof Error ? error.message : 'The provider request failed.',
          stage: fallback.stage,
          scope: fallback.scope,
        });

  return {
    provider: providerError.provider,
    code: providerError.code,
    httpStatus: providerError.status,
    googleErrorCode: providerError.googleCode,
    googleErrorMessage: providerError.googleMessage,
    message: providerError.message,
    scope: providerError.scope || fallback.scope || null,
    stage: providerError.stage || fallback.stage || null,
    timestamp: providerError.timestamp,
    retryable: providerError.retryable,
  };
}

/**
 * Human-readable error text that keeps the original Google diagnostic instead
 * of replacing it with the classified transport code. Stored in
 * analytics_connections.last_error_message and analytics_sync_runs.details.
 */
export function diagnosticSummary(diagnostic: ProviderErrorDiagnostic): string {
  const parts = [diagnostic.message];

  if (diagnostic.googleErrorCode && !diagnostic.message.includes(diagnostic.googleErrorCode)) {
    parts.push(`Google code: ${diagnostic.googleErrorCode}`);
  }

  if (
    diagnostic.googleErrorMessage &&
    !diagnostic.message.includes(diagnostic.googleErrorMessage)
  ) {
    parts.push(diagnostic.googleErrorMessage);
  }

  return parts.filter(Boolean).join(' — ');
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
    stage?: string;
    scope?: string;
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
      const parsed = parseGoogleErrorBody(body);
      const failure = classifyHttpFailure(status, parsed);

      lastError = new AnalyticsProviderError({
        provider: options.provider,
        code: failure.code,
        message: failure.message,
        status,
        retryable: isRetryableStatus(status),
        details: parsed.safeDetails,
        googleCode: parsed.googleCode,
        googleMessage: parsed.googleMessage,
        stage: options.stage ?? options.label,
        scope: options.scope,
      });

      if (!isRetryableStatus(status) || attempt === retries) {
        throw lastError;
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      const delay =
        Number.isFinite(retryAfter) && retryAfter > 0
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
        message: aborted ? 'The provider request timed out.' : 'The provider could not be reached.',
        retryable: true,
        stage: options.stage ?? options.label,
        scope: options.scope,
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
      stage: options.stage ?? options.label,
      scope: options.scope,
    })
  );
}
