import type { SupabaseClient } from '@supabase/supabase-js';

export type RecentPierrotConversation = {
  id: string;
  startedAt: string | null;
  lastMessageAt: string | null;
  language: string;
  startPage: string;
  status: string;
  messageCount: number | null;
  lastMessageRole: 'user' | 'assistant' | null;
  href: string;
};

type OverviewRow = {
  conversation_id?: unknown;
  started_at?: unknown;
  last_message_at?: unknown;
  language?: unknown;
  start_page?: unknown;
  status?: unknown;
  message_count?: unknown;
  last_message_role?: unknown;
};

type ConversationRow = {
  id?: unknown;
  started_at?: unknown;
  last_message_at?: unknown;
  language?: unknown;
  start_page?: unknown;
  status?: unknown;
};

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function roleValue(value: unknown): 'user' | 'assistant' | null {
  return value === 'user' || value === 'assistant' ? value : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toConversation(row: OverviewRow | ConversationRow): RecentPierrotConversation | null {
  const id = stringValue((row as OverviewRow).conversation_id ?? (row as ConversationRow).id);

  if (!id) return null;

  return {
    id,
    startedAt: stringValue(row.started_at) || null,
    lastMessageAt: stringValue(row.last_message_at) || null,
    language: stringValue(row.language, 'und'),
    startPage: stringValue(row.start_page, '/'),
    status: stringValue(row.status, 'active'),
    messageCount: numberValue((row as OverviewRow).message_count),
    lastMessageRole: roleValue((row as OverviewRow).last_message_role),
    href: `/admin/pierrot/intelligence?conversation=${encodeURIComponent(id)}`,
  };
}

/**
 * Lightweight owner-only overview. It returns conversation metadata only, never
 * transcript content, and always links to the existing dialogue viewer.
 */
export async function loadRecentPierrotConversations(
  store: SupabaseClient,
  limit = 15
): Promise<RecentPierrotConversation[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);

  try {
    const { data, error } = await store
      .from('pierrot_v_conversation_overview')
      .select(
        'conversation_id,started_at,last_message_at,language,start_page,status,message_count,last_message_role'
      )
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(safeLimit);

    if (!error && Array.isArray(data)) {
      return data
        .map((row) => toConversation(row as OverviewRow))
        .filter((row): row is RecentPierrotConversation => row !== null);
    }
  } catch {
    // Fall back to the base table when the analytics view is not deployed yet.
  }

  try {
    const { data, error } = await store
      .from('pierrot_conversations')
      .select('id,started_at,last_message_at,language,start_page,status')
      .order('started_at', { ascending: false })
      .limit(safeLimit);

    if (error || !Array.isArray(data)) return [];

    return data
      .map((row) => toConversation(row as ConversationRow))
      .filter((row): row is RecentPierrotConversation => row !== null);
  } catch {
    return [];
  }
}
