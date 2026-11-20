import type { IssueLang, IssuePayload } from './types';

/**
 * Header contract for a Flow issue.
 *
 * The same values are used by the web renderer, the email renderer and the
 * public archive so the period, number, timezone and masthead cannot drift
 * between them. The order below is the order in which they must be shown:
 *
 *   1. period
 *   2. issue number
 *   3. timezone note
 *   4. canonical address
 *   5. publication name
 */
export type IssueHeader = {
  period: string;
  issueNumber: string;
  timezone: string;
  address: string;
  brand: string;
};

const LOCALE: Record<IssueLang, string> = {
  ru: 'ru-RU',
  en: 'en-GB',
};

const ISSUE_WORD: Record<IssueLang, string> = {
  ru: 'ВЫПУСК',
  en: 'ISSUE',
};

const BRAND: Record<IssueLang, string> = {
  ru: 'ПОТОК',
  en: 'FLOW',
};

const TIMEZONE: Record<IssueLang, string> = {
  ru: 'ВРЕМЯ УКАЗАНО ПО UTC',
  en: 'TIMES ARE SHOWN IN UTC',
};

const ADDRESS = 'MERKUROV.LOVE/FLOW';

function formatDate(value: string | null | undefined, lang: IssueLang): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Uppercase editorial period. Example RU:
 * `6 НОЯБРЯ 2026 Г. — 13 НОЯБРЯ 2026 Г.`
 */
export function formatIssuePeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  lang: IssueLang
): string {
  const from = formatDate(start, lang);
  const to = formatDate(end, lang);

  if (from && to) return `${from} — ${to}`.toUpperCase();
  return (from || to).toUpperCase();
}

/** Example RU: `ВЫПУСК №25`. Example EN: `ISSUE №25`. */
export function formatIssueNumber(number: number | null | undefined, lang: IssueLang): string {
  const word = ISSUE_WORD[lang];

  return typeof number === 'number' && Number.isFinite(number)
    ? `${word} №${number}`
    : word;
}

export function issueBrand(lang: IssueLang): string {
  return BRAND[lang];
}

export function issueTimezoneLabel(lang: IssueLang): string {
  return TIMEZONE[lang];
}

export function issueAddress(): string {
  return ADDRESS;
}

export function buildIssueHeader(
  payload: Pick<IssuePayload, 'lang' | 'period'>,
  number?: number | null
): IssueHeader {
  const lang = payload.lang;

  return {
    period: formatIssuePeriod(payload.period?.start, payload.period?.end, lang),
    issueNumber: formatIssueNumber(number, lang),
    timezone: TIMEZONE[lang],
    address: ADDRESS,
    brand: BRAND[lang],
  };
}
