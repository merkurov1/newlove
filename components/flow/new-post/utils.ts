import type { Item } from "./types";

export const LAST_DRAFT_KEY = "flow:last-draft-id";
export const AUTOSAVE_INTERVAL = 10_000;

export function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || "";
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function readJson<T>(value: unknown): T | null {
  if (!value) return null;

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return null;
}

export function withFlowMetadata(
  item: Item,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? item.metadata
      : {};

  const flow =
    metadata.flow && typeof metadata.flow === "object"
      ? metadata.flow
      : {};

  return {
    ...metadata,
    ...patch,
    flow: {
      ...flow,
      updated_at: new Date().toISOString(),
    },
  };
}

export function normalizePastedUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Recognizes complete URLs, www URLs and bare domains. A missing protocol is
 * normalized to HTTPS. URL text is matched as broadly as possible; trailing
 * sentence punctuation is removed by `trimUrlPunctuation` so the matcher can
 * also preserve punctuation that belongs to the surrounding prose.
 */
export const URL_PATTERN =
  /(?<![A-Za-z0-9_@])(?:(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?))/gi;

const TRAILING_PUNCTUATION = /[.,;:!?'"`…。，、；：！？）】》”’»›]/;
const DELIMITER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
];

function countCharacter(value: string, character: string): number {
  let count = 0;

  for (const current of value) {
    if (current === character) count += 1;
  }

  return count;
}

/**
 * Removes prose punctuation adjacent to a URL without truncating balanced
 * parentheses that belong to the destination itself, for example
 * `https://en.wikipedia.org/wiki/Function_(mathematics)`.
 */
export function trimUrlPunctuation(value: string): string {
  let candidate = value.trim();

  while (candidate) {
    const last = candidate[candidate.length - 1];

    if (TRAILING_PUNCTUATION.test(last)) {
      candidate = candidate.slice(0, -1);
      continue;
    }

    const pair = DELIMITER_PAIRS.find(([, close]) => close === last);

    if (pair) {
      const [open, close] = pair;

      if (countCharacter(candidate, close) > countCharacter(candidate, open)) {
        candidate = candidate.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return candidate;
}

/** Normalize one extracted URL while keeping safe HTTP(S) destinations only. */
export function normalizeExtractedUrl(value: string): string | null {
  let candidate = trimUrlPunctuation(value);

  if (!candidate) return null;

  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  } else if (!/^https?:\/\//i.test(candidate)) {
    const scheme = candidate.match(/^([a-z][a-z0-9+.-]*):/i)?.[1] ?? "";

    // A bare host with a port (`example.com:8080`) also matches the scheme
    // grammar because dots are allowed in custom schemes. Real schemes in
    // this composer are dot-free, so keep the host:port form as HTTPS.
    if (scheme && !scheme.includes(".")) {
      try {
        const parsed = new URL(candidate);

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return null;
        }

        candidate = parsed.toString();
      } catch {
        candidate = `https://${candidate}`;
      }
    } else {
      candidate = `https://${candidate}`;
    }
  }

  return normalizePastedUrl(candidate);
}

/**
 * Split pasted text into unique URL attachments and the text that should stay
 * in the composer. Only the URL itself is removed; punctuation around it is
 * left exactly where the author put it.
 */
export function extractUrlsFromText(text: string): {
  urls: string[];
  textWithoutUrls: string;
} {
  const urls: string[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
  let textWithoutUrls = "";
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const urlText = trimUrlPunctuation(raw);
    const normalized = normalizeExtractedUrl(urlText);

    if (!normalized) continue;

    textWithoutUrls += text.slice(cursor, start) + raw.slice(urlText.length);
    cursor = start + raw.length;

    if (seen.has(normalized)) continue;

    seen.add(normalized);
    urls.push(normalized);
  }

  textWithoutUrls += text.slice(cursor);

  return { urls, textWithoutUrls };
}

/** Stable key for de-duplicating the same destination with a trailing slash. */
export function urlDedupeKey(value: string): string {
  const normalized = normalizeExtractedUrl(value) ?? value.trim();

  try {
    const url = new URL(normalized);
    const hostname = url.host.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    return `${url.protocol}//${hostname}${pathname}${url.search}${url.hash}`;
  } catch {
    return normalized;
  }
}

export function getDomain(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isYouTubeVideo(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    const isYouTubeHost =
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "www.youtu.be";

    if (!isYouTubeHost) return false;

    if (hostname.endsWith("youtu.be")) {
      return Boolean(url.pathname.split("/").filter(Boolean)[0]);
    }

    if (url.searchParams.get("v")) {
      return true;
    }

    const path = url.pathname.replace(/^\/+|\/+$/g, "");

    return /^(shorts|embed|live|v)\/[^/]+$/i.test(path);
  } catch {
    return false;
  }
}

export function getYouTubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    const isYouTubeHost =
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "www.youtu.be";

    if (!isYouTubeHost) return null;

    if (hostname === "youtu.be" || hostname === "www.youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }

    const queryId = url.searchParams.get("v");

    if (queryId) {
      return queryId;
    }

    const path = url.pathname.split("/").filter(Boolean);

    if (path.length >= 2) {
      const kind = path[0].toLowerCase();

      if (
        kind === "shorts" ||
        kind === "embed" ||
        kind === "live" ||
        kind === "v"
      ) {
        return path[1] || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function getYouTubeCanonicalUrl(value: string): string | null {
  const videoId = getYouTubeVideoId(value);

  if (!videoId) return null;

  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function getYouTubeEmbedUrl(value: string): string | null {
  const videoId = getYouTubeVideoId(value);

  if (!videoId) return null;

  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function getYouTubeThumbnailUrl(value: string): string | null {
  const videoId = getYouTubeVideoId(value);

  if (!videoId) return null;

  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isProbablyImageUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase();

    return /\.(jpg|jpeg|png|gif|webp|avif)(?:$|\?)/i.test(pathname);
  } catch {
    return false;
  }
}