/**
 * Aggregate Vigil analytics.
 *
 * These numbers describe stable identities recorded by the server, never
 * browser-supplied names and never `temple_log` author labels:
 *
 * - lifetimeTotal: all-time successful sparks. The private counter is seeded
 *   from the canonical VIGIL / VIGIL_SPARK log and then advanced atomically by
 *   the claim trigger. It is never reset by the rolling 24h window.
 * - uniqueParticipants: distinct stable identity keys (`tg:` or `sb:`) that
 *   have completed at least one spark since claim tracking began.
 * - returningParticipants: identities with more than one successful spark.
 *   Because the server enforces a 24h cooldown, two successful sparks by the
 *   same identity are necessarily in different 24h windows.
 * - repeatRate: returningParticipants / uniqueParticipants. It is a rate over
 *   identities, not over people: one person with two accounts is two keys.
 *
 * Historical identities that predate `vigil_spark_claims` cannot be
 * reconstructed without guessing, so unique/returning metrics start when the
 * claim table exists. `analyticsSince` exposes the earliest identity record.
 */

export const VIGIL_METRICS_METHODOLOGY =
  'Stable identity keys only (Telegram tg: or Supabase sb:). Unique participants are identities, not verified people. Returning means more than one successful spark; the 24h server cooldown makes each return a different 24h window. Lifetime total is the all-time VIGIL/VIGIL_SPARK count.';

export type VigilMetrics = {
  /** All-time successful VIGIL/VIGIL_SPARK events, or null if unavailable. */
  lifetimeTotal: number | null;
  /** Distinct stable identity keys with at least one successful spark. */
  uniqueParticipants: number;
  /** Identity keys with more than one successful spark. */
  returningParticipants: number;
  /** returningParticipants / uniqueParticipants, or null when there are none. */
  repeatRate: number | null;
  /** Stable identities by verified namespace. */
  telegramParticipants: number;
  supabaseParticipants: number;
  /** Earliest tracked identity record; null when tracking is unavailable. */
  analyticsSince: string | null;
  /** False when the analytics migration/source is not available. */
  analyticsAvailable: boolean;
};

export const EMPTY_VIGIL_METRICS: VigilMetrics = {
  lifetimeTotal: null,
  uniqueParticipants: 0,
  returningParticipants: 0,
  repeatRate: null,
  telegramParticipants: 0,
  supabaseParticipants: 0,
  analyticsSince: null,
  analyticsAvailable: false,
};

export function normalizeVigilMetricCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(count) || count <= 0) return 0;

  return Math.floor(count);
}

function normalizeNullableCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const count = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(count) || count < 0) return null;

  return Math.floor(count);
}

/**
 * A returning rate can never exceed 1, even against malformed input. The rate
 * is rounded to four decimal places so the public payload stays stable.
 */
export function computeVigilRepeatRate(
  returningParticipants: unknown,
  uniqueParticipants: unknown
): number | null {
  const returning = normalizeVigilMetricCount(returningParticipants);
  const unique = normalizeVigilMetricCount(uniqueParticipants);

  if (unique === 0) return null;

  const rate = Math.min(1, returning / unique);

  return Math.round(rate * 10_000) / 10_000;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Maps the private aggregate view row to the public camelCase contract. */
export function buildVigilMetrics(
  row: Record<string, unknown> | null | undefined
): VigilMetrics {
  if (!row) return { ...EMPTY_VIGIL_METRICS };

  const uniqueParticipants = normalizeVigilMetricCount(
    row.unique_participants
  );
  const returningParticipants = normalizeVigilMetricCount(
    row.returning_participants
  );

  return {
    lifetimeTotal: normalizeNullableCount(row.lifetime_total),
    uniqueParticipants,
    returningParticipants,
    repeatRate: computeVigilRepeatRate(
      returningParticipants,
      uniqueParticipants
    ),
    telegramParticipants: normalizeVigilMetricCount(row.telegram_participants),
    supabaseParticipants: normalizeVigilMetricCount(row.supabase_participants),
    analyticsSince: validTimestamp(row.reliable_since),
    analyticsAvailable: true,
  };
}

/**
 * Parses an `/api/vigil/state` payload. Older cached payloads that predate
 * analytics are accepted as "unavailable" instead of being rejected, so the
 * shared flame keeps working during a deploy or behind an old cache.
 */
export function parseVigilMetrics(
  payload: Record<string, unknown>
): VigilMetrics {
  if (payload.analyticsAvailable !== true) {
    return { ...EMPTY_VIGIL_METRICS };
  }

  const lifetimeTotal = normalizeNullableCount(payload.lifetimeTotal);
  const uniqueParticipants = normalizeVigilMetricCount(
    payload.uniqueParticipants
  );
  const returningParticipants = normalizeVigilMetricCount(
    payload.returningParticipants
  );
  const rawRate = payload.repeatRate;
  const repeatRate =
    typeof rawRate === 'number' && Number.isFinite(rawRate)
      ? Math.min(1, Math.max(0, rawRate))
      : computeVigilRepeatRate(returningParticipants, uniqueParticipants);

  return {
    lifetimeTotal,
    uniqueParticipants,
    returningParticipants,
    repeatRate,
    telegramParticipants: normalizeVigilMetricCount(
      payload.telegramParticipants
    ),
    supabaseParticipants: normalizeVigilMetricCount(
      payload.supabaseParticipants
    ),
    analyticsSince: validTimestamp(payload.analyticsSince),
    analyticsAvailable: true,
  };
}

export function formatVigilLifetimeLabel(
  lifetimeTotal: number | null | undefined
): string {
  if (typeof lifetimeTotal !== 'number' || !Number.isFinite(lifetimeTotal)) {
    return '';
  }

  const total = Math.max(0, Math.floor(lifetimeTotal));

  return `${total} ${total === 1 ? 'spark' : 'sparks'} offered`;
}
