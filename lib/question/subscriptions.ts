import { createHash, randomBytes } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { assertServerOnly } from '@/lib/serverOnly';
import { sendTelegramMessage } from '@/lib/telegram';
import type {
  QuestionChannelState,
  QuestionChannelStatus,
  QuestionSubscriptionStatus,
} from './constants';
import { getQuestionServiceClient } from './store';
import { isQuestionId } from './validation';
import {
  sendQuestionAnswerNotificationEmail,
  sendQuestionSubscriptionConfirmation,
} from './notificationEmail';

assertServerOnly('lib/question/subscriptions');

export const QUESTION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export type { QuestionChannelState, QuestionChannelStatus, QuestionSubscriptionStatus };

type SubscriptionRow = {
  id: string;
  question_id: string;
  user_id: string | null;
  email: string | null;
  email_status: string;
  telegram_user_id: number | null;
  telegram_status: string;
};

type TokenRow = {
  id: string;
  subscription_id: string;
  purpose: string;
  channel: string;
  expires_at: string;
  used_at: string | null;
};

const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;
const UNSUBSCRIBE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function storeClient(): SupabaseClient {
  return getQuestionServiceClient();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function hashQuestionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createRawQuestionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidQuestionEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function normalizeQuestionEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function questionAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://www.merkurov.love'
  ).replace(/\/$/, '');
}

export function questionPageUrl(questionId: string): string {
  return `${questionAppBaseUrl()}/question?q=${encodeURIComponent(questionId)}`;
}

export function isQuestionEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function isQuestionEmailDevMode(): boolean {
  return !isQuestionEmailConfigured() && process.env.NODE_ENV !== 'production';
}

export function isQuestionEmailAvailable(): boolean {
  return isQuestionEmailConfigured() || isQuestionEmailDevMode();
}

export function getQuestionBotUsername(): string | null {
  const raw = (
    process.env.QUESTION_TELEGRAM_BOT_USERNAME ||
    process.env.PIERROT_BOT_USERNAME ||
    process.env.TELEGRAM_BOT_USERNAME ||
    ''
  )
    .trim()
    .replace(/^@/, '');

  if (!raw) return null;
  return /^[A-Za-z0-9_]{4,64}$/.test(raw) ? raw : null;
}

/**
 * Telegram linking is enabled only after the operator has checked the bot
 * end-to-end. The code path exists, but the channel stays hidden by default.
 */
export function isQuestionTelegramConfigured(): boolean {
  const botToken =
    process.env.PIERROT_BOT_TOKEN ||
    process.env.OSIRIS_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN;

  return (
    process.env.QUESTION_TELEGRAM_NOTIFICATIONS_ENABLED === '1' &&
    Boolean(botToken) &&
    getQuestionBotUsername() !== null
  );
}

export function getQuestionChannelAvailability(): {
  email: boolean;
  telegram: boolean;
} {
  return {
    email: isQuestionEmailAvailable(),
    telegram: isQuestionTelegramConfigured(),
  };
}

async function loadActiveQuestionText(questionId: string): Promise<string | null> {
  if (!isQuestionId(questionId)) return null;

  const store = storeClient();
  const { data, error } = await store
    .from('questions')
    .select('question')
    .eq('id', questionId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !data || typeof data.question !== 'string') return null;
  return data.question;
}

async function findSubscriptionByEmail(
  store: SupabaseClient,
  questionId: string,
  email: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await store
    .from('question_subscriptions')
    .select('id,question_id,user_id,email,email_status,telegram_user_id,telegram_status')
    .eq('question_id', questionId)
    .eq('email', email)
    .maybeSingle();

  if (error || !data) return null;
  return data as SubscriptionRow;
}

async function findSubscriptionById(
  store: SupabaseClient,
  subscriptionId: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await store
    .from('question_subscriptions')
    .select('id,question_id,user_id,email,email_status,telegram_user_id,telegram_status')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (error || !data) return null;
  return data as SubscriptionRow;
}

