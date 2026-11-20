import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/newsletter/signup');

import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  sendSubscriptionConfirmation,
  type SubscriptionConfirmationResult,
} from './sendSubscriptionConfirmation';

export const CONFIRMATION_TOKEN_TTL_DAYS = 7;

export type NewsletterLocale = 'ru' | 'en';

export type NewsletterSignupFailureReason =
  | 'lookup'
  | 'insert'
  | 'update'
  | 'token'
  | 'email_send'
  | 'email_not_configured';

export type NewsletterSignupResult =
  | { status: 'already_confirmed'; subscriberId: string | number }
  | {
      status: 'pending_confirmation';
      subscriberId: string | number;
      token: string;
      devConfirmationUrl?: string;
    }
  | {
      status: 'failed';
      reason: NewsletterSignupFailureReason;
      subscriberId: string | number | null;
      errorCode: string | null;
    };

type ExistingSubscriber = {
  id: string | number;
  isActive: boolean | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  locale?: string | null;
  userId?: string | null;
};

function databaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.slice(0, 40) : null;
}

function confirmationUrl(input: {
  baseUrl: string;
  token: string;
  locale: NewsletterLocale;
  pierrotAttribution?: string | null;
}): string {
  const url = new URL('/api/newsletter-confirm', input.baseUrl);
  url.searchParams.set('token', input.token);
  if (input.pierrotAttribution) url.searchParams.set('pierrot', input.pierrotAttribution);
  if (input.locale === 'ru') url.searchParams.set('lang', 'ru');
  return url.toString();
}

async function invalidateNewToken(store: SupabaseClient, token: string, now: string) {
  try {
    const { error } = await store
      .from('subscriber_tokens')
      .update({ used: true, usedAt: now })
      .eq('token', token);

    if (!error) return;
  } catch {
    // Fall through to deleting the token; both states are non-live.
  }

  try {
    await store.from('subscriber_tokens').delete().eq('token', token);
  } catch {
    // Best effort. The caller still reports the delivery failure.
  }
}

async function restoreSubscriber(
  store: SupabaseClient,
  previous: ExistingSubscriber,
  fallbackLocale: NewsletterLocale
) {
  try {
    await store
      .from('subscribers')
      .update({
        isActive: previous.isActive === true,
        confirmedAt: previous.confirmedAt ?? null,
        unsubscribedAt: previous.unsubscribedAt ?? null,
        locale: previous.locale || fallbackLocale,
        userId: previous.userId ?? null,
      })
      .eq('id', previous.id);
  } catch {
    // Best effort compensating update; no confirmed subscriber is affected.
  }
}

async function removeUnconfirmedSubscriber(store: SupabaseClient, subscriberId: string | number) {
  try {
    await store
      .from('subscribers')
      .delete()
      .eq('id', subscriberId)
      .eq('isActive', false)
      .is('confirmedAt', null);
  } catch {
    // Best effort cleanup. The token is already invalidated.
  }
}

/**
 * Core double opt-in lifecycle shared by the JSON endpoint and server action.
 *
 * The previous confirmation token is only invalidated after the new email was
 * delivered. If delivery fails, the newly created token is invalidated and a
 * just-created pending subscriber is removed; an existing subscriber is
 * restored to its previous state. A confirmed subscriber is never deleted or
 * downgraded.
 */
