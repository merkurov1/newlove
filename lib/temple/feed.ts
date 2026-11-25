/**
 * Shared, framework-agnostic definitions for the public Temple feed.
 *
 * The raw `temple_log` rows are intentionally never rewritten here. A row keeps
 * its original `event_type`; classification only adds an explicit, reversible
 * canonical type/category on top of it. This makes legacy case variants safe to
 * display and aggregate without deleting or mutating history.
 *
 * Definitions:
 * - Ritual: a completed ritual signal written by a ritual flow.
 * - Incomplete: an intent/open signal (modal opened, intensity sample) that is
 *   not evidence that a ritual was completed.
 * - Infrastructure: entry/navigation noise that must never crowd out rituals.
 * - Unclassified: an unknown legacy type. It is preserved for audit but is not
 *   presented as a completed ritual.
 */

export const TEMPLE_TRACE_LIMIT = 7;
export const TEMPLE_TRACE_FETCH_LIMIT = 50;
export const TEMPLE_FEED_TTL_SECONDS = 60;
export const TEMPLE_FEED_TTL_MS = TEMPLE_FEED_TTL_SECONDS * 1000;
export const TEMPLE_CHRONICLES_WINDOW_DAYS = 30;
export const TEMPLE_CHRONICLES_WINDOW_MS =
  TEMPLE_CHRONICLES_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const TEMPLE_AGGREGATE_PAGE_SIZE = 1000;
export const TEMPLE_AGGREGATE_MAX_ROWS = 10_000;
// v2 contains only allowlisted descriptions and opt-in identity. The previous
// key is intentionally not reused so an old browser snapshot with raw stored
// messages can never be rendered after this privacy change.
export const TEMPLE_FEED_CACHE_KEY = 'temple:feed:v2';

/** Default page size for the browsable public chronology. */
export const TEMPLE_CHRONICLES_PAGE_SIZE = 20;
export const TEMPLE_CHRONICLES_MAX_PAGE_SIZE = 50;

export const RITUAL_EVENT_TYPES = [
  'VIGIL',
  'VIGIL_SPARK',
  'ASH',
  'CAST',
  'ABSOLUTION',
  'TRIBUTE',
  'MEDITATION',
  'SILENCE',
  'HEARTANDANGEL',
  'WHISPER',
] as const;

/**
 * The only public wording the chronicle uses. Raw stored messages are never
 * copied into a public event: some legacy rows contain confession text,
 * archetype answers or client telemetry from older versions of the Temple.
 */
export const TEMPLE_RITUAL_DEFINITIONS: Record<
  string,
  { label: string; description: string }
> = {
  VIGIL: {
    label: 'Vigil',
    description: 'Kept watch at the Vigil.',
  },
  VIGIL_SPARK: {
    label: 'Vigil',
    description: 'Added a spark to the shared Vigil.',
  },
  ASH: {
    label: 'Let It Go',
    description: 'Released a burden and let it go.',
  },
  CAST: {
    label: 'Cast',
    description: 'Completed the Cast ritual.',
  },
  ABSOLUTION: {
    label: 'Absolution',
    description: 'Completed the Absolution ritual.',
  },
  TRIBUTE: {
    label: 'Tribute',
    description: 'Offered a tribute to the Temple.',
  },
  MEDITATION: {
    label: 'Calm',
    description: 'Completed a Calm meditation.',
  },
  SILENCE: {
    label: 'Calm',
    description: 'Kept a moment of silence.',
  },
  HEARTANDANGEL: {
    label: 'Calm',
    description: 'Held the Heart & Angel.',
  },
  WHISPER: {
    label: 'Whisper',
    description: 'Left a whisper in the Temple.',
  },
};

export const TEMPLE_FALLBACK_RITUAL_DEFINITION = {
  label: 'Ritual',
  description: 'Completed a ritual at the Temple.',
} as const;

export const INCOMPLETE_EVENT_TYPES = ['MODAL_OPEN', 'INTENSITY'] as const;

export const INFRASTRUCTURE_EVENT_TYPES = [
  'ENTER',
  'NAV',
  'PAGE_VIEW',
  'VISIT',
  'VIEW',
] as const;

export type TempleEventCategory =
  | 'ritual'
  | 'incomplete'
  | 'infrastructure'
  | 'unclassified';