async function invalidateTokens(
  store: SupabaseClient,
  subscriptionId: string,
  purpose: string
): Promise<void> {
  await store
    .from('question_subscription_tokens')
    .update({ used_at: nowIso() })
    .eq('subscription_id', subscriptionId)
    .eq('purpose', purpose)
    .is('used_at', null);
}

async function insertToken(
  store: SupabaseClient,
  input: {
    subscriptionId: string;
    purpose: string;
    channel: 'email' | 'telegram' | 'all';
    ttlMs: number;
  }
): Promise<string | null> {
  const raw = createRawQuestionToken();
  const { error } = await store.from('question_subscription_tokens').insert({
    subscription_id: input.subscriptionId,
    purpose: input.purpose,
    channel: input.channel,
    token_hash: hashQuestionToken(raw),
    expires_at: new Date(Date.now() + input.ttlMs).toISOString(),
  });

  return error ? null : raw;
}

/** Creates a fresh single-use unsubscribe token for one delivery. */
async function createUnsubscribeToken(
  store: SupabaseClient,
  subscriptionId: string,
  channel: 'email' | 'telegram' | 'all'
): Promise<string | null> {
  return insertToken(store, {
    subscriptionId,
    purpose:
      channel === 'all'
        ? 'unsubscribe_all'
        : channel === 'email'
          ? 'unsubscribe_email'
          : 'unsubscribe_telegram',
    channel,
    ttlMs: UNSUBSCRIBE_TOKEN_TTL_MS,
  });
}

export function unsubscribeUrlForToken(token: string): string {
  return `${questionAppBaseUrl()}/api/question/subscription/unsubscribe?token=${encodeURIComponent(
    token
  )}`;
}

export function confirmEmailUrlForToken(token: string): string {
  return `${questionAppBaseUrl()}/api/question/subscription/confirm?token=${encodeURIComponent(
    token
  )}`;
}

/**
 * Creates or refreshes an email opt-in. The channel is `pending` until the
 * confirmation link is opened; no delivery can happen before that.
 */
export async function createQuestionEmailSubscription(input: {
  questionId: string;
  email: string;
  userId: string | null;
}): Promise<QuestionChannelStatus> {
  const email = normalizeQuestionEmail(input.email);

  if (!isQuestionEmailAvailable()) {
    return { state: 'unavailable', available: false, code: 'email_not_configured' };
  }

  if (!isValidQuestionEmail(email)) {
    return { state: 'error', available: true, code: 'invalid_email' };
  }

  const questionText = await loadActiveQuestionText(input.questionId);
  if (!questionText) {
    return { state: 'error', available: true, code: 'question_unavailable' };
  }

  const store = storeClient();
  let subscription = await findSubscriptionByEmail(store, input.questionId, email);

  if (!subscription) {
    const { data, error } = await store
      .from('question_subscriptions')
      .insert({
        question_id: input.questionId,
        user_id: input.userId,
        email,
        email_status: 'pending',
      })
      .select('id,question_id,user_id,email,email_status,telegram_user_id,telegram_status')
      .maybeSingle();

    if (error || !data) {
      // A concurrent opt-in may have won the unique index race.
      subscription = await findSubscriptionByEmail(store, input.questionId, email);
      if (!subscription) {
        return { state: 'error', available: true, code: 'subscription_failed' };
      }
    } else {
      subscription = data as SubscriptionRow;
    }
  }

  // A confirmed email is idempotent: do not send another confirmation and do
  // not create duplicate subscriptions.
  if (subscription.email_status === 'active') {
    if (input.userId && !subscription.user_id) {
      // Attach a previously anonymous confirmation to the signed-in account
      // so it can be managed from the UI. Best effort: delivery still works.
      await store
        .from('question_subscriptions')
        .update({ user_id: input.userId, updated_at: nowIso() })
        .eq('id', subscription.id);
    }

    return { state: 'active', available: true };
  }

  const update: Record<string, unknown> = {
    email_status: 'pending',
    email_confirmed_at: null,
    updated_at: nowIso(),
  };

  if (input.userId && !subscription.user_id) {
    update.user_id = input.userId;
  }

  const { error: updateError } = await store
    .from('question_subscriptions')
    .update(update)
    .eq('id', subscription.id);

  if (updateError) {
    return { state: 'error', available: true, code: 'subscription_failed' };
  }

  await invalidateTokens(store, subscription.id, 'confirm_email');

  const confirmToken = await insertToken(store, {
    subscriptionId: subscription.id,
    purpose: 'confirm_email',
    channel: 'email',
    ttlMs: CONFIRM_TOKEN_TTL_MS,
  });

  if (!confirmToken) {
    return { state: 'error', available: true, code: 'token_failed' };
  }

  const confirmationUrl = confirmEmailUrlForToken(confirmToken);

  if (!isQuestionEmailConfigured()) {
    // Development without a mail provider: the link is returned so the flow can
    // still be verified locally. It is never returned in production.
    return {
      state: 'pending',
      available: true,
      code: 'email_not_configured',
      devConfirmationUrl: confirmationUrl,
    };
  }

  const delivery = await sendQuestionSubscriptionConfirmation({
    email,
    questionText,
    confirmationUrl,
  });

  if (delivery.status === 'sent') {
    return { state: 'pending', available: true };
  }

  return {
    state: 'error',
    available: true,
    code: delivery.status === 'skipped' ? 'email_not_configured' : 'email_send_failed',
  };
}

