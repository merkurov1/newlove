import {
  TEMPLE_FEED_CACHE_KEY,
  TEMPLE_FEED_TTL_MS,
  isTempleFeedPayload,
  type TempleFeedPayload,
} from '@/lib/temple/feed';

type CacheEntry<T> = {
  value: T;
  storedAt: number;
  expiresAt: number;
};

/**
 * Small in-process TTL cache used by the server route. A cached value is reused
 * for one documented TTL. When it expires it is kept as a last-known-good
 * fallback until a successful refresh replaces it or it is invalidated.
 */
export class TtlCache<T> {
  private entry: CacheEntry<T> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now()
  ) {}

  get(nowMs: number = this.now()): CacheEntry<T> | null {
    const entry = this.entry;

    if (!entry || nowMs >= entry.expiresAt) return null;

    return entry;
  }

  /** Returns even an expired entry, for stale-if-error fallback. */
  peek(): CacheEntry<T> | null {
    return this.entry;
  }

  set(value: T, nowMs: number = this.now()): CacheEntry<T> {
    const entry = {
      value,
      storedAt: nowMs,
      expiresAt: nowMs + this.ttlMs,
    };

    this.entry = entry;
    return entry;
  }

  invalidate(): void {
    this.entry = null;
  }

  get size(): number {
    return this.entry ? 1 : 0;
  }
}

export type CachedTempleFeed = {
  payload: TempleFeedPayload;
  savedAt: number;
  ageMs: number;
  fresh: boolean;
};

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the browser cache used across visits. Expired data is still returned
 * with `fresh: false` so a transient API failure can keep showing the last
 * known good snapshot instead of an empty Temple.
 */
export function readCachedTempleFeed(
  storage: ReadableStorage | null = safeStorage(),
  nowMs: number = Date.now()
): CachedTempleFeed | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(TEMPLE_FEED_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { savedAt?: unknown; payload?: unknown };
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) {
      return null;
    }
    if (!isTempleFeedPayload(parsed.payload)) return null;

    const ageMs = Math.max(0, nowMs - parsed.savedAt);

    return {
      payload: parsed.payload,
      savedAt: parsed.savedAt,
      ageMs,
      fresh: ageMs <= TEMPLE_FEED_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function writeCachedTempleFeed(
  payload: TempleFeedPayload,
  storage: WritableStorage | null = safeStorage(),
  nowMs: number = Date.now()
): void {
  if (!storage) return;

  try {
    storage.setItem(
      TEMPLE_FEED_CACHE_KEY,
      JSON.stringify({ savedAt: nowMs, payload })
    );
  } catch {
    // Private webviews can block localStorage. The live response still renders.
  }
}

export function clearCachedTempleFeed(
  storage: WritableStorage | null = safeStorage()
): void {
  if (!storage) return;

  try {
    storage.removeItem(TEMPLE_FEED_CACHE_KEY);
  } catch {
    // Ignore.
  }
}
