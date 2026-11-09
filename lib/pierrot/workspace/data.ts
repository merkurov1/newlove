import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { loadCommercialSummary } from '@/lib/pierrot/commercialIntelligence';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrainRecentSource,
  OwnerConversation,
  OwnerConversationListItem,
  OwnerSessionListItem,
  WorkspaceMetric,
  WorkspaceMetricKey,
  WorkspaceOverview,
  WorkspacePeriod,
} from './types';
import { buildOverviewSummary, classifyMetricState } from './status';
import { listPierrotProjects } from '@/lib/pierrot/projects/store';
import {
  listHistorySessions,
  loadHistoryMessagePage,
  resolveHistoryScope,
  type PierrotHistoryScope,
} from '@/lib/pierrot/history/store';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

assertServerOnly('lib/pierrot/workspace/data');

const DAY_MS = 24 * 60 * 60 * 1000;

const METRIC_META: Array<{
  key: WorkspaceMetricKey;
  label: string;
  table: string;
  dateColumn: string;
  bulkImportEligible?: boolean;
  totalFilter?: (query: any) => any;
  periodFilter?: (query: any) => any;
}> = [
  {
    key: 'users',
    label: 'Пользователи',
    table: 'users',
    dateColumn: 'created_at',
  },
  {
    key: 'subscribers',
    label: 'Подписчики',
    table: 'subscribers',
    dateColumn: 'confirmedAt',
    totalFilter: (query) => query.eq('isActive', true),
    periodFilter: (query) => query.eq('isActive', true),
  },
  {
    key: 'flow',
    label: 'Flow',
    table: 'items',
    dateColumn: 'published_at',
    totalFilter: (query) => query.eq('status', 'published').eq('visibility', 'public'),
    periodFilter: (query) => query.eq('status', 'published').eq('visibility', 'public'),
  },
  {
    key: 'conversations',
    label: 'Диалоги',
    table: 'pierrot_conversations',
    dateColumn: 'started_at',
    totalFilter: (query) => query.or('identity_type.neq.owner,identity_type.is.null'),
    periodFilter: (query) => query.or('identity_type.neq.owner,identity_type.is.null'),
  },
  {
    key: 'media',
    label: 'Медиа',
    table: 'media_archive_records',
    dateColumn: 'created_at',
    bulkImportEligible: true,
  },
];

function startOfUtcDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function isoDay(date: Date): string {
  return date.toISOString();
}

async function readCount(
  store: SupabaseClient,
  table: string,
  configure?: (query: any) => any
): Promise<{ ok: boolean; value: number }> {
  try {
    let query = store.from(table).select('id', { count: 'exact', head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    if (error) return { ok: false, value: 0 };
    return { ok: true, value: count ?? 0 };
  } catch {
    return { ok: false, value: 0 };
  }
}

async function readTimestamps(
  store: SupabaseClient,
  table: string,
  column: string,
  from: string,
  toExclusive: string,
  configure?: (query: any) => any
): Promise<string[] | null> {
  try {
    let query = store
      .from(table)
      .select(column)
      .gte(column, from)
      .lt(column, toExclusive)
      .limit(10000);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) return null;
    if (!Array.isArray(data)) return null;

    return (data as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const value = row[column];
        return typeof value === 'string' ? value : null;
      })
      .filter((value): value is string => Boolean(value));
  } catch {
    return null;
  }
}

function bulkAdjustedCount(
  series: number[],
  eligible: boolean
): {
  raw: number;
  organic: number;
  peak: number;
  bulk: boolean;
} {
  const raw = series.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(0, ...series);
  const nonZeroDays = series.filter((value) => value > 0).length;
  // A single day is treated as a bulk/import event only when it is both large
  // in absolute terms and dominates the period. Small legitimate bursts stay
  // in the comparison. No source/batch column is assumed here.
  const bulk = eligible && nonZeroDays === 1 && raw >= 20 && peak >= 20 && peak / raw >= 0.7;
  return { raw, organic: bulk ? raw - peak : raw, peak, bulk };
}