const RITUAL_EVENT_SET = new Set<string>(RITUAL_EVENT_TYPES);
const INCOMPLETE_EVENT_SET = new Set<string>(INCOMPLETE_EVENT_TYPES);
const INFRASTRUCTURE_EVENT_SET = new Set<string>(INFRASTRUCTURE_EVENT_TYPES);

/**
 * `or` filters for PostgREST. They are broad enough to include known legacy
 * spellings but the canonical classifier below is the final guard.
 */
export const TEMPLE_RITUAL_QUERY_PATTERNS = [
  'ASH*',
  'LET*GO*',
  'VIGIL*',
  'CAST*',
  'ABSOLUTION*',
  'TRIBUTE*',
  'MEDITATION*',
  'CALM*',
  'SILENCE*',
  'HEART*ANGEL*',
  'WHISPER*',
] as const;

export const TEMPLE_INFRASTRUCTURE_QUERY_PATTERNS = [
  'ENTER*',
  'NAV*',
  'PAGE*',
  'VISIT*',
  'VIEW*',
] as const;

export const TEMPLE_INCOMPLETE_QUERY_PATTERNS = [
  'MODAL*',
  'INTENSITY*',
] as const;

export function templeOrFilter(patterns: readonly string[]): string {
  return patterns.map((pattern) => `event_type.ilike.${pattern}`).join(',');
}

export const TEMPLE_RITUAL_OR_FILTER = templeOrFilter(
  TEMPLE_RITUAL_QUERY_PATTERNS
);
export const TEMPLE_INFRASTRUCTURE_OR_FILTER = templeOrFilter(
  TEMPLE_INFRASTRUCTURE_QUERY_PATTERNS
);
export const TEMPLE_INCOMPLETE_OR_FILTER = templeOrFilter(
  TEMPLE_INCOMPLETE_QUERY_PATTERNS
);

const NORMALIZATION_ALIASES: Record<string, string> = {
  LETITGO: 'ASH',
  LETGO: 'ASH',
  LET_GO: 'ASH',
  LETTING_GO: 'ASH',
  LET_IT_GO: 'ASH',
  VIGILSPARK: 'VIGIL_SPARK',
  HEART_AND_ANGEL: 'HEARTANDANGEL',
  HEART_ANGEL: 'HEARTANDANGEL',
  CALM: 'MEDITATION',
  PAGEVIEW: 'NAV',
  NAVIGATION: 'NAV',
  ENTERED: 'ENTER',
  MODALOPEN: 'MODAL_OPEN',
};

/**
 * Canonicalizes a stored event type without losing the raw value. Whitespace,
 * hyphens, slashes and ampersands collapse to a single underscore, so
 * `vigil-spark`, `Vigil Spark` and `VIGIL_SPARK` become the same key.
 */
export function normalizeTempleEventType(raw: unknown): string {
  const normalized = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return NORMALIZATION_ALIASES[normalized] ?? normalized;
}

export function classifyTempleEventType(raw: unknown): TempleEventCategory {
  const canonical = normalizeTempleEventType(raw);

  if (RITUAL_EVENT_SET.has(canonical)) return 'ritual';
  if (INCOMPLETE_EVENT_SET.has(canonical)) return 'incomplete';
  if (INFRASTRUCTURE_EVENT_SET.has(canonical)) return 'infrastructure';

  return 'unclassified';
}

const GENERIC_AUTHOR_KEYS = new Set([
  '',
  '-',
  'anonymous',
  'guest',
  'n/a',
  'none',
  'pilgrim',
  'temple',
  'unknown',
]);

