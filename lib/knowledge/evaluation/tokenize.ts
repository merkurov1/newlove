/**
 * Deterministic lexical normalization for the local evaluation baseline.
 *
 * No stemming, no synonyms, no language model and no network access. Hyphens
 * and apostrophes are treated as token separators; one-character tokens are
 * discarded. This is intentionally simple and transparent.
 */
export function tokenizeForBm25(value: string): string[] {
  const normalized = value.normalize('NFKC').toLowerCase();
  const matches = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  return matches.filter((token) => token.length > 1);
}

export function uniqueTokens(value: string): string[] {
  return [...new Set(tokenizeForBm25(value))];
}