function bucketSeries(
  timestamps: string[],
  periodStart: number,
  period: WorkspacePeriod
): number[] {
  const buckets = Array.from({ length: period }, () => 0);

  for (const value of timestamps) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time) || time < periodStart) continue;
    const index = Math.min(period - 1, Math.floor((time - periodStart) / DAY_MS));
    if (index >= 0) buckets[index] += 1;
  }

  return buckets;
}

async function loadMetric(
  store: SupabaseClient,
  meta: (typeof METRIC_META)[number],
  period: WorkspacePeriod,
  now: Date
): Promise<WorkspaceMetric> {
  // Use complete UTC days for both periods. The current partial day is never
  // compared with a complete historical day.
  const currentEndDate = startOfUtcDay(now);
  const periodStartDate = new Date(currentEndDate.getTime() - period * DAY_MS);
  const previousStartDate = new Date(periodStartDate.getTime() - period * DAY_MS);
  const periodStart = periodStartDate.getTime();

  const [total, timestamps] = await Promise.all([
    readCount(store, meta.table, meta.totalFilter),
    readTimestamps(
      store,
      meta.table,
      meta.dateColumn,
      isoDay(previousStartDate),
      isoDay(currentEndDate),
      meta.periodFilter
    ),
  ]);

  const series = timestamps ? bucketSeries(timestamps, periodStart, period) : null;
  const previousSeries = timestamps
    ? bucketSeries(timestamps, previousStartDate.getTime(), period)
    : null;
  const currentProfile = series
    ? bulkAdjustedCount(series, meta.bulkImportEligible === true)
    : null;
  const previousProfile = previousSeries
    ? bulkAdjustedCount(previousSeries, meta.bulkImportEligible === true)
    : null;
  const periodCount = currentProfile?.raw || 0;
  const previousCount = previousProfile?.raw || 0;
  const comparisonCurrent = currentProfile?.organic ?? null;
  const comparisonPrevious = previousProfile?.organic ?? null;
  const changeRatio =
    comparisonCurrent !== null && comparisonPrevious !== null && comparisonPrevious > 0
      ? (comparisonCurrent - comparisonPrevious) / comparisonPrevious
      : null;

  return {
    key: meta.key,
    label: meta.label,
    current: total.value,
    periodCount,
    previousCount,
    state:
      comparisonCurrent !== null && comparisonPrevious !== null
        ? classifyMetricState(comparisonCurrent, comparisonPrevious)
        : null,
    series,
    comparisonCurrent: comparisonCurrent ?? undefined,
    comparisonPrevious: comparisonPrevious ?? undefined,
    bulkImportCurrent: currentProfile?.bulk ? currentProfile.peak : undefined,
    bulkImportPrevious: previousProfile?.bulk ? previousProfile.peak : undefined,
    changeRatio,
    available: total.ok || series !== null,
  };
}

/**
 * Real snapshot + real daily additions. No metric is synthesized from a
 * single current number: if the date column is unavailable, the series and
 * state stay null and the UI shows "нет данных".
 */
export async function loadWorkspaceOverview(
  period: WorkspacePeriod = 7,
  now = new Date()
): Promise<WorkspaceOverview> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const periodStartDate = new Date(startOfUtcDay(now).getTime() - period * DAY_MS);

  const [metrics, commercial, activeProjects, activeTasks, activeDevTasks] = await Promise.all([
    Promise.all(METRIC_META.map((meta) => loadMetric(store, meta, period, now))),
    loadCommercialSummary({
      store,
      periodKey: period === 30 ? 'last_30_days' : 'last_7_days',
      now,
    }).catch(() => emptyCommercialSummary(period === 30 ? 'last_30_days' : 'last_7_days', now)),
    readCount(store, 'pierrot_projects', (query) => query.eq('status', 'active')),
    readCount(store, 'pierrot_decisions', (query) =>
      query.in('kind', ['task', 'reminder']).in('status', ['current', 'uncertain'])
    ),
    readCount(store, 'pierrot_dev_prompts', (query) =>
      query.in('status', ['ready', 'in_progress', 'review'])
    ),
  ]);

  return {
    period,
    from: isoDay(periodStartDate),
    to: isoDay(now),
    metrics,
    commercial,
    summary: buildOverviewSummary(metrics),
    generatedAt: now.toISOString(),
    projectHealth: {
      activeProjects: activeProjects.ok ? activeProjects.value : null,
      activeTasks: activeTasks.ok ? activeTasks.value : null,
      activeDevTasks: activeDevTasks.ok ? activeDevTasks.value : null,
    },
  };
}