export function normalizeAuthorKey(author: unknown): string {
  return String(author ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isNamedTempleAuthor(author: unknown): boolean {
  return !GENERIC_AUTHOR_KEYS.has(normalizeAuthorKey(author));
}

export type TempleLogRow = {
  id?: string | number | null;
  event_type?: string | null;
  author?: string | null;
  message?: string | null;
  created_at?: string | null;
  audio_url?: string | null;
  /** Explicit visitor opt-in. Missing on legacy rows and therefore private. */
  is_public_identity?: boolean | null;
};

/**
 * One public chronicle event. This is the projection allowlist: no stored
 * message, user id, audio URL, email or other metadata crosses this boundary.
 */
export type TempleChronicleEvent = {
  id: string;
  ritual: string;
  ritualLabel: string;
  description: string;
  occurredAt: string;
  /** Present only when the visitor explicitly opted in. */
  visitor: string | null;
};

export type TempleTrace = {
  id: string;
  /** Original database value. Never rewritten. */
  event_type: string | null;
  canonical_type: string;
  category: 'ritual';
  author: string;
  description: string;
  public_identity: boolean;
  /** Kept for older consumers; contains the human description, not raw data. */
  message: string;
  created_at: string;
  audio_url: string | null;
};

export type TempleChroniclesStats = {
  completedRituals: number;
  /** Distinct publicly named visitors. Anonymous visitors are never counted. */
  namedAuthors: number;
  vigilSparks: number;
  byType: Record<string, number>;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  truncated: boolean;
};

export type TempleFeedMeta = {
  generatedAt: string;
  stale: boolean;
};

export type TempleFeedPayload = {
  ok: true;
  data: TempleTrace[];
  stats: TempleChroniclesStats;
  meta: TempleFeedMeta;
  error: null;
};

export type TemplePublicAggregates = TempleChroniclesStats;

export type TempleChroniclesPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

export type TempleChroniclesPage = {
  ok: true;
  events: TempleChronicleEvent[];
  pageInfo: TempleChroniclesPageInfo;
  aggregates: TemplePublicAggregates | null;
  error: null;
};

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowDedupeKey(row: TempleLogRow, index: number): string {
  if (row.id !== null && row.id !== undefined && String(row.id).trim()) {
    return `id:${String(row.id)}`;
  }

  return [
    'row',
    row.created_at ?? '',
    row.event_type ?? '',
    row.author ?? '',
    row.message ?? '',
    index,
  ].join('|');
}

function compareRowsNewestFirst(
  a: { row: TempleLogRow; createdAtMs: number },
  b: { row: TempleLogRow; createdAtMs: number }
): number {
  if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;

  const aId = String(a.row.id ?? '');
  const bId = String(b.row.id ?? '');

  return bId.localeCompare(aId);
}

const PRIVATE_IDENTITY_EVENTS = new Set(['ABSOLUTION']);

function publicVisitorName(row: TempleLogRow, canonical: string): string | null {
  if (row.is_public_identity !== true) return null;
  if (PRIVATE_IDENTITY_EVENTS.has(canonical)) return null;
  if (!isNamedTempleAuthor(row.author)) return null;

  return String(row.author ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

/**
 * Builds the only public shape of a Temple event. It deliberately ignores the
 * stored `message` column: older rows may contain confession text, raw Cast
 * answers or client telemetry. Identity is included only after an explicit
 * opt-in, and Absolution can never publish a name.
 */
export function projectPublicTempleEvent(
  row: TempleLogRow,
  index: number = 0
): TempleChronicleEvent | null {
  const createdAtMs = parseTimestamp(row.created_at);
  if (createdAtMs === null) return null;
  if (classifyTempleEventType(row.event_type) !== 'ritual') return null;

  const canonical = normalizeTempleEventType(row.event_type);
  const definition =
    TEMPLE_RITUAL_DEFINITIONS[canonical] ?? TEMPLE_FALLBACK_RITUAL_DEFINITION;

  return {
    id: String(row.id ?? `${row.created_at}-${index}`),
    ritual: canonical,
    ritualLabel: definition.label,
    description: definition.description,
    occurredAt: new Date(createdAtMs).toISOString(),
    visitor: publicVisitorName(row, canonical),
  };
}

/**
 * Turns eligible rows into the trace shape returned by the home API. Keeping
 * the raw snake_case fields means older consumers keep working while new
 * consumers can use the canonical classification and human description.
 */
export function selectTempleTraces(
  rows: readonly TempleLogRow[],
  limit: number = TEMPLE_TRACE_LIMIT
): TempleTrace[] {
  const seen = new Set<string>();
  const eligible: Array<{
    row: TempleLogRow;
    createdAtMs: number;
    trace: TempleTrace;
  }> = [];

  rows.forEach((row, index) => {
    const createdAtMs = parseTimestamp(row.created_at);
    if (createdAtMs === null) return;

    const key = rowDedupeKey(row, index);
    if (seen.has(key)) return;

    const event = projectPublicTempleEvent(row, index);
    if (!event) return;
    seen.add(key);

    eligible.push({
      row,
      createdAtMs,
      trace: {
        id: event.id,
        event_type: row.event_type ?? null,
        canonical_type: event.ritual,
        category: 'ritual',
        author: event.visitor ?? 'Anonymous',
        description: event.description,
        public_identity: event.visitor !== null,
        message: event.description,
        created_at: event.occurredAt,
        audio_url: row.audio_url ?? null,
      },
    });
  });

  eligible.sort(compareRowsNewestFirst);

  return eligible.slice(0, Math.max(0, limit)).map((item) => item.trace);
}

export type TempleAggregate = {
  completedRituals: number;
  namedAuthors: number;
  vigilSparks: number;
  byType: Record<string, number>;
};

/**
 * Aggregates only ritual rows inside an inclusive window. Every raw row is
 * counted at most once, even when its legacy spelling differs from another
 * row's spelling of the same ritual.
 */
export function aggregateTempleRows(
  rows: readonly TempleLogRow[],
  windowStartMs: number,
  windowEndMs: number
): TempleAggregate {
  const seen = new Set<string>();
  const authors = new Set<string>();
  const byType: Record<string, number> = {};
  let completedRituals = 0;
  let vigilSparks = 0;

  rows.forEach((row, index) => {
    const createdAtMs = parseTimestamp(row.created_at);
    if (createdAtMs === null) return;
    if (createdAtMs < windowStartMs || createdAtMs > windowEndMs) return;

    if (classifyTempleEventType(row.event_type) !== 'ritual') return;

    const key = rowDedupeKey(row, index);
    if (seen.has(key)) return;
    seen.add(key);

    const canonical = normalizeTempleEventType(row.event_type);
    completedRituals += 1;
    byType[canonical] = (byType[canonical] ?? 0) + 1;

    if (canonical === 'VIGIL' || canonical === 'VIGIL_SPARK') {
      vigilSparks += 1;
    }

    // A name is a public aggregate only when the visitor explicitly opted in.
    // Otherwise the count could reveal that named rows exist in the archive.
    if (row.is_public_identity === true && isNamedTempleAuthor(row.author)) {
      authors.add(normalizeAuthorKey(row.author));
    }
  });

  return {
    completedRituals,
    namedAuthors: authors.size,
    vigilSparks,
    byType,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Client-side validator for cached and fetched payloads. It rejects malformed
 * data instead of letting a partial response erase the last known good feed.
 */
export function isTempleFeedPayload(value: unknown): value is TempleFeedPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;

  if (payload.ok !== true || !Array.isArray(payload.data)) return false;

  const stats = payload.stats;
  const meta = payload.meta;
  if (!stats || typeof stats !== 'object' || !meta || typeof meta !== 'object') {
    return false;
  }

  const s = stats as Record<string, unknown>;
  const m = meta as Record<string, unknown>;

  if (!isFiniteNumber(s.completedRituals)) return false;
  if (!isFiniteNumber(s.namedAuthors)) return false;
  if (!isFiniteNumber(s.vigilSparks)) return false;
  if (!isFiniteNumber(s.windowDays)) return false;
  if (typeof s.windowStart !== 'string' || typeof s.windowEnd !== 'string') {
    return false;
  }
  if (typeof m.generatedAt !== 'string') return false;
  if (typeof m.stale !== 'boolean') return false;

  return true;
}

/**
 * Client-side validator for a chronicle page. A malformed page must never
 * replace a valid timeline with partial or arbitrary data.
 */
export function isTempleChroniclesPage(
  value: unknown
): value is TempleChroniclesPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Record<string, unknown>;

  if (page.ok !== true || !Array.isArray(page.events)) return false;

  const info = page.pageInfo;
  if (!info || typeof info !== 'object') return false;

  const i = info as Record<string, unknown>;
  if (i.nextCursor !== null && typeof i.nextCursor !== 'string') return false;
  if (typeof i.hasMore !== 'boolean') return false;

  return page.events.every((event) => {
    if (!event || typeof event !== 'object') return false;
    const e = event as Record<string, unknown>;

    return (
      typeof e.id === 'string' &&
      typeof e.ritual === 'string' &&
      typeof e.ritualLabel === 'string' &&
      typeof e.description === 'string' &&
      typeof e.occurredAt === 'string' &&
      (e.visitor === null || typeof e.visitor === 'string')
    );
  });
}
