import { assertServerOnly } from '@/lib/serverOnly';
import { getSiteUrl } from './config';
import { fullHash } from './tokenCrypto';

assertServerOnly('lib/analytics/website/normalize');

export type ProjectDefinition = {
  key: string;
  name: string;
  paths: string[];
};

export const PROJECT_DEFINITIONS: ProjectDefinition[] = [
  { key: 'flow', name: 'Flow', paths: ['/flow', '/subscribe', '/newsletter'] },
  { key: 'heart', name: 'Heart & Angel', paths: ['/heartandangel', '/heart-and-angel', '/postcards', '/tribute', '/temple'] },
  { key: 'journal', name: 'Journal', paths: ['/journal', '/articles'] },
  { key: 'letters', name: 'Letters', paths: ['/letters'] },
  { key: 'art', name: 'Art Engine', paths: ['/art-engine', '/art'] },
  { key: 'unframed', name: 'UNFRAMED', paths: ['/unframed'] },
];

const PROJECT_BY_KEY = new Map(PROJECT_DEFINITIONS.map((project) => [project.key, project]));

function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

export function normalizePath(value: string | null | undefined, siteUrl = getSiteUrl()): string {
  if (!value) return '';

  let raw = String(value).trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      return '';
    }
  }

  raw = raw.split('#')[0].split('?')[0];
  if (!raw.startsWith('/')) raw = `/${raw}`;
  raw = raw.replace(/\/{2,}/g, '/');
  raw = stripTrailingSlash(raw);

  // Site routes are lowercase. GSC sometimes percent-encodes Cyrillic slugs;
  // decode safely so the same page is never counted twice.
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep the encoded path
  }

  return raw.toLowerCase();
}

export function normalizeHost(value: string | null | undefined): string {
  if (!value) return '';

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
  }
}

export function projectForPath(path: string): ProjectDefinition | null {
  const normalized = normalizePath(path);

  for (const project of PROJECT_DEFINITIONS) {
    for (const prefix of project.paths) {
      if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
        return project;
      }
    }
  }

  return null;
}

export function projectByKey(key: string): ProjectDefinition | null {
  return PROJECT_BY_KEY.get(key) ?? null;
}

export function isHomePath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === '' || normalized === '/';
}

export function pageLabel(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized || normalized === '/') return 'Главная';

  const project = projectForPath(normalized);
  if (project && normalizePath(project.paths[0]) === normalized) return project.name;

  return normalized;
}

export type ContentIndexEntry = {
  path: string;
  type: 'article' | 'letter' | 'item' | 'project' | 'page';
  slug: string | null;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  brainDocumentId: string | null;
};

export function extractContentSlug(
  path: string
):
  | { type: 'article' | 'letter' | 'item'; slug: string }
  | { type: 'project'; slug: string }
  | null {
  const normalized = normalizePath(path);

  const article = normalized.match(/^\/(?:journal|articles)\/([^/]+)/);
  if (article?.[1]) return { type: 'article', slug: article[1] };

  const letter = normalized.match(/^\/letters\/([^/]+)/);
  if (letter?.[1]) return { type: 'letter', slug: letter[1] };

  const item = normalized.match(/^\/(?:item|items|p)\/([^/]+)/);
  if (item?.[1]) return { type: 'item', slug: item[1] };

  const project = projectForPath(normalized);
  if (project) return { type: 'project', slug: project.key };

  return null;
}

export function matchContent(
  path: string,
  index: Map<string, ContentIndexEntry>
): ContentIndexEntry | null {
  const normalized = normalizePath(path);
  if (!normalized) return null;

  const exact = index.get(normalized);
  if (exact) return exact;

  const extracted = extractContentSlug(normalized);
  if (!extracted) return null;

  return index.get(`${extracted.type}:${extracted.slug}`) ?? null;
}

export function contentIndexKey(entry: { type: string; slug: string | null }): string {
  return `${entry.type}:${entry.slug ?? ''}`;
}

export function dimensionHash(value: string): string {
  return fullHash(value);
}

export function normalizeDimensionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '')
    .slice(0, 80) || 'total';
}

export function displayDimension(value: string): string {
  if (!value) return '(not set)';
  return value;
}

export function stripUrlOrigin(value: string): string {
  return normalizePath(value);
}

export function domainOf(value: string | null | undefined): string {
  if (!value) return '(direct)';

  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return value.split('/')[0].replace(/^www\./, '') || '(direct)';
  }
}
