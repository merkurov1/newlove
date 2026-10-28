import type { IssueEntry, IssuePayload } from "./types";

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The composer writes `link_previews` (array) and `link_preview` (first
 * item). Older records use `linkPreview` / `linkPreviews`. Issue building
 * and analysis must understand all of them, otherwise new link posts lose
 * their description, image, and source.
 */
export function getLinkPreviews(
  metadata: Record<string, any> | null | undefined,
): Record<string, any>[] {
  const value = metadata || {};

  const arrayValue = [
    value.link_previews,
    value.linkPreviews,
  ].find(
    (candidate): candidate is unknown[] =>
      Array.isArray(candidate) && candidate.length > 0,
  );

  const raw = arrayValue
    ? arrayValue
    : value.link_preview
      ? [value.link_preview]
      : value.linkPreview
        ? [value.linkPreview]
        : [];

  const seen = new Set<string>();
  const previews: Record<string, any>[] = [];

  for (const candidate of raw) {
    if (!isRecord(candidate)) continue;

    const url = clean(candidate.url);
    const key = url || JSON.stringify(candidate);

    if (seen.has(key)) continue;
    seen.add(key);
    previews.push(candidate);
  }

  return previews;
}

export function getPrimaryLinkPreview(
  metadata: Record<string, any> | null | undefined,
): Record<string, any> | null {
  return getLinkPreviews(metadata)[0] || null;
}

export type LinkPresentation = {
  url: string;
  title: string;
  description: string;
  siteName: string;
  author: string;
  image: string;
  domain: string;
};

/**
 * Presentation fields for a link, with legacy top-level metadata as a
 * fallback. Never fetches or infers the destination page content.
 */
export function getLinkPresentation(
  metadata: Record<string, any> | null | undefined,
): LinkPresentation {
  const value = metadata || {};
  const preview = getPrimaryLinkPreview(value) || {};

  const url =
    clean(preview.url) ||
    clean(value.canonical_url) ||
    clean(value.url);

  let domain = clean(preview.domain) || clean(value.domain);

  if (!domain && url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // Ignore malformed URLs.
    }
  }

  return {
    url,
    title: clean(preview.title) || clean(value.title),
    description:
      clean(preview.description) || clean(value.description),
    siteName:
      clean(preview.site_name) ||
      clean(value.site_name) ||
      domain,
    author: clean(preview.author) || clean(value.author),
    image: clean(preview.image) || clean(value.image),
    domain,
  };
}

/**
 * Rebuild the issue source index from the entries that are actually
 * selected. This is the same rule used by build.ts and the editor.
 */
export function buildSourceIndex(
  entries: IssueEntry[],
): IssuePayload["sourceIndex"] {
  const seen = new Set<string>();
  const result: IssuePayload["sourceIndex"] = [];

  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);

    const link = getLinkPresentation(entry.metadata);

    const rawOriginalDate = entry.metadata?.published_at;
    const originalDate =
      typeof rawOriginalDate === "string" &&
      !Number.isNaN(new Date(rawOriginalDate).getTime())
        ? new Date(rawOriginalDate).toISOString()
        : null;

    result.push({
      id: entry.id,
      source: link.siteName || link.domain || "—",
      title: entry.title || link.title || link.siteName || "—",
      url: entry.url || link.url || null,
      originalDate,
      addedAt: entry.publishedAt,
    });
  }

  return result;
}
