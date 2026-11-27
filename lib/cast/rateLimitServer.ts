import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { checkRateLimit } from '@/lib/rateLimit';

/**
 * Server-side, cross-instance rate limiting for the expensive Cast endpoints.
 *
 * The previous limiter kept counters in a module-level object. On serverless
 * deployments every instance (and every cold start) had its own counters, so a
 * caller could multiply the AI budget simply by triggering new instances.
 *
 * This limiter stores a counter row in Postgres through
 * `public.consume_rate_limit(...)` (see the cast privacy migration). The
 * counter key is a SHA-256 digest, so neither an IP address nor an account id
 * is written to the table in the clear.
 *
 * Failure policy: if the RPC is unavailable (migration not applied yet, or a
 * transient database error) the limiter falls back to the previous in-process
 * limiter and logs a warning. It never silently allows unlimited traffic when
 * a decision cannot be made locally either.
 */

export type DistributedRateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: string | null;
  /** 'database' when the shared counter answered, 'memory' on fallback. */
  store: 'database' | 'memory';
};

export type DistributedRateLimitOptions = {
  /** Stable logical bucket, e.g. `cast:analysis`. */
  scope: string;
  /** Verified subject (user id / telegram key) or client IP. */
  identifier: string;
  limit: number;
  windowSeconds: number;
};

function digest(scope: string, identifier: string): string {
  const salt =
    process.env.CAST_CAPTURE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'cast-rate-limit';

  return createHash('sha256')
    .update(`${salt}:${scope}:${identifier}`)
    .digest('hex');
}

function memoryFallback(
  options: DistributedRateLimitOptions
): DistributedRateLimitDecision {
  const limited = checkRateLimit(options.identifier, {
    interval: options.windowSeconds * 1000,
    maxRequests: options.limit,
    keyPrefix: `drl:${options.scope}`,
  });

  if (!limited) {
    return {
      allowed: true,
      remaining: Math.max(options.limit - 1, 0),
      retryAfterSeconds: 0,
      resetAt: null,
      store: 'memory',
    };
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Number(limited.headers.get('Retry-After') || 60),
    resetAt: null,
    store: 'memory',
  };
}

type ConsumeRow = {
  allowed?: unknown;
  remaining?: unknown;
  reset_at?: unknown;
};

export async function consumeDistributedRateLimit(
  client: SupabaseClient,
  options: DistributedRateLimitOptions
): Promise<DistributedRateLimitDecision> {
  const bucket = digest(options.scope, options.identifier);

  try {
    const { data, error } = await client.rpc('consume_rate_limit', {
      p_bucket: bucket,
      p_limit: options.limit,
      p_window_seconds: options.windowSeconds,
    });

    if (error) {
      // 42883 = function does not exist, 42P01 = table does not exist.
      if (error.code && error.code !== '42883' && error.code !== '42P01') {
        console.error('[cast-rate-limit] database limiter failed', {
          code: error.code,
        });
      } else {
        console.warn(
          '[cast-rate-limit] distributed limiter unavailable; using memory fallback'
        );
      }

      return memoryFallback(options);
    }

    const row = (Array.isArray(data) ? data[0] : data) as ConsumeRow | null;

    if (!row || typeof row.allowed !== 'boolean') {
      return memoryFallback(options);
    }

    const resetAt =
      typeof row.reset_at === 'string' ? row.reset_at : null;
    const resetMs = resetAt ? Date.parse(resetAt) : NaN;

    return {
      allowed: row.allowed,
      remaining:
        typeof row.remaining === 'number'
          ? Math.max(0, row.remaining)
          : 0,
      retryAfterSeconds:
        Number.isFinite(resetMs) && resetMs > Date.now()
          ? Math.ceil((resetMs - Date.now()) / 1000)
          : options.windowSeconds,
      resetAt,
      store: 'database',
    };
  } catch (error) {
    console.error('[cast-rate-limit] database limiter error', {
      message: error instanceof Error ? error.message : 'unknown',
    });

    return memoryFallback(options);
  }
}