function truncateTitle(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 92 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}

function isMissingModeColumn(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST204|42703/.test(value) || /column .*mode.* does not exist/i.test(value);
}

export async function loadOwnerConversations(
  ownerUserId: string,
  limit = 40
): Promise<OwnerConversationListItem[]> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const select =
      'id,session_id,started_at,updated_at,last_message_at,consent_state,identity_type,user_id,mode';

    let result = await store
      .from('pierrot_conversations')
      .select(select)
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .eq('mode', 'site')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (result.error && isMissingModeColumn(result.error)) {
      result = await store
        .from('pierrot_conversations')
        .select(select)
        .eq('identity_type', 'owner')
        .eq('user_id', ownerUserId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(limit);
    }

    let data = result.data;
    if (result.error || !Array.isArray(data) || data.length === 0) return [];

    const initialIds = data
      .map((row) => (typeof row.id === 'string' ? row.id : null))
      .filter((value): value is string => Boolean(value));

    const { data: links } = await store
      .from('pierrot_project_conversations')
      .select('conversation_id,project_id')
      .eq('owner_user_id', ownerUserId)
      .in('conversation_id', initialIds);
    const projects = await listPierrotProjects(ownerUserId).catch(() => []);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const projectByConversation = new Map(
      (links || []).map((row) => [
        String(row.conversation_id),
        projectById.get(String(row.project_id)) || null,
      ])
    );
    const projectByCanonicalConversation = new Map(
      projects
        .filter((project): project is NonNullable<typeof project> =>
          Boolean(project?.conversationId)
        )
        .map((project) => [project.conversationId as string, project])
    );

    // A project is represented by its canonical conversation only. If the
    // canonical row fell outside the recent limit, load it explicitly so the
    // list can never show a project as several separate chats.
    const presentIds = new Set(initialIds);
    const missingCanonicalIds = Array.from(projectByCanonicalConversation.keys()).filter(
      (id) => !presentIds.has(id)
    );
    if (missingCanonicalIds.length > 0) {
      const extra = await store
        .from('pierrot_conversations')
        .select(select)
        .in('id', missingCanonicalIds)
        .eq('identity_type', 'owner')
        .eq('user_id', ownerUserId)
        .limit(missingCanonicalIds.length);
      if (!extra.error && Array.isArray(extra.data)) {
        data = [...data, ...extra.data];
      }
    }

    const dataById = new Map(
      (Array.isArray(data) ? data : [])
        .filter((row) => row && typeof row.id === 'string')
        .map((row) => [String(row.id), row])
    );
    const visibleData = Array.from(dataById.values()).filter((row) => {
      const id = String(row.id);
      const linkedProject = projectByConversation.get(id);
      const canonicalProject = projectByCanonicalConversation.get(id);
      const ownerProject = canonicalProject || linkedProject;
      if (!ownerProject) return true;
      // Legacy historical chats stay in the database and in project history
      // search, but not as separate rows in the dialogue list.
      return !ownerProject.conversationId || id === ownerProject.conversationId;
    });

    const ids = visibleData.map((row) => String(row.id));

    const { data: messageRows } = await store
      .from('pierrot_messages')
      .select('conversation_id,role,content,message_index')
      .in('conversation_id', ids)
      .order('message_index', { ascending: true })
      .limit(3000);

    const firstUserMessage = new Map<string, string>();
    const counts = new Map<string, number>();

    for (const row of Array.isArray(messageRows) ? messageRows : []) {
      const id = typeof row.conversation_id === 'string' ? row.conversation_id : '';
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      if (row.role === 'user' && !firstUserMessage.has(id) && typeof row.content === 'string') {
        firstUserMessage.set(id, truncateTitle(row.content));
      }
    }

    return visibleData
      .filter(
        (row) =>
          typeof row.id === 'string' &&
          typeof row.session_id === 'string' &&
          typeof row.started_at === 'string' &&
          (counts.get(row.id as string) || 0) > 0
      )
      .map((row) => ({
        ...(() => {
          const canonical = projectByCanonicalConversation.get(row.id as string);
          const linked = projectByConversation.get(row.id as string);
          const project = canonical || linked || null;
          return {
            projectId: project?.id || null,
            projectSlug: project?.slug || null,
            projectName: project?.name || null,
            projectStatus: project?.status || null,
          };
        })(),
        id: row.id as string,
        sessionId: row.session_id as string,
        title: firstUserMessage.get(row.id as string) || 'Новый диалог',
        startedAt: row.started_at as string,
        updatedAt:
          typeof row.last_message_at === 'string'
            ? row.last_message_at
            : typeof row.updated_at === 'string'
              ? row.updated_at
              : (row.started_at as string),
        consentState:
          row.consent_state === 'granted' || row.consent_state === 'denied'
            ? row.consent_state
            : row.consent_state === 'pending'
              ? 'pending'
              : null,
        messageCount: counts.get(row.id as string) || 0,
      }));
  } catch {
    return [];
  }
}

