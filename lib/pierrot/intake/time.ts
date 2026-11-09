export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type TimeZoneResolution = {
  timezone: string;
  /** False when the configured owner timezone is absent and UTC is a fallback. */
  known: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * The owner timezone is configuration, never the server timezone. If it is not
 * configured, callers must say that day boundaries are approximate.
 */
export function resolveOwnerTimeZone(): TimeZoneResolution {
  const configured = (
    process.env.PIERROT_INTAKE_TIMEZONE ||
    process.env.PIERROT_OWNER_TIMEZONE ||
    ''
  ).trim();

  if (isValidTimeZone(configured)) {
    return { timezone: configured, known: true };
  }

  return { timezone: 'UTC', known: false };
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour') === 24 ? 0 : value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

/**
 * Converts a wall-clock time in an IANA timezone to a UTC Date. The offset is
 * resolved twice so DST transitions are handled without a timezone library.
 */
export function zonedTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const firstOffset = offsetMs(new Date(guess), timeZone);
  let result = guess - firstOffset;
  const secondOffset = offsetMs(new Date(result), timeZone);
  if (secondOffset !== firstOffset) result = guess - secondOffset;
  return new Date(result);
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  return zonedParts(date, timeZone);
}

export function addLocalDays(parts: ZonedParts, days: number): ZonedParts {
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, parts.hour, parts.minute, parts.second)
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function startOfLocalDay(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  return zonedTimeToUtc(
    { ...parts, hour: 0, minute: 0, second: 0 },
    timeZone
  );
}

export function localDayRange(input: {
  now?: Date;
  timeZone: string;
  dayOffset?: number;
  days?: number;
}): { from: Date; to: Date } {
  const now = input.now || new Date();
  const timeZone = input.timeZone;
  const dayOffset = input.dayOffset || 0;
  const days = input.days || 1;

  const nowParts = zonedParts(now, timeZone);
  const shifted = addLocalDays({ ...nowParts, hour: 0, minute: 0, second: 0 }, dayOffset);
  const from = zonedTimeToUtc(shifted, timeZone);
  const endParts = addLocalDays({ ...shifted, hour: 0, minute: 0, second: 0 }, days);
  const to = zonedTimeToUtc(endParts, timeZone);
  return { from, to };
}

export function formatLocalTime(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatLocalDate(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function toIso(value: Date): string {
  return value.toISOString();
}

export function localStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(
    date.getUTCHours()
  )}${pad(date.getUTCMinutes())}`;
}
