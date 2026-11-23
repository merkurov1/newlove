import type { MetadataRoute } from 'next';
import { absoluteUrl, PUBLIC_ROUTES } from '@/lib/seo';
import {
  SECTION_BY_PATH,
  SECTION_LANGUAGES,
  languageAlternates,
  localizedPath,
} from '@/lib/i18n/config';
import { flowIssuePath } from '@/lib/flow-issue/urls';

/**
 * Deterministic sitemap construction.
 *
 * Rules enforced here (and covered by lib/__tests__/sitemap.test.ts):
 * - only canonical absolute HTTPS www URLs without query strings or hashes;
 * - no duplicate URLs;
 * - no `now` fallback for lastModified: unknown dates are omitted entirely;
 * - dynamic sources are filtered again even when the database query already
 *   filters them, so a future query regression cannot leak drafts.
 */
export type SitemapEntry = MetadataRoute.Sitemap[number];

export type SitemapArticleSource = {
  slug?: unknown;
  updatedAt?: unknown;
  publishedAt?: unknown;
  published?: unknown;
};

export type SitemapFlowItemSource = {
  slug?: unknown;
  updated_at?: unknown;
  published_at?: unknown;
  status?: unknown;
  visibility?: unknown;
};

export type SitemapLetterSource = {
  slug?: unknown;
  updatedAt?: unknown;
  publishedAt?: unknown;
  createdAt?: unknown;
  kind?: unknown;
  status?: unknown;
  published?: unknown;
  lang?: unknown;
};

export type SitemapTagSource = { slug?: unknown };
export type SitemapLotSource = { id?: unknown; created_at?: unknown; status?: unknown };
export type SitemapMediaSource = { slug?: unknown; date?: unknown };

export type SitemapSources = {
  articles?: SitemapArticleSource[];
  flowItems?: SitemapFlowItemSource[];
  letters?: SitemapLetterSource[];
  tags?: SitemapTagSource[];
  lots?: SitemapLotSource[];
  media?: SitemapMediaSource[];
};

const CANONICAL_HOST = 'www.merkurov.love';

/**
 * 1970-01-01 is the value Google Search Console exports for "Last crawled"
 * when the field is empty. Dates before 1971 are treated as unknown here so a
 * database sentinel can never become a real sitemap signal.
 */
const MIN_KNOWN_TIMESTAMP = Date.UTC(1971, 0, 1);

/**
 * A lastmod in the future is not a trustworthy modification signal and Google
 * may ignore the whole field. Allow a small clock-skew window, then omit.
 */
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

function latestTrustedTimestamp(): number {
  return Date.now() + MAX_FUTURE_SKEW_MS;
}

/** Routes that are public but canonicalise to another URL. */
const NON_CANONICAL_STATIC_ROUTES = new Set(['/letters']);

function cleanSlug(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const slug = value.trim();
  if (!slug || slug === '.' || slug === '..') return undefined;
  if (slug.startsWith('/') || slug.endsWith('/')) return undefined;
  // Control characters cannot be part of a public route segment.
  if (/[\u0000-\u001f\u007f]/.test(slug)) return undefined;

  return slug;
}

export function parseLastModified(value: unknown): string | undefined {
  let time: number;

  if (value instanceof Date) {
    time = value.getTime();
  } else if (typeof value === 'string' && value.trim()) {
    time = Date.parse(value);
  } else {
    return undefined;
  }

  if (!Number.isFinite(time) || time < MIN_KNOWN_TIMESTAMP) return undefined;
  if (time > latestTrustedTimestamp()) return undefined;

  return new Date(time).toISOString();
}

export function isCanonicalSitemapUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname !== CANONICAL_HOST) return false;
    if (url.search || url.hash) return false;
    if (url.pathname !== '/' && url.pathname.endsWith('/')) return false;
    return true;
  } catch {
    return false;
  }
}

function createEntry(
  path: string,
  lastModified: string | undefined,
  priority: number,
  alternates?: Record<string, string>
): SitemapEntry {
  return {
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified } : {}),
    changeFrequency: 'weekly',
    priority,
    ...(alternates
      ? {
          alternates: {
            languages: Object.fromEntries(
              Object.entries(alternates).map(([language, alternatePath]) => [
                language,
                absoluteUrl(alternatePath),
              ])
            ),
          },
        }
      : {}),
  };
}

