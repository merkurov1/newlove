/**
 * Temple analytics event contract.
 *
 * These events describe visits and rituals, never people. A visitor is a
 * pseudonymous key derived on the server from a random guest cookie or a
 * verified identity namespace (`tg:` / `sb:`). Display names, authors, emails
 * and raw Telegram ids are never accepted as identity and never stored here.
 *
 * Event names:
 * - `session_start` — emitted once when the server creates a new 30-minute
 *   visit session. Refreshes inside the window reuse the session cookie and do
 *   not create another one.
 * - `page_view` — one per mounted Temple/Vigil page. A browser refresh is a new
 *   page view but still the same session.
 * - `ritual_open` — a ritual modal/surface was opened by the visitor.
 * - `ritual_nav` — the visitor selected a ritual from the Temple menu.
 * - `ritual_complete` — a ritual completed successfully. Only trusted server
 *   routes may emit this event; clients cannot inflate conversions.
 *
 * `event_key` is the idempotency key. A retried request with the same key is
 * ignored by the unique index, and the report de-duplicates defensively.
 */

export const TEMPLE_ANALYTICS_SESSION_WINDOW_MS = 30 * 60 * 1000;

export const TEMPLE_ANALYTICS_EVENT_NAMES = [
  'session_start',
  'page_view',
  'ritual_open',
  'ritual_nav',
  'ritual_complete',
] as const;

export const TEMPLE_ANALYTICS_CLIENT_EVENT_NAMES = ['page_view', 'ritual_nav'] as const;

export const TEMPLE_ANALYTICS_CHANNELS = ['web', 'telegram'] as const;
export const TEMPLE_ANALYTICS_IDENTITY_KINDS = ['guest', 'supabase', 'telegram'] as const;

export type TempleAnalyticsEventName = (typeof TEMPLE_ANALYTICS_EVENT_NAMES)[number];
export type TempleAnalyticsClientEventName = (typeof TEMPLE_ANALYTICS_CLIENT_EVENT_NAMES)[number];
export type TempleAnalyticsChannel = (typeof TEMPLE_ANALYTICS_CHANNELS)[number];
export type TempleAnalyticsIdentityKind = (typeof TEMPLE_ANALYTICS_IDENTITY_KINDS)[number];

export type TempleAnalyticsEventInput = {
  event: TempleAnalyticsEventName;
  ritual?: string | null;
  path?: string | null;
  source?: string | null;
  channel?: TempleAnalyticsChannel;
  eventKey?: string | null;
};

