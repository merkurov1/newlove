export type TributeTempleLogRow = {
  event_type?: unknown;
  /** Public-safe signal column, populated only after explicit opt-in. */
  public_name?: unknown;
  /** Legacy shape kept for tests and older cached signals. */
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
  const value =
    typeof row?.public_name === 'string'
      ? row.public_name
      : typeof row?.author === 'string'
        ? row.author
        : '';

  return value.trim() ? value.trim().slice(0, 120) : 'PILGRIM';
}
