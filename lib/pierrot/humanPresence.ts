import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/humanPresence');

/**
 * Server-only persistence and state-machine adapter for PIERO HUMAN PRESENCE.
 *
 * The service-role client bypasses RLS. This module must never be imported
 * from a Client Component. All authorization decisions happen here or in the
 * route handlers; the browser only receives a sanitized public state.
 */

import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordPierrotEvent } from '@/lib/pierrot/serverStore';
import {
  HUMAN_REQUEST_TTL_SECONDS,
  type HumanLanguage,
  type HumanPresenceMessage,
  type HumanPresencePublicState,
  type HumanPresenceSessionState,
  type HumanPresenceStateResponse,
  type HumanRequestStatus,
} from '@/lib/pierrot/humanPresenceShared';

export type HumanRequestRow = {
  id: string;
  conversation_id: string;
  status: HumanRequestStatus;
  access_token_hash: string;
  visitor_label: string;
  start_page: string;
  context_summary: string | null;
  language: HumanLanguage;
  resolved_by: 'owner' | 'visitor' | 'system' | null;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  telegram_status_message_id: number | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  closed_at: string | null;
  expired_at: string | null;
};

export type HumanSessionRow = {
  id: string;
  request_id: string;
  conversation_id: string;
  owner_telegram_id: number;
  status: 'active' | 'closed';
  opened_at: string;
  closed_at: string | null;
  closed_by: 'owner' | 'visitor' | 'system' | null;
};

export type HumanPresenceRecord = {
  request: HumanRequestRow;
  session: HumanSessionRow | null;
  conversationSessionId: string | null;
};

export type HumanRequestCreateResult = {
  requestId: string;
  status: HumanRequestStatus;
  created: boolean;
  expiresAt: string;
  visitorLabel: string;
  createdAt: string;
  startPage: string;
  contextSummary: string | null;
  language: HumanLanguage;
};

export type HumanAcceptResult = {
  result:
    | 'accepted'
    | 'already_active'
    | 'owner_busy'
    | 'expired'
    | 'declined'
    | 'closed'
    | 'not_found';
  requestId: string;
  conversationId: string | null;
  sessionId: string | null;
  visitorLabel: string | null;
  startPage: string | null;
  contextSummary: string | null;
  requestCreatedAt: string | null;
  busyConversationId: string | null;
};

export type HumanDeclineResult = {
  result: string;
  requestId: string;
  conversationId: string | null;
  visitorLabel: string | null;
  telegramChatId: number | null;
  telegramMessageId: number | null;
};

export type HumanCloseResult = {
  result: string;
  requestId: string;
  conversationId: string | null;
  sessionId: string | null;
  visitorLabel: string | null;
  telegramChatId: number | null;
  telegramMessageId: number | null;
};

export type HumanMessageAppendResult = {
  sequence: number;
  content: string;
  inserted: boolean;
  conversationId: string;
  sessionId: string;
  alreadyLinked: boolean;
};

export type HumanMessageLinkRow = {
  id: string;
  request_id: string;
  session_id: string;
  conversation_id: string;
  message_id: string;
  direction: 'visitor_to_telegram' | 'telegram_to_visitor';
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  delivery_status: 'pending' | 'sent' | 'received' | 'failed';
};

type RpcRow = Record<string, unknown>;

function firstRow(value: unknown): RpcRow | null {
  if (Array.isArray(value)) {
    return value[0] && typeof value[0] === 'object' ? (value[0] as RpcRow) : null;
  }

  return value && typeof value === 'object' ? (value as RpcRow) : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value !== 0) {
    return value;
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed !== 0 ? parsed : null;
  }

  return null;
}

function asStatus(value: unknown): HumanRequestStatus {
  return value === 'active' ||
    value === 'closed' ||
    value === 'declined' ||
    value === 'expired' ||
    value === 'pending'
    ? value
    : 'pending';
}

/** 256-bit opaque visitor recovery token. */
export function createHumanAccessToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');

  return { token, hash: hashHumanAccessToken(token) };
}

export function hashHumanAccessToken(token: string): string {
  return createHash('sha256').update(`piero-human:${token}`, 'utf8').digest('hex');
}

