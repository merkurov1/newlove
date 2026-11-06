import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasExplicitWebCommand } from '@/lib/knowledge/web/searchDecision';
import { getDevRepositoryConfig } from '@/lib/pierrot/dev/repositories';
import {
  createDevTask,
  findDevTaskByDecisionId,
} from '@/lib/pierrot/dev/tasks';
import type { DevRepositoryKey, DevTask } from '@/lib/pierrot/dev/types';
import { updateMemoryRecord } from './store';
import type { PierrotMemoryRecord } from './types';
import { getPierrotProjectForConversation, listPierrotProjects } from '@/lib/pierrot/projects/store';
import { matchUniqueProjectMention } from '@/lib/pierrot/projects/matching';

assertServerOnly('lib/pierrot/memory/devBridge');

export type DevTaskBridgeAction = 'none' | 'create' | 'transfer';

export type DevTaskBridgeIntent = {
  action: DevTaskBridgeAction;
  repository: DevRepositoryKey | null;
  content: string | null;
  query: string | null;
  explicit: boolean;
  confidence: number;
  reason: string;
};

type HistoryItem = { role: 'user' | 'assistant'; content: string };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRANSFER_COMMAND =
  /(?:^|\s)(?:перенеси(?:те)?|перенести|отправь(?:те)?|отправить|импортируй(?:те)?|импортировать|сделай(?:те)?\s+(?:из\s+этого|из\s+неё|из\s+нее)|move|transfer|import)(?=\s|$)[^.!?]{0,120}(?:dev|dev\s*mode|dev[- ]?задач|engineering\s+task|разработ)/i;

const EXPLICIT_DEV_COMMAND =
  /(?:^|\s)(?:созда(?:й|йте)|создать|добав(?:ь|ьте)|добавить|завед(?:и|ите)|завести|оформ(?:и|ите)|оформить|сдела(?:й|йте)|сделать|create|add|make|open)(?=\s|$)[^.!?]{0,120}(?:dev|dev\s*mode|dev[- ]?задач|engineering\s+task|разработ)/i;

const EXPLICIT_DEV_STATEMENT =
  /(?:^|\s)(?:это|this\s+is)\s+(?:задача|task)\s+(?:по\s+разработке|for\s+development|dev)|(?:^|\s)(?:задача|task)\s+(?:относится|belongs)\s+(?:к\s+)?dev/i;

const DEV_TERMS =
  /(?:dev\s*mode|dev-mode|newlove|pierrot|репозитор[а-я]*|github|supabase|vercel|api|route|маршрут|компонент|миграц[а-я]*|сборк[а-я]*|тест[а-я]*|commit|pull\s+request|\bpr\b|deploy|opencode|логи|log|ошибк[а-я]*|баг[а-я]*|\berror\b|\bbug\b|код[а-я]*|\bcode\b|refactor|рефактор|typescript|next\.?js|expo|pwa|workspace)/i;

const ENGINEERING_ACTION =
  /(?:исправ[а-я]*|провер[а-я]*|улучш[а-я]*|разбер[а-я]*|найд[а-я]*|почин[а-я]*|обнов[а-я]*|добав[а-я]*|удал[а-я]*|реализ[а-я]*|напис[а-я]*|протест[а-я]*|собер[а-я]*|собрать|задепло[а-я]*|проанализ[а-я]*|исслед[а-я]*|оптимиз[а-я]*|отлад[а-я]*|fix|check|improve|debug|refactor|implement|update|test|build|deploy|investigate|analy[sz]e)/i;

const REMINDER_TERMS =
  /(?:напомни|напоминание|remind|позвони|позвонить|купи|купить|встрет|обед|ужин|завтрак|врач|аптек|забер[а-я]*|оплат[а-я]*|день\s+рожд)/i;

function detectRepository(message: string): DevRepositoryKey | null {
  const text = normalize(message);

  if (/(?:^|\s)(?:newlove|dev\s*mode|dev-mode|pwa|owner\s+workspace|supabase|vercel|api\s+route)(?=\s|$)/i.test(text)) {
    return 'newlove';
  }
  if (/(?:^|\s)(?:pierrot\s+(?:repo|repository|mobile|app)|репозитор[а-я]*\s+pierrot|проект[а-я]*\s+pierrot|expo|mobile\s+client|ios\s+app)(?=\s|$)/i.test(text)) {
    return 'pierrot';
  }
  if (/(?:^|\s)pierrot(?=\s|$)/i.test(text)) return 'pierrot';

  return null;
}

