import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '@/lib/serverOnly';
import {
  EMPTY_VIGIL_METRICS,
  buildVigilMetrics,
} from '@/lib/vigil/analytics';
import {
  globalFlameExpiresAt,
  globalFlameRemainingMs,
} from '@/lib/vigil/flame';
import {
  VIGIL_SUPPORTER_WINDOW_MS,
  normalizeSupporterCount,
  type VigilPublicState,
} from '@/lib/vigil/supporters';

assertServerOnly('lib/vigil/publicState');

const FLAME_ID = 1;
const METRICS_VIEW = 'vigil_spark_metrics';

type CountResult = {
  count: number | null;
  error: { message?: string } | null;
};

type FlameResult = {
  data: { last_lit_at?: string | null } | null;
  error: { message?: string } | null;
};

type MetricsResult = {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
};

/**
 * Reads the authoritative Vigil state with the service role.
 *
 * Supports are counted from the private per-identity claim table rather than
 * a client-supplied value or a display name. The shared flame comes from the
 * single public heart row. No identity, name or claim details leave this
 * function.
 */
export async function getVigilPublicState(
  supabaseAdmin: SupabaseClient,
  nowMs: number = Date.now()
): Promise<VigilPublicState> {
  const windowStartedAt = new Date(
    nowMs - VIGIL_SUPPORTER_WINDOW_MS
  ).toISOString();

  const [claimResult, flameResult, metricsResult] = await Promise.all([
    supabaseAdmin
      .from('vigil_spark_claims')
      .select('*', { count: 'exact', head: true })
      .gt('last_spark_at', windowStartedAt) as unknown as Promise<CountResult>,
    supabaseAdmin
      .from('vigil_hearts')
      .select('last_lit_at')
      .eq('id', FLAME_ID)
      .maybeSingle() as unknown as Promise<FlameResult>,
    supabaseAdmin
      .from(METRICS_VIEW)
      .select('*')
      .maybeSingle() as unknown as Promise<MetricsResult>,
  ]);

  if (claimResult.error) {
    throw new Error(
      `Vigil supporter count failed: ${claimResult.error.message || 'unknown error'}`
    );
  }

  if (flameResult.error) {
    throw new Error(
      `Vigil flame read failed: ${flameResult.error.message || 'unknown error'}`
    );
  }

  // Analytics is additive. A missing migration or view must not take the
  // shared flame down with it; the UI hides the lifetime row until it exists.
  if (metricsResult.error) {
    console.warn(
      'Vigil metrics unavailable:',
      metricsResult.error.message || 'unknown error'
    );
  }

  const metrics = metricsResult.error
    ? { ...EMPTY_VIGIL_METRICS }
    : buildVigilMetrics(metricsResult.data);
  const lastLitAt = flameResult.data?.last_lit_at ?? null;

  return {
    supporterCount: normalizeSupporterCount(claimResult.count),
    lastLitAt,
    flameExpiresAt: globalFlameExpiresAt(lastLitAt),
    flameLit: globalFlameRemainingMs(lastLitAt, nowMs) > 0,
    windowStartedAt,
    updatedAt: new Date(nowMs).toISOString(),
    ...metrics,
  };
}
