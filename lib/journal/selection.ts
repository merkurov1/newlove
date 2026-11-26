import type { JournalMaterial, JournalMaterialKind } from './issue';

/**
 * The four formats the Journal front page can select from.
 *
 * `post` covers text-led materials (notes and articles), while `photo`,
 * `video` and `link` keep their native presentation. The full issue keeps its
 * own grouping by material kind; this model exists only for the compact
 * front-page selection.
 */
export type JournalFormat = 'post' | 'photo' | 'video' | 'link';

export const JOURNAL_FORMAT_ORDER: JournalFormat[] = ['post', 'photo', 'video', 'link'];

const FORMAT_BY_KIND: Record<JournalMaterialKind, JournalFormat> = {
  note: 'post',
  article: 'post',
  other: 'post',
  photo: 'photo',
  video: 'video',
  link: 'link',
};

export function journalFormat(
  kind: JournalMaterialKind | string | null | undefined
): JournalFormat {
  return FORMAT_BY_KIND[kind as JournalMaterialKind] || 'post';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FLOW_SIGNATURE =
  /\s*[«"“']?\s*[|｜]?\s*(?:Поток|Flow|The Journal|Journal|Журнал)\s*[-–—]\s*[^»"”']*[»"”']?\s*$/iu;
const FLOW_BRAND = /\s*[«"“']?\s*[|｜]\s*(?:Поток|Flow|The Journal|Journal|Журнал)\s*[»"”']?\s*$/iu;
const AUTHOR_SUFFIX = /\s*(?:[|｜—–·•/]|[-–—]{1,2})\s*(?:Антон\s+Меркуров|Anton\s+Merkurov)\s*$/iu;
const SERVICE_SUFFIX =
  /\s*(?:[|｜—–·•]\s*)?(?:читать далее|read more|continue reading|открыть материал|open material)\s*$/iu;

function stripRepeated(value: string, pattern: RegExp): string {
  let result = value;

  // Titles occasionally contain stacked service suffixes (source, author and
  // Flow signature). Strip them one at a time so a single pass cannot leave a
  // dangling separator behind.
  for (let index = 0; index < 6; index++) {
    const next = result.replace(pattern, '');
    if (next === result) break;
    result = next;
  }

  return result;
}

function stripSiteName(value: string, siteName: string): string {
  if (!siteName.trim()) return value;

  const escaped = escapeRegExp(siteName.trim());
  const suffix = new RegExp(`\\s*[|｜—–·•]\\s*${escaped}\\s*$`, 'iu');
  const parenthetical = new RegExp(`\\s*\\(${escaped}\\)\\s*$`, 'iu');

  return stripRepeated(stripRepeated(value, suffix), parenthetical);
}

export type JournalTitleOptions = {
  /** Publication name already known from the material metadata. */
  siteName?: string | null;
};

/**
 * Remove presentation-only decoration from a headline.
 *
 * The stored issue title is composed for feeds and search (`Title | Source
 * «| Flow - date»`). The editorial cover needs the story itself, so it strips
 * the repeated source, duplicated author byline and Flow signature. No words
 * from the actual story are invented or rewritten.
 */
export function normalizeJournalTitle(
  value: string | null | undefined,
  options: JournalTitleOptions = {}
): string {
  const original = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!original) return '';

  let result = original;

  result = stripRepeated(result, FLOW_SIGNATURE);
  result = stripRepeated(result, FLOW_BRAND);
  result = stripRepeated(result, AUTHOR_SUFFIX);
  result = stripRepeated(result, SERVICE_SUFFIX);
  result = stripSiteName(result, String(options.siteName || ''));

  result = result
    .replace(/\s+[-–—]\s*$/u, '')
    .replace(/^[\s|｜—–·•]+/u, '')
    .replace(/[\s|｜—–·•]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  return result || original;
}

function normalizedIdentity(material: JournalMaterial): string {
  return normalizeJournalTitle(material.title, { siteName: material.siteName })
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isSameMaterial(left: JournalMaterial, right: JournalMaterial): boolean {
  if (left === right) return true;

  const leftId = String(left.id || '').trim();
  const rightId = String(right.id || '').trim();
  if (leftId && rightId && leftId === rightId) return true;

  const leftUrl = String(left.url || '').trim();
  const rightUrl = String(right.url || '').trim();
  if (leftUrl && rightUrl) return leftUrl === rightUrl;

  const leftTitle = normalizedIdentity(left);
  const rightTitle = normalizedIdentity(right);
  return Boolean(leftTitle) && leftTitle === rightTitle;
}

function uniqueMaterials(materials: JournalMaterial[]): JournalMaterial[] {
  const result: JournalMaterial[] = [];

  for (const material of materials) {
    if (!material) continue;
    if (result.some((known) => isSameMaterial(known, material))) continue;
    result.push(material);
  }

  return result;
}

export type JournalHighlights = {
  main: JournalMaterial | null;
  supporting: JournalMaterial[];
};

/**
 * Pick one main material and at most one additional material per format.
 *
 * Selection is intentionally local to `materials`, which the page builds from
 * the current issue payload. The main material is never repeated in the
 * supporting set, and a format without a real published material is skipped
 * instead of filled with a placeholder.
 */
export function selectJournalHighlights(
  materials: JournalMaterial[],
  limit = JOURNAL_FORMAT_ORDER.length
): JournalHighlights {
  const list = uniqueMaterials(materials);
  const main = list.find((material) => material.isLead) || list[0] || null;

  if (!main) return { main: null, supporting: [] };

  const remaining = list.filter((material) => !isSameMaterial(material, main));
  const supporting: JournalMaterial[] = [];
  const max = Math.max(0, Math.min(limit, JOURNAL_FORMAT_ORDER.length));

  for (const format of JOURNAL_FORMAT_ORDER) {
    if (supporting.length >= max) break;

    const candidate = remaining.find(
      (material) =>
        journalFormat(material.kind) === format &&
        !supporting.some((chosen) => isSameMaterial(chosen, material))
    );

    if (candidate) supporting.push(candidate);
  }

  return { main, supporting };
}
