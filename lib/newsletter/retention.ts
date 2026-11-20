import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/newsletter/retention');

import type { SupabaseClient } from '@supabase/supabase-js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_PENDING_RETENTION_DAYS = 30;
export const DEFAULT_TOKEN_GRACE_DAYS = 7;
export const DEFAULT_RETENTION_BATCH_SIZE = 25;

function boundedEnvDays(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

export function pendingRetentionDays(): number {
  return boundedEnvDays(
    'NEWSLETTER_PENDING_RETENTION_DAYS',
    DEFAULT_PENDING_RETENTION_DAYS,
    14,
    365
  );
}

export function tokenGraceDays(): number {
  return boundedEnvDays('NEWSLETTER_TOKEN_GRACE_DAYS', DEFAULT_TOKEN_GRACE_DAYS, 1, 90);
}

export type NewsletterRetentionResult = {
  examinedPending: number;
  purgedSubscribers: number;
  purgedTokens: number;
  skippedSubscribers: number;
  errors: string[];
};

/**
 * Remove stale pending signups and expired confirmation tokens.
 *
 * Safety rules:
 * - only rows with `isActive=false`, no `confirmedAt` and no `unsubscribedAt`
 *   are eligible;
 * - an audit event is written before the pending row is removed; if that event
 *   cannot be stored, the row is left in place;
 * - confirmed, active and unsubscribed rows are never selected or deleted;
 * - work is batched and idempotent, so a cron retry cannot duplicate actions.
 */
export async function cleanupStaleNewsletterSignups(
  store: SupabaseClient,
  options: {
    now?: Date;
    pendingDays?: number;
    tokenGrace?: number;
    batchSize?: number;
  } = {}
): Promise<NewsletterRetentionResult> {
  const now = options.now ?? new Date();
  const pendingDays = Math.max(14, options.pendingDays ?? pendingRetentionDays());
  const graceDays = Math.max(1, options.tokenGrace ?? tokenGraceDays());
  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_RETENTION_BATCH_SIZE, 500));
  const pendingCutoff = new Date(now.getTime() - pendingDays * DAY_MS).toISOString();
  const tokenCutoff = new Date(now.getTime() - graceDays * DAY_MS).toISOString();

  const result: NewsletterRetentionResult = {
    examinedPending: 0,
    purgedSubscribers: 0,
    purgedTokens: 0,
    skippedSubscribers: 0,
    errors: [],
  };

  try {
    const { data, error } = await store
      .from('subscribers')
      .select('id, createdAt')
      .eq('isActive', false)
      .is('confirmedAt', null)
      .is('unsubscribedAt', null)
      .lt('createdAt', pendingCutoff)
      .order('createdAt', { ascending: true })
      .limit(batchSize);

    if (error) {
      result.errors.push('pending_lookup_failed');
      return result;
    }

    const rows = Array.isArray(data) ? (data as Array<{ id: string | number }>) : [];
    result.examinedPending = rows.length;

    for (const row of rows) {
      const subscriberId = row.id;

      const { error: auditError } = await store.from('subscription_events').upsert(
        {
          event_name: 'subscription_failed',
          event_key: `pending_expired:${subscriberId}`,
          subscriber_id: String(subscriberId),
          payload: { reason: 'pending_expired' },
        },
        { onConflict: 'event_key', ignoreDuplicates: true }
      );

      if (auditError) {
        result.skippedSubscribers += 1;
        continue;
      }

      try {
        await store.from('subscriber_tokens').delete().eq('subscriber_id', subscriberId);
      } catch {
        // The subscriber guard below still protects confirmed rows.
      }

      const { error: deleteError } = await store
        .from('subscribers')
        .delete()
        .eq('id', subscriberId)
        .eq('isActive', false)
        .is('confirmedAt', null)
        .is('unsubscribedAt', null);

      if (deleteError) {
        result.skippedSubscribers += 1;
      } else {
        result.purgedSubscribers += 1;
      }
    }
  } catch {
    result.errors.push('pending_cleanup_failed');
  }

  try {
    const { data: deletedTokens, error: tokenError } = await store
      .from('subscriber_tokens')
      .delete()
      .lt('expires_at', tokenCutoff)
      .limit(batchSize)
      .select('id');

    if (tokenError) {
      result.errors.push('token_cleanup_failed');
    } else {
      result.purgedTokens = Array.isArray(deletedTokens) ? deletedTokens.length : 0;
    }
  } catch {
    result.errors.push('token_cleanup_failed');
  }

  return result;
}