export type TempleAnalyticsEventRow = {
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

export type TempleAnalyticsBreakdown = {
  visitors: number;
  sessions: number;
  pageViews: number;
  ritualStarts: number;
  ritualCompletions: number;
};

export type TempleAnalyticsRitualBreakdown = {
  starts: number;
  completions: number;
};

export type TempleAnalyticsReport = {
  since: string;
  until: string;
  windowDays: number;
  uniqueVisitors: number;
  sessions: number;
  pageViews: number;
  ritualStarts: number;
  ritualCompletions: number;
  /** completions / starts, bounded to 0..1. Null when there are no starts. */
  conversionRate: number | null;
  /** Visitors active on at least two distinct UTC days. */
  returningVisitors: number;
  /** Visitors active again exactly on the day after their first seen day. */
  d1ReturningVisitors: number;
  /** Visitors active again on or after the seventh day from first seen. */
  d7ReturningVisitors: number;
  byChannel: Record<string, TempleAnalyticsBreakdown>;
  bySource: Record<string, TempleAnalyticsBreakdown>;
  byRitual: Record<string, TempleAnalyticsRitualBreakdown>;
  /**
   * Earliest observed analytics event in the requested window. Historical
   * anonymous temple_log traffic is never converted into visitor counts, so
   * this is a lower bound on when measurement became reliable, not a
   * fabricated backfill.
   */
  reliableSince: string | null;
  methodology: string;
};

export const TEMPLE_ANALYTICS_METHODOLOGY =
  'Pseudonymous visitor keys only (guest cookie hash, tg: hash or sb: hash). Visitors are identities, not verified people; guest and signed-in keys are never merged by name. Sessions are 30-minute server-cookie windows and do not restart on refresh. D1 means active on the next UTC day; D7 means active on or after the seventh UTC day. Historical temple_log rows are not backfilled and never produce visitor counts.';

const ALLOWED_PATH_PREFIXES = [
  '/temple',
  '/vigil',
  '/absolution',
  '/cast',
  '/heartandangel',
] as const;

const RITUAL_ALIASES: Record<string, string> = {
  CALM: 'MEDITATION',
  MEDITATION: 'MEDITATION',
  LETITGO: 'ASH',
  LET_IT_GO: 'ASH',
  LET_GO: 'ASH',
  ASH: 'ASH',
  ABSOLUTION: 'ABSOLUTION',
  CAST: 'CAST',
  VIGIL: 'VIGIL',
  VIGILSPARK: 'VIGIL_SPARK',
  VIGIL_SPARK: 'VIGIL_SPARK',
  WHISPER: 'WHISPER',
  SILENCE: 'SILENCE',
  HEARTANDANGEL: 'HEARTANDANGEL',
  HEART_AND_ANGEL: 'HEARTANDANGEL',
  TRIBUTE: 'TRIBUTE',
};

export function isTempleAnalyticsEventName(value: unknown): value is TempleAnalyticsEventName {
  return (
    typeof value === 'string' && (TEMPLE_ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function isTempleAnalyticsClientEventName(
  value: unknown
): value is TempleAnalyticsClientEventName {
  return (
    typeof value === 'string' &&
    (TEMPLE_ANALYTICS_CLIENT_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function isTempleAnalyticsChannel(value: unknown): value is TempleAnalyticsChannel {
  return (
    typeof value === 'string' && (TEMPLE_ANALYTICS_CHANNELS as readonly string[]).includes(value)
  );
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Canonical ritual name, or null for input that is not a known ritual. */
export function normalizeTempleAnalyticsRitual(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const token = normalizeToken(value);

  if (!token) return null;

  if (RITUAL_ALIASES[token]) return RITUAL_ALIASES[token];

  const withoutRitualSuffix = token.replace(/_RITUAL$/, '');

  return RITUAL_ALIASES[withoutRitualSuffix] ?? null;
}

/**
 * Only known Temple paths are recorded. Query strings, fragments and
 * arbitrary URL parameters are dropped so no private token can reach the
 * analytics table.
 */
export function sanitizeTempleAnalyticsPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  const withoutQuery = trimmed.split(/[?#]/, 1)[0];

  if (!withoutQuery.startsWith('/')) return null;

  const allowed = ALLOWED_PATH_PREFIXES.some(
    (prefix) => withoutQuery === prefix || withoutQuery.startsWith(`${prefix}/`)
  );

  if (!allowed) return null;

  return withoutQuery.slice(0, 120);
}

/**
 * Source is a coarse channel: `direct`, `internal`, an external hostname or a
 * short UTM campaign token. Everything after the host/path separator is
 * discarded, and only a conservative character set survives.
 */
export function sanitizeTempleAnalyticsSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().toLowerCase();

  if (!trimmed) return null;

  let source = trimmed;

  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)) {
      source = new URL(trimmed).hostname;
    } else {
      source = trimmed.split(/[/?#]/, 1)[0];
    }
  } catch {
    source = trimmed.split(/[/?#]/, 1)[0];
  }

  source = source
    .replace(/^www\./, '')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (!source) return null;

  return source.slice(0, 64);
}

export function detectTempleAnalyticsChannel(
  userAgent: unknown,
  hasTelegramInitData: boolean = false
): TempleAnalyticsChannel {
  if (hasTelegramInitData) return 'telegram';

  if (typeof userAgent === 'string' && /telegram/i.test(userAgent)) {
    return 'telegram';
  }

  return 'web';
}

/** Stable idempotency key for a server-derived ritual action. */
export function templeAnalyticsActionKey(prefix: string, stableId: string | number): string {
  return `${prefix}:${String(stableId).slice(0, 120)}`;
}

function emptyBreakdown(): TempleAnalyticsBreakdown {
  return {
    visitors: 0,
    sessions: 0,
    pageViews: 0,
    ritualStarts: 0,
    ritualCompletions: 0,
  };
}

function breakdownKey(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toLowerCase().slice(0, 64);
  }

  return fallback;
}

function utcDay(value: string): number | null {
  const ms = Date.parse(value);

  if (!Number.isFinite(ms)) return null;

  return Math.floor(ms / 86_400_000);
}

/**
 * Builds the owner-facing report from event rows. It is pure so the metric
 * definitions are testable without a database, and it defensively de-duplicates
 * by `event_key` in case a retried write bypassed the unique index.
 */
export function buildTempleAnalyticsReport(
  rows: readonly TempleAnalyticsEventRow[],
  options: {
    nowMs?: number;
    windowDays?: number;
    reliableSince?: string | null;
  } = {}
): TempleAnalyticsReport {
  const nowMs = options.nowMs ?? Date.now();
  const windowDays = Math.max(1, Math.min(366, Math.floor(options.windowDays ?? 30)));
  const sinceMs = nowMs - windowDays * 86_400_000;
  const untilMs = nowMs;

  const accepted = new Set<string>();
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const visitorDays = new Map<string, Set<number>>();
  const channelVisitors = new Map<string, Set<string>>();
  const channelSessions = new Map<string, Set<string>>();
  const sourceVisitors = new Map<string, Set<string>>();
  const sourceSessions = new Map<string, Set<string>>();
  const byChannel: Record<string, TempleAnalyticsBreakdown> = {};
  const bySource: Record<string, TempleAnalyticsBreakdown> = {};
  const byRitual: Record<string, TempleAnalyticsRitualBreakdown> = {};

  let pageViews = 0;
  let ritualStarts = 0;
  let ritualCompletions = 0;
  let earliest: number | null = null;

  const bucket = (
    target: Record<string, TempleAnalyticsBreakdown>,
    key: string
  ): TempleAnalyticsBreakdown => {
    const existing = target[key] ?? emptyBreakdown();
    target[key] = existing;
    return existing;
  };

  const addToSet = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key) ?? new Set<string>();
    set.add(value);
    map.set(key, set);
  };

  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    if (typeof row.event_key !== 'string' || !row.event_key) return;
    if (accepted.has(row.event_key)) return;
    accepted.add(row.event_key);

    const occurredMs = Date.parse(row.occurred_at);

    if (!Number.isFinite(occurredMs) || occurredMs < sinceMs || occurredMs > untilMs) {
      return;
    }

    const visitorKey =
      typeof row.visitor_key === 'string' && row.visitor_key ? row.visitor_key : 'unknown';
    const sessionKey =
      typeof row.session_key === 'string' && row.session_key
        ? row.session_key
        : `unknown:${visitorKey}`;
    const channel = breakdownKey(row.channel, 'unknown');
    const source = breakdownKey(row.source, 'direct');
    const day = utcDay(row.occurred_at);

    if (earliest === null || occurredMs < earliest) earliest = occurredMs;

    visitors.add(visitorKey);
    sessions.add(sessionKey);
    addToSet(channelVisitors, channel, visitorKey);
    addToSet(channelSessions, channel, sessionKey);
    addToSet(sourceVisitors, source, visitorKey);
    addToSet(sourceSessions, source, sessionKey);

    if (day !== null) {
      const days = visitorDays.get(visitorKey) ?? new Set<number>();
      days.add(day);
      visitorDays.set(visitorKey, days);
    }

    const channelBreakdown = bucket(byChannel, channel);
    const sourceBreakdown = bucket(bySource, source);

    switch (row.event_name) {
      case 'page_view':
        pageViews += 1;
        channelBreakdown.pageViews += 1;
        sourceBreakdown.pageViews += 1;
        break;
      case 'ritual_open':
        ritualStarts += 1;
        channelBreakdown.ritualStarts += 1;
        sourceBreakdown.ritualStarts += 1;
        addRitualStart(byRitual, row.ritual);
        break;
      case 'ritual_complete':
        ritualCompletions += 1;
        channelBreakdown.ritualCompletions += 1;
        sourceBreakdown.ritualCompletions += 1;
        addRitualCompletion(byRitual, row.ritual);
        break;
      default:
        break;
    }
  });

  Object.entries(byChannel).forEach(([key, value]) => {
    value.visitors = channelVisitors.get(key)?.size ?? 0;
    value.sessions = channelSessions.get(key)?.size ?? 0;
  });

  Object.entries(bySource).forEach(([key, value]) => {
    value.visitors = sourceVisitors.get(key)?.size ?? 0;
    value.sessions = sourceSessions.get(key)?.size ?? 0;
  });

  let returningVisitors = 0;
  let d1ReturningVisitors = 0;
  let d7ReturningVisitors = 0;

  visitorDays.forEach((days) => {
    if (days.size === 0) return;

    const first = Math.min(...days);

    if (days.size > 1) returningVisitors += 1;
    if (days.has(first + 1)) d1ReturningVisitors += 1;
    if (Array.from(days).some((day) => day >= first + 7)) {
      d7ReturningVisitors += 1;
    }
  });

  return {
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
    windowDays,
    uniqueVisitors: visitors.size,
    sessions: sessions.size,
    pageViews,
    ritualStarts,
    ritualCompletions,
    conversionRate:
      ritualStarts === 0
        ? null
        : Math.round(Math.min(1, ritualCompletions / ritualStarts) * 10_000) / 10_000,
    returningVisitors,
    d1ReturningVisitors,
    d7ReturningVisitors,
    byChannel,
    bySource,
    byRitual,
    reliableSince:
      options.reliableSince ?? (earliest === null ? null : new Date(earliest).toISOString()),
    methodology: TEMPLE_ANALYTICS_METHODOLOGY,
  };
}

function addRitualStart(
  target: Record<string, TempleAnalyticsRitualBreakdown>,
  value: unknown
): void {
  const ritual = normalizeTempleAnalyticsRitual(value) ?? 'UNKNOWN';
  const current = target[ritual] ?? { starts: 0, completions: 0 };
  current.starts += 1;
  target[ritual] = current;
}

function addRitualCompletion(
  target: Record<string, TempleAnalyticsRitualBreakdown>,
  value: unknown
): void {
  const ritual = normalizeTempleAnalyticsRitual(value) ?? 'UNKNOWN';
  const current = target[ritual] ?? { starts: 0, completions: 0 };
  current.completions += 1;
  target[ritual] = current;
}