/** Static public routes, split into their real translated URLs. */
export function buildStaticSitemapEntries(): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  for (const route of PUBLIC_ROUTES) {
    if (NON_CANONICAL_STATIC_ROUTES.has(route)) continue;

    const priority = route === '/' ? 1 : route === '/lobby' || route === '/advising' ? 0.9 : 0.7;
    const section = SECTION_BY_PATH[route];

    if (!section) {
      // Static editorial routes have no reliable per-page update timestamp in
      // the repository. Omitting lastModified is more honest than `now`.
      entries.push(createEntry(route, undefined, priority));
      continue;
    }

    const alternates = languageAlternates(section);
    entries.push(createEntry(route, undefined, priority, alternates));

    for (const language of SECTION_LANGUAGES[section]) {
      if (language === 'en') continue;
      entries.push(createEntry(localizedPath(section, language), undefined, priority, alternates));
    }
  }

  return entries;
}

/** Dynamic entries built from already-fetched data sources. */
export function buildDynamicSitemapEntries(sources: SitemapSources): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  for (const article of sources.articles || []) {
    if (article.published === false) continue;
    const slug = cleanSlug(article.slug);
    if (!slug) continue;

    entries.push(
      createEntry(
        `/${encodeURIComponent(slug)}`,
        parseLastModified(article.updatedAt ?? article.publishedAt),
        0.7
      )
    );
  }

  for (const item of sources.flowItems || []) {
    if (item.status !== 'published') continue;
    if (item.visibility !== 'public') continue;

    const slug = cleanSlug(item.slug);
    if (!slug) continue;

    entries.push(
      createEntry(
        `/flow/${encodeURIComponent(slug)}`,
        parseLastModified(item.updated_at ?? item.published_at),
        0.6
      )
    );
  }

  for (const letter of sources.letters || []) {
    if (letter.published === false) continue;

    const slug = cleanSlug(letter.slug);
    if (!slug) continue;

    const isIssue = letter.kind === 'issue';
    // Public issue pages additionally require status=published; ordinary
    // letters are published through the `published` flag alone.
    if (isIssue && letter.status !== 'published') continue;

    const path = isIssue
      ? flowIssuePath(slug, typeof letter.lang === 'string' ? letter.lang : null)
      : `/journal/${encodeURIComponent(slug)}`;

    entries.push(
      createEntry(
        path,
        parseLastModified(letter.updatedAt ?? letter.publishedAt ?? letter.createdAt),
        0.7
      )
    );
  }

  for (const tag of sources.tags || []) {
    // A tag needs a real slug; falling back to its display name produces a
    // non-canonical `/tags/<name>` URL that may not resolve deterministically.
    const slug = cleanSlug(tag.slug);
    if (!slug) continue;

    entries.push(createEntry(`/tags/${encodeURIComponent(slug)}`, undefined, 0.4));
  }

  for (const lot of sources.lots || []) {
    if (lot.status !== 'published') continue;
    const id = cleanSlug(lot.id);
    if (!id) continue;

    entries.push(
      createEntry(`/lots/${encodeURIComponent(id)}`, parseLastModified(lot.created_at), 0.4)
    );
  }

  for (const record of sources.media || []) {
    const slug = cleanSlug(record.slug);
    if (!slug) continue;

    entries.push(
      createEntry(`/media/record/${encodeURIComponent(slug)}`, parseLastModified(record.date), 0.5)
    );
  }

  return entries;
}

export function buildSitemapEntries(sources: SitemapSources = {}): SitemapEntry[] {
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];

  for (const entry of [
    ...buildStaticSitemapEntries(),
    ...buildDynamicSitemapEntries(sources),
  ]) {
    if (seen.has(entry.url)) continue;
    if (!isCanonicalSitemapUrl(entry.url)) continue;

    seen.add(entry.url);
    entries.push(entry);
  }

  return entries;
}