/**
 * Short, non-reversible label shown in Telegram. It is derived from the
 * opaque conversation id and contains no visitor identity.
 */
export function visitorLabelForConversation(conversationId: string): string {
  const digest = createHash('sha256')
    .update(`human-visitor:${conversationId}`, 'utf8')
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();

  return `#${digest}`;
}

/**
 * Deterministic message id for a Telegram update. Telegram can redeliver the
 * same update; the id and the database unique constraints make the second
 * write a no-op.
 */
export function deriveTelegramHumanMessageId(
  chatId: number | string,
  messageId: number | string,
): string {
  const digest = createHash('sha256')
    .update(`human-tg:${chatId}:${messageId}`, 'utf8')
    .digest('hex')
    .slice(0, 40);

  return `h_${digest}`;
}

/**
 * A compact, human-readable context for Anton. It deliberately uses the last
 * few visitor/Pierrot turns instead of another model call and contains no
 * system identifiers or secrets.
 */
export function buildHumanContextSummary(
  history: Array<{ role: string; content: string }>,
  limit = 240,
): string | null {
  const parts = history
    .filter(
      (item) =>
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0,
    )
    .slice(-3)
    .map((item) => item.content.replace(/\s+/g, ' ').trim().slice(0, 90));

  if (parts.length === 0) return null;

  return parts.join(' / ').slice(0, limit);
}

function requestFromRow(row: Record<string, unknown>): HumanRequestRow {
  return {
    id: asString(row.id),
    conversation_id: asString(row.conversation_id),
    status: asStatus(row.status),
    access_token_hash: asString(row.access_token_hash),
    visitor_label: asString(row.visitor_label, '#0000'),
    start_page: asString(row.start_page, '/'),
    context_summary: asNullableString(row.context_summary),
    language:
      row.language === 'ru' || row.language === 'en' || row.language === 'und'
        ? row.language
        : 'und',
    resolved_by:
      row.resolved_by === 'owner' ||
      row.resolved_by === 'visitor' ||
      row.resolved_by === 'system'
        ? row.resolved_by
        : null,
    telegram_chat_id: asNumber(row.telegram_chat_id),
    telegram_message_id: asNumber(row.telegram_message_id),
    telegram_status_message_id: asNumber(row.telegram_status_message_id),
    created_at: asString(row.created_at),
    updated_at: asString(row.updated_at),
    expires_at: asString(row.expires_at),
    accepted_at: asNullableString(row.accepted_at),
    declined_at: asNullableString(row.declined_at),
    closed_at: asNullableString(row.closed_at),
    expired_at: asNullableString(row.expired_at),
  };
}

function sessionFromRow(row: Record<string, unknown>): HumanSessionRow {
  return {
    id: asString(row.id),
    request_id: asString(row.request_id),
    conversation_id: asString(row.conversation_id),
    owner_telegram_id: asNumber(row.owner_telegram_id) ?? 0,
    status: row.status === 'closed' ? 'closed' : 'active',
    opened_at: asString(row.opened_at),
    closed_at: asNullableString(row.closed_at),
    closed_by:
      row.closed_by === 'owner' ||
      row.closed_by === 'visitor' ||
      row.closed_by === 'system'
        ? row.closed_by
        : null,
  };
}

