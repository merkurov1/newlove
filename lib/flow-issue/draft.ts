function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Return the unique Flow item IDs represented in an issue payload.
 * The same item may legitimately appear in more than one payload
 * section, so duplicates are removed before comparing signatures.
 */
export function getPayloadItemIds(payload: unknown): string[] {
  if (!isRecord(payload)) return [];

  const ids = new Set<string>();

  const addEntry = (entry: unknown) => {
    if (!isRecord(entry)) return;

    if (typeof entry.id === "string" && entry.id.trim()) {
      ids.add(entry.id);
    }
  };

  addEntry(payload.lead);

  for (const key of ["latest", "links", "videos", "photos"]) {
    const entries = payload[key];

    if (Array.isArray(entries)) {
      entries.forEach(addEntry);
    }
  }

  return [...ids].sort();
}

/**
 * Two issues with the same source records are treated as the same draft,
 * even if editorial ordering changed. This is what protects manual edits:
 * regenerating the same period returns the existing draft instead of
 * overwriting it with a new algorithm's composition.
 */
export function samePayloadComposition(
  first: unknown,
  second: unknown,
): boolean {
  const a = getPayloadItemIds(first);
  const b = getPayloadItemIds(second);

  // An empty payload is not enough evidence to reuse a draft.
  if (!a.length || !b.length) return false;
  if (a.length !== b.length) return false;

  return a.every((id, index) => id === b[index]);
}
