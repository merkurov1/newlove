import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'crypto';
import { assertServerOnly } from '@/lib/serverOnly';
import type { TempleIdentity } from '@/lib/temple/identity';
import {
  TEMPLE_ANALYTICS_SESSION_WINDOW_MS,
  detectTempleAnalyticsChannel,
  isTempleAnalyticsEventName,
  normalizeTempleAnalyticsRitual,
  sanitizeTempleAnalyticsPath,
  sanitizeTempleAnalyticsSource,
  type TempleAnalyticsChannel,
  type TempleAnalyticsEventName,
  type TempleAnalyticsEventRow,
} from '@/lib/temple/analytics';

assertServerOnly('lib/temple/analytics.server');

export const TEMPLE_ANALYTICS_EVENTS_TABLE = 'temple_analytics_events';
export const TEMPLE_ANALYTICS_SESSIONS_TABLE = 'temple_analytics_sessions';

export const TEMPLE_ANALYTICS_VISITOR_COOKIE = 'temple_analytics_visitor';
export const TEMPLE_ANALYTICS_SESSION_COOKIE = 'temple_analytics_session';

const VISITOR_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const SESSION_COOKIE_MAX_AGE_SECONDS = TEMPLE_ANALYTICS_SESSION_WINDOW_MS / 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function analyticsSecret(): string {
  return (
    process.env.TEMPLE_ANALYTICS_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'temple-analytics-local-development'
  );
}

/**
 * Pseudonymous visitor key. The raw guest cookie, Telegram id and Supabase UUID
 * never leave this function; only the HMAC digest is persisted.
 */
export function hashTempleAnalyticsVisitor(namespace: string, value: string): string {
  const digest = createHmac('sha256', analyticsSecret())
    .update(`${namespace}:${value}`)
    .digest('hex')
    .slice(0, 40);

  return `v1:${digest}`;
}

