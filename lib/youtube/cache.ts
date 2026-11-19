type CacheEntry<T> = {
  value: T;
  fetchedAtMs: number;
};

export type ReportCacheHit<T> = {
  value: T;
  fetchedAt: string;
  ageSeconds: number;
};

/**
 * Small in-process cache for repeated owner questions. It is deliberately not
 * a background worker: entries expire and disappear, and `fresh: true` always
 * goes to the source API.
 */
export function createReportCache<T>(ttlSeconds: number, now: () => number = Date.now) {
  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): ReportCacheHit<T> | null {
      const entry = entries.get(key);
      if (!entry) return null;

      const ageSeconds = Math.max(0, Math.floor((now() - entry.fetchedAtMs) / 1000));

      if (ttlSeconds <= 0 || ageSeconds >= ttlSeconds) {
        entries.delete(key);
        return null;
      }

      return {
        value: entry.value,
        fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
        ageSeconds,
      };
    },

    set(key: string, value: T): ReportCacheHit<T> {
      const fetchedAtMs = now();
      entries.set(key, { value, fetchedAtMs });

      return {
        value,
        fetchedAt: new Date(fetchedAtMs).toISOString(),
        ageSeconds: 0,
      };
    },

    clear(): void {
      entries.clear();
    },
  };
}