/**
 * Creates a Telegram deep-link token. The identity is attached only after the
 * bot webhook consumes `/start <token>`.
 */
export async function createQuestionTelegramLink(input: {
  questionId: string;
  userId: string | null;
}): Promise<QuestionChannelStatus> {
  if (!isQuestionTelegramConfigured()) {
    return { state: 'unavailable', available: false, code: 'telegram_not_configured' };
  }

  const questionText = await loadActiveQuestionText(input.questionId);
  if (!questionText) {
    return { state: 'error', available: true, code: 'question_unavailable' };
  }

  const store = storeClient();

  // Repeated opt-in for a signed-in subscriber must not create another row.
  if (input.userId) {
    const { data: activeTelegram } = await store
      .from('question_subscriptions')
      .select('id')
      .eq('question_id', input.questionId)
      .eq('user_id', input.userId)
      .eq('telegram_status', 'active')
      .maybeSingle();

    if (activeTelegram?.id) {
      return { state: 'active', available: true };
    }
  }

  const { data, error } = await store
    .from('question_subscriptions')
    .insert({
      question_id: input.questionId,
      user_id: input.userId,
      telegram_status: 'pending',
    })
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    return { state: 'error', available: true, code: 'subscription_failed' };
  }

  const token = await insertToken(store, {
    subscriptionId: data.id as string,
    purpose: 'link_telegram',
    channel: 'telegram',
    ttlMs: TELEGRAM_LINK_TTL_MS,
  });

  if (!token) {
    return { state: 'error', available: true, code: 'token_failed' };
  }

  const botUsername = getQuestionBotUsername();
  if (!botUsername) {
    return { state: 'unavailable', available: false, code: 'telegram_not_configured' };
  }

  return {
    state: 'pending',
    available: true,
    deepLinkUrl: `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`,
  };
}

/**
 * Consumes a confirmation token. The token is claimed with a conditional
 * update, so two concurrent clicks cannot both activate the subscription.
 */
export async function confirmQuestionEmailToken(rawToken: string): Promise<
  | { status: 'confirmed'; questionId: string }
  | { status: 'invalid' | 'used' | 'expired' | 'error' }
