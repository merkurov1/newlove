/**
 * Deterministic inline citation helpers.
 *
 * The backend does not guarantee `[n]` markers. When the model emits them we
 * turn them into clickable badges. When it does not, the UI renders a compact
 * badge cluster at the end of the answer instead of a separate source line.
 */

export const CITATION_HREF_PREFIX = 'pw-cite:';

export function citationIndexFromHref(href: string): number | null {
  if (!href.startsWith(CITATION_HREF_PREFIX)) return null;
  const value = Number(href.slice(CITATION_HREF_PREFIX.length));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function hasCitationMarkers(content: string): boolean {
  return /\[\[?\d{1,3}\]?\]/.test(content);
}

export function prepareCitationMarkdown(content: string, citationCount: number): string {
  if (citationCount <= 0) return content;

  const normalized = content.replace(/\[\[(\d{1,3})\]\]/g, '[$1]');

  return normalized.replace(/\[(\d{1,3})\](?!\()/g, (match, raw: string) => {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 1 || index > citationCount) return match;
    return `[${raw}](${CITATION_HREF_PREFIX}${raw})`;
  });
}
