import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/newsletter/recipients');

import type { SupabaseClient } from '@supabase/supabase-js';

import { filterSubscribersByLang, isSubscriberMatchingLang } from './language';

/**
 * Canonical recipient selection for every newsletter dispatch path.
 *
 * A subscriber may only receive a newsletter when BOTH conditions hold:
 *   - `isActive === true`;
 *   - `confirmedAt` is set (double opt-in completed).
 *
 * Filtering is repeated in memory after the database query so a partial or
 * misconfigured Supabase query can never leak a pending subscriber into a
 * send loop.
 */
export const NEWSLETTER_RECIPIENT_COLUMNS = 'id,email,locale,isActive,confirmedAt';

export type NewsletterSubscriberRecord = {
  id: string;
  email: string;
  locale?: string | null;
  isActive?: boolean | null;
  confirmedAt?: string | null;
};

export type NewsletterAudienceSummary = {
  total: number;
  ru: number;
  en: number;
};

export function isConfirmedActiveSubscriber(
  row: NewsletterSubscriberRecord | null | undefined
): boolean {
  return Boolean(
    row &&
      row.isActive === true &&
      typeof row.confirmedAt === 'string' &&
      row.confirmedAt.trim().length > 0
  );
}

/** Select confirmed active recipients for exactly one issue language. */
export function selectNewsletterRecipients<T extends NewsletterSubscriberRecord>(
  rows: readonly T[] | null | undefined,
  issueLang: string | null | undefined
): T[] {
  const eligible = (rows || []).filter(isConfirmedActiveSubscriber);
  return filterSubscribersByLang(eligible, issueLang);
}

/**
 * Remove subscribers that already have a terminal log row for this job.
 * This makes a retried job idempotent even without a unique index on
 * `newsletter_logs`.
 */
export function excludeProcessedSubscribers<T extends { id: string | number }>(
  recipients: readonly T[],
  processedIds: ReadonlySet<string>
): T[] {
  if (processedIds.size === 0) return [...recipients];
  return recipients.filter((recipient) => !processedIds.has(String(recipient.id)));
}

export function summarizeNewsletterAudience(
  rows: readonly NewsletterSubscriberRecord[] | null | undefined
): NewsletterAudienceSummary {
  const eligible = (rows || []).filter(isConfirmedActiveSubscriber);
  return {
    total: eligible.length,
    ru: eligible.filter((row) => isSubscriberMatchingLang(row.locale, 'ru')).length,
    en: eligible.filter((row) => isSubscriberMatchingLang(row.locale, 'en')).length,
  };
}

/**
 * Fetch the whole confirmed/active audience. Used by admin previews and
 * counters. The query mirrors the in-memory guard intentionally.
 */
export async function fetchConfirmedActiveSubscribers(
  store: SupabaseClient,
  options: { limit?: number } = {}
): Promise<{ subscribers: NewsletterSubscriberRecord[]; error: unknown | null }> {
  let query = store
    .from('subscribers')
    .select(NEWSLETTER_RECIPIENT_COLUMNS)
    .eq('isActive', true)
    .not('confirmedAt', 'is', null);

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    return { subscribers: [], error };
  }

  return {
    subscribers: (Array.isArray(data) ? data : []) as NewsletterSubscriberRecord[],
    error: null,
  };
}

/** Fetch only the recipients for one issue language. */
export async function fetchNewsletterRecipients(
  store: SupabaseClient,
  issueLang: string | null | undefined,
  options: { limit?: number } = {}
): Promise<{ recipients: NewsletterSubscriberRecord[]; error: unknown | null }> {
  const { subscribers, error } = await fetchConfirmedActiveSubscribers(store, options);

  if (error) {
    return { recipients: [], error };
  }

  return { recipients: selectNewsletterRecipients(subscribers, issueLang), error: null };
}

/** Admin preview helper: never exposes a complete address in JSON or logs. */
export function maskNewsletterEmail(email: string): string {
  const value = (email || '').trim();
  const at = value.lastIndexOf('@');

  if (at <= 0 || at === value.length - 1) return '***';

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = local.slice(0, 1);

  return `${visible}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
}
