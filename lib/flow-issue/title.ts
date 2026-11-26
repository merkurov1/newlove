import { getLinkPresentation } from './metadata';
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
 * The publication that supplied the headline material. External sources keep
 * their own name; an own note has no source and therefore no separator.
 */
export function issueEntrySource(entry: IssueEntry | null | undefined): string {
  if (!entry) return '';

  const metadata = entry.metadata || {};
  const link = getLinkPresentation(metadata);
  const legacy = entry as IssueEntry & { siteName?: string; source?: string; author?: string };

  const explicit =
    clean(link.siteName) ||
    clean(legacy.siteName) ||
    clean(legacy.source) ||
    clean(metadata.youtube?.author_name) ||
    clean(metadata.youtube?.channel) ||
    clean(metadata.site_name) ||
    clean(metadata.source);

  if (explicit) return explicit;

  if (!entry.own && entry.url) {
    try {
      return new URL(entry.url).hostname.replace(/^www\./, '');
    } catch {
      // Ignore malformed URLs.
    }
  }

  return '';
}

/**
 * Title contract (control example):
 *   RU: `Tomb in Siberia reveals humans were using cannabis 2800 years ago |
 *        New Scientist | Поток - 13 ноября 2026 г.`
 *   EN: `<main item title> | <source> | Flow - 13 November 2026`
 *
 * The issue signature always closes the title, so a long source name can
 * never truncate the publication and date. New titles use a bare separator
 * instead of wrapping the signature in «…». Stored legacy titles are handled
 * by `resolveIssueTitle` and must not be rewritten retroactively.
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
  const indexedSource = Array.isArray(payload.sourceIndex)
    ? clean(payload.sourceIndex.find((source) => source.id === main?.id)?.source)
    : '';
  const source =
    issueEntrySource(main) || (indexedSource && indexedSource !== '—' ? indexedSource : '');

  const brand = payload.lang === 'ru' ? 'Поток' : 'Flow';
  const formattedDate = formatIssueDate(date, payload.lang);
  const signature = formattedDate ? `| ${brand} - ${formattedDate}` : `| ${brand}`;

  const base = [mainTitle, source].filter(Boolean).join(' | ');
  const maxBaseLength = Math.max(0, 500 - signature.length - 1);

  return `${base.slice(0, maxBaseLength).trimEnd()} ${signature}`;
}

const LEGACY_QUOTED_SIGNATURE = /«\s*\|?\s*(?:Поток|Flow)\s*[-–—]\s*[^»]*»\s*$/u;

/** True when a stored title still uses the old «| brand - date» signature. */
export function hasLegacyQuotedIssueSignature(title: string | null | undefined): boolean {
  return typeof title === 'string' && LEGACY_QUOTED_SIGNATURE.test(title.trim());
}

/**
 * Resolve the public title from a stored record and its payload.
 *
 * Published legacy issues keep the title they were stored with, including the
 * old quoted signature. Newly built payloads receive the current unquoted
 * signature. This keeps the quote change forward-only without rewriting data.
 */
export function resolveIssueTitle(payload: IssuePayload, storedTitle?: string | null): string {
  const stored = clean(storedTitle);

  if (stored && hasLegacyQuotedIssueSignature(stored)) {
    return stored;
  }

  return buildIssueTitle(payload) || stored;
}
