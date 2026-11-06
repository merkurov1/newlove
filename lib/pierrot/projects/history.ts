import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotProjectSnapshot } from './types';
import { listProjectConversationIds } from './conversation';

assertServerOnly('lib/pierrot/projects/history');

export type ProjectHistoryMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  messageIndex: number;
  createdAt: string | null;
};

const STOP_WORDS = new Set([
  'что',
  'как',
  'где',
  'когда',
  'почему',
  'зачем',
  'это',
  'этот',
  'эта',
  'было',
  'были',
  'был',
  'была',
  'мы',
  'вы',
  'они',
  'она',
  'оно',
  'для',
  'про',
  'над',
  'под',
  'при',
  'или',
  'если',
  'чем',
  'так',
  'там',
  'тут',
  'ещё',
  'еще',
  'уже',
  'проект',
  'проекте',
  'проекта',
  'обсуждали',
  'обсуждал',
  'говорили',
  'решали',
  'помнишь',
  'помнить',
  'what',
  'did',
  'we',
  'the',
  'and',
  'about',
  'project',
  'discuss',
  'discussed',
  'remember',
]);

export function projectHistoryTerms(query: string): string[] {
  const terms = (query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || [])
    .map((term) => term.replace(/[-_]+$/g, ''))
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));

  return Array.from(new Set(terms)).slice(0, 8);
}

/**
 * Loads transcript messages for a project. `conversationIds` includes the
 * canonical conversation and every preserved legacy link. Ordered oldest
 * first inside the bounded window.
 */
export async function loadProjectHistoryMessages(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  options: { limit?: number; conversationIds?: string[]; ascending?: boolean } = {}
): Promise<ProjectHistoryMessage[]> {
  const ids = options.conversationIds || (await listProjectConversationIds(store, ownerUserId, projectId));
  if (ids.length === 0) return [];

  const limit = Math.min(Math.max(options.limit ?? 2000, 1), 5000);
  const ascending = options.ascending === true;

  // Supabase caps a response at the configured API limit; request the newest
  // bounded window in descending order and reverse it for prompt use.
  const { data, error } = await store
    .from('pierrot_messages')
    .select('id,conversation_id,role,content,message_index,created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending })
    .order('message_index', { ascending })
    .limit(limit);

  if (error) throw error;

  return (Array.isArray(data) ? (data as unknown[]) : [])
    .filter(
      (row): row is Record<string, unknown> & {
        id: string;
        conversation_id: string;
        role: 'user' | 'assistant';
        content: string;
      } => {
        const item = row as Record<string, unknown> | null;
        return (
          Boolean(item) &&
          typeof item?.id === 'string' &&
          typeof item?.conversation_id === 'string' &&
          (item?.role === 'user' || item?.role === 'assistant') &&
          typeof item?.content === 'string'
        );
      }
    )
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      messageIndex: Number(row.message_index || 0),
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    }))
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.messageIndex - right.messageIndex;
    });
}

export async function searchProjectHistory(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  query: string,
  options: { limit?: number } = {}
): Promise<ProjectHistoryMessage[]> {
  const terms = projectHistoryTerms(query);
  if (terms.length === 0) return [];

  const ids = await listProjectConversationIds(store, ownerUserId, projectId);
  if (ids.length === 0) return [];

  const limit = Math.min(Math.max(options.limit ?? 10, 1), 30);
  const pattern = terms
    .map((term) => {
      // Russian/English inflection: searching by a stable root catches
      // "архивные"/"архивными" and "открытки"/"открытками" without a
      // language-specific stemmer or an AI call.
      const root = term.length > 5 ? term.slice(0, Math.max(4, term.length - 2)) : term;
      return `content.ilike.%${root.replace(/[%_\\]/g, '\\$&')}%`;
    })
    .join(',');

  const { data, error } = await store
    .from('pierrot_messages')
    .select('id,conversation_id,role,content,message_index,created_at')
    .in('conversation_id', ids)
    .or(pattern)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];

  return (Array.isArray(data) ? (data as unknown[]) : [])
    .filter(
      (row): row is Record<string, unknown> & {
        id: string;
        conversation_id: string;
        role: 'user' | 'assistant';
        content: string;
      } => {
        const item = row as Record<string, unknown> | null;
        return (
          Boolean(item) &&
          typeof item?.id === 'string' &&
          typeof item?.conversation_id === 'string' &&
          (item?.role === 'user' || item?.role === 'assistant') &&
          typeof item?.content === 'string'
        );
      }
    )
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      messageIndex: Number(row.message_index || 0),
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    }));
}

function compact(value: string, max = 420): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function speaker(message: ProjectHistoryMessage): string {
  return message.role === 'assistant' ? 'Pierrot' : 'Owner';
}

