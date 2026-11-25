/**
 * Framework-agnostic helpers for the public Temple chronology.
 *
 * Cursors are opaque to the browser and contain only the stable ordering pair
 * `(occurredAt, id)`. They never contain a user id, an email or a database
 * offset, so a page cannot be replayed against a different table.
 */

import {
  TEMPLE_CHRONICLES_MAX_PAGE_SIZE,
  TEMPLE_CHRONICLES_PAGE_SIZE,
  projectPublicTempleEvent,
  type TempleChronicleEvent,
  type TempleLogRow,
} from '@/lib/temple/feed';

export type TempleChroniclesCursor = {
  occurredAt: string;
  id: string;
};

export type TempleChroniclesPageSlice = {
  events: TempleChronicleEvent[];
  nextCursor: string | null;
  hasMore: boolean;
};

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;

function encodeBase64Url(value: string): string {
  const globalScope = globalThis as {
    btoa?: (input: string) => string;
    Buffer?: {
      from: (input: string, encoding: string) => {
        toString: (encoding: string) => string;
      };
    };
  };

  if (typeof globalScope.btoa === 'function') {
    return globalScope
      .btoa(value)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  if (globalScope.Buffer) {
    return globalScope.Buffer.from(value, 'utf8').toString('base64url');
  }

  return encodeURIComponent(value);
}

function decodeBase64Url(value: string): string {
  const globalScope = globalThis as {
    atob?: (input: string) => string;
    Buffer?: {
      from: (input: string, encoding: string) => {
        toString: (encoding: string) => string;
      };
    };
  };

  const padded = value.replace(/-/g, '+').replace(/_/g, '/');

  if (typeof globalScope.atob === 'function') {
    return globalScope.atob(
      padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '=')
    );
  }

  if (globalScope.Buffer) {
    return globalScope.Buffer.from(padded, 'base64').toString('utf8');
  }

  return decodeURIComponent(value);
}

export function encodeTempleCursor(
  event: Pick<TempleChronicleEvent, 'occurredAt' | 'id'>
): string {
  return encodeBase64Url(
    JSON.stringify({ occurredAt: event.occurredAt, id: event.id })
  );
}

export function decodeTempleCursor(
  raw: string | null | undefined
): TempleChroniclesCursor | null {
  if (!raw || typeof raw !== 'string') return null;

  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as {
      occurredAt?: unknown;
      id?: unknown;
    };

    if (typeof parsed.occurredAt !== 'string') return null;
    if (Number.isNaN(Date.parse(parsed.occurredAt))) return null;
    if (typeof parsed.id !== 'string' || !ID_PATTERN.test(parsed.id)) {
      return null;
    }

    return {
      occurredAt: new Date(parsed.occurredAt).toISOString(),
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function clampChroniclesLimit(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return TEMPLE_CHRONICLES_PAGE_SIZE;
  }

  return Math.min(
    TEMPLE_CHRONICLES_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(parsed))
  );
}

export function compareChronicleEventsNewestFirst(
  a: Pick<TempleChronicleEvent, 'occurredAt' | 'id'>,
  b: Pick<TempleChronicleEvent, 'occurredAt' | 'id'>
): number {
  const aTime = Date.parse(a.occurredAt);
  const bTime = Date.parse(b.occurredAt);

  if (bTime !== aTime) return bTime - aTime;

  return b.id.localeCompare(a.id);
}

/**
 * Projects rows and returns a page. The server fetches one extra row so
 * `hasMore` is known without a second count query.
 */
export function buildTempleChroniclesPage(
  rows: readonly TempleLogRow[],
  limit: number = TEMPLE_CHRONICLES_PAGE_SIZE
): TempleChroniclesPageSlice {
  const safeLimit = clampChroniclesLimit(limit);
  const seen = new Set<string>();
  const events: TempleChronicleEvent[] = [];

  rows.forEach((row, index) => {
    const event = projectPublicTempleEvent(row, index);
    if (!event) return;
    if (seen.has(event.id)) return;

    seen.add(event.id);
    events.push(event);
  });

  events.sort(compareChronicleEventsNewestFirst);

  const page = events.slice(0, safeLimit);
  const hasMore = events.length > safeLimit;
  const last = page[page.length - 1] ?? null;

  return {
    events: page,
    nextCursor: hasMore && last ? encodeTempleCursor(last) : null,
    hasMore,
  };
}

export function mergeTempleChronicleEvents(
  existing: readonly TempleChronicleEvent[],
  incoming: readonly TempleChronicleEvent[]
): TempleChronicleEvent[] {
  const byId = new Map<string, TempleChronicleEvent>();

  existing.forEach((event) => byId.set(event.id, event));
  incoming.forEach((event) => byId.set(event.id, event));

  return Array.from(byId.values()).sort(compareChronicleEventsNewestFirst);
}

export type TempleChronicleDay = {
  key: string;
  label: string;
  events: TempleChronicleEvent[];
};

const DAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function chronicleDayLabel(iso: string): string {
  return DAY_FORMATTER.format(new Date(iso));
}

/**
 * Groups a newest-first timeline into stable UTC calendar days. The label is
 * generated with a fixed locale and timezone so the server and browser render
 * identical text.
 */
export function groupTempleChronicleEvents(
  events: readonly TempleChronicleEvent[]
): TempleChronicleDay[] {
  const days: TempleChronicleDay[] = [];

  events.forEach((event) => {
    const key = dayKey(event.occurredAt);
    const current = days[days.length - 1];

    if (current?.key === key) {
      current.events.push(event);
      return;
    }

    days.push({
      key,
      label: chronicleDayLabel(event.occurredAt),
      events: [event],
    });
  });

  return days;
}
