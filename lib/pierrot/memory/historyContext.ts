import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

assertServerOnly('lib/pierrot/memory/historyContext');

/**
 * Loads a compact owner-scoped transcript context for questions such as
 * “Что я вчера обсуждал с Пьеро?”. It is never used for visitors and never
 * crosses the owner boundary. Message text is truncated and the result is
 * bounded before it reaches a prompt.
 */
export async function loadOwnerHistoryContext(
  store: SupabaseClient,
  ownerUserId: string,
  options: {
    query?: string | null;
    excludeConversationId?: string | null;
    limit?: number;
  } = {}
): Promise<string | null> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);

  let conversationsQuery = store
    .from('pierrot_conversations')
    .select('id,title,started_at,user_id')
    .eq('user_id', ownerUserId)
    .order('started_at', { ascending: false })
    .limit(limit + 2);

  if (options.excludeConversationId) {
    conversationsQuery = conversationsQuery.neq('id', options.excludeConversationId);
  }

  const { data: conversations, error } = await conversationsQuery;
  if (error || !Array.isArray(conversations) || conversations.length === 0) return null;

  const ids = conversations
    .filter((row) => row && typeof row.id === 'string' && row.user_id === ownerUserId)
    .map((row) => String(row.id))
    .slice(0, limit);

  if (ids.length === 0) return null;

  const { data: messages } = await store
    .from('pierrot_messages')
    .select('conversation_id,role,content,created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit * 12);

  if (!Array.isArray(messages) || messages.length === 0) return null;

  const titles = new Map<string, { title: string; startedAt: string }>();
  for (const row of conversations) {
    if (!row || typeof row.id !== 'string') continue;
    titles.set(row.id, {
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'Untitled',
      startedAt: typeof row.started_at === 'string' ? row.started_at : '',
    });
  }

  const byConversation = new Map<string, string[]>();
  for (const row of [...messages].reverse()) {
    if (!row || typeof row.conversation_id !== 'string' || typeof row.content !== 'string') {
      continue;
    }
    const content = row.content.replace(/\s+/g, ' ').trim().slice(0, 360);
    if (!content) continue;
    const speaker = row.role === 'assistant' ? 'Pierrot' : 'Owner';
    const list = byConversation.get(row.conversation_id) || [];
    list.push(`${speaker}: ${content}`);
    byConversation.set(row.conversation_id, list);
  }

  const blocks: string[] = [];
  for (const id of ids) {
    const meta = titles.get(id);
    const lines = (byConversation.get(id) || []).slice(-6);
    if (!meta || lines.length === 0) continue;
    const date = meta.startedAt ? meta.startedAt.slice(0, 10) : '';
    blocks.push(`- ${meta.title}${date ? ` (${date})` : ''}\n${lines.map((line) => `  ${line}`).join('\n')}`);
  }

  if (blocks.length === 0) return null;

  return `RECENT OWNER CONVERSATIONS (history only; no external search):\n${blocks
    .join('\n')
    .slice(0, 6_000)}`;
}
