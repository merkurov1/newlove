import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getServerSupabaseClient,
  isAuthenticationError,
  requireAdminFromRequest,
} from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { resolveTempleIdentity, type TempleIdentity } from '@/lib/temple/identity';
import {
  TEMPLE_ANALYTICS_CLIENT_EVENT_NAMES,
  buildTempleAnalyticsReport,
  isTempleAnalyticsClientEventName,
  sanitizeTempleAnalyticsPath,
  sanitizeTempleAnalyticsSource,
} from '@/lib/temple/analytics';
import {
  appendTempleAnalyticsCookies,
  loadTempleAnalyticsEvents,
  recordTempleAnalyticsEvent,
} from '@/lib/temple/analytics.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function dayWindow(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) return 30;

  return Math.min(90, Math.max(1, Math.floor(parsed)));
}

/**
 * Records a client-observable intent event. Ritual open/completion is derived
 * by trusted server routes, so this endpoint only accepts the two client event
 * names in `TEMPLE_ANALYTICS_CLIENT_EVENT_NAMES`.
 */
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'temple-analytics',
  });

  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const event = (body as { event?: unknown } | null)?.event;

    if (!isTempleAnalyticsClientEventName(event)) {
      return NextResponse.json(
        {
          ok: false,
          error: `event must be one of: ${TEMPLE_ANALYTICS_CLIENT_EVENT_NAMES.join(', ')}`,
        },
        { status: 400, headers: NO_STORE }
      );
    }

    const payload = body as Record<string, unknown>;
    const eventKey =
      typeof payload.eventKey === 'string' ? payload.eventKey.trim().slice(0, 160) : null;

    let client: SupabaseClient;
    let identity: TempleIdentity | null = null;

    try {
      client = getServerSupabaseClient({ useServiceRole: true });
      identity = await resolveTempleIdentity(req, client);
    } catch (error) {
      // Analytics is additive. A missing service role or identity lookup
      // failure must not make the beacon retry forever.
      console.warn(
        'Temple analytics identity unavailable:',
        error instanceof Error ? error.message : String(error)
      );

      return NextResponse.json(
        { ok: false, error: 'analytics unavailable' },
        { status: 503, headers: NO_STORE }
      );
    }

    const result = await recordTempleAnalyticsEvent(client, req, {
      eventName: event,
      identity,
      eventKey,
      ritual: typeof payload.ritual === 'string' ? payload.ritual : null,
      path: typeof payload.path === 'string' ? sanitizeTempleAnalyticsPath(payload.path) : null,
      source:
        typeof payload.source === 'string' ? sanitizeTempleAnalyticsSource(payload.source) : null,
    });

    const response = NextResponse.json(
      { ok: result.ok },
      { status: result.ok ? 202 : 503, headers: NO_STORE }
    );

    appendTempleAnalyticsCookies(response, result.setCookies);

    return response;
  } catch (error) {
    console.error('Temple analytics error:', error instanceof Error ? error.message : error);

    return NextResponse.json(
      { ok: false, error: 'analytics unavailable' },
      { status: 503, headers: NO_STORE }
    );
  }
}

/**
 * Owner/admin-only aggregate report. It never returns event rows, identity
 * keys, names or message content.
 */
export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json(
        { ok: false, error: 'not authorized' },
        { status: 401, headers: NO_STORE }
      );
    }

    console.error(
      'Temple analytics admin check failed:',
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { ok: false, error: 'analytics unavailable' },
      { status: 500, headers: NO_STORE }
    );
  }

  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'temple-analytics-report',
  });

  if (limited) return limited;

  const url = new URL(req.url);
  const windowDays = dayWindow(url.searchParams.get('days'));
  const nowMs = Date.now();
  const sinceMs = nowMs - windowDays * 86_400_000;

  try {
    const client = getServerSupabaseClient({ useServiceRole: true });
    const rows = await loadTempleAnalyticsEvents(client, {
      sinceMs,
      untilMs: nowMs,
    });

    return NextResponse.json(
      {
        ok: true,
        report: buildTempleAnalyticsReport(rows, {
          nowMs,
          windowDays,
        }),
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    console.error(
      'Temple analytics report failed:',
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { ok: false, error: 'analytics unavailable' },
      { status: 503, headers: NO_STORE }
    );
  }
}