export async function loadOwnerConversation(
  ownerUserId: string,
  conversationId: string,
  options: { limit?: number; beforeIndex?: number | null } = {}
): Promise<OwnerConversation | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) return null;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const select = 'id,session_id,started_at,consent_state,identity_type,user_id,mode';

    let result = await store
      .from('pierrot_conversations')
      .select(select)
      .eq('id', conversationId)
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .eq('mode', 'site')
      .maybeSingle();

    if (result.error && isMissingModeColumn(result.error)) {
      result = await store
        .from('pierrot_conversations')
        .select(select)
        .eq('id', conversationId)
        .eq('identity_type', 'owner')
        .eq('user_id', ownerUserId)
        .maybeSingle();
    }

    const conversation = result.data;
    if (result.error || !conversation || typeof conversation.session_id !== 'string') {
      return null;
    }

    const limit = Math.min(Math.max(options.limit ?? 160, 1), 500);
    let query = store
      .from('pierrot_messages')
      .select('id,role,content,message_index,provider,created_at')
      .eq('conversation_id', conversationId);

    if (typeof options.beforeIndex === 'number' && Number.isFinite(options.beforeIndex)) {
      query = query.lt('message_index', options.beforeIndex);
    }

    const { data: rows, error: messagesError } = await query
      .order('message_index', { ascending: false })
      .limit(limit + 1);

    if (messagesError) return null;

    const descending = (Array.isArray(rows) ? rows : []).filter(
      (
        row
      ): row is {
        id: string;
        role: 'user' | 'assistant';
        content: string;
        message_index: number;
        provider: string | null;
        created_at: string | null;
      } =>
        (row.role === 'user' || row.role === 'assistant') &&
        typeof row.id === 'string' &&
        typeof row.content === 'string'
    );
    const hasMore = descending.length > limit;
    const page = (hasMore ? descending.slice(0, limit) : descending).reverse();

    const messages = page.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
      provider: typeof row.provider === 'string' ? row.provider : null,
      messageIndex: Number(row.message_index || 0),
    }));

    const firstUser = messages.find((message) => message.role === 'user');

    return {
      id: conversation.id as string,
      sessionId: conversation.session_id,
      title: firstUser ? truncateTitle(firstUser.content) : 'Новый диалог',
      consentState:
        conversation.consent_state === 'granted' || conversation.consent_state === 'denied'
          ? conversation.consent_state
          : conversation.consent_state === 'pending'
            ? 'pending'
            : null,
      messages,
      hasMore,
      oldestMessageIndex: messages.length > 0 ? messages[0].messageIndex : null,
    };
  } catch {
    return null;
  }
}

