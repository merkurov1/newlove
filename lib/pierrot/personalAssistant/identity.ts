/**
 * Server-side identity contract for the isolated personal assistant profile.
 *
 * The Telegram sender id is a routing key only. It is never an authentication
 * factor: the webhook secret must be verified separately before an update is
 * allowed to reach this profile.
 *
 * This module is deliberately pure so it can be unit tested without importing
 * Next.js or a database client.
 */

export const PERSONAL_ASSISTANT_TELEGRAM_USER_ID = 291983727;
export const PERSONAL_ASSISTANT_DISPLAY_NAME = 'Светлана Георгиевна';
export const PERSONAL_ASSISTANT_GREETING = 'Здравствуйте, Светлана Георгиевна! Чем могу помочь?';

export type TelegramChatType = 'private' | 'group' | 'supergroup' | 'channel' | string;

export type PersonalAssistantContext = {
  fromId?: number | string | null;
  chatId?: number | string | null;
  chatType?: TelegramChatType | null;
};

export type PersonalAssistantUpdateInspection =
  | { kind: 'profile'; senderId: number }
  | { kind: 'forbidden'; senderId: number; chatType: string | null }
  | { kind: 'unrelated' };

export function isPersonalAssistantSenderId(value: unknown): boolean {
  return (
    value === PERSONAL_ASSISTANT_TELEGRAM_USER_ID ||
    value === String(PERSONAL_ASSISTANT_TELEGRAM_USER_ID)
  );
}

/**
 * Only the allowlisted Telegram user in a private chat resolves to the
 * personal assistant profile. Any group, supergroup or channel context is
 * rejected even when the sender id matches.
 */
export function isPersonalAssistantContext(input: PersonalAssistantContext): boolean {
  if (input.chatType !== 'private' || !isPersonalAssistantSenderId(input.fromId)) return false;

  if (input.chatId !== undefined && input.chatId !== null) {
    return String(input.chatId) === String(input.fromId);
  }

  return true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

/**
 * Reads the sender and chat type directly from a Telegram update. It never
 * reads `is_owner`, `user_id`, `profile_id`, `identity_type` or any other
 * claim that a caller could put in a request body or message text.
 */
export function inspectPersonalAssistantUpdate(update: unknown): PersonalAssistantUpdateInspection {
  const record = asRecord(update);
  if (!record) return { kind: 'unrelated' };

  const callback = asRecord(record.callback_query);
  const callbackMessage = asRecord(callback?.message);

  const message =
    asRecord(record.message) ||
    asRecord(record.edited_message) ||
    asRecord(record.channel_post) ||
    asRecord(record.edited_channel_post) ||
    callbackMessage;

  const from = asRecord(callback?.from) || asRecord(message?.from);
  const senderId = numberFrom(from?.id);

  if (!isPersonalAssistantSenderId(senderId)) return { kind: 'unrelated' };

  const chat = asRecord(message?.chat);
  const chatType = typeof chat?.type === 'string' ? chat.type : null;
  const chatId = numberFrom(chat?.id);

  // A Telegram private chat id equals the user id. Requiring both prevents a
  // forged private-chat update from routing another chat to this profile.
  if (chatType === 'private' && chatId !== null && chatId === senderId) {
    return { kind: 'profile', senderId: senderId as number };
  }

  return { kind: 'forbidden', senderId: senderId as number, chatType };
}