async function loadConversationSessionId(
  store: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select('session_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;

  return data && typeof data.session_id === 'string' ? data.session_id : null;
}

async function loadSessionForRequest(
  store: SupabaseClient,
  requestId: string,
): Promise<HumanSessionRow | null> {
  const { data, error } = await store
    .from('pierrot_human_sessions')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();

  if (error) throw error;

  return data ? sessionFromRow(data) : null;
}

async function loadRequestById(
  store: SupabaseClient,
  requestId: string,
): Promise<HumanRequestRow | null> {
  const { data, error } = await store
    .from('pierrot_human_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();

  if (error) throw error;

  return data ? requestFromRow(data) : null;
}

async function expireIfDue(
  store: SupabaseClient,
  request: HumanRequestRow,
): Promise<HumanRequestRow> {
  if (request.status !== 'pending') return request;
  if (Date.parse(request.expires_at) > Date.now()) return request;

  const { data, error } = await store.rpc('pierrot_human_request_expire', {
    p_request_id: request.id,
  });

  if (error) throw error;

  const status = asStatus(data);

  if (status === request.status) return request;

  return {
    ...request,
    status,
    expired_at: status === 'expired' ? new Date().toISOString() : request.expired_at,
    resolved_by: status === 'expired' ? 'system' : request.resolved_by,
  };
}

function humanRequestTtlSeconds(): number {
  const configured = Number(process.env.PIERROT_HUMAN_REQUEST_TTL_MINUTES);

  if (!Number.isFinite(configured) || configured <= 0) {
    return HUMAN_REQUEST_TTL_SECONDS;
  }

  return Math.min(Math.max(Math.round(configured * 60), 60), 3600);
}

export async function createHumanRequest(
  store: SupabaseClient,
  input: {
    conversationId: string;
    sessionId: string;
    accessTokenHash: string;
    visitorLabel: string;
    startPage: string;
    contextSummary: string | null;
    language: HumanLanguage;
  },
): Promise<HumanRequestCreateResult> {
  const { data, error } = await store.rpc('pierrot_human_request_create', {
    p_conversation_id: input.conversationId,
    p_session_id: input.sessionId,
    p_access_token_hash: input.accessTokenHash,
    p_visitor_label: input.visitorLabel,
    p_start_page: input.startPage,
    p_context_summary: input.contextSummary,
    p_language: input.language,
    p_ttl_seconds: humanRequestTtlSeconds(),
  });

  if (error) throw error;

  const row = firstRow(data);

  if (!row) throw new Error('pierrot_human_request_create returned no row');

  return {
    requestId: asString(row.request_id),
    status: asStatus(row.status),
    created: row.created === true,
    expiresAt: asString(row.expires_at),
    visitorLabel: asString(row.visitor_label, input.visitorLabel),
    createdAt: asString(row.created_at),
    startPage: asString(row.start_page, input.startPage),
    contextSummary: asNullableString(row.context_summary),
    language:
      row.language === 'ru' || row.language === 'en' || row.language === 'und'
        ? row.language
        : input.language,
  };
}

export async function getHumanPresenceByToken(
  store: SupabaseClient,
  token: string,
): Promise<HumanPresenceRecord | null> {
  const hash = hashHumanAccessToken(token);

  const { data, error } = await store
    .from('pierrot_human_requests')
    .select('*')
    .eq('access_token_hash', hash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const request = await expireIfDue(store, requestFromRow(data));
  const [session, conversationSessionId] = await Promise.all([
    loadSessionForRequest(store, request.id),
    loadConversationSessionId(store, request.conversation_id),
  ]);

  return { request, session, conversationSessionId };
}

/**
 * Existing-tab authorization: both random identifiers must match the same
 * conversation row. Knowing a conversation id alone is never sufficient.
 */
export async function getHumanPresenceForConversation(
  store: SupabaseClient,
  conversationId: string,
  sessionId: string,
): Promise<HumanPresenceRecord | null> {
  const { data: conversation, error: conversationError } = await store
    .from('pierrot_conversations')
    .select('id, session_id')
    .eq('id', conversationId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (conversationError) throw conversationError;
  if (!conversation) return null;

  const { data, error } = await store
    .from('pierrot_human_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const request = await expireIfDue(store, requestFromRow(data));
  const session = await loadSessionForRequest(store, request.id);

  return {
    request,
    session,
    conversationSessionId: typeof conversation.session_id === 'string' ? conversation.session_id : null,
  };
}

export async function expireHumanRequest(
  store: SupabaseClient,
  requestId: string,
): Promise<HumanRequestStatus> {
  const { data, error } = await store.rpc('pierrot_human_request_expire', {
    p_request_id: requestId,
  });

  if (error) throw error;

  return asStatus(data);
}

export async function getHumanPresenceByRequestId(
  store: SupabaseClient,
  requestId: string,
): Promise<HumanPresenceRecord | null> {
  const request = await loadRequestById(store, requestId);

  if (!request) return null;

  const refreshed = await expireIfDue(store, request);
  const [session, conversationSessionId] = await Promise.all([
    loadSessionForRequest(store, refreshed.id),
    loadConversationSessionId(store, refreshed.conversation_id),
  ]);

  return { request: refreshed, session, conversationSessionId };
}

export async function acceptHumanRequest(
  store: SupabaseClient,
  requestId: string,
  ownerTelegramId: number,
): Promise<HumanAcceptResult> {
  const { data, error } = await store.rpc('pierrot_human_request_accept', {
    p_request_id: requestId,
    p_owner_telegram_id: ownerTelegramId,
  });

  if (error) throw error;

  const row = firstRow(data);

  if (!row) throw new Error('pierrot_human_request_accept returned no row');

  const result = asString(row.result, 'not_found') as HumanAcceptResult['result'];

  return {
    result:
      result === 'accepted' ||
      result === 'already_active' ||
      result === 'owner_busy' ||
      result === 'expired' ||
      result === 'declined' ||
      result === 'closed'
        ? result
        : 'not_found',
    requestId: asString(row.request_id, requestId),
    conversationId: asNullableString(row.conversation_id),
    sessionId: asNullableString(row.session_id),
    visitorLabel: asNullableString(row.visitor_label),
    startPage: asNullableString(row.start_page),
    contextSummary: asNullableString(row.context_summary),
    requestCreatedAt: asNullableString(row.request_created_at),
    busyConversationId: asNullableString(row.busy_conversation_id),
  };
}

export async function declineHumanRequest(
  store: SupabaseClient,
  requestId: string,
  resolvedBy: 'owner' | 'visitor' | 'system' = 'owner',
): Promise<HumanDeclineResult> {
  const { data, error } = await store.rpc('pierrot_human_request_decline', {
    p_request_id: requestId,
    p_resolved_by: resolvedBy,
  });

  if (error) throw error;

  const row = firstRow(data);

  if (!row) throw new Error('pierrot_human_request_decline returned no row');

  return {
    result: asString(row.result, 'not_found'),
    requestId: asString(row.request_id, requestId),
    conversationId: asNullableString(row.conversation_id),
    visitorLabel: asNullableString(row.visitor_label),
    telegramChatId: asNumber(row.telegram_chat_id),
    telegramMessageId: asNumber(row.telegram_message_id),
  };
}

export async function closeHumanSession(
  store: SupabaseClient,
  requestId: string,
  closedBy: 'owner' | 'visitor' | 'system',
  ownerTelegramId: number | null = null,
): Promise<HumanCloseResult> {
  const { data, error } = await store.rpc('pierrot_human_session_close', {
    p_request_id: requestId,
    p_closed_by: closedBy,
    p_owner_telegram_id: ownerTelegramId,
  });

  if (error) throw error;

  const row = firstRow(data);

  if (!row) throw new Error('pierrot_human_session_close returned no row');

  return {
    result: asString(row.result, 'not_found'),
    requestId: asString(row.request_id, requestId),
    conversationId: asNullableString(row.conversation_id),
    sessionId: asNullableString(row.session_id),
    visitorLabel: asNullableString(row.visitor_label),
    telegramChatId: asNumber(row.telegram_chat_id),
    telegramMessageId: asNumber(row.telegram_message_id),
  };
}

export async function appendHumanMessage(
  store: SupabaseClient,
  input: {
    requestId: string;
    messageId: string;
    role: 'user' | 'human';
    content: string;
    direction: 'visitor_to_telegram' | 'telegram_to_visitor';
    telegramChatId?: number | null;
    telegramMessageId?: number | null;
  },
): Promise<HumanMessageAppendResult> {
  const { data, error } = await store.rpc('pierrot_human_append_message', {
    p_request_id: input.requestId,
    p_message_id: input.messageId,
    p_role: input.role,
    p_content: input.content,
    p_direction: input.direction,
    p_telegram_chat_id: input.telegramChatId ?? null,
    p_telegram_message_id: input.telegramMessageId ?? null,
  });

  if (error) throw error;

  const row = firstRow(data);

  if (!row) throw new Error('pierrot_human_append_message returned no row');

  return {
    sequence: Number(row.sequence),
    content: asString(row.content, input.content),
    inserted: row.inserted === true,
    conversationId: asString(row.conversation_id),
    sessionId: asString(row.session_id),
    alreadyLinked: row.already_linked === true,
  };
}

export async function loadHumanMessages(
  store: SupabaseClient,
  conversationId: string,
  sinceIso: string,
  limit = 100,
): Promise<HumanPresenceMessage[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const since = new Date(new Date(sinceIso).getTime() - 15_000).toISOString();

  const { data, error } = await store
    .from('pierrot_messages')
    .select('id, role, content, message_index, created_at')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'human'])
    .gte('created_at', since)
    .order('message_index', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;

  const rows = Array.isArray(data) ? [...data].reverse() : [];

  return rows
    .filter(
      (row): row is {
        id: string;
        role: 'user' | 'human';
        content: string;
        message_index: number | string;
        created_at: string | null;
      } =>
        Boolean(row) &&
        typeof row.id === 'string' &&
        (row.role === 'user' || row.role === 'human') &&
        typeof row.content === 'string' &&
        (typeof row.message_index === 'number' ||
          (typeof row.message_index === 'string' &&
            /^\d+$/.test(row.message_index))),
    )
    .map((row) => ({
      id: row.id as string,
      role: row.role === 'human' ? 'human' : 'user',
      content: row.content as string,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
      sequence: Number(row.message_index),
    }));
}

export async function getActiveHumanSessionForOwner(
  store: SupabaseClient,
  ownerTelegramId: number,
): Promise<HumanPresenceRecord | null> {
  const { data, error } = await store
    .from('pierrot_human_sessions')
    .select('*')
    .eq('owner_telegram_id', ownerTelegramId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const session = sessionFromRow(data);
  const request = await loadRequestById(store, session.request_id);

  if (!request || request.status !== 'active') return null;

  return {
    request,
    session,
    conversationSessionId: await loadConversationSessionId(store, request.conversation_id),
  };
}

/**
 * Resolve a Telegram reply_to_message to the conversation it belongs to. Both
 * the original request notification and every relayed visitor message are
 * accepted as anchors.
 */
export async function getHumanPresenceByTelegramMessage(
  store: SupabaseClient,
  ownerTelegramId: number,
  telegramMessageId: number,
): Promise<HumanPresenceRecord | null> {
  const { data: directRequest, error: directError } = await store
    .from('pierrot_human_requests')
    .select('*')
    .eq('telegram_chat_id', ownerTelegramId)
    .eq('telegram_message_id', telegramMessageId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (directError) throw directError;

  let request = directRequest ? requestFromRow(directRequest) : null;

  if (!request) {
    const { data: link, error: linkError } = await store
      .from('pierrot_human_message_links')
      .select('request_id')
      .eq('telegram_chat_id', ownerTelegramId)
      .eq('telegram_message_id', telegramMessageId)
      .maybeSingle();

    if (linkError) throw linkError;

    if (link && typeof link.request_id === 'string') {
      request = await loadRequestById(store, link.request_id);
    }
  }

  if (!request) return null;

  const session = await loadSessionForRequest(store, request.id);

  return {
    request,
    session,
    conversationSessionId: await loadConversationSessionId(store, request.conversation_id),
  };
}

export async function setHumanRequestTelegramMessage(
  store: SupabaseClient,
  requestId: string,
  input: { chatId: number; messageId: number },
): Promise<void> {
  const { error } = await store
    .from('pierrot_human_requests')
    .update({
      telegram_chat_id: input.chatId,
      telegram_message_id: input.messageId,
      telegram_status_message_id: input.messageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
}

export async function updateHumanMessageLink(
  store: SupabaseClient,
  messageId: string,
  input: {
    telegramChatId?: number | null;
    telegramMessageId?: number | null;
    status: 'pending' | 'sent' | 'received' | 'failed';
  },
): Promise<void> {
  const { error } = await store
    .from('pierrot_human_message_links')
    .update({
      ...(input.telegramChatId !== undefined
        ? { telegram_chat_id: input.telegramChatId }
        : {}),
      ...(input.telegramMessageId !== undefined
        ? { telegram_message_id: input.telegramMessageId }
        : {}),
      delivery_status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('message_id', messageId);

  if (error) throw error;
}

/**
 * Attaches delivery metadata to a message that was already persisted by the
 * normal AI route before Anton accepted (the accept/AI race). Returns true
 * when this call created the link and the caller should relay the message.
 */
export async function ensureHumanMessageLink(
  store: SupabaseClient,
  input: {
    requestId: string;
    sessionId: string;
    conversationId: string;
    messageId: string;
    direction: 'visitor_to_telegram' | 'telegram_to_visitor';
  },
): Promise<boolean> {
  const { error } = await store.from('pierrot_human_message_links').insert({
    request_id: input.requestId,
    session_id: input.sessionId,
    conversation_id: input.conversationId,
    message_id: input.messageId,
    direction: input.direction,
    delivery_status: 'pending',
  });

  if (!error) return true;

  if (error.code === '23505') return false;

  throw error;
}

export async function getHumanMessageLink(
  store: SupabaseClient,
  messageId: string,
): Promise<HumanMessageLinkRow | null> {
  const { data, error } = await store
    .from('pierrot_human_message_links')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: asString(data.id),
    request_id: asString(data.request_id),
    session_id: asString(data.session_id),
    conversation_id: asString(data.conversation_id),
    message_id: asString(data.message_id),
    direction:
      data.direction === 'telegram_to_visitor'
        ? 'telegram_to_visitor'
        : 'visitor_to_telegram',
    telegram_chat_id: asNumber(data.telegram_chat_id),
    telegram_message_id: asNumber(data.telegram_message_id),
    delivery_status:
      data.delivery_status === 'sent' ||
      data.delivery_status === 'received' ||
      data.delivery_status === 'failed'
        ? data.delivery_status
        : 'pending',
  };
}

/**
 * Record an audit event on the existing pierrot_events table. The function
 * reads the conversation session id itself so callers never need to trust a
 * browser-supplied value.
 */
export async function recordHumanEvent(
  store: SupabaseClient,
  input: {
    conversationId: string;
    eventName:
      | 'human_requested'
      | 'human_request_duplicate'
      | 'human_accepted'
      | 'human_declined'
      | 'human_expired'
      | 'human_closed'
      | 'human_message_sent'
      | 'human_message_received'
      | 'human_notification_failed'
      | 'human_ai_blocked';
    eventKey: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const sessionId = await loadConversationSessionId(store, input.conversationId);

  if (!sessionId) return;

  await recordPierrotEvent(store, {
    conversationId: input.conversationId,
    sessionId,
    eventName: input.eventName,
    eventKey: input.eventKey,
    payload: input.payload ?? {},
  });
}

export function publicHumanState(
  request: HumanRequestRow,
): HumanPresencePublicState {
  return {
    requestId: request.id,
    status: request.status,
    visitorLabel: request.visitor_label,
    startPage: request.start_page,
    language: request.language,
    createdAt: request.created_at || null,
    expiresAt: request.expires_at || null,
    acceptedAt: request.accepted_at,
    closedAt: request.closed_at,
    resolvedBy: request.resolved_by,
  };
}

export function publicHumanSession(
  session: HumanSessionRow | null,
): HumanPresenceSessionState | null {
  if (!session) return null;

  return {
    id: session.id,
    status: session.status,
    openedAt: session.opened_at || null,
    closedAt: session.closed_at,
  };
}

export async function buildHumanStateResponse(
  store: SupabaseClient,
  record: HumanPresenceRecord,
): Promise<HumanPresenceStateResponse> {
  let messages: HumanPresenceMessage[] = [];

  try {
    messages = await loadHumanMessages(store, record.request.conversation_id, record.request.created_at);
  } catch {
    // State must remain available even if the transcript query fails.
  }

  return {
    request: publicHumanState(record.request),
    session: publicHumanSession(record.session),
    conversationId: record.request.conversation_id,
    sessionId: record.conversationSessionId,
    messages,
    serverTime: new Date().toISOString(),
  };
}
