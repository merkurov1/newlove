import type { IssueEntry, IssueLang, IssuePayload } from './types';

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function fallbackItems(payload: IssuePayload): IssueEntry[] {
  const entries: IssueEntry[] = [];
  const seen = new Set<string>();

  const add = (entry: IssueEntry | null | undefined) => {
    if (!entry || seen.has(entry.id)) return;
    seen.add(entry.id);
    entries.push(entry);
  };

  add(payload.lead);
  (payload.latest || []).forEach(add);
  (payload.links || []).forEach(add);
  (payload.videos || []).forEach(add);
  (payload.photos || []).forEach(add);

  return entries;
}

/** All materials represented by an issue, including legacy payloads. */
export function issueEntries(payload: IssuePayload): IssueEntry[] {
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    return payload.items;
  }

  return fallbackItems(payload);
}

/** The material that gives the issue its headline. */
export function issueMainEntry(payload: IssuePayload): IssueEntry | null {
  // Prefer the editorial lead, then the highest-ranked selected section.
  // `payload.items` is the raw source period and must not decide the title.
  return payload.lead || fallbackItems(payload)[0] || payload.items?.[0] || null;
}

export function formatIssueDate(value: string | null | undefined, lang: IssueLang): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Title contract:
 *   RU: `<main item title> — Flow / поток — <date>`
 *   EN: `<main item title> — Flow — <date>`
 */
export function buildIssueTitle(
  payload: IssuePayload,
  date: string | null = payload.period?.end ?? null
): string {
  const main = issueMainEntry(payload);
  const mainTitle =
    clean(main?.title) ||
    clean(payload.items?.find((entry) => clean(entry.title))?.title) ||
    (payload.lang === 'ru' ? 'Поток' : 'Flow');

  const brand = payload.lang === 'ru' ? 'Flow / поток' : 'Flow';
  const formattedDate = formatIssueDate(date, payload.lang);

  return [mainTitle, brand, formattedDate].filter(Boolean).join(' — ').slice(0, 500);
}