export async function registerNewsletterSubscriber(input: {
  store: SupabaseClient;
  email: string;
  locale: NewsletterLocale;
  userId?: string | null;
  pierrotAttribution?: string | null;
  baseUrl: string;
  sendConfirmation?: typeof sendSubscriptionConfirmation;
}): Promise<NewsletterSignupResult> {
  const { store, email, locale, userId, pierrotAttribution, baseUrl } = input;
  const sendConfirmation = input.sendConfirmation ?? sendSubscriptionConfirmation;
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: existing, error: lookupError } = await store
    .from('subscribers')
    .select('id, isActive, confirmedAt, unsubscribedAt, locale, userId')
    .eq('email', email)
    .maybeSingle();

  if (lookupError) {
    console.error('Newsletter signup lookup failed');
    return {
      status: 'failed',
      reason: 'lookup',
      subscriberId: null,
      errorCode: databaseErrorCode(lookupError),
    };
  }

  const previous = (existing || null) as ExistingSubscriber | null;

  if (previous?.isActive === true && previous.confirmedAt) {
    return { status: 'already_confirmed', subscriberId: previous.id };
  }

  let subscriberId: string | number | null = previous?.id ?? null;
  const createdSubscriber = !previous;

  if (createdSubscriber) {
    const insertData: Record<string, unknown> = {
      email,
      isActive: false,
      locale,
      confirmedAt: null,
      unsubscribedAt: null,
    };
    if (userId) insertData.userId = userId;

    const insert = await store.from('subscribers').insert(insertData).select('id').maybeSingle();

    if (insert.error || !insert.data?.id) {
      console.error('Newsletter signup insert failed');
      return {
        status: 'failed',
        reason: 'insert',
        subscriberId: null,
        errorCode: databaseErrorCode(insert.error),
      };
    }

    subscriberId = insert.data.id;
  } else {
    const update: Record<string, unknown> = {
      isActive: false,
      locale,
      confirmedAt: null,
      unsubscribedAt: null,
    };
    if (userId) update.userId = userId;

    const { error: updateError } = await store
      .from('subscribers')
      .update(update)
      .eq('id', subscriberId);

    if (updateError) {
      console.error('Newsletter signup update failed');
      return {
        status: 'failed',
        reason: 'update',
        subscriberId,
        errorCode: databaseErrorCode(updateError),
      };
    }
  }

  if (subscriberId === null) {
    return {
      status: 'failed',
      reason: 'insert',
      subscriberId: null,
      errorCode: null,
    };
  }

  const targetSubscriberId = subscriberId;

  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(
    now.getTime() + CONFIRMATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error: tokenError } = await store.from('subscriber_tokens').insert({
    subscriber_id: targetSubscriberId,
    type: 'confirm',
    token,
    created_at: nowIso,
    expires_at: expiresAt,
  });

  if (tokenError) {
    console.error('Newsletter confirmation token insert failed');

    if (createdSubscriber) {
      await removeUnconfirmedSubscriber(store, targetSubscriberId);
    } else if (previous) {
      await restoreSubscriber(store, previous, locale);
    }

    return {
      status: 'failed',
      reason: 'token',
      subscriberId: targetSubscriberId,
      errorCode: databaseErrorCode(tokenError),
    };
  }

  let delivery: SubscriptionConfirmationResult;

  try {
    delivery = await sendConfirmation({
      email,
      token,
      locale,
      baseUrl,
      pierrotAttribution,
    });
  } catch {
    delivery = { status: 'error', reason: 'exception' };
  }

  const deliveryFailed =
    delivery.status === 'error' ||
    (delivery.status === 'skipped' && process.env.NODE_ENV === 'production');

  if (deliveryFailed) {
    console.warn(
      `[Newsletter] confirmation delivery failed (${delivery.status === 'error' ? delivery.reason : 'missing_api_key'})`
    );

    await invalidateNewToken(store, token, nowIso);

    if (createdSubscriber) {
      await removeUnconfirmedSubscriber(store, targetSubscriberId);
    } else if (previous) {
      await restoreSubscriber(store, previous, locale);
    }

    return {
      status: 'failed',
      reason: delivery.status === 'skipped' ? 'email_not_configured' : 'email_send',
      subscriberId: targetSubscriberId,
      errorCode: null,
    };
  }

  // The new link is live, so older links for this subscriber are retired.
  try {
    await store
      .from('subscriber_tokens')
      .update({ used: true, usedAt: nowIso })
      .eq('subscriber_id', targetSubscriberId)
      .eq('type', 'confirm')
      .eq('used', false)
      .neq('token', token);
  } catch {
    // The new token remains valid; stale links may survive until expiry.
  }

  if (delivery.status === 'skipped') {
    return {
      status: 'pending_confirmation',
      subscriberId: targetSubscriberId,
      token,
      devConfirmationUrl: confirmationUrl({ baseUrl, token, locale, pierrotAttribution }),
    };
  }

  return { status: 'pending_confirmation', subscriberId: targetSubscriberId, token };
}
