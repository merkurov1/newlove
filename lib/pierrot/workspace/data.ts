import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { isGeminiConfigured } from '@/lib/ai/gemini';
import { loadCommercialSummary } from '@/lib/pierrot/commercialIntelligence';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrainRecentSource,
  FlowItemRow,
  IntegrationSnapshot,
  ModelSnapshot,
  OwnerConversation,
  OwnerConversationListItem,
  WorkspaceMetric,
  WorkspaceMetricKey,
  WorkspaceOverview,
  WorkspacePeriod,
} from './types';
import { buildOverviewSummary, classifyMetricState } from './status';

assertServerOnly('lib/pierrot/workspace/data');

const DAY_MS = 24 * 60 * 60 * 1000;

const METRIC_META: Array<{
  key: WorkspaceMetricKey;
  label: string;
  table: string;
  dateColumn: string;
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
  to: string,
  configure?: (query: any) => any
): Promise<string[] | null> {
  try {
    let query = store.from(table).select(column).gte(column, from).lte(column, to).limit(10000);
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
  const periodStartDate = startOfUtcDay(new Date(now.getTime() - (period - 1) * DAY_MS));
  const previousStartDate = new Date(periodStartDate.getTime() - period * DAY_MS);
  const periodStart = periodStartDate.getTime();

  const [total, timestamps] = await Promise.all([
    readCount(store, meta.table, meta.totalFilter),
    readTimestamps(
      store,
      meta.table,
      meta.dateColumn,
      isoDay(previousStartDate),
      isoDay(now),
      meta.periodFilter
    ),
  ]);

  const series = timestamps ? bucketSeries(timestamps, periodStart, period) : null;
  const periodCount = series ? series.reduce((sum, value) => sum + value, 0) : 0;
  const previousCount = timestamps
    ? timestamps.filter((value) => {
        const time = new Date(value).getTime();
        return Number.isFinite(time) && time >= previousStartDate.getTime() && time < periodStart;
      }).length
    : 0;

  return {
    key: meta.key,
    label: meta.label,
    current: total.value,
    periodCount,
    previousCount,
    state: series ? classifyMetricState(periodCount, previousCount) : null,
    series,
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
  const periodStartDate = startOfUtcDay(new Date(now.getTime() - (period - 1) * DAY_MS));

  const [metrics, commercial] = await Promise.all([
    Promise.all(METRIC_META.map((meta) => loadMetric(store, meta, period, now))),
    loadCommercialSummary({
      store,
      periodKey: period === 30 ? 'last_30_days' : 'last_7_days',
      now,
    }).catch(() =>
      emptyCommercialSummary(period === 30 ? 'last_30_days' : 'last_7_days', now)
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
  };
}

function truncateTitle(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 92 ? `${clean.slice(0, 89).trimEnd()}…` : clean;
}

export async function loadOwnerConversations(
  ownerUserId: string,
  limit = 40
): Promise<OwnerConversationListItem[]> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await store
      .from('pierrot_conversations')
      .select(
        'id,session_id,started_at,updated_at,last_message_at,consent_state,identity_type,user_id'
      )
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data) || data.length === 0) return [];

    const ids = data
      .map((row) => (typeof row.id === 'string' ? row.id : null))
      .filter((value): value is string => Boolean(value));

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

    return data
      .filter(
        (row) =>
          typeof row.id === 'string' &&
          typeof row.session_id === 'string' &&
          typeof row.started_at === 'string' &&
          (counts.get(row.id as string) || 0) > 0
      )
      .map((row) => ({
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
  conversationId: string
): Promise<OwnerConversation | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) return null;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data: conversation, error } = await store
      .from('pierrot_conversations')
      .select('id,session_id,started_at,consent_state,identity_type,user_id')
      .eq('id', conversationId)
      .eq('identity_type', 'owner')
      .eq('user_id', ownerUserId)
      .maybeSingle();

    if (error || !conversation || typeof conversation.session_id !== 'string') return null;

    const { data: rows, error: messagesError } = await store
      .from('pierrot_messages')
      .select('id,role,content,message_index,provider,created_at')
      .eq('conversation_id', conversationId)
      .order('message_index', { ascending: true })
      .limit(500);

    if (messagesError) return null;

    const messages = (Array.isArray(rows) ? rows : [])
      .filter(
        (row): row is {
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
      )
      .map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: typeof row.created_at === 'string' ? row.created_at : null,
        provider: typeof row.provider === 'string' ? row.provider : null,
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
    };
  } catch {
    return null;
  }
}

export async function loadRecentFlowItems(limit = 8): Promise<FlowItemRow[]> {
  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await store
      .from('items')
      .select(
        'id,title,slug,body_md,source_url,type,lang,status,visibility,metadata,published_at,created_at,updated_at'
      )
      .in('status', ['published', 'draft'])
      .eq('visibility', 'public')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) return [];
    return data as unknown as FlowItemRow[];
  } catch {
    return [];
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

export function loadIntegrationSnapshot(): IntegrationSnapshot {
  return {
    blueskyConfigured: Boolean(
      (process.env.BLUESKY_IDENTIFIER || '').trim() &&
        (process.env.BLUESKY_PASSWORD || '').trim()
    ),
    telegramConfigured: Boolean(
      (process.env.TELEGRAM_BOT_TOKEN || '').trim() &&
        (process.env.TELEGRAM_CHANNEL_ID || '').trim()
    ),
    // No GitHub OAuth flow exists in this repository. A token used by the
    // knowledge admin endpoint is not a user connection and must not be
    // presented as one.
    githubOAuth: false,
  };
}

export function loadModelSnapshot(): ModelSnapshot {
  const gemini = isGeminiConfigured();
  const deepseek = Boolean((process.env.DEEPSEEK_API_KEY || '').trim());
  const openrouter = Boolean((process.env.OPENROUTER_API_KEY || '').trim());

  const fallback: string[] = [];
  if (deepseek) fallback.push('deepseek-chat');
  if (openrouter) fallback.push('deepseek/deepseek-chat via OpenRouter');

  return {
    primary: gemini
      ? 'gemini-3.5-flash'
      : deepseek
        ? 'deepseek-chat'
        : openrouter
          ? 'deepseek/deepseek-chat via OpenRouter'
          : null,
    fallback,
    configured: gemini || deepseek || openrouter,
  };
}
