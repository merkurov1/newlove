/**
 * Pure, timezone-aware reporting periods for Pierrot's owner commercial
 * answers. No database or network access lives here.
 */

export type ReportingPeriodKey =
  | 'last_7_days'
  | 'previous_7_days'
  | 'last_30_days'
  | 'current_month'
  | 'previous_month'
  | 'custom';

export type CustomPeriodInput = {
  /** Inclusive calendar date, YYYY-MM-DD. */
  start: string;
  /** Inclusive calendar date, YYYY-MM-DD. */
  end: string;
};

export type ReportingPeriod = {
  key: ReportingPeriodKey;
  timezone: string;
  /** Inclusive UTC instant. */
  start: Date;
  /** Exclusive UTC instant. */
  end: Date;
  previous: {
    start: Date;
    end: Date;
  };
  custom?: CustomPeriodInput;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/**
 * Converts a wall-clock time in a named IANA zone to a UTC instant. Iterative
 * correction handles DST boundaries without a third-party date library.
 */
export function zonedWallTimeToUtc(
  values: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string
): Date {
  const targetAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0
  );

  let guess = targetAsUtc;

  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const correction = targetAsUtc - actualAsUtc;

    guess += correction;

    if (correction === 0) break;
  }

  return new Date(guess);
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);

  return zonedWallTimeToUtc(
    { year: parts.year, month: parts.month, day: parts.day },
    timeZone
  );
}

export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);

  return zonedWallTimeToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day + days,
    },
    timeZone
  );
}

export function startOfZonedMonth(date: Date, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);

  return zonedWallTimeToUtc({ year: parts.year, month: parts.month, day: 1 }, timeZone);
}

export function addZonedMonths(date: Date, months: number, timeZone: string): Date {
  const parts = zonedParts(date, timeZone);
  const target = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));

  return zonedWallTimeToUtc(
    {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: 1,
    },
    timeZone
  );
}

export function parseCalendarDate(
  value: string,
  timezone: string,
  endOfDay = false
): Date | null {
  if (!DATE_PATTERN.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) return null;

  const start = zonedWallTimeToUtc({ year, month, day }, timezone);

  if (endOfDay) return addZonedDays(start, 1, timezone);

  return start;
}

function sameDurationPrevious(start: Date, end: Date): { start: Date; end: Date } {
  const duration = end.getTime() - start.getTime();

  return {
    start: new Date(start.getTime() - duration),
    end: new Date(start.getTime()),
  };
}

export function resolveReportingPeriod(
  key: ReportingPeriodKey,
  now: Date,
  timezone: string,
  custom?: CustomPeriodInput
): ReportingPeriod {
  const today = startOfZonedDay(now, timezone);
  const tomorrow = addZonedDays(today, 1, timezone);

  if (key === 'last_7_days') {
    const start = addZonedDays(today, -6, timezone);

    return {
      key,
      timezone,
      start,
      end: tomorrow,
      previous: {
        start: addZonedDays(today, -13, timezone),
        end: start,
      },
    };
  }

  if (key === 'previous_7_days') {
    const start = addZonedDays(today, -13, timezone);
    const end = addZonedDays(today, -6, timezone);

    return {
      key,
      timezone,
      start,
      end,
      previous: {
        start: addZonedDays(today, -20, timezone),
        end: start,
      },
    };
  }

  if (key === 'last_30_days') {
    const start = addZonedDays(today, -29, timezone);

    return {
      key,
      timezone,
      start,
      end: tomorrow,
      previous: {
        start: addZonedDays(today, -59, timezone),
        end: start,
      },
    };
  }

  if (key === 'current_month') {
    const start = startOfZonedMonth(now, timezone);
    const previousStart = addZonedMonths(start, -1, timezone);

    return {
      key,
      timezone,
      start,
      end: tomorrow,
      previous: {
        start: previousStart,
        end: start,
      },
    };
  }

  if (key === 'previous_month') {
    const currentStart = startOfZonedMonth(now, timezone);
    const start = addZonedMonths(currentStart, -1, timezone);
    const previousStart = addZonedMonths(currentStart, -2, timezone);

    return {
      key,
      timezone,
      start,
      end: currentStart,
      previous: {
        start: previousStart,
        end: start,
      },
    };
  }

  const start = custom ? parseCalendarDate(custom.start, timezone) : null;
  const end = custom ? parseCalendarDate(custom.end, timezone, true) : null;

  if (!start || !end || end <= start) {
    return resolveReportingPeriod('last_7_days', now, timezone);
  }

  return {
    key: 'custom',
    timezone,
    start,
    end,
    previous: sameDurationPrevious(start, end),
    custom,
  };
}

function formatDate(date: Date, timezone: string, language: 'ru' | 'en'): string {
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatReportingPeriod(
  period: ReportingPeriod,
  language: 'ru' | 'en'
): string {
  const inclusiveEnd = new Date(period.end.getTime() - 1);
  const start = formatDate(period.start, period.timezone, language);
  const end = formatDate(inclusiveEnd, period.timezone, language);

  if (period.key === 'current_month') {
    return language === 'ru'
      ? `текущий месяц, ${start} — ${end} (${period.timezone})`
      : `current month, ${start} — ${end} (${period.timezone})`;
  }

  if (period.key === 'previous_month') {
    return language === 'ru'
      ? `предыдущий месяц, ${start} — ${end} (${period.timezone})`
      : `previous month, ${start} — ${end} (${period.timezone})`;
  }

  if (period.key === 'previous_7_days') {
    return language === 'ru'
      ? `предыдущие семь дней, ${start} — ${end} (${period.timezone})`
      : `previous seven days, ${start} — ${end} (${period.timezone})`;
  }

  if (period.key === 'last_30_days') {
    return language === 'ru'
      ? `последние 30 дней, ${start} — ${end} (${period.timezone})`
      : `last 30 days, ${start} — ${end} (${period.timezone})`;
  }

  if (period.key === 'custom') {
    return language === 'ru'
      ? `${start} — ${end} (${period.timezone})`
      : `${start} — ${end} (${period.timezone})`;
  }

  return language === 'ru'
    ? `последние семь дней, ${start} — ${end} (${period.timezone})`
    : `last seven days, ${start} — ${end} (${period.timezone})`;
}

export function formatPreviousPeriod(
  period: ReportingPeriod,
  language: 'ru' | 'en'
): string {
  return formatReportingPeriod(
    {
      ...period,
      key: 'custom',
      start: period.previous.start,
      end: period.previous.end,
      previous: period.previous,
      custom: undefined,
    },
    language
  );
}
