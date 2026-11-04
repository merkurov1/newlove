export type TributeTempleLogRow = {
  event_type?: unknown;
  author?: unknown;
};

export function isTributeTempleLogEvent(
  row: TributeTempleLogRow | null | undefined
): boolean {
  return String(row?.event_type || '').toUpperCase() === 'TRIBUTE';
}

/**
 * The public temple-log signal carries only the donor display name. Empty or
 * absent names fall back to the same neutral label the Tribute page already
 * used for anonymous donors.
 */
export function tributeSignalDonorName(
  row: TributeTempleLogRow | null | undefined
): string {
  return typeof row?.author === 'string' && row.author.trim()
    ? row.author.trim().slice(0, 120)
    : 'PILGRIM';
}
