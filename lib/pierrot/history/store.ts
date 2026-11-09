import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OwnerChatMessage,
  OwnerHistorySummary,
  OwnerSessionListItem,
  PierrotHistoryType,
} from '@/lib/pierrot/workspace/types';
import { ensureProjectConversation } from '@/lib/pierrot/projects/conversation';
import {
  getPierrotProject,
  getPierrotProjectForConversation,
  listPierrotProjects,
} from '@/lib/pierrot/projects/store';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

assertServerOnly('lib/pierrot/history/store');

const HISTORY_COLUMNS =
  'id,owner_user_id,type,project_id,canonical_conversation_id,title,metadata,next_message_sequence,created_at,updated_at';
const SESSION_COLUMNS =
  'id,history_id,conversation_id,source_conversation_id,ordinal,title,started_at,ended_at,last_message_at,message_count,first_message_sequence,last_message_sequence,metadata,created_at,updated_at';

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const numberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isMissingHistorySchema(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return (
    /PGRST205|PGRST204|42P01|42703|42883/.test(value) ||
    /relation .* does not exist|column .* does not exist|function .* does not exist/i.test(value)
  );
}

export type PierrotHistoryRecord = {
  id: string;
  ownerUserId: string;
  type: PierrotHistoryType;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  canonicalConversationId: string | null;
  canonicalConversationSessionId: string | null;
  title: string;
  nextMessageSequence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PierrotSessionRecord = {
  id: string;
  historyId: string;
  conversationId: string | null;
  sourceConversationId: string | null;
  ordinal: number;
  title: string;
  startedAt: string;
  endedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  firstMessageSequence: number | null;
  lastMessageSequence: number | null;
  metadata: Record<string, unknown>;
};

export type PierrotHistoryScope = {
  history: PierrotHistoryRecord;
  session: PierrotSessionRecord | null;
  /** Canonical conversation used for all new messages in this history. */
  conversationId: string;
  /** Legacy session token of the canonical conversation row (auth compat). */
  conversationSessionId: string;
  project: PierrotProject | null;
};

function mapHistory(row: Record<string, unknown>): PierrotHistoryRecord | null {
  const id = text(row.id);
  const ownerUserId = text(row.owner_user_id);
  if (!id || !ownerUserId) return null;
  const type = row.type === 'project' ? 'project' : 'main';
  return {
    id,
    ownerUserId,
    type,
    projectId: text(row.project_id) || null,
    projectSlug: text(row.project_slug) || null,
    projectName: text(row.project_name) || null,
    canonicalConversationId: text(row.canonical_conversation_id) || null,
    canonicalConversationSessionId: text(row.canonical_session_id) || null,
    title: text(row.title) || (type === 'main' ? 'Главная история' : 'Проект'),
    nextMessageSequence: Number(row.next_message_sequence || 0),
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapSession(row: Record<string, unknown>): PierrotSessionRecord | null {
  const id = text(row.id);
  const historyId = text(row.history_id);
  if (!id || !historyId) return null;
  return {
    id,
    historyId,
    conversationId: text(row.conversation_id) || null,
    sourceConversationId: text(row.source_conversation_id) || null,
    ordinal: Number(row.ordinal || 0),
    title: text(row.title) || 'Сессия',
    startedAt: text(row.started_at),
    endedAt: text(row.ended_at) || null,
    lastMessageAt: text(row.last_message_at) || null,
    messageCount: Number(row.message_count || 0),
    firstMessageSequence: numberOrNull(row.first_message_sequence),
    lastMessageSequence: numberOrNull(row.last_message_sequence),
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

async function loadHistoryRow(
  store: SupabaseClient,
  where: { id?: string; ownerUserId?: string; type?: PierrotHistoryType; projectId?: string }
): Promise<PierrotHistoryRecord | null> {
  let query = store.from('pierrot_histories').select(HISTORY_COLUMNS);
  if (where.id) query = query.eq('id', where.id);
  if (where.ownerUserId) query = query.eq('owner_user_id', where.ownerUserId);
  if (where.type) query = query.eq('type', where.type);
  if (where.projectId) query = query.eq('project_id', where.projectId);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    if (isMissingHistorySchema(error)) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;

  const projectId = text(row.project_id);
  const canonicalConversationId = text(row.canonical_conversation_id);

  const [projectResult, conversationResult] = await Promise.all([
    projectId
      ? store.from('pierrot_projects').select('slug,name').eq('id', projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    canonicalConversationId
      ? store
          .from('pierrot_conversations')
          .select('session_id')
          .eq('id', canonicalConversationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return mapHistory({
    ...row,
    project_slug: projectResult.data?.slug || '',
    project_name: projectResult.data?.name || '',
    canonical_session_id: conversationResult.data?.session_id || '',
  });
}

export async function getHistoryById(
  store: SupabaseClient,
  ownerUserId: string,
  historyId: string
): Promise<PierrotHistoryRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(historyId)) return null;
  return loadHistoryRow(store, { id: historyId, ownerUserId });
}

export async function ensureMainHistory(
  store: SupabaseClient,
  ownerUserId: string
): Promise<PierrotHistoryRecord | null> {
  try {
    const { data, error } = await store.rpc('pierrot_ensure_main_history', {
      p_owner_user_id: ownerUserId,
    });
    if (error) {
      if (isMissingHistorySchema(error)) return null;
      throw error;
    }
    const historyId = Array.isArray(data)
      ? text((data[0] as Record<string, unknown>)?.id)
      : text(data as unknown);
    if (!historyId) return null;
    return getHistoryById(store, ownerUserId, historyId);
  } catch (error) {
    if (isMissingHistorySchema(error)) return null;
    throw error;
  }
}

export async function ensureProjectHistory(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<PierrotHistoryRecord | null> {
  try {
    const project = await getPierrotProject(ownerUserId, projectId);
    if (!project) return null;

    if (!project.conversationId) {
      const canonical = await ensureProjectConversation(store, ownerUserId, project.id);
      if (!canonical) return null;
    }

    const { data, error } = await store.rpc('pierrot_ensure_project_history', {
      p_project_id: project.id,
    });
    if (error) {
      if (isMissingHistorySchema(error)) return null;
      throw error;
    }
    const historyId = Array.isArray(data)
      ? text((data[0] as Record<string, unknown>)?.id)
      : text(data as unknown);
    if (!historyId) return null;
    return getHistoryById(store, ownerUserId, historyId);
  } catch (error) {
    if (isMissingHistorySchema(error)) return null;
    throw error;
  }
}

async function listSessionsForHistory(
  store: SupabaseClient,
  historyId: string,
  options: { limit?: number } = {}
): Promise<PierrotSessionRecord[]> {
  let query = store
    .from('pierrot_sessions')
    .select(SESSION_COLUMNS)
    .eq('history_id', historyId)
    .order('ordinal', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 500, 1), 500));
  const { data, error } = await query;
  if (error) {
    if (isMissingHistorySchema(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => mapSession(row as Record<string, unknown>))
    .filter((row): row is PierrotSessionRecord => Boolean(row));
}

export async function listHistorySessions(
  store: SupabaseClient,
  ownerUserId: string,
  historyId: string
): Promise<OwnerSessionListItem[]> {
  const history = await getHistoryById(store, ownerUserId, historyId);
  if (!history) return [];
  const sessions = await listSessionsForHistory(store, historyId);
  return sessions.map((session) => ({
    id: session.id,
    historyId: session.historyId,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    messageCount: session.messageCount,
    ordinal: session.ordinal,
    sourceConversationId: session.sourceConversationId,
    firstMessageSequence: session.firstMessageSequence,
    lastMessageSequence: session.lastMessageSequence,
  }));
}

export async function listOwnerHistories(
  store: SupabaseClient,
  ownerUserId: string
): Promise<OwnerHistorySummary[]> {
  const main = await ensureMainHistory(store, ownerUserId);
  const projects = await listPierrotProjects(ownerUserId).catch(() => []);
  const projectHistories: PierrotHistoryRecord[] = [];
  for (const project of projects) {
    const history = await ensureProjectHistory(store, ownerUserId, project.id).catch(() => null);
    if (history) projectHistories.push(history);
  }

  const histories = [main, ...projectHistories].filter((row): row is PierrotHistoryRecord =>
    Boolean(row)
  );
  const result: OwnerHistorySummary[] = [];
  for (const history of histories) {
    const [{ count: sessionCount }, { count: messageCount }] = await Promise.all([
      store
        .from('pierrot_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('history_id', history.id),
      store
        .from('pierrot_messages')
        .select('id', { count: 'exact', head: true })
        .eq('history_id', history.id),
    ]);
    result.push({
      id: history.id,
      type: history.type,
      title: history.title,
      projectId: history.projectId,
      projectSlug: history.projectSlug,
      projectName: history.projectName,
      canonicalConversationId: history.canonicalConversationId,
      updatedAt: history.updatedAt || null,
      sessionCount: Number(sessionCount || 0),
      messageCount: Number(messageCount || 0),
    });
  }
  return result.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'main' ? -1 : 1;
    return Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || '');
  });
}

async function loadSessionById(
  store: SupabaseClient,
  historyId: string,
  sessionId: string
): Promise<PierrotSessionRecord | null> {
  if (!sessionId) return null;
  const { data, error } = await store
    .from('pierrot_sessions')
    .select(SESSION_COLUMNS)
    .eq('history_id', historyId)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    if (isMissingHistorySchema(error)) return null;
    throw error;
  }
  return data ? mapSession(data as Record<string, unknown>) : null;
}

async function latestSession(
  store: SupabaseClient,
  historyId: string
): Promise<PierrotSessionRecord | null> {
  const sessions = await listSessionsForHistory(store, historyId, { limit: 1 });
  return sessions[0] || null;
}

async function readConversation(
  store: SupabaseClient,
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select(
      'id,session_id,identity_type,user_id,mode,title,status,consent_state,started_at,updated_at,last_message_at,ended_at'
    )
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) || null;
}

function cleanSessionTitle(value: unknown, startedAt?: string | null): string {
  const title = text(value).replace(/\s+/g, ' ').trim();
  if (title) return title.length > 120 ? `${title.slice(0, 117).trimEnd()}…` : title;
  const date = startedAt ? text(startedAt).slice(0, 10) : '';
  return date ? `Сессия ${date}` : 'Сессия';
}

/** Links a pre-existing conversation to a session without moving messages. */
export async function ensureSessionForConversation(
  store: SupabaseClient,
  ownerUserId: string,
  history: PierrotHistoryRecord,
  conversationId: string
): Promise<PierrotSessionRecord | null> {
  const existing = await store
    .from('pierrot_sessions')
    .select(SESSION_COLUMNS)
    .eq('history_id', history.id)
    .eq('source_conversation_id', conversationId)
    .maybeSingle();
  if (existing.error && !isMissingHistorySchema(existing.error)) throw existing.error;
  if (existing.data) return mapSession(existing.data as Record<string, unknown>);

  const conversation = await readConversation(store, conversationId);
  if (!conversation) return null;

  const firstUser = await store
    .from('pierrot_messages')
    .select('content')
    .eq('conversation_id', conversationId)
    .eq('role', 'user')
    .order('message_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  const title = cleanSessionTitle(
    conversation.title || firstUser.data?.content,
    text(conversation.started_at)
  );

  const { data, error } = await store.rpc('pierrot_create_session', {
    p_history_id: history.id,
    p_title: title,
    p_source_conversation_id: conversationId,
  });
  if (error) {
    if (isMissingHistorySchema(error)) return null;
    throw error;
  }
  const created = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : (data as Record<string, unknown> | null);
  const sessionId = text(created?.id);
  if (!sessionId) return null;

  await store
    .from('pierrot_sessions')
    .update({
      conversation_id: history.canonicalConversationId,
      started_at: text(conversation.started_at) || new Date().toISOString(),
      ended_at:
        text(conversation.ended_at) ||
        text(conversation.last_message_at) ||
        text(conversation.updated_at) ||
        null,
      title,
      metadata: {
        source: 'legacy_conversation',
        conversation_id: conversationId,
        identity_type: text(conversation.identity_type) || 'owner',
        mode: text(conversation.mode) || 'site',
        linked_by: 'ensure_session_for_conversation',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('history_id', history.id);

  await store.rpc('pierrot_link_conversation_messages', {
    p_history_id: history.id,
    p_session_id: sessionId,
    p_conversation_id: conversationId,
  });

  return loadSessionById(store, history.id, sessionId);
}

export async function createSession(
  store: SupabaseClient,
  ownerUserId: string,
  historyId: string,
  title?: string | null
): Promise<PierrotSessionRecord | null> {
  const history = await getHistoryById(store, ownerUserId, historyId);
  if (!history) return null;

  const { data, error } = await store.rpc('pierrot_create_session', {
    p_history_id: historyId,
    p_title: title || null,
    p_source_conversation_id: null,
  });
  if (error) {
    if (isMissingHistorySchema(error)) return null;
    throw error;
  }
  const created = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : (data as Record<string, unknown> | null);
  const sessionId = text(created?.id);
  if (!sessionId) return null;
  return loadSessionById(store, historyId, sessionId);
}

function scopeFromHistory(
  history: PierrotHistoryRecord,
  session: PierrotSessionRecord | null,
  project: PierrotProject | null
): PierrotHistoryScope | null {
  if (!history.canonicalConversationId || !history.canonicalConversationSessionId) return null;
  return {
    history,
    session,
    conversationId: history.canonicalConversationId,
    conversationSessionId: history.canonicalConversationSessionId,
    project,
  };
}

export type ResolveHistoryScopeInput = {
  historyId?: string | null;
  episodeId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  createSession?: boolean;
};

/**
 * Resolves the permanent history and episode for an owner request. Nothing is
 * guessed from silence or from a project name inside message text.
 */
export async function resolveHistoryScope(
  store: SupabaseClient,
  ownerUserId: string,
  input: ResolveHistoryScopeInput
): Promise<PierrotHistoryScope | null> {
  let history: PierrotHistoryRecord | null = null;
  let session: PierrotSessionRecord | null = null;
  let project: PierrotProject | null = null;

  if (input.historyId) {
    history = await getHistoryById(store, ownerUserId, input.historyId);
  }

  if (!history && input.conversationId) {
    const bySession = await store
      .from('pierrot_sessions')
      .select(SESSION_COLUMNS)
      .or(
        `source_conversation_id.eq.${input.conversationId},conversation_id.eq.${input.conversationId}`
      )
      .order('ordinal', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bySession.error && !isMissingHistorySchema(bySession.error)) throw bySession.error;
    const row = bySession.data as Record<string, unknown> | null;
    const candidate = row ? mapSession(row) : null;
    if (candidate) {
      const candidateHistory = await getHistoryById(store, ownerUserId, candidate.historyId);
      if (candidateHistory) {
        session = candidate;
        history = candidateHistory;
      }
    }

    if (!history) {
      const conversationProject = await getPierrotProjectForConversation(
        ownerUserId,
        input.conversationId
      ).catch(() => null);
      if (conversationProject) {
        project = conversationProject;
        history = await ensureProjectHistory(store, ownerUserId, conversationProject.id);
      } else {
        const conversation = await readConversation(store, input.conversationId).catch(() => null);
        const conversationOwner = text(conversation?.user_id);
        const isOwnerConversation =
          text(conversation?.identity_type) === 'owner' &&
          (!conversationOwner || conversationOwner === ownerUserId);
        if (isOwnerConversation) {
          history = await ensureMainHistory(store, ownerUserId);
        }
      }

      if (history) {
        session = await ensureSessionForConversation(
          store,
          ownerUserId,
          history,
          input.conversationId
        );
      }
    }
  }

  if (!history && input.projectId) {
    project = await getPierrotProject(ownerUserId, input.projectId);
    if (project) history = await ensureProjectHistory(store, ownerUserId, project.id);
  }

  if (!history) {
    history = await ensureMainHistory(store, ownerUserId);
  }

  if (!history) return null;

  if (history.projectId && !project) {
    project = await getPierrotProject(ownerUserId, history.projectId).catch(() => null);
  }

  if (input.episodeId) {
    session = await loadSessionById(store, history.id, input.episodeId);
  }

  if (!session) session = await latestSession(store, history.id);

  if (!session && input.createSession !== false) {
    session = await createSession(store, ownerUserId, history.id);
  }

  return scopeFromHistory(history, session, project);
}

export type HistoryPageOptions = {
  limit?: number;
  beforeSequence?: number | null;
  /** Load a page ending at this session (old session links). */
  session?: PierrotSessionRecord | null;
  sessionId?: string | null;
};

export type HistoryMessagePage = {
  messages: OwnerChatMessage[];
  hasMore: boolean;
  oldestSequence: number | null;
  newestSequence: number | null;
  historyMaxSequence: number;
};

async function loadFeedbackMap(
  store: SupabaseClient,
  historyId: string,
  messageIds: string[]
): Promise<Map<string, 'up' | 'down'>> {
  const map = new Map<string, 'up' | 'down'>();
  if (messageIds.length === 0) return map;
  const eventKeys = Array.from(new Set(messageIds.flatMap((id) => [id, `answer_feedback:${id}`])));
  const { data, error } = await store
    .from('pierrot_events')
    .select('event_key,payload')
    .eq('history_id', historyId)
    .eq('event_name', 'answer_feedback')
    .in('event_key', eventKeys);
  if (error || !Array.isArray(data)) return map;

  for (const row of data) {
    const payload =
      row.payload && typeof row.payload === 'object'
        ? (row.payload as Record<string, unknown>)
        : {};
    const messageId =
      typeof payload.message_id === 'string' ? payload.message_id : text(row.event_key);
    const rating = payload.rating === 'up' || payload.rating === 'down' ? payload.rating : null;
    if (messageId && rating) map.set(messageId, rating);
  }
  return map;
}

export async function loadHistoryMessagePage(
  store: SupabaseClient,
  ownerUserId: string,
  scope: PierrotHistoryScope,
  options: HistoryPageOptions = {}
): Promise<HistoryMessagePage> {
  const history = await getHistoryById(store, ownerUserId, scope.history.id);
  if (!history) {
    return {
      messages: [],
      hasMore: false,
      oldestSequence: null,
      newestSequence: null,
      historyMaxSequence: 0,
    };
  }

  const limit = Math.min(Math.max(options.limit ?? 120, 1), 300);
  let query = store
    .from('pierrot_messages')
    .select('id,role,content,message_index,provider,created_at,session_id,history_sequence')
    .eq('history_id', history.id);

  const selectedSession =
    options.session ||
    (options.sessionId ? await loadSessionById(store, history.id, options.sessionId) : null);

  if (selectedSession?.firstMessageSequence != null) {
    query = query.gte('history_sequence', selectedSession.firstMessageSequence);
  }
  if (selectedSession?.lastMessageSequence != null) {
    if (typeof options.beforeSequence === 'number' && Number.isFinite(options.beforeSequence)) {
      query = query.lt('history_sequence', options.beforeSequence);
    } else {
      query = query.lte('history_sequence', selectedSession.lastMessageSequence);
    }
  } else if (
    typeof options.beforeSequence === 'number' &&
    Number.isFinite(options.beforeSequence)
  ) {
    query = query.lt('history_sequence', options.beforeSequence);
  }

  const { data, error } = await query
    .order('history_sequence', { ascending: false })
    .limit(limit + 1);
  if (error) {
    if (isMissingHistorySchema(error)) {
      return {
        messages: [],
        hasMore: false,
        oldestSequence: null,
        newestSequence: null,
        historyMaxSequence: 0,
      };
    }
    throw error;
  }

  const rows = (Array.isArray(data) ? data : []).filter((row) => {
    const item = row as Record<string, unknown> | null;
    return (
      Boolean(item) &&
      typeof item?.id === 'string' &&
      (item?.role === 'user' || item?.role === 'assistant') &&
      typeof item?.content === 'string'
    );
  }) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  const feedback = await loadFeedbackMap(
    store,
    history.id,
    page.map((row) => String(row.id))
  );

  const messages: OwnerChatMessage[] = page.map((row) => ({
    id: String(row.id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: String(row.content),
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    provider: typeof row.provider === 'string' ? row.provider : null,
    messageIndex: Number(row.message_index || 0),
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    historySequence: numberOrNull(row.history_sequence),
    feedback: feedback.get(String(row.id)) || null,
  }));

  const maxResult = await store
    .from('pierrot_messages')
    .select('history_sequence')
    .eq('history_id', history.id)
    .not('history_sequence', 'is', null)
    .order('history_sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  const historyMaxSequence = Number(maxResult.data?.history_sequence || 0);

  return {
    messages,
    hasMore,
    oldestSequence: messages[0]?.historySequence ?? null,
    newestSequence: messages[messages.length - 1]?.historySequence ?? null,
    historyMaxSequence,
  };
}

export type HistoryContextMessage = { role: 'user' | 'assistant'; content: string };

export async function loadHistoryContextMessages(
  store: SupabaseClient,
  ownerUserId: string,
  historyId: string,
  limit = 24
): Promise<HistoryContextMessage[]> {
  const history = await getHistoryById(store, ownerUserId, historyId);
  if (!history) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 40);
  const { data, error } = await store
    .from('pierrot_messages')
    .select('role,content')
    .eq('history_id', history.id)
    .not('history_sequence', 'is', null)
    .order('history_sequence', { ascending: false })
    .limit(safeLimit);
  if (error) {
    if (isMissingHistorySchema(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : [])
    .reverse()
    .filter(
      (row): row is { role: 'user' | 'assistant'; content: string } =>
        (row.role === 'user' || row.role === 'assistant') && typeof row.content === 'string'
    )
    .map((row) => ({ role: row.role, content: row.content }));
}

export async function historyBelongsToOwner(
  store: SupabaseClient,
  ownerUserId: string,
  historyId: string
): Promise<boolean> {
  return Boolean(await getHistoryById(store, ownerUserId, historyId));
}

export function sessionById(
  sessions: OwnerSessionListItem[],
  sessionId: string | null | undefined
): OwnerSessionListItem | null {
  if (!sessionId) return null;
  return sessions.find((session) => session.id === sessionId) || null;
}
