import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly } from '@/lib/serverOnly';
import {
  VIGIL_COOLDOWN_MS,
  formatVigilCooldown,
  vigilCooldownRemainingMs,
} from '@/lib/vigil/cooldown';
import type { VigilIdentity } from '@/lib/vigil/identity';

assertServerOnly('lib/vigil/claim');

export const VIGIL_CLAIMS_TABLE = 'vigil_spark_claims';

const EPOCH_ISO = new Date(0).toISOString();

export type VigilClaimResult =
  | {
      allowed: true;
      lastSparkAt: string;
    }
  | {
      allowed: false;
      lastSparkAt: string | null;
      remainingMs: number;
      remainingLabel: string;
    };

type ClaimRow = {
  last_spark_at: string | null;
};

export type VigilSparkStatus = {
  canSpark: boolean;
  lastSparkAt: string | null;
  remainingMs: number;
  remainingLabel: string;
};

export async function getVigilSparkStatus(
  supabaseAdmin: SupabaseClient,
  identity: VigilIdentity,
  nowMs: number = Date.now()
): Promise<VigilSparkStatus> {
  const { data, error } = await supabaseAdmin
    .from(VIGIL_CLAIMS_TABLE)
    .select('last_spark_at')
    .eq('identity_key', identity.key)
    .maybeSingle();

  if (error) {
    throw new Error(`Vigil cooldown read failed: ${error.message}`);
  }

  const row = data as ClaimRow | null;
  const remainingMs = vigilCooldownRemainingMs(row?.last_spark_at, nowMs);

  return {
    canSpark: remainingMs <= 0,
    lastSparkAt: row?.last_spark_at ?? null,
    remainingMs,
    remainingLabel: formatVigilCooldown(remainingMs),
  };
}

/**
 * Atomically consumes one spark for one stable identity.
 *
 * The conditional UPDATE is the lock: two concurrent requests both try to move
 * `last_spark_at`; PostgreSQL serialises them on the row and only the first
 * update matches `last_spark_at <= now - 24h`. No client-supplied name, log row
 * or timestamp participates in the decision.
 */
export async function claimVigilSpark(
  supabaseAdmin: SupabaseClient,
  identity: VigilIdentity,
  heartId: number,
  intention?: string | null
): Promise<VigilClaimResult> {
  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const cutoffISO = new Date(now - VIGIL_COOLDOWN_MS).toISOString();

  // Create the cooldown row once. On conflict it is deliberately left intact.
  const { error: ensureError } = await supabaseAdmin
    .from(VIGIL_CLAIMS_TABLE)
    .upsert(
      {
        identity_key: identity.key,
        display_name: identity.displayName,
        heart_id: heartId,
        last_spark_at: EPOCH_ISO,
        updated_at: nowISO,
      },
      { onConflict: 'identity_key', ignoreDuplicates: true }
    );

  if (ensureError) {
    throw new Error(`Vigil cooldown row unavailable: ${ensureError.message}`);
  }

  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from(VIGIL_CLAIMS_TABLE)
    .update({
      display_name: identity.displayName,
      heart_id: heartId,
      last_spark_at: nowISO,
      updated_at: nowISO,
    })
    .eq('identity_key', identity.key)
    .lte('last_spark_at', cutoffISO)
    .select('last_spark_at')
    .maybeSingle();

  if (claimError) {
    throw new Error(`Vigil cooldown check failed: ${claimError.message}`);
  }

  const claimed = claimedRows as ClaimRow | null;

  if (!claimed) {
    const { data: existingRows, error: readError } = await supabaseAdmin
      .from(VIGIL_CLAIMS_TABLE)
      .select('last_spark_at')
      .eq('identity_key', identity.key)
      .maybeSingle();

    if (readError) {
      throw new Error(`Vigil cooldown read failed: ${readError.message}`);
    }

    const existing = existingRows as ClaimRow | null;
    const remainingMs = vigilCooldownRemainingMs(
      existing?.last_spark_at,
      now
    );

    return {
      allowed: false,
      lastSparkAt: existing?.last_spark_at ?? null,
      remainingMs,
      remainingLabel: formatVigilCooldown(remainingMs),
    };
  }

  // From here the spark is consumed. Only a verified Supabase identity may own
  // a UUID-backed heart; Telegram ownership stays display-only, as before,
  // but is never used for cooldown or identity decisions.
  if (identity.source === 'supabase') {
    const { error: clearError } = await supabaseAdmin
      .from('vigil_hearts')
      .update({
        owner_id: null,
        owner_name: null,
        intention: null,
        last_lit_at: null,
      })
      .eq('owner_id', identity.userId)
      .neq('id', heartId);

    if (clearError) {
      console.warn('Vigil previous heart cleanup failed:', clearError.message);
    }
  }

  const heartUpdate: Record<string, unknown> = {
    id: heartId,
    owner_name: identity.displayName,
    owner_id: identity.source === 'supabase' ? identity.userId : null,
    last_lit_at: nowISO,
  };

  if (typeof intention === 'string' && intention.trim()) {
    heartUpdate.intention = intention.trim().slice(0, 280);
  }

  const { data: record, error: heartError } = await supabaseAdmin
    .from('vigil_hearts')
    .upsert(heartUpdate, { onConflict: 'id' })
    .select()
    .single();

  if (heartError) {
    throw new Error(`Vigil heart update failed: ${heartError.message}`);
  }

  // The public ritual log is written by the server with the verified display
  // name. A logging failure must not turn a successful spark into an error.
  const { error: logError } = await supabaseAdmin.from('temple_log').insert({
    user_id: identity.source === 'supabase' ? identity.userId : null,
    author: identity.displayName,
    event_type: 'VIGIL_SPARK',
    message: `${identity.displayName} transmitted a spark`,
    created_at: nowISO,
  });

  if (logError) {
    console.warn('Vigil temple log failed:', logError.message);
  }

  return {
    allowed: true,
    lastSparkAt:
      (record as { last_lit_at?: string | null } | null)?.last_lit_at ??
      nowISO,
  };
}
