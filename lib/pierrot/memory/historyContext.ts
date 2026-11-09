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
    /** Permanent history scope. MAIN and project histories never mix. */
    historyId?: string | null;
    limit?: number;
  } = {}
): Promise<string | null> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 8);

  if (options.historyId) {
    const { data: messages, error } = await store
      .from('pierrot_messages')
      .select('session_id,role,content,created_at,history_sequence')
      .eq('history_id', options.historyId)
      .not('history_sequence', 'is', null)
      .order('history_sequence', { ascending: false })
      .limit(limit * 12);

    if (error || !Array.isArray(messages) || messages.length === 0) return null;

    const sessionIds = Array.from(
      new Set(
        messages
          .map((row) => (typeof row.session_id === 'string' ? row.session_id : ''))
          .filter(Boolean)
      )
    );
    const { data: sessions } = sessionIds.length
      ? await store
          .from('pierrot_sessions')
          .select('id,title,started_at,ordinal')
          .in('id', sessionIds)
      : { data: [] };
    const sessionById = new Map(
      (Array.isArray(sessions) ? sessions : [])
        .filter((row) => row && typeof row.id === 'string')
        .map((row) => [String(row.id), row])
    );

    const bySession = new Map<string, string[]>();
    for (const row of [...messages].reverse()) {
      if (!row || typeof row.content !== 'string') continue;
      const sessionId = typeof row.session_id === 'string' ? row.session_id : '__none__';
      const content = row.content.replace(/\s+/g, ' ').trim().slice(0, 360);
      if (!content) continue;
      const speaker = row.role === 'assistant' ? 'Pierrot' : 'Owner';
      const list = bySession.get(sessionId) || [];
      list.push(`${speaker}: ${content}`);
      bySession.set(sessionId, list);
    }

    const orderedSessionIds = Array.from(bySession.keys()).sort((left, right) => {
      const a = Number(sessionById.get(left)?.ordinal || 0);
      const b = Number(sessionById.get(right)?.ordinal || 0);
      return b - a;
    });

    const blocks: string[] = [];
    for (const sessionId of orderedSessionIds.slice(0, limit)) {
      const session = sessionById.get(sessionId);
      const lines = (bySession.get(sessionId) || []).slice(-6);
      if (lines.length === 0) continue;
      const title =
        session && typeof session.title === 'string' && session.title.trim()
          ? session.title.trim()
          : 'Сессия';
      const startedAt =
        session && typeof session.started_at === 'string' ? session.started_at.slice(0, 10) : '';
      blocks.push(`- ${title}${startedAt ? ` (${startedAt})` : ''}\n${lines.map((line) => `  ${line}`).join('\n')}`);
    }

    if (blocks.length === 0 && !options.query) return null;
    const parts = [
      `RECENT EPISODES IN THIS OWNER HISTORY (same scope only; no external search):\n${blocks
        .join('\n')
        .slice(0, 4_800)}`,
    ];

    const terms = Array.from(
      new Set(
        (String(options.query || '')
          .toLocaleLowerCase()
          .match(/[\p{L}\p{N}_-]{3,}/gu) || [])
          .map((term) => term.replace(/[-_]+$/g, ''))
          .filter((term) => term.length >= 3)
      )
    ).slice(0, 8);

    if (terms.length > 0) {
      const pattern = terms
        .map((term) => `content.ilike.%${term.replace(/[%_\\]/g, '\\$&')}%`)
        .join(',');
      const { data: matches } = await store
        .from('pierrot_messages')
        .select('session_id,role,content,created_at,history_sequence')
        .eq('history_id', options.historyId)
        .or(pattern)
        .order('history_sequence', { ascending: false })
        .limit(12);
      if (Array.isArray(matches) && matches.length > 0) {
        const matchSessionIds = Array.from(
          new Set(
            matches
              .map((row) => (typeof row.session_id === 'string' ? row.session_id : ''))
              .filter(Boolean)
          )
        );
        const { data: matchSessions } = matchSessionIds.length
          ? await store
              .from('pierrot_sessions')
              .select('id,title,started_at')
              .in('id', matchSessionIds)
          : { data: [] };
        const matchSessionById = new Map(
          (Array.isArray(matchSessions) ? matchSessions : [])
            .filter((row) => row && typeof row.id === 'string')
            .map((row) => [String(row.id), row])
        );
        const lines = matches
          .slice()
          .reverse()
          .map((row) => {
            const session =
              typeof row.session_id === 'string'
                ? matchSessionById.get(row.session_id)
                : null;
            const stamp =
              typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : 'undated';
            const label =
              session && typeof session.title === 'string' ? session.title : 'Сессия';
            return `[${stamp} · ${label}] ${row.role === 'assistant' ? 'Pierrot' : 'Owner'}: ${String(
              row.content || ''
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 420)}`;
          });
        parts.push(
          `RELEVANT FRAGMENTS FROM THE SAME OWNER HISTORY:\n${lines.join('\n')}`
        );
      }
    }

    return parts.join('\n\n').slice(0, 6_000);
  }

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
