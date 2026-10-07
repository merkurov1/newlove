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