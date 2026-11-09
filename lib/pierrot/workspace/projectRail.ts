import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { listPierrotProjects } from '@/lib/pierrot/projects/store';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import type { ProjectRailItem, ProjectRailSession } from './types';

assertServerOnly('lib/pierrot/workspace/projectRail');

/**
 * A project can be represented by several sessions. The rail only exposes
 * sessions that are still open and actually contain dialogue:
 *
 * - `ended_at` is the only explicit closure marker in the schema. A session
 *   created by the current UI never receives it; migrated legacy sessions were
 *   closed during backfill.
 * - `message_count` distinguishes a real dialogue from an empty shell created
 *   by "New session" before the first message.
 * - `last_message_at` is the real activity timestamp written on message
 *   append. Creation time is deliberately not used for ordering.
 */
export type ProjectRailSessionRow = {
  id: string;
  history_id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  last_message_at: string | null;
  message_count: number;
  ordinal: number;
};

export type ProjectRailHistoryRow = {
  id: string;
  project_id: string | null;
  canonical_conversation_id: string | null;
};

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function time(value: string | null | undefined): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isActiveProjectSession(row: {
  ended_at?: string | null;
  endedAt?: string | null;
  message_count?: number;
  messageCount?: number;
}): boolean {
  const endedAt = row.ended_at ?? row.endedAt ?? null;
  const messageCount = Number(row.message_count ?? row.messageCount ?? 0);
  return endedAt === null && messageCount > 0;
}

function mapSession(row: ProjectRailSessionRow): ProjectRailSession {
  return {
    id: row.id,
    historyId: row.history_id,
    title: text(row.title) || 'Сессия',
    startedAt: text(row.started_at),
    lastActivityAt: text(row.last_message_at) || text(row.started_at) || null,
    messageCount: Number(row.message_count || 0),
    ordinal: Number(row.ordinal || 0),
  };
}

export function projectRailHref(item: { historyId: string | null; slug: string }): string {
  return item.historyId
    ? `/admin/pierrot?history=${encodeURIComponent(item.historyId)}`
    : `/admin/pierrot?project=${encodeURIComponent(item.slug)}`;
}

export function sessionRailHref(historyId: string, sessionId: string): string {
  return `/admin/pierrot?history=${encodeURIComponent(
    historyId
  )}&session=${encodeURIComponent(sessionId)}`;
}

/**
 * Pure builder used by the server loader and by tests. It never invents a
 * session or a timestamp: a project without message activity is placed after
 * active projects and ordered by name.
 */
export function buildProjectRailItems(
  projects: PierrotProject[],
  histories: ProjectRailHistoryRow[],
  sessions: ProjectRailSessionRow[]
): ProjectRailItem[] {
  const historyByProject = new Map<string, ProjectRailHistoryRow>();
  for (const history of histories) {
    if (history.project_id) historyByProject.set(history.project_id, history);
  }

  const historyIds = new Set(histories.map((history) => history.id));
  const sessionsByHistory = new Map<string, ProjectRailSessionRow[]>();
  for (const session of sessions) {
    if (!historyIds.has(session.history_id)) continue;
    const list = sessionsByHistory.get(session.history_id) || [];
    list.push(session);
    sessionsByHistory.set(session.history_id, list);
  }

  const items = projects
    .filter((project) => Boolean(project.id))
    .map((project): ProjectRailItem => {
      const history = historyByProject.get(project.id) || null;
      const projectSessions = history ? sessionsByHistory.get(history.id) || [] : [];
      const lastActivityAt =
        projectSessions
          .map((session) => text(session.last_message_at))
          .filter(Boolean)
          .sort((left, right) => time(right) - time(left))[0] || null;
      const activeSessions = projectSessions
        .filter(isActiveProjectSession)
        .map(mapSession)
        .sort((left, right) => {
          const byActivity = time(right.lastActivityAt) - time(left.lastActivityAt);
          return byActivity || right.ordinal - left.ordinal;
        });

      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        status: project.status,
        historyId: history?.id || null,
        canonicalConversationId:
          text(history?.canonical_conversation_id) || project.conversationId || null,
        chatHref: projectRailHref({
          historyId: history?.id || null,
          slug: project.slug,
        }),
        lastActivityAt,
        sessions: activeSessions,
      };
    });

  return sortProjectRailItems(items);
}

export function sortProjectRailItems(items: ProjectRailItem[]): ProjectRailItem[] {
  return [...items].sort((left, right) => {
    const leftTime = time(left.lastActivityAt);
    const rightTime = time(right.lastActivityAt);

    // Projects without real message activity go last. Their creation date is
    // never used as a fallback, so a new empty project cannot jump above a
    // project that was actually used.
    if (leftTime !== rightTime) return rightTime - leftTime;
    return left.name.localeCompare(right.name, 'ru');
  });
}

/**
 * Loads the complete rail with three bounded queries: projects, project
 * histories and sessions for those histories. No message bodies and no full
 * history pages are read here, and expanding a card never calls this loader.
 */
export async function loadProjectRail(ownerUserId: string): Promise<ProjectRailItem[]> {
  try {
    const projects = await listPierrotProjects(ownerUserId).catch(() => [] as PierrotProject[]);
    if (projects.length === 0) return [];

    const projectIds = projects.map((project) => project.id).filter(Boolean);
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data: historyRows, error: historyError } = await store
      .from('pierrot_histories')
      .select('id,project_id,canonical_conversation_id')
      .eq('owner_user_id', ownerUserId)
      .eq('type', 'project')
      .in('project_id', projectIds);

    if (historyError) {
      // A partially migrated database still gets a usable project rail.
      return buildProjectRailItems(projects, [], []);
    }

    const histories = (Array.isArray(historyRows) ? historyRows : [])
      .filter(
        (row): row is ProjectRailHistoryRow =>
          Boolean(row) &&
          typeof row.id === 'string' &&
          UUID_PATTERN.test(String(row.id)) &&
          (row.project_id == null || typeof row.project_id === 'string')
      )
      .map((row) => ({
        id: row.id,
        project_id: row.project_id == null ? null : String(row.project_id),
        canonical_conversation_id:
          typeof row.canonical_conversation_id === 'string' ? row.canonical_conversation_id : null,
      }));

    const historyIds = histories.map((history) => history.id);
    if (historyIds.length === 0) return buildProjectRailItems(projects, [], []);

    const { data: sessionRows, error: sessionError } = await store
      .from('pierrot_sessions')
      .select('id,history_id,title,started_at,ended_at,last_message_at,message_count,ordinal')
      .in('history_id', historyIds)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(800);

    if (sessionError) return buildProjectRailItems(projects, histories, []);

    const sessions = (Array.isArray(sessionRows) ? sessionRows : [])
      .filter(
        (row): row is ProjectRailSessionRow =>
          Boolean(row) && typeof row.id === 'string' && typeof row.history_id === 'string'
      )
      .map((row) => ({
        id: row.id,
        history_id: row.history_id,
        title: typeof row.title === 'string' ? row.title : '',
        started_at: typeof row.started_at === 'string' ? row.started_at : '',
        ended_at: typeof row.ended_at === 'string' ? row.ended_at : null,
        last_message_at: typeof row.last_message_at === 'string' ? row.last_message_at : null,
        message_count: Number(row.message_count || 0),
        ordinal: Number(row.ordinal || 0),
      }));

    return buildProjectRailItems(projects, histories, sessions);
  } catch {
    return [];
  }
}
