import { buildSourceIndex } from './metadata';
import type { IssueEntry, IssuePayload } from './types';

export type EditableIssueEntry = {
  id: string;
  title?: string;
  body?: string;
  description?: string;
  alt?: string;
  caption?: string;
};

export type EditableIssueSections = {
  /** `null` removes the lead; `undefined` leaves it unchanged. */
  lead?: EditableIssueEntry | null;
  latest?: EditableIssueEntry[];
  links?: EditableIssueEntry[];
  videos?: EditableIssueEntry[];
  photos?: EditableIssueEntry[];
  /** Short header summary. */
  summary?: string;
  /** Pierrot's author column, two or three paragraphs. */
  pierrotIntro?: string[];
};

const LIMITS = {
  title: 500,
  body: 20_000,
  description: 2_000,
  alt: 500,
  caption: 2_000,
} as const;

type EditableField = keyof typeof LIMITS;

function mergeEntry<T extends IssueEntry>(
  original: T,
  edited: EditableIssueEntry,
  fields: EditableField[]
): T {
  let next: T = original;

  for (const field of fields) {
    const value = edited[field];

    if (value === undefined) continue;

    if (typeof value !== 'string') {
      throw new Error(`${field} must be a string.`);
    }

    next = {
      ...next,
      [field]: value.trim().slice(0, LIMITS[field]),
    };
  }

  return next;
}

function applyArraySection<T extends IssueEntry>(
  original: T[],
  edited: EditableIssueEntry[] | undefined,
  fields: EditableField[],
  label: string
): T[] {
  if (edited === undefined) return original;

  if (!Array.isArray(edited)) {
    throw new Error(`${label} must be an array.`);
  }

  const byId = new Map(original.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of edited) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`${label} contains an entry without a valid id.`);
    }

    if (seen.has(item.id)) {
      throw new Error(`${label} contains a duplicate entry.`);
    }
    seen.add(item.id);

    const existing = byId.get(item.id);

    if (!existing) {
      throw new Error(`${label} entry ${item.id} is not part of this issue.`);
    }

    result.push(mergeEntry(existing, item, fields));
  }

  return result;
}

/**
 * Apply manual edits to an issue payload without replacing source identity.
 *
 * The client may edit copy, reorder entries, or remove entries. It may not
 * add records, change IDs, or alter source URLs. The original Flow items are
 * never touched; only the issue snapshot changes.
 */
export function applyIssueEdits(
  payload: IssuePayload,
  sections: EditableIssueSections
): IssuePayload {
  if (
    !Array.isArray(payload.latest) ||
    !Array.isArray(payload.links) ||
    !Array.isArray(payload.videos) ||
    !Array.isArray(payload.photos)
  ) {
    throw new Error('Invalid issue payload.');
  }

  let lead = payload.lead;

  if (sections.lead === null) {
    lead = null;
  } else if (sections.lead !== undefined) {
    if (!lead) {
      throw new Error('This issue has no lead to edit.');
    }

    if (sections.lead.id !== lead.id) {
      throw new Error('The lead id does not match this issue.');
    }

    lead = mergeEntry(lead, sections.lead, ['title', 'body']);
  }

  const latest = applyArraySection(payload.latest, sections.latest, ['title', 'body'], 'latest');

  const links = applyArraySection(
    payload.links,
    sections.links,
    ['title', 'body', 'description'],
    'links'
  );

  const videos = applyArraySection(payload.videos, sections.videos, ['title', 'body'], 'videos');

  const photos = applyArraySection(
    payload.photos,
    sections.photos,
    ['title', 'body', 'alt', 'caption'],
    'photos'
  );

  let summary = payload.summary;

  if (sections.summary !== undefined) {
    if (typeof sections.summary !== 'string') {
      throw new Error('summary must be a string.');
    }

    summary = sections.summary.trim().slice(0, 240);
  }

  let pierrotIntro = payload.pierrotIntro;

  if (sections.pierrotIntro !== undefined) {
    if (!Array.isArray(sections.pierrotIntro)) {
      throw new Error('pierrotIntro must be an array.');
    }

    const paragraphs = sections.pierrotIntro
      .map((paragraph) => {
        if (typeof paragraph !== 'string') {
          throw new Error('pierrotIntro paragraphs must be strings.');
        }

        return paragraph.trim().slice(0, 1_500);
      })
      .filter(Boolean);

    if (paragraphs.length > 3) {
      throw new Error('pierrotIntro accepts at most three paragraphs.');
    }

    pierrotIntro = paragraphs;
  }

  const external: IssueEntry[] = [];

  if (lead && (lead.type === 'link' || lead.type === 'video')) {
    external.push(lead);
  }

  external.push(...links, ...videos);

  // Keep the source snapshot in `items` aligned with section edits. The
  // newspaper itself renders the category arrays, but the snapshot is used
  // for the Published metric and later re-rendering.
  const editedById = new Map<
    string,
    Partial<Pick<IssueEntry, 'title' | 'body' | 'description' | 'alt' | 'caption'>>
  >();

  const remember = (
    entry: IssueEntry,
    fields: Array<'title' | 'body' | 'description' | 'alt' | 'caption'>
  ) => {
    const existing = editedById.get(entry.id) || {};

    for (const field of fields) {
      const value = entry[field];
      if (typeof value === 'string') existing[field] = value;
    }

    editedById.set(entry.id, existing);
  };

  if (lead) remember(lead, ['title', 'body']);
  latest.forEach((entry) => remember(entry, ['title', 'body']));
  links.forEach((entry) => remember(entry, ['title', 'body', 'description']));
  videos.forEach((entry) => remember(entry, ['title', 'body']));
  photos.forEach((entry) => remember(entry, ['title', 'body', 'alt', 'caption']));

  const items = Array.isArray(payload.items)
    ? payload.items.map((entry) => {
        const edited = editedById.get(entry.id);
        return edited ? { ...entry, ...edited } : entry;
      })
    : null;

  return {
    ...payload,
    ...(items ? { items } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(pierrotIntro !== undefined ? { pierrotIntro } : {}),
    lead,
    latest,
    links,
    videos,
    photos,
    sourceIndex: buildSourceIndex(external),
  };
}
