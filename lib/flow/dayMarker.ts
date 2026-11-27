/**
 * One date marker per calendar day in the Flow feed.
 *
 * Flow dates are displayed in UTC (`EntryDate` formats with
 * `timeZone: 'UTC'`), so grouping must use the same calendar boundary. A
 * marker belongs to the first entry of each day in feed order; pagination can
 * append more entries without adding a second marker for an already seen day.
 */

type DatedItem = {
  published_at?: string | null;
  created_at?: string | null;
};

/** UTC `YYYY-MM-DD`, or `null` when the item has no usable date. */
export function flowDayKey(value: string | null | undefined): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Map every feed item to whether it owns the date marker for its day.
 *
 * The first occurrence in feed order owns the marker even if pagination ever
 * delivers a day out of order; later occurrences never repeat it.
 */
export function flowDayMarkers(items: readonly DatedItem[]): boolean[] {
  const firstIndexByDay = new Map<string, number>();

  items.forEach((item, index) => {
    const key = flowDayKey(item.published_at || item.created_at);

    if (key && !firstIndexByDay.has(key)) firstIndexByDay.set(key, index);
  });

  return items.map((item, index) => {
    const key = flowDayKey(item.published_at || item.created_at);

    return Boolean(key && firstIndexByDay.get(key) === index);
  });
}