> {
  if (!QUESTION_TOKEN_PATTERN.test(rawToken)) return { status: 'invalid' };

  const store = storeClient();
  const { data, error } = await store
    .from('question_subscription_tokens')
    .select('id,subscription_id,purpose,channel,expires_at,used_at')
    .eq('token_hash', hashQuestionToken(rawToken))
    .maybeSingle<TokenRow>();

  if (error) return { status: 'error' };
  if (!data || data.purpose !== 'confirm_email') return { status: 'invalid' };
  if (data.used_at) return { status: 'used' };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { status: 'expired' };

  const { data: claimed, error: claimError } = await store
    .from('question_subscription_tokens')
    .update({ used_at: nowIso() })
    .eq('id', data.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) return { status: 'error' };
  if (!claimed) return { status: 'used' };

  const subscription = await findSubscriptionById(store, data.subscription_id);
  if (!subscription) return { status: 'invalid' };

  const { error: activateError } = await store
    .from('question_subscriptions')
    .update({
      email_status: 'active',
      email_confirmed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', subscription.id);

  if (activateError) return { status: 'error' };

  return { status: 'confirmed', questionId: subscription.question_id };
}

/**
 * Consumes a Telegram deep-link token and attaches the Telegram identity to
 * the pending subscription. Returns only a coarse status.
 */
export async function linkQuestionTelegramToken(input: {
  rawToken: string;
  telegramUserId: number;
  telegramChatId: number;
}): Promise<
  | { status: 'linked' | 'already_linked'; questionId: string }
  | { status: 'invalid' | 'used' | 'expired' | 'error' }
> {
  if (!QUESTION_TOKEN_PATTERN.test(input.rawToken)) return { status: 'invalid' };
  if (
    !Number.isSafeInteger(input.telegramUserId) ||
    input.telegramUserId <= 0 ||
    !Number.isSafeInteger(input.telegramChatId) ||
    input.telegramChatId === 0
  ) {
    return { status: 'invalid' };
  }

  const store = storeClient();
  const { data, error } = await store
    .from('question_subscription_tokens')
    .select('id,subscription_id,purpose,channel,expires_at,used_at')
    .eq('token_hash', hashQuestionToken(input.rawToken))
    .maybeSingle<TokenRow>();

  if (error) return { status: 'error' };
  if (!data || data.purpose !== 'link_telegram') return { status: 'invalid' };
  if (data.used_at) return { status: 'used' };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { status: 'expired' };

  const { data: claimed, error: claimError } = await store
    .from('question_subscription_tokens')
    .update({ used_at: nowIso() })
    .eq('id', data.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) return { status: 'error' };
  if (!claimed) return { status: 'used' };

  const pending = await findSubscriptionById(store, data.subscription_id);
  if (!pending) return { status: 'invalid' };

  const { data: existing, error: existingError } = await store
    .from('question_subscriptions')
    .select('id,telegram_status')
    .eq('question_id', pending.question_id)
    .eq('telegram_user_id', input.telegramUserId)
    .maybeSingle();

  if (existingError) return { status: 'error' };

  if (existing?.id) {
    if (existing.telegram_status === 'active') {
      await store
        .from('question_subscriptions')
        .update({ telegram_status: 'disabled', updated_at: nowIso() })
        .eq('id', pending.id);

      return { status: 'already_linked', questionId: pending.question_id };
    }

    // Re-subscribe after an unsubscribe: the unique index forbids a second
    // row for the same Telegram account, so reactivate the existing one.
    const { error: reactivateError } = await store
      .from('question_subscriptions')
      .update({
        telegram_chat_id: input.telegramChatId,
        telegram_status: 'active',
        telegram_confirmed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', existing.id);

    if (reactivateError) return { status: 'error' };

    await store
      .from('question_subscriptions')
      .update({ telegram_status: 'disabled', updated_at: nowIso() })
      .eq('id', pending.id);

    return { status: 'linked', questionId: pending.question_id };
  }

  const { error: linkError } = await store
    .from('question_subscriptions')
    .update({
      telegram_user_id: input.telegramUserId,
      telegram_chat_id: input.telegramChatId,
      telegram_status: 'active',
      telegram_confirmed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', pending.id);

  if (linkError) {
    // A concurrent link may have won the unique index race.
    const { data: raced } = await store
      .from('question_subscriptions')
      .select('id')
      .eq('question_id', pending.question_id)
      .eq('telegram_user_id', input.telegramUserId)
      .maybeSingle();

    return raced?.id
      ? { status: 'already_linked', questionId: pending.question_id }
      : { status: 'error' };
  }

  // A confirmation may have created an email channel on the same row; keep it.
  return { status: 'linked', questionId: pending.question_id };
}

/** Tokenized unsubscribe. Works for anonymous subscribers and is idempotent. */
export async function unsubscribeQuestionToken(rawToken: string): Promise<
  | { status: 'unsubscribed'; channel: 'email' | 'telegram' | 'all'; questionId: string }
  | { status: 'invalid' | 'used' | 'expired' | 'error' }
> {
  if (!QUESTION_TOKEN_PATTERN.test(rawToken)) return { status: 'invalid' };

  const store = storeClient();
  const { data, error } = await store
    .from('question_subscription_tokens')
    .select('id,subscription_id,purpose,channel,expires_at,used_at')
    .eq('token_hash', hashQuestionToken(rawToken))
    .maybeSingle<TokenRow>();

  if (error) return { status: 'error' };
  if (
    !data ||
    (data.purpose !== 'unsubscribe_email' &&
      data.purpose !== 'unsubscribe_telegram' &&
      data.purpose !== 'unsubscribe_all')
  ) {
    return { status: 'invalid' };
  }
  if (data.used_at) return { status: 'used' };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { status: 'expired' };

  const { data: claimed, error: claimError } = await store
    .from('question_subscription_tokens')
    .update({ used_at: nowIso() })
    .eq('id', data.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) return { status: 'error' };
  if (!claimed) return { status: 'used' };

  const subscription = await findSubscriptionById(store, data.subscription_id);
  if (!subscription) return { status: 'invalid' };

  const update: Record<string, unknown> = { updated_at: nowIso() };

  if (data.purpose === 'unsubscribe_all') {
    update.email_status = 'disabled';
    update.telegram_status = 'disabled';
  } else if (data.purpose === 'unsubscribe_email') {
    update.email_status = 'disabled';
  } else {
    update.telegram_status = 'disabled';
  }

  const { error: updateError } = await store
    .from('question_subscriptions')
    .update(update)
    .eq('id', subscription.id);

  if (updateError) return { status: 'error' };

  return {
    status: 'unsubscribed',
    channel:
      data.purpose === 'unsubscribe_all'
        ? 'all'
        : data.purpose === 'unsubscribe_email'
          ? 'email'
          : 'telegram',
    questionId: subscription.question_id,
  };
}

/**
 * Authenticated channel preference. Only the caller's own subscriptions are
 * touched; the query is scoped by user_id before any update.
 */
export async function disableQuestionChannel(input: {
  questionId: string;
  userId: string;
  channel: 'email' | 'telegram' | 'all';
}): Promise<'disabled' | 'not_found' | 'error'> {
  if (!isQuestionId(input.questionId) || !input.userId) return 'not_found';

  const store = storeClient();

  if (input.channel === 'all') {
    const { data, error } = await store
      .from('question_subscriptions')
      .select('email_status,telegram_status')
      .eq('question_id', input.questionId)
      .eq('user_id', input.userId);

    if (error) return 'error';

    const hasActive = Array.isArray(data)
      ? (data as Array<{ email_status?: unknown; telegram_status?: unknown }>).some(
          (row) => row.email_status === 'active' || row.telegram_status === 'active'
        )
      : false;

    if (!hasActive) return 'not_found';

    const { error: updateError } = await store
      .from('question_subscriptions')
      .update({
        email_status: 'disabled',
        telegram_status: 'disabled',
        updated_at: nowIso(),
      })
      .eq('question_id', input.questionId)
      .eq('user_id', input.userId);

    return updateError ? 'error' : 'disabled';
  }

  const statusColumn = input.channel === 'email' ? 'email_status' : 'telegram_status';

  const { data, error } = await store
    .from('question_subscriptions')
    .update({ [statusColumn]: 'disabled', updated_at: nowIso() })
    .eq('question_id', input.questionId)
    .eq('user_id', input.userId)
    .eq(statusColumn, 'active')
    .select('id');

  if (error) return 'error';
  return Array.isArray(data) && data.length > 0 ? 'disabled' : 'not_found';
}

function aggregateState(statuses: string[]): QuestionChannelState {
  if (statuses.includes('active')) return 'active';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.includes('disabled')) return 'disabled';
  return 'none';
}

/**
 * Returns only channel states. Email addresses and Telegram ids never leave
 * the server.
 */
export async function getQuestionSubscriptionStatusForUser(input: {
  questionId: string;
  userId: string | null;
}): Promise<QuestionSubscriptionStatus> {
  const availability = getQuestionChannelAvailability();
  const base: QuestionSubscriptionStatus = {
    email: { state: 'none', available: availability.email },
    telegram: { state: 'none', available: availability.telegram },
  };

  if (!input.userId || !isQuestionId(input.questionId)) return base;

  const store = storeClient();
  const { data, error } = await store
    .from('question_subscriptions')
    .select('email,email_status,telegram_user_id,telegram_status')
    .eq('question_id', input.questionId)
    .eq('user_id', input.userId);

  if (error || !Array.isArray(data)) return base;

  const emailStatuses: string[] = [];
  const telegramStatuses: string[] = [];

  for (const row of data as Array<{
    email?: unknown;
    email_status?: unknown;
    telegram_user_id?: unknown;
    telegram_status?: unknown;
  }>) {
    // A Telegram-only row keeps email_status at its default 'pending'. It must
    // not make the UI claim that an email confirmation is waiting.
    if (row.email !== null && row.email !== undefined && typeof row.email_status === 'string') {
      emailStatuses.push(row.email_status);
    }

    const hasTelegramIdentity =
      row.telegram_user_id !== null && row.telegram_user_id !== undefined;
    const isTelegramOnlyRow = row.email === null || row.email === undefined;

    if (
      typeof row.telegram_status === 'string' &&
      (hasTelegramIdentity || isTelegramOnlyRow)
    ) {
      telegramStatuses.push(row.telegram_status);
    }
  }

  return {
    email: { state: aggregateState(emailStatuses), available: availability.email },
    telegram: { state: aggregateState(telegramStatuses), available: availability.telegram },
  };
}

type ClaimedNotification = {
  notification_id: string;
  subscription_id: string;
  channel: string;
  question_id: string;
  question_text: string;
  answer_id: string;
  email: string | null;
  telegram_user_id: number | null;
  telegram_chat_id: number | null;
  attempts: number;
};

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function complete(
  store: SupabaseClient,
  notificationId: string,
  status: 'sent' | 'failed' | 'skipped',
  error?: string
): Promise<void> {
  const { error: rpcError } = await store.rpc('question_complete_answer_notification', {
    p_notification_id: notificationId,
    p_status: status,
    p_error: error ?? null,
  });

  if (rpcError) {
    console.error('[Question] Notification completion failed:', rpcError.code || 'unknown');
  }
}

/**
 * Claims and delivers a bounded batch. Each row is independent: one channel
 * failing never prevents another row from being sent. Delivery errors are
 * recorded on the row and retried with backoff by a later tick.
 */
export async function processPendingQuestionNotifications(input?: {
  limit?: number;
}): Promise<{ claimed: number; sent: number; failed: number; skipped: number }> {
  const store = storeClient();
  const { data, error } = await store.rpc('question_claim_answer_notifications', {
    p_limit: Math.min(Math.max(input?.limit ?? 20, 1), 100),
  });

  if (error) {
    console.error('[Question] Notification claim failed:', error.code || 'unknown');
    return { claimed: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const rows: ClaimedNotification[] = Array.isArray(data) ? data : data ? [data] : [];
  const counters = { claimed: rows.length, sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    const questionText =
      typeof row.question_text === 'string' && row.question_text.trim()
        ? row.question_text
        : 'Вопрос Question';
    const questionUrl = questionPageUrl(row.question_id);

    try {
      if (row.channel === 'email') {
        if (!row.email) {
          await complete(store, row.notification_id, 'skipped', 'missing_email');
          counters.skipped += 1;
          continue;
        }

        if (!isQuestionEmailConfigured()) {
          await complete(store, row.notification_id, 'failed', 'email_not_configured');
          counters.failed += 1;
          continue;
        }

        const unsubscribeToken = await createUnsubscribeToken(
          store,
          row.subscription_id,
          'email'
        );
        const unsubscribeAllToken = await createUnsubscribeToken(
          store,
          row.subscription_id,
          'all'
        );

        if (!unsubscribeToken || !unsubscribeAllToken) {
          await complete(store, row.notification_id, 'failed', 'token_failed');
          counters.failed += 1;
          continue;
        }

        const delivery = await sendQuestionAnswerNotificationEmail({
          email: row.email,
          questionText,
          questionUrl,
          unsubscribeUrl: unsubscribeUrlForToken(unsubscribeToken),
          unsubscribeAllUrl: unsubscribeUrlForToken(unsubscribeAllToken),
        });

        if (delivery.status === 'sent') {
          await complete(store, row.notification_id, 'sent');
          counters.sent += 1;
        } else {
          await complete(
            store,
            row.notification_id,
            'failed',
            delivery.status === 'skipped' ? 'email_not_configured' : 'email_send_failed'
          );
          counters.failed += 1;
        }

        continue;
      }

      if (row.channel === 'telegram') {
        if (!row.telegram_user_id) {
          await complete(store, row.notification_id, 'skipped', 'missing_telegram');
          counters.skipped += 1;
          continue;
        }

        if (!isQuestionTelegramConfigured()) {
          await complete(store, row.notification_id, 'failed', 'telegram_not_configured');
          counters.failed += 1;
          continue;
        }

        const unsubscribeToken = await createUnsubscribeToken(
          store,
          row.subscription_id,
          'telegram'
        );
        const unsubscribeAllToken = await createUnsubscribeToken(
          store,
          row.subscription_id,
          'all'
        );

        if (!unsubscribeToken || !unsubscribeAllToken) {
          await complete(store, row.notification_id, 'failed', 'token_failed');
          counters.failed += 1;
          continue;
        }

        const text = [
          '<b>Новый ответ на вопрос</b>',
          '',
          `«${escapeTelegramHtml(questionText)}»`,
          '',
          `Появился новый ответ. Текст ответа остаётся приватным — обновлённый синтез Пьеро доступен на странице вопроса.`,
          '',
          `<a href="${escapeTelegramHtml(questionUrl)}">Открыть вопрос</a>`,
          `<a href="${escapeTelegramHtml(
            unsubscribeUrlForToken(unsubscribeToken)
          )}">Отключить Telegram</a>`,
          `<a href="${escapeTelegramHtml(
            unsubscribeUrlForToken(unsubscribeAllToken)
          )}">Отписаться от всех</a>`,
        ].join('\n');

        const sent = await sendTelegramMessage(
          row.telegram_chat_id ?? row.telegram_user_id,
          text,
          { disableLinkPreview: true, timeoutMs: 8000 }
        );

        if (sent) {
          await complete(store, row.notification_id, 'sent');
          counters.sent += 1;
        } else {
          await complete(store, row.notification_id, 'failed', 'telegram_send_failed');
          counters.failed += 1;
        }

        continue;
      }

      await complete(store, row.notification_id, 'skipped', 'unknown_channel');
      counters.skipped += 1;
    } catch (deliveryError) {
      const code =
        deliveryError instanceof Error && deliveryError.name
          ? deliveryError.name.replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 80)
          : 'delivery_exception';

      await complete(store, row.notification_id, 'failed', code || 'delivery_exception');
      counters.failed += 1;
    }
  }

  return counters;
}