/**
 * Builds the model context for a permanent project chat:
 *  - current project facts and reviewed summary;
 *  - open tasks, decisions and materials;
 *  - the latest canonical transcript;
 *  - deterministic history search when the owner asks about the past.
 *
 * The full transcript stays visible in the UI. This bounded block is only what
 * the language model receives for a turn.
 */
export async function buildProjectChatContext(input: {
  store: SupabaseClient;
  ownerUserId: string;
  project: PierrotProjectSnapshot;
  conversationId: string;
  query: string;
  wantsHistory?: boolean;
  recentLimit?: number;
}): Promise<string> {
  const { store, ownerUserId, project, conversationId, query } = input;
  const recentLimit = Math.min(Math.max(input.recentLimit ?? 12, 4), 24);

  const [recent, relevant] = await Promise.all([
    loadProjectHistoryMessages(store, ownerUserId, project.id, {
      limit: recentLimit,
      conversationIds: [conversationId],
      ascending: false,
    }).catch(() => []),
    input.wantsHistory
      ? searchProjectHistory(store, ownerUserId, project.id, query, { limit: 10 }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const recentOrdered = [...recent].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.messageIndex - right.messageIndex;
  });

  const activeTasks = project.tasks.filter(
    (item) => !['verified', 'archived', 'completed', 'cancelled', 'superseded', 'rejected'].includes(item.status)
  );
  const activeDecisions = project.decisions.filter(
    (item) => item.kind !== 'task' && item.kind !== 'reminder' && item.status === 'current'
  );
  const historicalDecisions = project.decisions.filter(
    (item) =>
      item.kind !== 'task' &&
      item.kind !== 'reminder' &&
      item.status !== 'current'
  );

  const lines: string[] = [
    `PROJECT WORKSPACE: ${project.name} (${project.status})`,
    `Reviewed brief (revision ${project.briefRevision}): ${
      project.projectBrief || 'No reviewed brief yet.'
    }`,
    project.objective ? `Objective: ${project.objective}` : '',
    project.latestReview?.summary
      ? `Current working summary (project review ${project.latestReview.completedAt.slice(0, 10)}): ${project.latestReview.summary}`
      : '',
    project.ownerRating
      ? `Owner rating: ${project.ownerRating}/10 (explicit owner value; not model importance).`
      : '',
    activeDecisions.length
      ? `Active decisions: ${activeDecisions
          .slice(0, 10)
          .map((item) => `${item.title} [${item.status}]`)
          .join('; ')}`
      : '',
    historicalDecisions.length
      ? `Historical/superseded decisions: ${historicalDecisions
          .slice(0, 8)
          .map((item) => `${item.title} [${item.status}]`)
          .join('; ')}`
      : '',
    activeTasks.length
      ? `Open tasks: ${activeTasks
          .slice(0, 12)
          .map((item) => `${item.title} [${item.status}]`)
          .join('; ')}`
      : 'Open tasks: none recorded.',
    project.knowledge.length
      ? `Project knowledge: ${project.knowledge
          .slice(0, 8)
          .map((item) => item.title || item.id)
          .join('; ')}`
      : '',
    project.artifacts.length
      ? `Project materials: ${project.artifacts
          .slice(0, 8)
          .map((item) => `${item.title} (${item.artifactType})`)
          .join('; ')}`
      : '',
    '',
    'PERMANENT PROJECT CHAT HISTORY (most recent messages of the canonical conversation):',
    recentOrdered.length
      ? recentOrdered.map((message) => `${speaker(message)}: ${compact(message.content, 500)}`).join('\n')
      : 'No saved messages in this project chat yet.',
  ];

  if (input.wantsHistory) {
    const recentIds = new Set(recentOrdered.map((message) => message.id));
    const older = relevant.filter((message) => !recentIds.has(message.id));
    lines.push(
      '',
      'RELEVANT OLDER PROJECT HISTORY (server search, not a guess):',
      older.length
        ? older
            .map((message) => {
              const date = message.createdAt ? message.createdAt.slice(0, 10) : 'undated';
              return `[${date}] ${speaker(message)}: ${compact(message.content, 420)}`;
            })
            .join('\n')
        : 'No matching older message was found in this project history.'
    );
  }

  lines.push(
    '',
    'HISTORY RULE: the transcript above is the project’s single permanent chat. Do not invent an older exchange. If a history question is not covered by the supplied messages or search result, say that the available history does not contain it.'
  );

  return lines.filter(Boolean).join('\n').slice(0, 14_000);
}

export function formatProjectHistorySnippet(message: ProjectHistoryMessage): string {
  const date = message.createdAt ? message.createdAt.slice(0, 10) : 'undated';
  return `[${date}] ${speaker(message)}: ${compact(message.content, 600)}`;
}
