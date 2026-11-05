import { randomUUID } from 'crypto';
import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDevRequestTraces } from './requests';
import type { DevDiagnosis, DevTokenUsage, DevToolEvent, DevToolTraceEntry } from './types';

assertServerOnly('lib/pierrot/dev/store');

export const DEV_MODE = 'dev' as const;
export const SITE_MODE = 'site' as const;
const DEV_PAGE = '/admin/pierrot/dev';
const MAX_STORED_MESSAGE = 16_000;

export type DevChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  createdAt?: string | null;
  toolTrace?: DevToolTraceEntry[];
  events?: DevToolEvent[];
  requestStatus?: string | null;
  usage?: DevTokenUsage | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  diagnosis?: DevDiagnosis | null;
};

export type DevConversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages: DevChatMessage[];
};

export type DevConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

function isMissingModeColumn(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';

  return /PGRST204|42703/.test(value) || /column .*mode.* does not exist/i.test(value);
}

function titleFromContent(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 92 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}

async function loadConversationTitles(
  store: SupabaseClient,
  ids: string[]
): Promise<Map<string, { title: string; count: number }>> {
  const result = new Map<string, { title: string; count: number }>();
  if (ids.length === 0) return result;

  const { data, error } = await store
    .from('pierrot_messages')
    .select('conversation_id,role,content,message_index')
    .in('conversation_id', ids)
    .eq('mode', DEV_MODE)
    .order('message_index', { ascending: true })
    .limit(4000);

  if (error) return result;

  for (const row of Array.isArray(data) ? data : []) {
    const id = typeof row.conversation_id === 'string' ? row.conversation_id : '';
    if (!id) continue;

    const current = result.get(id) || { title: 'Dev-тред', count: 0 };
    current.count += 1;
    if (row.role === 'user' && current.title === 'Dev-тред' && typeof row.content === 'string') {
      current.title = titleFromContent(row.content);
    }
    result.set(id, current);
  }

  return result;
}

export async function loadDevConversations(
  ownerUserId: string,
  limit = 40
): Promise<{ conversations: DevConversationListItem[]; migrationRequired: boolean }> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await store
      .from('pierrot_conversations')
      .select(
        'id,session_id,started_at,updated_at,last_message_at,consent_state,identity_type,user_id,mode'
      )
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .eq('mode', DEV_MODE)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        conversations: [],
        migrationRequired: isMissingModeColumn(error),
      };
    }

    const ids = (Array.isArray(data) ? data : [])
      .map((row) => (typeof row.id === 'string' ? row.id : ''))
      .filter(Boolean);
    const titles = await loadConversationTitles(store, ids);

    return {
      conversations: (Array.isArray(data) ? data : [])
        .filter(
          (row) =>
            typeof row.id === 'string' &&
            typeof row.started_at === 'string' &&
            (titles.get(row.id)?.count || 0) > 0
        )
        .map((row) => ({
          id: row.id as string,
          title: titles.get(row.id as string)?.title || 'Dev-тред',
          updatedAt:
            typeof row.last_message_at === 'string'
              ? row.last_message_at
              : typeof row.updated_at === 'string'
                ? row.updated_at
                : (row.started_at as string),
          messageCount: titles.get(row.id as string)?.count || 0,
        })),
      migrationRequired: false,
    };
  } catch {
    return { conversations: [], migrationRequired: false };
  }
}

export async function loadDevConversation(
  ownerUserId: string,
  conversationId: string
): Promise<DevConversation | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) return null;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data: conversation, error } = await store
      .from('pierrot_conversations')
      .select('id,started_at,updated_at,last_message_at,mode,identity_type,user_id')
      .eq('id', conversationId)
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .eq('mode', DEV_MODE)
      .maybeSingle();

    if (error || !conversation) return null;

    const { data: rows, error: messagesError } = await store
      .from('pierrot_messages')
      .select('id,role,content,message_index,provider,created_at')
      .eq('conversation_id', conversationId)
      .eq('mode', DEV_MODE)
      .order('message_index', { ascending: true })
      .limit(200);

    if (messagesError) return null;

    const traces = await loadDevRequestTraces(conversationId);
    const messages = (Array.isArray(rows) ? rows : [])
      .filter(
        (row) =>
          (row.role === 'user' || row.role === 'assistant') &&
          typeof row.id === 'string' &&
          typeof row.content === 'string'
      )
      .map((row) => {
        const trace = traces.get(row.id as string);
        return {
          id: row.id as string,
          role: row.role as 'user' | 'assistant',
          content: row.content as string,
          provider: typeof row.provider === 'string' ? row.provider : null,
          createdAt: typeof row.created_at === 'string' ? row.created_at : null,
          ...(trace
            ? {
                toolTrace: trace.toolTrace,
                events: trace.events,
                requestStatus: trace.status,
                usage: trace.usage,
                latencyMs: trace.latencyMs,
                errorCode: trace.errorCode,
                diagnosis: trace.diagnosis,
              }
            : {}),
        };
      });

    const firstUser = messages.find((message) => message.role === 'user');

    return {
      id: conversation.id as string,
      title: firstUser ? titleFromContent(firstUser.content) : 'Dev-тред',
      updatedAt:
        typeof conversation.last_message_at === 'string'
          ? conversation.last_message_at
          : typeof conversation.updated_at === 'string'
            ? conversation.updated_at
            : (conversation.started_at as string),
      messages,
    };
  } catch {
    return null;
  }
}

