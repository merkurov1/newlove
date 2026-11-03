import type { SupabaseClient } from '@supabase/supabase-js';

import { sendTelegramMessage } from '@/lib/telegram';

export type TelegramNotificationCategory =
  'human_requests' | 'flow' | 'art_engine' | 'pierrot' | 'system';

export const TELEGRAM_NOTIFICATION_CATEGORIES: Array<{
  category: TelegramNotificationCategory;
  label: string;
}> = [
  { category: 'human_requests', label: 'Human requests' },
  { category: 'flow', label: 'Flow & crossposting' },
  { category: 'art_engine', label: 'Art Engine' },
  { category: 'pierrot', label: 'Pierrot dialogue' },
  { category: 'system', label: 'System' },
];

export function getNotificationOwnerId(): number | null {
  const candidates = [
    process.env.PIERROT_OWNER_TELEGRAM_ID,
    process.env.MY_TELEGRAM_ID,
    ...(process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(','),
  ];

  for (const candidate of candidates) {
    const value = Number((candidate || '').trim());
    if (Number.isSafeInteger(value) && value > 0) return value;
  }

  return null;
}

export function isNotificationOwner(userId: number): boolean {
  return getNotificationOwnerId() === userId;
}

export async function getNotificationPreferences(
  store: SupabaseClient,
  userId: number
): Promise<Record<TelegramNotificationCategory, boolean>> {
  const owner = isNotificationOwner(userId);
  const defaults = Object.fromEntries(
    TELEGRAM_NOTIFICATION_CATEGORIES.map(({ category }) => [category, owner])
  ) as Record<TelegramNotificationCategory, boolean>;
  const { data, error } = await store
    .from('telegram_notification_preferences')
    .select('category,enabled')
    .eq('telegram_user_id', userId);

  if (error) return defaults;

  for (const row of data ?? []) {
    if (TELEGRAM_NOTIFICATION_CATEGORIES.some((entry) => entry.category === row.category)) {
      defaults[row.category as TelegramNotificationCategory] = row.enabled === true;
    }
  }

  return defaults;
}

export async function setNotificationPreference(
  store: SupabaseClient,
  input: {
    userId: number;
    category: TelegramNotificationCategory;
    enabled: boolean;
  }
): Promise<void> {
  const { error } = await store.from('telegram_notification_preferences').upsert(
    {
      telegram_user_id: input.userId,
      category: input.category,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'telegram_user_id,category' }
  );

  if (error) throw new Error('Could not update notification preferences.');
}

export async function isTelegramNotificationEnabled(
  store: SupabaseClient,
  userId: number,
  category: TelegramNotificationCategory
): Promise<boolean> {
  const preferences = await getNotificationPreferences(store, userId);
  return preferences[category] === true;
}

/**
 * Send one deduplicated notification. A unique (user, event_key) claim makes a
 * repeated webhook/event a no-op. There is no retry loop: a failed delivery is
 * recorded and the caller decides whether to emit a new event later.
 */
export async function sendTelegramNotification(
  store: SupabaseClient,
  input: {
    userId: number;
    category: TelegramNotificationCategory;
    eventKey: string;
    text: string;
    replyMarkup?: unknown;
  }
): Promise<boolean> {
  if (!isNotificationOwner(input.userId)) return false;
  if (!(await isTelegramNotificationEnabled(store, input.userId, input.category))) {
    return false;
  }

  const { error: claimError } = await store.from('telegram_notification_deliveries').insert({
    telegram_user_id: input.userId,
    category: input.category,
    event_key: input.eventKey.slice(0, 200),
  });

  if (claimError) return false;

  const sent = await sendTelegramMessage(input.userId, input.text, {
    replyMarkup: input.replyMarkup,
    disableLinkPreview: true,
    timeoutMs: 8000,
  });

  if (!sent) {
    await store
      .from('telegram_notification_deliveries')
      .update({ delivered: false, error: 'delivery_failed' })
      .eq('telegram_user_id', input.userId)
      .eq('event_key', input.eventKey.slice(0, 200))
      .then(
        () => undefined,
        () => undefined
      );

    return false;
  }

  await store
    .from('telegram_notification_deliveries')
    .update({
      delivered: true,
      delivered_at: new Date().toISOString(),
      error: null,
    })
    .eq('telegram_user_id', input.userId)
    .eq('event_key', input.eventKey.slice(0, 200))
    .then(
      () => undefined,
      () => undefined
    );

  return true;
}
