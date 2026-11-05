import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMemoryRecords } from '@/lib/pierrot/memory/store';
import { listSkills } from '@/lib/pierrot/skills/store';
import type { SkillAnalysisSourceStatus } from '../types';
import type { AnalysisEvidenceBundle, AnalysisToolEvent, AnalysisWorkItem } from './evidence';

assertServerOnly('lib/pierrot/skills/analysis/collect');

const SOURCE_TIMEOUT_MS = 12_000;
const MAX_CONVERSATIONS = 30;
const MAX_DEV_CONVERSATIONS = 20;
const MAX_MESSAGES = 1_600;
const MAX_DEV_TASKS = 60;
const MAX_DEV_REQUESTS = 200;
const MAX_EVENTS = 2_000;
const MAX_MEMORIES = 200;

type QueryResult<T> = { ok: true; data: T } | { ok: false; error: unknown };

function withTimeout<T>(
  value: PromiseLike<T> | Promise<T>,
  fallback: T,
  timeoutMs = SOURCE_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return Promise.race([
    Promise.resolve(value),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function missingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST205|42P01|relation .* does not exist/i.test(value);
}

function missingColumn(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST204|42703|column .* does not exist/i.test(value);
}

function source(
  key: SkillAnalysisSourceStatus['key'],
  label: string,
  status: SkillAnalysisSourceStatus['status'],
  count: number,
  note: string
): SkillAnalysisSourceStatus {
  return { key, label, status, count, note };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function text(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(180, Math.max(7, Math.trunc(value)));
}

function buildWorkItems(input: {
  conversations: Array<{ id: string; startedAt: string }>;
  messages: Array<{
    id: string;
    conversationId: string;
    role: string;
    content: string;
    index: number;
    createdAt: string | null;
  }>;
  mode: 'site' | 'dev';
}): AnalysisWorkItem[] {
  const items: AnalysisWorkItem[] = [];
  const messagesByConversation = new Map<string, typeof input.messages>();

  for (const message of input.messages) {
    const list = messagesByConversation.get(message.conversationId) || [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }

  for (const conversation of input.conversations) {
    const messages = (messagesByConversation.get(conversation.id) || []).sort(
      (left, right) => left.index - right.index
    );

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index];
      if (message.role !== 'user') continue;
      if (message.content.trim().length < 34) continue;

      const next = messages.slice(index + 1).find((candidate) => candidate.role === 'assistant');
      items.push({
        id: `${input.mode}-message-${message.id}`,
        source: input.mode === 'dev' ? 'dev_task' : 'owner_chat',
        date: message.createdAt || conversation.startedAt,
        text: text(message.content).slice(0, 2_000),
        assistantText: next ? text(next.content).slice(0, 2_000) : null,
        conversationId: conversation.id,
        href:
          input.mode === 'dev'
            ? '/admin/pierrot/dev'
            : `/admin/pierrot?conversation=${conversation.id}`,
        tools: [],
        labels: [input.mode === 'dev' ? 'Dev Mode' : 'Owner chat'],
      });
    }
  }

  return items;
}

export async function collectSkillAnalysisEvidence(input: {
  store: SupabaseClient;
  userId: string;
  days?: number;
  now?: Date;
}): Promise<AnalysisEvidenceBundle> {
  const days = clampDays(input.days ?? 30);
  const now = input.now ?? new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const { store, userId } = input;

  let [siteConversationsResult, devConversationsResult] = await Promise.all([
    withTimeout(
      store
        .from('pierrot_conversations')
        .select('id,started_at,updated_at,last_message_at,mode')
        .eq('identity_type', 'owner')
        .eq('user_id', userId)
        .eq('mode', 'site')
        .gte('started_at', periodStart)
        .order('started_at', { ascending: false })
        .limit(MAX_CONVERSATIONS),
      { data: null, error: new Error('timeout') } as unknown as {
        data: unknown;
        error: unknown;
      }
    ),
    withTimeout(
      store
        .from('pierrot_conversations')
        .select('id,started_at,updated_at,last_message_at,mode')
        .eq('identity_type', 'owner')
        .eq('user_id', userId)
        .eq('mode', 'dev')
        .gte('started_at', periodStart)
        .order('started_at', { ascending: false })
        .limit(MAX_DEV_CONVERSATIONS),
      { data: null, error: new Error('timeout') } as unknown as {
        data: unknown;
        error: unknown;
      }
    ),
  ]);

  const modeMissing =
    (siteConversationsResult.error && missingColumn(siteConversationsResult.error)) ||
    (devConversationsResult.error && missingColumn(devConversationsResult.error));

  if (siteConversationsResult.error && missingColumn(siteConversationsResult.error)) {
    // Dev Mode has not been migrated yet. Owner chat still exists, so load it
    // without the optional mode column and report Dev Mode as unavailable.
    siteConversationsResult = await withTimeout(
      store
        .from('pierrot_conversations')
        .select('id,started_at,updated_at,last_message_at')
        .eq('identity_type', 'owner')
        .eq('user_id', userId)
        .gte('started_at', periodStart)
        .order('started_at', { ascending: false })
        .limit(MAX_CONVERSATIONS),
      { data: null, error: new Error('timeout') } as unknown as {
        data: unknown;
        error: unknown;
      }
    );
  }

  const siteRows = Array.isArray(siteConversationsResult.data) ? siteConversationsResult.data : [];
  const devRows = Array.isArray(devConversationsResult.data) ? devConversationsResult.data : [];
  const modeAvailable =
    !modeMissing && !siteConversationsResult.error && !devConversationsResult.error;

  const siteConversations = siteRows
    .map((row) => {
      const record = asRecord(row);
      if (!record || typeof record.id !== 'string') return null;
      return {
        id: record.id,
        startedAt:
          typeof record.started_at === 'string'
            ? record.started_at
            : typeof record.updated_at === 'string'
              ? record.updated_at
              : periodStart,
      };
    })
    .filter((row): row is { id: string; startedAt: string } => row !== null);

  const devConversations = devRows
    .map((row) => {
      const record = asRecord(row);
      if (!record || typeof record.id !== 'string') return null;
      return {
        id: record.id,
        startedAt:
          typeof record.started_at === 'string'
            ? record.started_at
            : typeof record.updated_at === 'string'
              ? record.updated_at
              : periodStart,
      };
    })
    .filter((row): row is { id: string; startedAt: string } => row !== null);

  const conversationIds = [...siteConversations, ...devConversations].map((row) => row.id);

  const messagesResult = await withTimeout(
    conversationIds.length > 0
      ? store
          .from('pierrot_messages')
          .select('id,conversation_id,role,content,message_index,created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: true })
          .limit(MAX_MESSAGES)
      : Promise.resolve({ data: [], error: null }),
    { data: [], error: new Error('timeout') } as unknown as { data: unknown; error: unknown }
  );

  const messageRows = Array.isArray(messagesResult.data) ? messagesResult.data : [];
  const messages = messageRows
    .map((row) => {
      const record = asRecord(row);
      if (
        !record ||
        typeof record.id !== 'string' ||
        typeof record.conversation_id !== 'string' ||
        (record.role !== 'user' && record.role !== 'assistant') ||
        typeof record.content !== 'string'
      ) {
        return null;
      }

      return {
        id: record.id,
        conversationId: record.conversation_id,
        role: record.role as 'user' | 'assistant',
        content: record.content,
        index: typeof record.message_index === 'number' ? record.message_index : 0,
        createdAt: typeof record.created_at === 'string' ? record.created_at : null,
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        conversationId: string;
        role: 'user' | 'assistant';
        content: string;
        index: number;
        createdAt: string | null;
      } => row !== null
    );

  const siteIds = new Set(siteConversations.map((row) => row.id));
  const devIds = new Set(devConversations.map((row) => row.id));

  const workItems: AnalysisWorkItem[] = [
    ...buildWorkItems({
      conversations: siteConversations,
      messages: messages.filter((message) => siteIds.has(message.conversationId)),
      mode: 'site',
    }),
    ...buildWorkItems({
      conversations: devConversations,
      messages: messages.filter((message) => devIds.has(message.conversationId)),
      mode: 'dev',
    }),
  ];

  let [devTasksResult, devRequestsResult, eventsResult, memoriesResult, skillsResult] =
    await Promise.all([
      withTimeout(
        store
          .from('pierrot_dev_prompts')
          .select(
            'id,title,task,objective,context,current_behavior,technical_plan,required_behavior,status,repository,verification_status,conversation_id,created_at,updated_at'
          )
          .eq('user_id', userId)
          .gte('updated_at', periodStart)
          .order('updated_at', { ascending: false })
          .limit(MAX_DEV_TASKS),
        { data: [], error: new Error('timeout') } as unknown as { data: unknown; error: unknown }
      ),
      withTimeout(
        store
          .from('pierrot_dev_requests')
          .select(
            'request_id,conversation_id,status,started_at,finished_at,tool_trace,side_effects,error_code'
          )
          .eq('user_id', userId)
          .gte('started_at', periodStart)
          .order('started_at', { ascending: false })
          .limit(MAX_DEV_REQUESTS),
        { data: [], error: new Error('timeout') } as unknown as { data: unknown; error: unknown }
      ),
      withTimeout(
        conversationIds.length > 0
          ? store
              .from('pierrot_events')
              .select('id,conversation_id,event_name,payload,created_at')
              .in('conversation_id', conversationIds)
              .order('created_at', { ascending: false })
              .limit(MAX_EVENTS)
          : Promise.resolve({ data: [], error: null }),
        { data: [], error: new Error('timeout') } as unknown as { data: unknown; error: unknown }
      ),
      withTimeout(
        listMemoryRecords(store, {
          userId,
          statuses: ['current', 'completed', 'archived', 'superseded'],
          limit: MAX_MEMORIES,
        })
          .then((data) => ({ ok: true as const, data }))
          .catch((error) => ({ ok: false as const, error })),
        { ok: false as const, error: new Error('timeout') }
      ),
      withTimeout(
        listSkills(store, userId, { limit: 100 })
          .then((data) => ({ ok: true as const, data }))
          .catch((error) => ({ ok: false as const, error })),
        { ok: false as const, error: new Error('timeout') }
      ),
    ]);

  if (devTasksResult.error && missingColumn(devTasksResult.error)) {
    devTasksResult = await withTimeout(
      store
        .from('pierrot_dev_prompts')
        .select('id,title,task,status,repository,conversation_id,created_at,updated_at')
        .eq('user_id', userId)
        .gte('updated_at', periodStart)
        .order('updated_at', { ascending: false })
        .limit(MAX_DEV_TASKS),
      { data: [], error: new Error('timeout') } as unknown as { data: unknown; error: unknown }
    );
  }

  const devTaskRows = Array.isArray(devTasksResult.data) ? devTasksResult.data : [];
  const devTasks = devTaskRows
    .map((row) => {
      const record = asRecord(row);
      if (!record || typeof record.id !== 'string') return null;
      const title = stringValue(record.title) || stringValue(record.task) || 'Dev task';
      const body = [
        stringValue(record.objective),
        stringValue(record.context),
        stringValue(record.current_behavior),
        stringValue(record.technical_plan),
        stringValue(record.required_behavior),
      ]
        .filter(Boolean)
        .join(' ');

      return {
        id: record.id,
        title,
        status: stringValue(record.status) || 'unknown',
        repository: stringValue(record.repository) || 'unknown',
        date:
          typeof record.updated_at === 'string'
            ? record.updated_at
            : typeof record.created_at === 'string'
              ? record.created_at
              : null,
        verificationStatus:
          typeof record.verification_status === 'string' ? record.verification_status : null,
        conversationId: typeof record.conversation_id === 'string' ? record.conversation_id : null,
        text: text(`${title} ${body}`).slice(0, 2_000),
      };
    })
    .filter(
      (
        row
      ): row is {
        id: string;
        title: string;
        status: string;
        repository: string;
        date: string | null;
        verificationStatus: string | null;
        conversationId: string | null;
        text: string;
      } => row !== null
    );

  for (const task of devTasks) {
    if (task.text.length < 34) continue;
    workItems.push({
      id: `dev-task-${task.id}`,
      source: 'dev_task',
      date: task.date,
      text: task.text,
      assistantText: null,
      conversationId: task.conversationId,
      href: '/admin/pierrot/dev',
      tools: [],
      labels: [task.repository, task.status],
    });
  }

  const devRequestRows = Array.isArray(devRequestsResult.data) ? devRequestsResult.data : [];
  const devRequests: AnalysisEvidenceBundle['devRequests'] = [];
  const devToolEvents: AnalysisToolEvent[] = [];

  for (const row of devRequestRows) {
    const record = asRecord(row);
    if (!record) continue;
    const requestId = stringValue(record.request_id);
    if (!requestId) continue;
    const date = typeof record.started_at === 'string' ? record.started_at : null;
    const conversationId =
      typeof record.conversation_id === 'string' ? record.conversation_id : null;
    const trace = Array.isArray(record.tool_trace) ? record.tool_trace : [];
    const tools = trace
      .map((entry) => {
        const item = asRecord(entry);
        return item ? stringValue(item.name) : '';
      })
      .filter(Boolean);

    devRequests.push({
      id: requestId,
      conversationId,
      status: stringValue(record.status) || 'unknown',
      date,
      tools,
      sideEffectCount: Array.isArray(record.side_effects) ? record.side_effects.length : 0,
    });

    for (const entry of trace) {
      const item = asRecord(entry);
      if (!item) continue;
      devToolEvents.push({
        id: `${requestId}:${stringValue(item.name) || 'tool'}`,
        conversationId,
        eventName: 'dev_tool',
        tool: stringValue(item.name) || null,
        operation: null,
        sourceModes: [],
        ok: item.ok === true ? true : item.ok === false ? false : null,
        date: typeof item.durationMs === 'number' ? date : typeof date === 'string' ? date : null,
      });
    }
  }

  const eventRows = Array.isArray(eventsResult.data) ? eventsResult.data : [];
  const toolEvents: AnalysisToolEvent[] = [];

  for (const row of eventRows) {
    const record = asRecord(row);
    if (!record || typeof record.id !== 'string' || typeof record.event_name !== 'string') {
      continue;
    }

    const payload = asRecord(record.payload) || {};
    const answerSources = asRecord(payload.answer_sources);
    const sourceStatus = asRecord(payload.source_status);
    const sourceModes = [
      answerSources && typeof answerSources.mode === 'string' ? answerSources.mode : '',
      ...(sourceStatus
        ? Object.keys(sourceStatus).filter((key) => sourceStatus[key] !== 'not_requested')
        : []),
    ].filter(Boolean);

    toolEvents.push({
      id: record.id,
      conversationId: typeof record.conversation_id === 'string' ? record.conversation_id : null,
      eventName: record.event_name,
      tool:
        typeof payload.tool === 'string'
          ? payload.tool
          : typeof payload.owner_tool === 'string'
            ? payload.owner_tool
            : null,
      operation: typeof payload.operation === 'string' ? payload.operation : null,
      sourceModes: Array.from(new Set(sourceModes)),
      ok: record.event_name === 'assistant_failed' ? false : null,
      date: typeof record.created_at === 'string' ? record.created_at : null,
    });
  }

  const memories = (memoriesResult.ok ? memoriesResult.data : [])
    .filter((record) => {
      if (!record.updatedAt) return true;
      return new Date(record.updatedAt).getTime() >= new Date(periodStart).getTime();
    })
    .map((record) => ({
      id: record.id,
      title: record.title,
      content: record.content,
      kind: record.kind,
      date: record.updatedAt || record.createdAt || null,
      project: record.project,
    }));

  for (const memory of memories) {
    if (!['task', 'decision', 'saved', 'memory'].includes(memory.kind)) continue;
    const content = text(`${memory.title} ${memory.content}`);
    if (content.length < 34) continue;
    workItems.push({
      id: `memory-${memory.id}`,
      source: 'memory',
      date: memory.date,
      text: content.slice(0, 2_000),
      assistantText: null,
      conversationId: null,
      href: '/admin/pierrot/memory',
      tools: [],
      labels: [memory.kind, memory.project || ''].filter(Boolean),
    });
  }

  const skills = skillsResult.ok ? skillsResult.data : [];
  const memoryUnavailable = !memoriesResult.ok;
  const skillsUnavailable = !skillsResult.ok;
  const devTasksUnavailable = Boolean(devTasksResult.error) && !missingTable(devTasksResult.error);
  const devRequestsUnavailable =
    Boolean(devRequestsResult.error) && !missingTable(devRequestsResult.error);

  const sourceStatuses: SkillAnalysisSourceStatus[] = [
    source(
      'owner_chat',
      'История диалогов владельца',
      siteConversationsResult.error || messagesResult.error
        ? siteConversations.length > 0
          ? 'partial'
          : 'unavailable'
        : 'available',
      siteConversations.length,
      siteConversationsResult.error
        ? 'История диалогов недоступна или загружена частично.'
        : `Загружено ${siteConversations.length} диалогов и ${messages.length} сообщений.`
    ),
    source(
      'memory',
      'Сохранённая память',
      memoryUnavailable ? 'unavailable' : 'available',
      memories.length,
      memoryUnavailable
        ? 'Память недоступна; отчёт не выдаёт этот источник за проверенный.'
        : `Загружено ${memories.length} записей памяти.`
    ),
    source(
      'dev_mode',
      'Dev Mode',
      !modeAvailable
        ? 'unavailable'
        : devTasksUnavailable || devRequestsUnavailable
          ? 'partial'
          : 'available',
      devTasks.length + devConversations.length + devRequests.length,
      !modeAvailable
        ? 'Dev Mode недоступен или миграция mode не применена.'
        : devTasksUnavailable || devRequestsUnavailable
          ? 'Часть Dev Mode источников недоступна; использованы только загруженные записи.'
          : `${devConversations.length} Dev-тредов, ${devTasks.length} задач, ${devRequests.length} запросов.`
    ),
    source(
      'tool_events',
      'История инструментов',
      eventsResult.error && devToolEvents.length === 0 ? 'unavailable' : 'available',
      toolEvents.length + devToolEvents.length,
      eventsResult.error
        ? 'События чата недоступны; использованы только Dev tool traces.'
        : `${toolEvents.length} событий чата и ${devToolEvents.length} Dev tool traces.`
    ),
    source(
      'existing_skills',
      'Существующие навыки',
      skillsUnavailable ? 'unavailable' : 'available',
      skills.length,
      skillsUnavailable
        ? 'Таблица навыков недоступна или миграция ещё не применена.'
        : `Загружено ${skills.length} навыков.`
    ),
    source(
      'brain',
      'Brain как контекст',
      'not_used',
      0,
      'Brain не используется как доказательство повторяемой работы; анализ опирается на реальную историю.'
    ),
  ];

  return {
    periodDays: days,
    periodStart,
    periodEnd,
    generatedAt: periodEnd,
    workItems,
    toolEvents: [...toolEvents, ...devToolEvents],
    memories,
    devTasks: devTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      repository: task.repository,
      date: task.date,
      verificationStatus: task.verificationStatus,
    })),
    devRequests,
    skills,
    sources: sourceStatuses,
    counts: {
      conversations: siteConversations.length + devConversations.length,
      messages: messages.length,
      devTasks: devTasks.length,
      devRequests: devRequests.length,
      memoryRecords: memories.length,
      toolTraceEvents: toolEvents.length + devToolEvents.length,
    },
  };
}