function cleanRemainder(value: string): string | null {
  const cleaned = value
    .replace(/^[\s:—–,.-]+/, '')
    .replace(/^(?:что|how|to)\s+/i, '')
    .replace(/^(?:задачу|задача|запись|заметку|напоминание|task|note|record|reminder)\s+/i, '')
    .replace(/^(?:про|о|об|по|about|on|for)\s+/i, '')
    .replace(/[\s?.!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4_000);

  return cleaned || null;
}

function commandRemainder(message: string): string | null {
  const patterns: RegExp[] = [
    /^(?:пожалуйста[,\s]*)?(?:созда(?:й|йте)|создать|добав(?:ь|ьте)|добавить|завед(?:и|ите)|завести|оформ(?:и|ите)|оформить|create|add|make|open)\s+(?:новую\s+|new\s+)?(?:задачу|таск|task)\s+(?:в|во|for|in)\s+dev(?:\s*mode)?\s*[:—–-]?\s*/i,
    /^(?:пожалуйста[,\s]*)?(?:добав(?:ь|ьте)|добавить|занеси(?:те)?|занести|перенеси(?:те)?|перенести|отправь(?:те)?|отправить|импортируй(?:те)?|импортировать|move|transfer|import)\s+(?:это\s+|эту\s+|этот\s+|ее\s+|её\s+|его\s+|it\s+|this\s+)?(?:в|во|to|into)\s+dev(?:\s*mode)?\s*[:—–-]?\s*/i,
    /^(?:это|this\s+is)\s+(?:задача|task)\s+(?:по\s+разработке|for\s+development|dev)\s*[:—–-]?\s*/i,
    /^(?:задача|task)\s+(?:относится|belongs)\s+(?:к\s+)?dev(?:\s*mode)?\s*[:—–-]?\s*/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return cleanRemainder(message.slice(match[0].length));
  }

  return null;
}

function isReminderOnly(message: string): boolean {
  return REMINDER_TERMS.test(normalize(message));
}

export function looksLikeEngineeringTask(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;

  if (isReminderOnly(text) && !EXPLICIT_DEV_COMMAND.test(text) && !EXPLICIT_DEV_STATEMENT.test(text)) {
    return false;
  }

  // A web request is a research request, not permission to create a Dev task.
  if (hasExplicitWebCommand(message) && !EXPLICIT_DEV_COMMAND.test(text)) {
    return false;
  }

  if (EXPLICIT_DEV_COMMAND.test(text) || EXPLICIT_DEV_STATEMENT.test(text)) return true;
  if (!DEV_TERMS.test(text)) return false;
  if (!ENGINEERING_ACTION.test(text)) return false;

  const repository = detectRepository(text);
  return Boolean(repository) || /dev\s*mode|dev-mode/i.test(text);
}

/**
 * Deterministic side-effect-free classification. It only decides whether the
 * message should become a Dev task; the route performs the write.
 */
export function detectDevTaskIntent(
  message: string,
  _options: { history?: HistoryItem[]; previousWebQuery?: string | null } = {}
): DevTaskBridgeIntent {
  void _options;
  const original = typeof message === 'string' ? message.trim() : '';
  const text = normalize(original);

  if (!text) {
    return {
      action: 'none',
      repository: null,
      content: null,
      query: null,
      explicit: false,
      confidence: 0,
      reason: 'empty',
    };
  }

  const repository = detectRepository(original);
  const transfer = TRANSFER_COMMAND.test(text);
  const explicitCommand = EXPLICIT_DEV_COMMAND.test(text);
  const explicitStatement = EXPLICIT_DEV_STATEMENT.test(text);
  const explicit = transfer || explicitCommand || explicitStatement;
  const auto = looksLikeEngineeringTask(original);
  const remainder = commandRemainder(original);

  if (transfer) {
    return {
      action: 'transfer',
      repository,
      content: null,
      query: remainder,
      explicit: true,
      confidence: 0.96,
      reason: 'explicit_dev_transfer',
    };
  }

  if (explicit || auto) {
    return {
      action: 'create',
      repository,
      content: remainder,
      query: null,
      explicit,
      confidence: explicit ? 0.95 : 0.78,
      reason: explicit ? 'explicit_dev_task' : 'engineering_task_detected',
    };
  }

  return {
    action: 'none',
    repository: null,
    content: null,
    query: null,
    explicit: false,
    confidence: 0.95,
    reason: 'not_a_dev_task',
  };
}

function repositoryFromRecord(record: PierrotMemoryRecord): DevRepositoryKey {
  const project = normalize(record.project || '');
  if (project.includes('pierrot')) return 'pierrot';
  return 'newlove';
}

function titleFromContent(content: string): string {
  const first = content.split(/[.!?\n]/)[0]?.trim() || content.trim();
  return (first.length > 96 ? `${first.slice(0, 93).trimEnd()}…` : first).slice(0, 200);
}

export async function createDevTaskFromChat(input: {
  userId: string;
  content: string;
  title?: string | null;
  repository?: DevRepositoryKey | null;
  conversationId?: string | null;
  originalMessage?: string;
}): Promise<DevTask> {
  const repositoryKey = input.repository || 'newlove';
  const config = getDevRepositoryConfig(repositoryKey);
  const content = input.content.trim();
  const cleanTitle = (input.title || '')
    .trim()
    .replace(/^(?:пожалуйста[,\s]*)?(?:нужно|надо|стоит)\s+/i, '')
    .split(/[.!?\n]/)[0]
    ?.trim();
  const title =
    cleanTitle && cleanTitle.length > 3
      ? cleanTitle.length > 96
        ? `${cleanTitle.slice(0, 93).trimEnd()}…`
        : cleanTitle
      : titleFromContent(content);

  let projectId: string | null = null;
  try {
    if (input.conversationId) {
      projectId = (
        await getPierrotProjectForConversation(input.userId, input.conversationId)
      )?.id || null;
    }
    if (!projectId) {
      const projects = await listPierrotProjects(input.userId);
      projectId = matchUniqueProjectMention(projects, `${input.originalMessage || ''} ${content}`)?.id || null;
    }
  } catch {
    projectId = null;
  }

  return createDevTask(input.userId, {
    title: title || 'Инженерное задание из чата Pierrot',
    objective: content,
    context: [
      'Создано из команды в чате Pierrot Dev.',
      input.originalMessage
        ? `Исходное сообщение: ${input.originalMessage.slice(0, 1_000)}`
        : null,
      `Репозиторий: ${config.fullName}.`,
    ]
      .filter(Boolean)
      .join('\n'),
    repository: repositoryKey,
    baseRef: config.workBranch,
    baseCommit: null,
    affectedFiles: [],
    currentBehavior: '',
    requiredBehavior: '',
    technicalPlan: '',
    backendChanges: [],
    frontendChanges: [],
    databaseChanges: [],
    mobileChanges: [],
    migrations: [],
    securityConstraints: [],
    tests: [],
    acceptanceCriteria: [],
    unverified: [],
    conversationId: input.conversationId || null,
    projectId,
    decisionIds: [],
    status: 'draft',
  });
}

export type TransferMemoryToDevResult = {
  task: DevTask;
  created: boolean;
  alreadyLinked: boolean;
  linkPersisted: boolean;
  sourceRecord: PierrotMemoryRecord;
};

export async function transferMemoryRecordToDev(input: {
  store: SupabaseClient;
  userId: string;
  record: PierrotMemoryRecord;
  repository?: DevRepositoryKey | null;
  titleOverride?: string;
  objectiveOverride?: string;
  contextOverride?: string;
  acceptanceCriteria?: string[];
  tests?: string[];
}): Promise<TransferMemoryToDevResult> {
  const existing = await findDevTaskByDecisionId(input.userId, input.record.id);
  if (existing) {
    return {
      task: existing,
      created: false,
      alreadyLinked: true,
      linkPersisted: true,
      sourceRecord: input.record,
    };
  }

  const repositoryKey =
    input.repository || repositoryFromRecord(input.record);
  const config = getDevRepositoryConfig(repositoryKey);
  const title =
    input.titleOverride?.trim() ||
    input.record.title ||
    titleFromContent(input.record.content);
  const objective =
    input.objectiveOverride?.trim() ||
    input.record.content ||
    input.record.title;
  const context =
    input.contextOverride?.trim() ||
    [
      `Источник: pierrot_decisions:${input.record.id}`,
      `Тип записи: ${input.record.kind}; статус: ${input.record.status}.`,
      input.record.project ? `Проект: ${input.record.project}.` : null,
      input.record.tags.length > 0 ? `Теги: ${input.record.tags.join(', ')}.` : null,
      '',
      input.record.content,
    ]
      .filter((line) => line !== null)
      .join('\n');

  const task = await createDevTask(input.userId, {
    title,
    objective,
    context,
    repository: repositoryKey,
    baseRef: config.workBranch,
    baseCommit: null,
    affectedFiles: [],
    currentBehavior: '',
    requiredBehavior: '',
    technicalPlan: '',
    backendChanges: [],
    frontendChanges: [],
    databaseChanges: [],
    mobileChanges: [],
    migrations: [],
    securityConstraints: [],
    tests: input.tests || [],
    acceptanceCriteria: input.acceptanceCriteria || [],
    unverified: [],
    conversationId: input.record.conversationId,
    decisionIds: [input.record.id],
    status: 'draft',
  });

  const link = {
    type: 'dev_task',
    taskId: task.id,
    repository: repositoryKey,
    status: task.status,
    createdAt: new Date().toISOString(),
  };
  const sourceRefs = [
    ...input.record.sourceRefs.filter(
      (ref) =>
        !(
          ref &&
          typeof ref === 'object' &&
          (ref as Record<string, unknown>).type === 'dev_task' &&
          (ref as Record<string, unknown>).taskId === task.id
        )
    ),
    link,
  ].slice(-20);
  const tags = Array.from(new Set([...input.record.tags, 'dev-task'])).slice(0, 10);
  let linkPersisted = true;

  try {
    await updateMemoryRecord(input.store, input.userId, input.record.id, {
      sourceRefs,
      tags,
      eventReason: 'dev_task_created',
      eventSource: 'dev_bridge',
    });
  } catch {
    // The Dev task stores the source decision id in decision_ids, so a retry
    // remains idempotent even if this provenance write fails.
    linkPersisted = false;
  }

  return {
    task,
    created: true,
    alreadyLinked: false,
    linkPersisted,
    sourceRecord: input.record,
  };
}
