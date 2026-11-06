import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Telegram may redeliver an update when the webhook response is slow or the
 * network drops. The existing `ingest_log` table is already the durable
 * idempotency store for Telegram ingestion, so the Pierrot bot reuses it
 * instead of introducing a second queue or a background worker.
 */

const TELEGRAM_UPDATE_SOURCE = 'telegram_pierrot';
const TABLE = 'ingest_log';

export function telegramUpdateKey(updateId: number | string): string {
  return `telegram:pierrot:${updateId}`;
}

export type TelegramUpdateClaim = 'claimed' | 'duplicate' | 'unavailable';

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505';
}

export async function claimTelegramUpdate(
  store: SupabaseClient,
  updateId: number | string
): Promise<TelegramUpdateClaim> {
  const { error } = await store.from(TABLE).insert({
    idempotency_key: telegramUpdateKey(updateId),
    source: TELEGRAM_UPDATE_SOURCE,
    item_id: null,
  });

  if (!error) return 'claimed';
  if (isUniqueViolation(error)) return 'duplicate';

  console.error('[telegram-idempotency] Could not claim update:', error.code || 'unknown');
  return 'unavailable';
}

export async function releaseTelegramUpdateClaim(
  store: SupabaseClient,
  updateId: number | string
): Promise<void> {
  const { error } = await store
    .from(TABLE)
    .delete()
    .eq('idempotency_key', telegramUpdateKey(updateId))
    .is('item_id', null);

  if (error) {
    console.error(
      '[telegram-idempotency] Could not release update claim:',
      error.code || 'unknown'
    );
  }
}