export type OwnerHistoryView = {
  scope: PierrotHistoryScope;
  sessions: OwnerSessionListItem[];
  conversation: OwnerConversation;
  project: PierrotProject | null;
};

/**
 * Loads one permanent history view. The transcript is always scoped to a
 * history, never to a single legacy conversation. A requested session only
 * changes the page boundary, not the history.
 */
export async function loadOwnerHistoryView(
  ownerUserId: string,
  input: {
    historyId?: string | null;
    sessionId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    createSession?: boolean;
    limit?: number;
  } = {}
): Promise<OwnerHistoryView | null> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const scope = await resolveHistoryScope(store, ownerUserId, {
      historyId: input.historyId || null,
      episodeId: input.sessionId || null,
      conversationId: input.conversationId || null,
      projectId: input.projectId || null,
      createSession: input.createSession === true,
    });
    if (!scope) return null;

    const sessions = await listHistorySessions(store, ownerUserId, scope.history.id).catch(
      () => []
    );

    const requestedSession = input.sessionId
      ? sessions.find((session) => session.id === input.sessionId) || null
      : null;
    const selectedSession =
      requestedSession ||
      (scope.session
        ? sessions.find((session) => session.id === scope.session?.id) || null
        : null) ||
      sessions[0] ||
      null;

    const page = await loadHistoryMessagePage(store, ownerUserId, scope, {
      limit: input.limit ?? 120,
      // A direct session link opens that episode's message range. The
      // canonical project chat (no session in the URL) keeps the continuous
      // history, so older fragments remain reachable above it.
      sessionId: requestedSession?.id || null,
    });

    const conversation: OwnerConversation = {
      id: scope.conversationId,
      sessionId: scope.conversationSessionId,
      title: selectedSession?.title || scope.history.title,
      consentState: 'granted',
      messages: page.messages,
      hasMore: page.hasMore,
      oldestMessageIndex: page.oldestSequence,
      historyId: scope.history.id,
      historyType: scope.history.type,
      historyTitle: scope.history.title,
      projectId: scope.history.projectId,
      projectSlug: scope.history.projectSlug,
      projectName: scope.history.projectName,
      currentSessionId: selectedSession?.id || scope.session?.id || null,
      currentSessionTitle: selectedSession?.title || scope.session?.title || null,
      oldestSequence: page.oldestSequence,
      newestSequence: page.newestSequence,
      hasNewer:
        page.newestSequence != null &&
        page.historyMaxSequence > 0 &&
        page.newestSequence < page.historyMaxSequence,
      emptyCurrentSession: selectedSession ? selectedSession.messageCount === 0 : false,
    };

    return {
      scope,
      sessions,
      conversation,
      project: scope.project,
    };
  } catch {
    return null;
  }
}

export async function loadRecentBrainSources(limit = 5): Promise<BrainRecentSource[]> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    let result: any = await store
      .from('brain_ingestion_jobs')
      .select('id,title,source_type,source_format,status,error_code,created_at,document_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Older deployments may not have the unified source columns yet.
    if (result.error) {
      result = await store
        .from('brain_ingestion_jobs')
        .select('id,title,status,error_code,created_at,document_id')
        .order('created_at', { ascending: false })
        .limit(limit);
    }

    const data = result.data;
    if (result.error || !Array.isArray(data)) return [];

    return data.map((row) => ({
      id: String(row.id || ''),
      title: typeof row.title === 'string' ? row.title : null,
      sourceType: typeof row.source_type === 'string' ? row.source_type : null,
      sourceFormat: typeof row.source_format === 'string' ? row.source_format : null,
      status: typeof row.status === 'string' ? row.status : null,
      errorCode: typeof row.error_code === 'string' ? row.error_code : null,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
      documentId: typeof row.document_id === 'string' ? row.document_id : null,
    }));
  } catch {
    return [];
  }
}
