/**
 * Small, deliberately boring local state for Flow continuity.
 *
 * Storage is optional: private WebViews and disabled site data must never
 * break reading. Everything is versioned and validated on read, and nothing
 * personal (no Telegram user, no initData, no tokens) is ever written.
 */

export const FLOW_READER_STATE_VERSION = 1;
export const FLOW_READER_STATE_KEY = 'flow_reader_state_v1';
export const FLOW_FEED_STATE_KEY = 'flow_feed_state_v1';
/** Older sessions only stored a raw number under this key. */
export const LEGACY_FLOW_SCROLL_KEY = 'flow_scroll_y';

export type StorageLike = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem' | 'removeItem'>>;

export type FlowLastRead = {
  slug: string;
  title: string;
  /** 0..1 reading progress. */
  progress: number;
  openedAt: number;
  updatedAt: number;
};

export type FlowReaderState = {
  version: typeof FLOW_READER_STATE_VERSION;
  lastRead: FlowLastRead | null;
};

export type FlowFeedPosition = {
  scrollY: number;
  anchorId: string | null;
  /** Pixel offset of the anchor from the viewport top when it was saved. */
  anchorOffset: number;
  /** Number of feed items that were loaded, so restoration can page back. */
  loadedCount: number;
  updatedAt: number;
};

const EMPTY_STATE: FlowReaderState = {
  version: FLOW_READER_STATE_VERSION,
  lastRead: null,
};

function nowMs(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

export function clampProgress(value: unknown): number {
  const progress = Number(value);

  if (!Number.isFinite(progress)) return 0;

  return Math.min(1, Math.max(0, progress));
}

function cleanSlug(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function cleanTitle(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLastRead(value: unknown): FlowLastRead | null {
  if (!isRecord(value)) return null;

  const slug = cleanSlug(value.slug);

  if (!slug) return null;

  return {
    slug,
    title: cleanTitle(value.title),
    progress: clampProgress(value.progress),
    openedAt: nowMs(Number(value.openedAt)),
    updatedAt: nowMs(Number(value.updatedAt)),
  };
}

/** Read and validate the stored reader state. Never throws. */
export function readFlowReaderState(storage?: StorageLike | null): FlowReaderState {
  if (!storage) return EMPTY_STATE;

  try {
    const raw = storage.getItem(FLOW_READER_STATE_KEY);

    if (!raw) return EMPTY_STATE;

    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || parsed.version !== FLOW_READER_STATE_VERSION) {
      return EMPTY_STATE;
    }

    return {
      version: FLOW_READER_STATE_VERSION,
      lastRead: parseLastRead(parsed.lastRead),
    };
  } catch {
    return EMPTY_STATE;
  }
}

function writeState(storage: StorageLike | null | undefined, state: FlowReaderState) {
  if (!storage?.setItem) return state;

  try {
    storage.setItem(FLOW_READER_STATE_KEY, JSON.stringify(state));
  } catch {
    /* Quota or private-mode failures are intentionally silent. */
  }

  return state;
}

/**
 * Record the publication that is currently open. Progress is preserved when
 * the same item is reopened so a return does not reset the reader.
 */
export function writeFlowLastRead(
  storage: StorageLike | null | undefined,
  input: { slug: string; title?: string | null; progress?: number },
  now = Date.now()
): FlowReaderState {
  const slug = cleanSlug(input.slug);

  if (!slug) return readFlowReaderState(storage);

  const previous = readFlowReaderState(storage).lastRead;
  const sameItem = previous?.slug === slug;

  return writeState(storage, {
    version: FLOW_READER_STATE_VERSION,
    lastRead: {
      slug,
      title: cleanTitle(input.title) || (sameItem ? previous?.title ?? '' : ''),
      progress: clampProgress(input.progress ?? (sameItem ? previous?.progress ?? 0 : 0)),
      openedAt: sameItem ? previous?.openedAt ?? now : now,
      updatedAt: now,
    },
  });
}

/** Update progress only for the item that is actually stored. */
export function writeFlowReadingProgress(
  storage: StorageLike | null | undefined,
  slug: string,
  progress: number,
  now = Date.now()
): FlowReaderState {
  const current = readFlowReaderState(storage);

  if (!current.lastRead || current.lastRead.slug !== cleanSlug(slug)) {
    return current;
  }

  const nextProgress = clampProgress(progress);

  // Avoid storage writes for sub-percent scroll noise.
  if (Math.abs(nextProgress - current.lastRead.progress) < 0.005 && nextProgress < 0.995) {
    return current;
  }

  return writeState(storage, {
    version: FLOW_READER_STATE_VERSION,
    lastRead: {
      ...current.lastRead,
      progress: nextProgress,
      updatedAt: nowMs(now),
    },
  });
}

export function readFlowFeedPosition(storage?: StorageLike | null): FlowFeedPosition | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(FLOW_FEED_STATE_KEY);

    if (raw) {
      const parsed: unknown = JSON.parse(raw);

      if (isRecord(parsed) && parsed.version === FLOW_READER_STATE_VERSION) {
        const updatedAt = Number(parsed.updatedAt);
        const scrollY = Number(parsed.scrollY);
        const anchorOffset = Number(parsed.anchorOffset);
        const loadedCount = Number(parsed.loadedCount);

        return {
          scrollY: Number.isFinite(scrollY) && scrollY > 0 ? Math.round(scrollY) : 0,
          anchorId: cleanSlug(parsed.anchorId) || null,
          anchorOffset: Number.isFinite(anchorOffset) ? Math.round(anchorOffset) : 0,
          loadedCount:
            Number.isFinite(loadedCount) && loadedCount > 0 ? Math.round(loadedCount) : 0,
          updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
        };
      }
    }

    // Backwards-compatible fallback: the first implementation stored only y.
    const legacy = Number(storage.getItem(LEGACY_FLOW_SCROLL_KEY));

    if (Number.isFinite(legacy) && legacy > 0) {
      return {
        scrollY: Math.round(legacy),
        anchorId: null,
        anchorOffset: 0,
        loadedCount: 0,
        updatedAt: 0,
      };
    }
  } catch {
    /* Ignore malformed or unavailable storage. */
  }

  return null;
}

export function writeFlowFeedPosition(
  storage: StorageLike | null | undefined,
  position: Omit<FlowFeedPosition, 'updatedAt'> & { updatedAt?: number }
): FlowFeedPosition | null {
  if (!storage?.setItem) return null;

  const next: FlowFeedPosition = {
    scrollY: Math.max(0, Math.round(Number(position.scrollY) || 0)),
    anchorId: cleanSlug(position.anchorId) || null,
    anchorOffset: Math.round(Number(position.anchorOffset) || 0),
    loadedCount: Math.max(0, Math.round(Number(position.loadedCount) || 0)),
    updatedAt: nowMs(position.updatedAt),
  };

  try {
    storage.setItem(
      FLOW_FEED_STATE_KEY,
      JSON.stringify({ version: FLOW_READER_STATE_VERSION, ...next })
    );
    // Keep the legacy key warm for a session that reloads an old bundle.
    storage.setItem(LEGACY_FLOW_SCROLL_KEY, String(next.scrollY));
  } catch {
    return null;
  }

  return next;
}

/** Local Storage in the browser, or null in SSR/private contexts. */
export function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function safeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
