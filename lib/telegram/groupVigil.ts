/**
 * Shared Vigil group bindings.
 *
 * Security model:
 * - the server verifies raw, signed initData;
 * - group context is read from that signed payload (chat_type/chat_instance/
 *   chat), never from a client body field;
 * - persistence is service-role only and is completely separate from the
 *   individual `vigil_hearts` supporter total.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  verifyTelegramInitData,
  type TelegramInitDataResult,
  type TelegramSignedChatContext,
} from './initData';

export const GROUP_VIGIL_TABLE = 'telegram_group_vigil_participants';
export const GROUP_VIGIL_SESSIONS_TABLE = 'telegram_group_vigil_sessions';

export type GroupVigilContext =
  | {
      ok: true;
      telegramUserId: string;
      chat: TelegramSignedChatContext;
    }
  | {
      ok: false;
      reason:
        | 'invalid_initdata'
        | 'missing_bot_token'
        | 'group_context_unavailable';
    };

/**
 * `initData` is the raw WebApp payload. `clientChatInstance` is deliberately
 * not an argument: accepting it would imply that an unverified value can bind
 * a group.
 */
export function verifyGroupVigilContext(input: {
  initData: string;
  botToken: string;
  nowSeconds?: number;
}): GroupVigilContext {
  if (!input.botToken) return { ok: false, reason: 'missing_bot_token' };

  const verified: TelegramInitDataResult = verifyTelegramInitData(
    input.initData,
    input.botToken,
    { nowSeconds: input.nowSeconds }
  );

  if (!verified.ok) return { ok: false, reason: 'invalid_initdata' };

  if (!verified.chat || !verified.chat.id || !verified.chat.instance) {
    return { ok: false, reason: 'group_context_unavailable' };
  }

  return {
    ok: true,
    telegramUserId: verified.user.id,
    chat: verified.chat,
  };
}

export type GroupVigilResult =
  | { ok: true; joined: boolean; participants: number }
  | { ok: false; error: 'unavailable' | 'invalid' | 'store_error' };

async function countParticipants(
  store: SupabaseClient,
  chat: TelegramSignedChatContext
): Promise<number> {
  const { count, error } = await store
    .from(GROUP_VIGIL_TABLE)
    .select('telegram_user_id', { count: 'exact', head: true })
    .eq('group_chat_id', chat.id)
    .eq('chat_instance', chat.instance);

  if (error) throw error;

  return typeof count === 'number' && count >= 0 ? count : 0;
}

export async function joinGroupVigil(
  store: SupabaseClient,
  context: Extract<GroupVigilContext, { ok: true }>
): Promise<GroupVigilResult> {
  try {
    const now = new Date().toISOString();

    const { error: sessionError } = await store.from(GROUP_VIGIL_SESSIONS_TABLE).upsert(
      {
        group_chat_id: context.chat.id,
        chat_instance: context.chat.instance,
        chat_type: context.chat.type,
        updated_at: now,
      },
      { onConflict: 'group_chat_id,chat_instance' }
    );

    if (sessionError) throw sessionError;

    // Idempotent: a repeated join updates the timestamp for the same
    // (group, user) pair instead of creating a second participation row.
    const { error } = await store.from(GROUP_VIGIL_TABLE).upsert(
      {
        group_chat_id: context.chat.id,
        chat_instance: context.chat.instance,
        telegram_user_id: context.telegramUserId,
        joined_at: now,
      },
      { onConflict: 'group_chat_id,chat_instance,telegram_user_id' }
    );

    if (error) throw error;

    return { ok: true, joined: true, participants: await countParticipants(store, context.chat) };
  } catch {
    return { ok: false, error: 'store_error' };
  }
}

export async function leaveGroupVigil(
  store: SupabaseClient,
  context: Extract<GroupVigilContext, { ok: true }>
): Promise<GroupVigilResult> {
  try {
    const { error } = await store
      .from(GROUP_VIGIL_TABLE)
      .delete()
      .eq('group_chat_id', context.chat.id)
      .eq('chat_instance', context.chat.instance)
      .eq('telegram_user_id', context.telegramUserId);

    if (error) throw error;

    return { ok: true, joined: false, participants: await countParticipants(store, context.chat) };
  } catch {
    return { ok: false, error: 'store_error' };
  }
}

/** Read-only aggregate. No participant identity leaves the server. */
export async function readGroupVigil(
  store: SupabaseClient,
  context: Extract<GroupVigilContext, { ok: true }>
): Promise<GroupVigilResult> {
  try {
    const { data, error } = await store
      .from(GROUP_VIGIL_TABLE)
      .select('telegram_user_id')
      .eq('group_chat_id', context.chat.id)
      .eq('chat_instance', context.chat.instance)
      .eq('telegram_user_id', context.telegramUserId)
      .maybeSingle();

    if (error) throw error;

    return {
      ok: true,
      joined: Boolean(data),
      participants: await countParticipants(store, context.chat),
    };
  } catch {
    return { ok: false, error: 'store_error' };
  }
}
