import type { WorkspaceMetricKey, WorkspaceOverview } from './types';
import { WORKSPACE_METRIC_KEYS } from './types';

/**
 * Owner-only aggregate snapshot cache.
 *
 * The record contains metrics and the commercial summary only. It never
 * contains messages, memory records or other private content. The browser
 * cache is namespaced by authenticated owner and schema version; the cookie
 * has the same namespace so the server can reuse the snapshot on the next
 * navigation instead of querying all five metric sources again.
 */

export const OVERVIEW_CACHE_VERSION = 1;
export const OVERVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const STORAGE_PREFIX = 'pierrot:workspace:overview:v1:';
const COOKIE_PREFIX = 'pw_overview_v1_';
export const OVERVIEW_COOKIE_PATH = '/admin/pierrot';

export type OverviewCacheRecord = {
  v: typeof OVERVIEW_CACHE_VERSION;
  ownerId: string;
  savedAt: string;
  overview: WorkspaceOverview;
};

export type ParsedOverviewCache = {
  overview: WorkspaceOverview;
  savedAt: string;
  stale: boolean;
};

const METRIC_STATES = new Set(['растёт', 'стоит', 'падает', 'тихо', 'пухнет', 'тревога']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isMetric(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!WORKSPACE_METRIC_KEYS.includes(value.key as WorkspaceMetricKey)) return false;
  if (typeof value.label !== 'string') return false;
  if (!isFiniteNumber(value.current)) return false;
  if (!isFiniteNumber(value.periodCount)) return false;
  if (!isFiniteNumber(value.previousCount)) return false;
  if (value.state !== null && !METRIC_STATES.has(String(value.state))) return false;
  if (value.series !== null && !isNumberArray(value.series)) return false;
  return typeof value.available === 'boolean';
}

function isCommercial(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.complete !== 'boolean') return false;
  if (value.periodKey !== 'last_7_days' && value.periodKey !== 'last_30_days') return false;
  if (!isRecord(value.current) || !isRecord(value.previous)) return false;
  if (!isFiniteNumber(value.current.paidCount)) return false;
  if (!isFiniteNumber(value.current.flowSubscriptions)) return false;
  if (!isFiniteNumber(value.previous.paidCount)) return false;
  if (!isFiniteNumber(value.previous.flowSubscriptions)) return false;
  return true;
}

function isOverview(value: unknown): value is WorkspaceOverview {
  if (!isRecord(value)) return false;
  if (value.period !== 7 && value.period !== 30) return false;
  if (typeof value.from !== 'string' || typeof value.to !== 'string') return false;
  if (typeof value.generatedAt !== 'string') return false;
  if (typeof value.summary !== 'string') return false;
  if (!Array.isArray(value.metrics) || value.metrics.length !== WORKSPACE_METRIC_KEYS.length) {
    return false;
  }
  if (!value.metrics.every(isMetric)) return false;
  return isCommercial(value.commercial);
}

export function overviewCacheKey(ownerId: string): string {
  return `${STORAGE_PREFIX}${ownerId}`;
}

export function overviewCookieName(ownerId: string): string {
  return `${COOKIE_PREFIX}${ownerId}`;
}

export function serializeOverviewCache(
  ownerId: string,
  overview: WorkspaceOverview,
  savedAt: string = new Date().toISOString()
): string {
  const record: OverviewCacheRecord = {
    v: OVERVIEW_CACHE_VERSION,
    ownerId,
    savedAt,
    overview,
  };
  return JSON.stringify(record);
}

export function parseOverviewCache(
  raw: string | null | undefined,
  ownerId: string,
  now = Date.now()
): ParsedOverviewCache | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.v !== OVERVIEW_CACHE_VERSION) return null;
    if (parsed.ownerId !== ownerId) return null;
    if (typeof parsed.savedAt !== 'string') return null;

    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt)) return null;
    if (!isOverview(parsed.overview)) return null;

    return {
      overview: parsed.overview,
      savedAt: parsed.savedAt,
      stale: now - savedAt > OVERVIEW_CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

export function readOverviewCache(ownerId: string, now = Date.now()): ParsedOverviewCache | null {
  if (typeof window === 'undefined') return null;

  try {
    return parseOverviewCache(window.localStorage.getItem(overviewCacheKey(ownerId)), ownerId, now);
  } catch {
    return null;
  }
}

/**
 * A cookie carries the same aggregate snapshot to the server renderer. Series
 * are not needed on the home screen and are removed to keep the cookie small.
 */
function slimForCookie(overview: WorkspaceOverview): WorkspaceOverview {
  return {
    ...overview,
    metrics: overview.metrics.map((metric) => ({ ...metric, series: null })),
  };
}

export function writeOverviewCache(
  ownerId: string,
  overview: WorkspaceOverview,
  savedAt: string = new Date().toISOString()
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      overviewCacheKey(ownerId),
      serializeOverviewCache(ownerId, overview, savedAt)
    );
  } catch {
    // Storage can be unavailable in private mode; the in-memory state remains.
  }

  try {
    const raw = serializeOverviewCache(ownerId, slimForCookie(overview), savedAt);
    if (raw.length > 3800) return;

    document.cookie = `${overviewCookieName(ownerId)}=${encodeURIComponent(
      raw
    )}; path=${OVERVIEW_COOKIE_PATH}; max-age=${Math.floor(
      OVERVIEW_CACHE_TTL_MS / 1000
    )}; SameSite=Lax`;
  } catch {
    // Cookie quota or a disabled cookie store must not break the home screen.
  }
}

export function clearOverviewCaches(): void {
  if (typeof window === 'undefined') return;

  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }

  try {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    for (const cookie of cookies) {
      const name = cookie.split('=')[0]?.trim();
      if (!name || !name.startsWith(COOKIE_PREFIX)) continue;
      document.cookie = `${name}=; path=${OVERVIEW_COOKIE_PATH}; max-age=0; SameSite=Lax`;
    }
  } catch {
    // Ignore unavailable cookies.
  }
}