export async function ensureDevConversation({
  ownerUserId,
  conversationId,
}: {
  ownerUserId: string;
  conversationId?: string | null;
}): Promise<{ id: string; sessionId: string; created: boolean }> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const id = conversationId || randomUUID();

  if (conversationId) {
    const { data, error } = await store
      .from('pierrot_conversations')
      .select('id,session_id')
      .eq('id', id)
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .eq('mode', DEV_MODE)
      .maybeSingle();

    if (error) {
      if (isMissingModeColumn(error)) throw new Error('DEV_MIGRATION_REQUIRED');
      throw error;
    }

    if (data?.id && typeof data.session_id === 'string') {
      return { id: data.id, sessionId: data.session_id, created: false };
    }
  }

  const now = new Date();
  const sessionId = randomUUID();
  const { error } = await store.from('pierrot_conversations').insert({
    id,
    session_id: sessionId,
    mode: DEV_MODE,
    status: 'active',
    consent_state: 'granted',
    consent_version: null,
    language: 'ru',
    start_page: DEV_PAGE,
    referrer: null,
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
    last_message_at: null,
    expires_at: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    identity_type: 'owner',
    user_id: ownerUserId,
    identity_source: 'supabase_session',
    identity_verified_at: now.toISOString(),
  });

  if (error) {
    if (isMissingModeColumn(error)) throw new Error('DEV_MIGRATION_REQUIRED');
    throw error;
  }

  return { id, sessionId, created: true };
}

export async function appendDevMessage({
  conversationId,
  role,
  content,
  provider,
  messageId,
}: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  messageId?: string | null;
}): Promise<DevChatMessage> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const safeContent = content.slice(0, MAX_STORED_MESSAGE);
  const id = messageId && /^[A-Za-z0-9_-]{8,64}$/.test(messageId) ? messageId : randomUUID();

  // Idempotent retry: a repeated client request must not append a second copy
  // of the same message.
  if (messageId) {
    const { data: existing, error: existingError } = await store
      .from('pierrot_messages')
      .select('id,role,content,provider,created_at')
      .eq('id', id)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (!existingError && existing?.id) {
      return {
        id: existing.id as string,
        role: existing.role as 'user' | 'assistant',
        content: existing.content as string,
        provider: typeof existing.provider === 'string' ? existing.provider : null,
        createdAt: typeof existing.created_at === 'string' ? existing.created_at : null,
      };
    }
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: last, error } = await store
      .from('pierrot_messages')
      .select('message_index')
      .eq('conversation_id', conversationId)
      .eq('mode', DEV_MODE)
      .order('message_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingModeColumn(error)) throw new Error('DEV_MIGRATION_REQUIRED');
      lastError = error;
      break;
    }

    const nextIndex = Number(last?.message_index || 0) + 1;
    const now = new Date().toISOString();

    const { error: insertError } = await store.from('pierrot_messages').insert({
      id,
      conversation_id: conversationId,
      role,
      content: safeContent,
      message_index: nextIndex,
      provider: provider || null,
      mode: DEV_MODE,
      created_at: now,
    });

    if (insertError) {
      if (isMissingModeColumn(insertError)) throw new Error('DEV_MIGRATION_REQUIRED');
      lastError = insertError;
      // A concurrent append consumed this index. Re-read and retry.
      if (String(insertError.code || '') === '23505') continue;
      break;
    }

    await store
      .from('pierrot_conversations')
      .update({
        updated_at: now,
        last_message_at: now,
        next_message_sequence: nextIndex,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', conversationId)
      .eq('mode', DEV_MODE);

    return {
      id,
      role,
      content: safeContent,
      provider: provider || null,
      createdAt: now,
    };
  }

  if (lastError) throw lastError;
  throw new Error('Unable to append Dev message.');
}

export async function loadDevHistory(
  conversationId: string,
  limit = 24
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await store
      .from('pierrot_messages')
      .select('role,content,message_index')
      .eq('conversation_id', conversationId)
      .eq('mode', DEV_MODE)
      .order('message_index', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 40));

    if (error || !Array.isArray(data)) return [];

    return data
      .reverse()
      .filter(
        (row): row is { role: 'user' | 'assistant'; content: string; message_index: number } =>
          (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string'
      )
      .map((row) => ({ role: row.role, content: row.content }));
  } catch {
    return [];
  }
}
