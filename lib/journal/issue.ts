/**
 * Canonical presentation model for the materials of a single Flow issue.
 *
 * `payload.items` is the complete set of published records in the issue
 * period (see `lib/flow-issue/build.ts`). Older issues predate that field, so
 * the legacy section arrays are used as a compatibility fallback. Nothing here
 * creates, edits or re-publishes content: the selector only normalizes
 * already-published rows for the public Journal page.
 */
import { getLinkPresentation } from '@/lib/flow-issue/metadata';
import { issueEntries } from '@/lib/flow-issue/title';
import type { IssueEntry, IssuePayload } from '@/lib/flow-issue/types';
import { stripHtml } from './preview';

export type JournalMaterialKind =
  | 'note'
  | 'link'
  | 'article'
  | 'video'
  | 'photo'
  | 'other';

export type JournalMaterialLang = 'ru' | 'en' | 'other';

export type JournalMaterial = {
  id: string;
  kind: JournalMaterialKind;
  type: string;
  lang: JournalMaterialLang;
  title: string;
  body: string;
  description: string;
  url: string | null;
  image: string | null;
  imageAlt: string;
  siteName: string;
  publishedAt: string | null;
  isLead: boolean;
  isExternal: boolean;
};

export type JournalMaterialGroup = {
  kind: JournalMaterialKind;
  items: JournalMaterial[];
};

/** The order in which material sections appear on the page. */
export const JOURNAL_MATERIAL_ORDER: JournalMaterialKind[] = [
  'note',
  'link',
  'article',
  'video',
  'photo',
  'other',
];

const KIND_BY_TYPE: Record<string, JournalMaterialKind> = {
  note: 'note',
  link: 'link',
  article: 'article',
  video: 'video',
  photo: 'photo',
};

const clean = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  return stripHtml(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(value: string | null): string {
  if (!value) return '';

  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isOwnHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'merkurov.love' || host.endsWith('.merkurov.love');
  } catch {
    return false;
  }
}

function normalizeKind(type: unknown): JournalMaterialKind {
  const value = String(type || '').toLowerCase().trim();
  return KIND_BY_TYPE[value] || 'other';
}

function normalizeLang(value: unknown): JournalMaterialLang {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'ru' || normalized === 'en') return normalized;
  return 'other';
}

type EntryExtras = IssueEntry & {
  description?: string;
  image?: string;
  alt?: string;
  caption?: string;
  siteName?: string;
};

function firstImage(entry: EntryExtras, linkImage: string): string {
  const metadata = entry.metadata || {};
  const youtube = metadata.youtube || {};

  const candidates = [
    entry.image,
    metadata.public_url,
    metadata.publicUrl,
    metadata.image,
    metadata.og_image,
    youtube.thumbnail_url,
    linkImage,
  ];

  for (const candidate of candidates) {
    const value = clean(candidate);
    if (value) return value;
  }

  return '';
}

function toMaterial(entry: EntryExtras, leadId: string): JournalMaterial | null {
  const metadata: Record<string, any> = entry.metadata || {};
  const link = getLinkPresentation(metadata);
  const kind = normalizeKind(entry.type);

  const body = clean(entry.body);
  const description = clean(entry.description) || clean(link.description);

  const title =
    clean(entry.title) ||
    clean(link.title) ||
    clean(metadata.youtube?.title) ||
    clean(entry.caption) ||
    clean(entry.alt) ||
    description ||
    (body ? body.slice(0, 160) : '');

  const image = firstImage(entry, clean(link.image));
  const url = safeHttpUrl(entry.url) || safeHttpUrl(link.url);
  const external = Boolean(url && !isOwnHost(url as string));

  // A row without any usable content is not a material. This can happen in a
  // legacy payload whose entry was emptied after publication; rendering an
  // empty card would misrepresent the issue.
  if (!title && !body && !description && !image && !url) return null;

  const imageAlt = clean(entry.alt) || clean(entry.caption) || title;
  const siteName =
    clean(entry.siteName) || clean(link.siteName) || (external ? hostOf(url) : '');

  return {
    id: String(entry.id || title || url),
    kind,
    type: String(entry.type || 'other'),
    lang: normalizeLang(entry.lang),
    title: title || siteName || description,
    body,
    description,
    url,
    image: image || null,
    imageAlt,
    siteName,
    publishedAt: entry.publishedAt || null,
    isLead: Boolean(leadId) && String(entry.id) === leadId,
    isExternal: external,
  };
}

/**
 * Normalize every published material of an issue.
 *
 * Duplicates are removed by id and then by a stable content key, because
 * legacy payloads sometimes repeat the lead inside `latest`. Empty rows are
 * dropped so the page never renders fictitious cards.
 */
export function collectIssueMaterials(
  payload: IssuePayload | null | undefined
): JournalMaterial[] {
  if (!payload) return [];

  const entries = issueEntries(payload) as EntryExtras[];
  const leadId = payload.lead?.id == null ? '' : String(payload.lead.id);
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const materials: JournalMaterial[] = [];

  for (const entry of entries) {
    if (!entry) continue;

    const material = toMaterial(entry, leadId);
    if (!material) continue;

    const idKey = String(entry.id || '');
    if (idKey && seenIds.has(idKey)) continue;
    if (idKey) seenIds.add(idKey);

    const contentKey = [
      material.kind,
      material.url || '',
      material.title,
      material.publishedAt || '',
    ].join('|');

    if (seenContent.has(contentKey)) continue;
    seenContent.add(contentKey);

    materials.push(material);
  }

  return materials;
}

/** Split materials into sections, dropping sections that have no content. */
export function groupIssueMaterials(
  materials: JournalMaterial[]
): JournalMaterialGroup[] {
  return JOURNAL_MATERIAL_ORDER.map((kind) => ({
    kind,
    items: materials.filter((material) => material.kind === kind),
  })).filter((group) => group.items.length > 0);
}

/**
 * Keep same-site links as Next links and leave external sources untouched.
 * The canonical URL stored in the issue payload is absolute.
 */
export function materialHref(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'merkurov.love' || parsed.hostname.endsWith('.merkurov.love')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Fall through to the raw value.
  }

  return url;
}

export function materialCount(materials: JournalMaterial[]): number {
  return materials.length;
}
