import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Short-lived Telegram Flow composer state.
 *
 * The state is bound to both the Telegram user and chat, expires after 30
 * minutes, and never stores message content. It is persisted in Supabase so
 * it survives separate serverless invocations.
 */

export type TelegramFlowMode = 'note' | 'link' | 'article' | 'media';

export const TELEGRAM_FLOW_MODES: Array<{
  mode: TelegramFlowMode;
  label: string;
  description: string;
}> = [
  { mode: 'note', label: 'Note', description: 'A short thought.' },
  { mode: 'link', label: 'Link', description: 'A link with commentary.' },
  { mode: 'article', label: 'Article', description: 'A longer text.' },
  { mode: 'media', label: 'Media', description: 'A photo with a caption.' },
];

export const TELEGRAM_FLOW_STATE_TTL_MS = 30 * 60 * 1000;

export function isTelegramFlowMode(value: unknown): value is TelegramFlowMode {
  return value === 'note' || value === 'link' || value === 'article' || value === 'media';
}

export function telegramFlowModeLabel(mode: TelegramFlowMode): string {
  return TELEGRAM_FLOW_MODES.find((entry) => entry.mode === mode)?.label ?? mode;
}

export async function setTelegramFlowMode(
  store: SupabaseClient,
  input: {
    userId: number;
    chatId: number;
    mode: TelegramFlowMode;
    now?: number;
  }
): Promise<void> {
  const now = input.now ?? Date.now();
  const { error } = await store.from('telegram_flow_sessions').upsert(
    {
      telegram_user_id: input.userId,
      telegram_chat_id: input.chatId,
      mode: input.mode,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
      expires_at: new Date(now + TELEGRAM_FLOW_STATE_TTL_MS).toISOString(),
    },
    { onConflict: 'telegram_user_id,telegram_chat_id' }
  );

  if (error) throw new Error('Could not start the Flow publishing mode.');
}

export async function getTelegramFlowMode(
  store: SupabaseClient,
  input: {
    userId: number;
    chatId: number;
    now?: number;
  }
): Promise<TelegramFlowMode | null> {
  const now = input.now ?? Date.now();
  const { data, error } = await store
    .from('telegram_flow_sessions')
    .select('mode,expires_at')
    .eq('telegram_user_id', input.userId)
    .eq('telegram_chat_id', input.chatId)
    .maybeSingle();

  if (error) throw new Error('Could not read the Flow publishing mode.');
  if (!data) return null;

  const expiresAt = Date.parse(String(data.expires_at));

  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    await clearTelegramFlowMode(store, input).catch(() => undefined);
    return null;
  }

  return isTelegramFlowMode(data.mode) ? data.mode : null;
}

export async function clearTelegramFlowMode(
  store: SupabaseClient,
  input: { userId: number; chatId: number }
): Promise<void> {
  const { error } = await store
    .from('telegram_flow_sessions')
    .delete()
    .eq('telegram_user_id', input.userId)
    .eq('telegram_chat_id', input.chatId);

  if (error) throw new Error('Could not clear the Flow publishing mode.');
}
