import { buildSourceIndex } from "./metadata";
import type { IssueEntry, IssuePayload } from "./types";

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
  fields: EditableField[],
): T {
  let next: T = original;

  for (const field of fields) {
    const value = edited[field];

    if (value === undefined) continue;

    if (typeof value !== "string") {
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
  label: string,
): T[] {
  if (edited === undefined) return original;

  if (!Array.isArray(edited)) {
    throw new Error(`${label} must be an array.`);
  }

  const byId = new Map(
    original.map((entry) => [entry.id, entry]),
  );
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of edited) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) {
      throw new Error(`${label} contains an entry without a valid id.`);
    }

    if (seen.has(item.id)) {
      throw new Error(`${label} contains a duplicate entry.`);
    }
    seen.add(item.id);

    const existing = byId.get(item.id);

    if (!existing) {
      throw new Error(
        `${label} entry ${item.id} is not part of this issue.`,
      );
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
  sections: EditableIssueSections,
): IssuePayload {
  if (
    !Array.isArray(payload.latest) ||
    !Array.isArray(payload.links) ||
    !Array.isArray(payload.videos) ||
    !Array.isArray(payload.photos)
  ) {
    throw new Error("Invalid issue payload.");
  }

  let lead = payload.lead;

  if (sections.lead === null) {
    lead = null;
  } else if (sections.lead !== undefined) {
    if (!lead) {
      throw new Error("This issue has no lead to edit.");
    }

    if (sections.lead.id !== lead.id) {
      throw new Error("The lead id does not match this issue.");
    }

    lead = mergeEntry(lead, sections.lead, ["title", "body"]);
  }

  const latest = applyArraySection(
    payload.latest,
    sections.latest,
    ["title", "body"],
    "latest",
  );

  const links = applyArraySection(
    payload.links,
    sections.links,
    ["title", "body", "description"],
    "links",
  );

  const videos = applyArraySection(
    payload.videos,
    sections.videos,
    ["title", "body"],
    "videos",
  );

  const photos = applyArraySection(
    payload.photos,
    sections.photos,
    ["title", "body", "alt", "caption"],
    "photos",
  );

  const external: IssueEntry[] = [];

  if (lead && (lead.type === "link" || lead.type === "video")) {
    external.push(lead);
  }

  external.push(...links, ...videos);

  return {
    ...payload,
    lead,
    latest,
    links,
    videos,
    photos,
    sourceIndex: buildSourceIndex(external),
  };
}