export function parseCookieHeader(cookieHeader: string | null | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((part) => {
    const separator = part.indexOf('=');

    if (separator <= 0) return;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (!name) return;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  });

  return cookies;
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function resolveTempleAnalyticsVisitor(
  cookies: Record<string, string>,
  identity: TempleIdentity | null | undefined
): {
  visitorKey: string;
  identityKind: 'guest' | 'supabase' | 'telegram';
  visitorId: string;
  visitorCookie?: string;
} {
  if (identity && identity.source === 'supabase') {
    return {
      visitorKey: hashTempleAnalyticsVisitor('supabase', identity.userId),
      identityKind: 'supabase',
      visitorId: identity.userId,
    };
  }

  if (identity && identity.source === 'telegram') {
    return {
      visitorKey: hashTempleAnalyticsVisitor('telegram', identity.userId),
      identityKind: 'telegram',
      visitorId: identity.userId,
    };
  }

  const cookieVisitor = cookies[TEMPLE_ANALYTICS_VISITOR_COOKIE];

  if (validUuid(cookieVisitor)) {
    return {
      visitorKey: hashTempleAnalyticsVisitor('guest', cookieVisitor),
      identityKind: 'guest',
      visitorId: cookieVisitor,
    };
  }

  const visitorId = randomUUID();

  return {
    visitorKey: hashTempleAnalyticsVisitor('guest', visitorId),
    identityKind: 'guest',
    visitorId,
    visitorCookie: serializeCookie(
      TEMPLE_ANALYTICS_VISITOR_COOKIE,
      visitorId,
      VISITOR_COOKIE_MAX_AGE_SECONDS
    ),
  };
}

export function resolveTempleAnalyticsSession(cookies: Record<string, string>): {
  sessionKey: string;
  isNew: boolean;
  sessionCookie: string;
} {
  const existing = cookies[TEMPLE_ANALYTICS_SESSION_COOKIE];

  if (validUuid(existing)) {
    return {
      sessionKey: existing,
      isNew: false,
      sessionCookie: serializeCookie(
        TEMPLE_ANALYTICS_SESSION_COOKIE,
        existing,
        SESSION_COOKIE_MAX_AGE_SECONDS
      ),
    };
  }

  const sessionKey = randomUUID();

  return {
    sessionKey,
    isNew: true,
    sessionCookie: serializeCookie(
      TEMPLE_ANALYTICS_SESSION_COOKIE,
      sessionKey,
      SESSION_COOKIE_MAX_AGE_SECONDS
    ),
  };
}

/**
 * Coarse, non-identifying source. Same-origin navigation is `internal`;
 * otherwise use the external hostname or a short UTM source. Query strings and
 * paths are never stored.
 */
export function templeAnalyticsSourceFromRequest(request: Request): string | null {
  const explicit = request.headers.get('x-temple-source');

  if (explicit) return sanitizeTempleAnalyticsSource(explicit);

  const referer = request.headers.get('referer');

  if (!referer) return 'direct';

  try {
    const refererUrl = new URL(referer);
    const requestHost = new URL(request.url).hostname;

    if (refererUrl.hostname === requestHost) return 'internal';

    const campaign =
      refererUrl.searchParams.get('utm_source') || refererUrl.searchParams.get('source');

    return (
      sanitizeTempleAnalyticsSource(campaign) ??
      sanitizeTempleAnalyticsSource(refererUrl.hostname) ??
      'referral'
    );
  } catch {
    return sanitizeTempleAnalyticsSource(referer) ?? null;
  }
}

export function templeAnalyticsChannelFromRequest(
  request: Request,
  identity?: TempleIdentity | null
): TempleAnalyticsChannel {
  if (identity?.source === 'telegram') return 'telegram';

  return detectTempleAnalyticsChannel(
    request.headers.get('user-agent'),
    Boolean(request.headers.get('x-telegram-init-data'))
  );
}

export type RecordTempleAnalyticsOptions = {
  eventName: TempleAnalyticsEventName;
  identity?: TempleIdentity | null;
  ritual?: string | null;
  path?: string | null;
  source?: string | null;
  channel?: TempleAnalyticsChannel;
  eventKey?: string | null;
  nowMs?: number;
};

export type RecordTempleAnalyticsResult = {
  ok: boolean;
  setCookies: string[];
  error?: string;
};

type EventInsertRow = {
  event_key: string;
  event_name: string;
  occurred_at: string;
  visitor_key: string;
  session_key: string;
  identity_kind: string;
  channel: string;
  source: string | null;
  path: string | null;
  ritual: string | null;
};

function eventKeyFor(
  input: RecordTempleAnalyticsOptions,
  sessionKey: string,
  visitorKey: string,
  occurredAt: string
): string {
  if (typeof input.eventKey === 'string' && input.eventKey.trim()) {
    return input.eventKey.trim().slice(0, 160);
  }

  return [input.eventName, visitorKey, sessionKey, input.ritual ?? '', occurredAt]
    .join(':')
    .slice(0, 260);
}

/**
 * Records one privacy-safe analytics event and returns any cookies the caller
 * must attach to its response. Analytics is strictly additive: a missing table
 * or a database error must never break a Temple ritual.
 */
export async function recordTempleAnalyticsEvent(
  client: SupabaseClient,
  request: Request,
  input: RecordTempleAnalyticsOptions
): Promise<RecordTempleAnalyticsResult> {
  if (!isTempleAnalyticsEventName(input.eventName)) {
    return { ok: false, setCookies: [], error: 'unsupported event' };
  }

  try {
    const nowMs = input.nowMs ?? Date.now();
    const occurredAt = new Date(nowMs).toISOString();
    const cookies = parseCookieHeader(request.headers.get('cookie'));
    const visitor = resolveTempleAnalyticsVisitor(cookies, input.identity);
    const session = resolveTempleAnalyticsSession(cookies);
    const channel = input.channel ?? templeAnalyticsChannelFromRequest(request, input.identity);
    const source =
      sanitizeTempleAnalyticsSource(input.source) ?? templeAnalyticsSourceFromRequest(request);
    const path = sanitizeTempleAnalyticsPath(input.path);
    const ritual = normalizeTempleAnalyticsRitual(input.ritual);
    const setCookies: string[] = [];

    if (visitor.visitorCookie) setCookies.push(visitor.visitorCookie);
    setCookies.push(session.sessionCookie);

    if (session.isNew) {
      const { error: sessionError } = await client.from(TEMPLE_ANALYTICS_SESSIONS_TABLE).upsert(
        {
          session_key: session.sessionKey,
          visitor_key: visitor.visitorKey,
          identity_kind: visitor.identityKind,
          channel,
          source,
          started_at: occurredAt,
          last_seen_at: occurredAt,
        },
        { onConflict: 'session_key', ignoreDuplicates: true }
      );

      if (sessionError) {
        // The event can still be recorded; sessions are derived from events in
        // the report, so a missing session row must not drop the visit.
        console.warn('Temple analytics session write failed:', sessionError.message);
      }
    }

    const rows: EventInsertRow[] = [];

    if (session.isNew) {
      rows.push({
        event_key: `session_start:${session.sessionKey}`,
        event_name: 'session_start',
        occurred_at: occurredAt,
        visitor_key: visitor.visitorKey,
        session_key: session.sessionKey,
        identity_kind: visitor.identityKind,
        channel,
        source,
        path,
        ritual: null,
      });
    }

    rows.push({
      event_key: eventKeyFor(input, session.sessionKey, visitor.visitorKey, occurredAt),
      event_name: input.eventName,
      occurred_at: occurredAt,
      visitor_key: visitor.visitorKey,
      session_key: session.sessionKey,
      identity_kind: visitor.identityKind,
      channel,
      source,
      path,
      ritual,
    });

    const { error } = await client.from(TEMPLE_ANALYTICS_EVENTS_TABLE).upsert(rows, {
      onConflict: 'event_key',
      ignoreDuplicates: true,
    });

    if (error) {
      return { ok: false, setCookies, error: error.message };
    }

    return { ok: true, setCookies };
  } catch (error) {
    return {
      ok: false,
      setCookies: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function appendTempleAnalyticsCookies(
  response: Response,
  setCookies: readonly string[]
): void {
  setCookies.forEach((cookie) => {
    response.headers.append('Set-Cookie', cookie);
  });
}

type EventQueryClient = Pick<SupabaseClient, 'from'>;

const ANALYTICS_PAGE_SIZE = 1000;
const ANALYTICS_MAX_ROWS = 50_000;

export async function loadTempleAnalyticsEvents(
  client: EventQueryClient,
  options: { sinceMs: number; untilMs?: number; maxRows?: number }
): Promise<TempleAnalyticsEventRow[]> {
  const untilMs = options.untilMs ?? Date.now();
  const maxRows = Math.min(
    ANALYTICS_MAX_ROWS,
    Math.max(1, Math.floor(options.maxRows ?? ANALYTICS_MAX_ROWS))
  );
  const rows: TempleAnalyticsEventRow[] = [];
  let from = 0;

  while (rows.length < maxRows) {
    const to = Math.min(from + ANALYTICS_PAGE_SIZE - 1, maxRows - 1);
    const { data, error } = await client
      .from(TEMPLE_ANALYTICS_EVENTS_TABLE)
      .select(
        'event_key,event_name,occurred_at,visitor_key,session_key,identity_kind,channel,source,path,ritual'
      )
      .gte('occurred_at', new Date(options.sinceMs).toISOString())
      .lte('occurred_at', new Date(untilMs).toISOString())
      .order('occurred_at', { ascending: true })
      .order('event_key', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const page = (data ?? []) as TempleAnalyticsEventRow[];
    rows.push(...page);

    if (page.length < to - from + 1) break;

    from += ANALYTICS_PAGE_SIZE;
  }

  return rows;
}
