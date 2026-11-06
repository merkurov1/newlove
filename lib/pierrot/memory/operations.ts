import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { PierrotMemoryIntent } from './intent';
import type { PierrotMemoryRecord, PierrotMemoryStatus } from './types';
import {
  listMemoryRecords,
  listMemoryRecordsByIds,
  searchMemory,
  updateMemoryRecord,
} from './store';
import { invalidateBrainStatus } from './brainCache';
import { listProjectTasks, resolveExactProject } from '@/lib/pierrot/projects/links';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

assertServerOnly('lib/pierrot/memory/operations');

export type MemoryOperationAction = 'complete' | 'archive' | 'forget' | 'delete' | 'restore';
export type MemoryOperationScope = 'single' | 'selection' | 'project' | 'all';

export type PendingMemoryOperation = {
  operationId: string;
  action: MemoryOperationAction;
  scope: MemoryOperationScope;
  targetIds: string[];
  projectId: string | null;
  projectName: string | null;
  requestedAt: string;
  expiresAt: string;
  titles: Array<{ id: string; title: string }>;
};

export type MemoryOperationResolution =
  | {
      status: 'resolved';
      action: MemoryOperationAction;
      scope: MemoryOperationScope;
      targets: PierrotMemoryRecord[];
      project: PierrotProject | null;
      requiresConfirmation: boolean;
    }
  | {
      status:
        | 'not_found'
        | 'ambiguous'
        | 'project_not_found'
        | 'project_ambiguous'
        | 'empty_project'
        | 'too_many'
        | 'no_target';
      action: MemoryOperationAction;
      scope: MemoryOperationScope;
      candidates: PierrotMemoryRecord[];
      projectRef: string | null;
    };

export type MemoryOperationOutcome = {
  status:
    | 'preview'
    | 'completed'
    | 'partial'
    | 'already'
    | 'cancelled'
    | 'not_found'
    | 'ambiguous'
    | 'project_not_found'
    | 'project_ambiguous'
    | 'empty_project'
    | 'too_many'
    | 'composition_changed';
  action: MemoryOperationAction;
  scope: MemoryOperationScope;
  changed: number;
  already: number;
  failed: number;
  targets: Array<{ id: string; title: string; status: string }>;
  candidates: Array<{ id: string; title: string; status: string }>;
  projectName: string | null;
  pending: PendingMemoryOperation | null;
  engine: 'rpc' | 'sequential' | null;
};

const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_OPERATION_TARGETS = 40;
const ACTIVE_STATUS: PierrotMemoryStatus = 'current';
const ARCHIVE_STATUSES: PierrotMemoryStatus[] = ['completed', 'archived', 'superseded', 'rejected'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function actionFromIntent(intent: PierrotMemoryIntent): MemoryOperationAction | null {
  if (
    intent.action === 'complete' ||
    intent.action === 'archive' ||
    intent.action === 'forget' ||
    intent.action === 'delete' ||
    intent.action === 'restore'
  ) {
    return intent.action;
  }
  return null;
}

export function memoryOperationAction(intent: PierrotMemoryIntent): MemoryOperationAction | null {
  return actionFromIntent(intent);
}

function scopeFromIntent(intent: PierrotMemoryIntent): MemoryOperationScope {
  if (intent.scope === 'project') return 'project';
  if (intent.scope === 'all') return 'all';
  if (intent.scope === 'selection') return 'selection';
  return 'single';
}

function singleStatuses(action: MemoryOperationAction): PierrotMemoryStatus[] {
  if (action === 'complete') return ['current', 'completed'];
  if (action === 'restore') return ARCHIVE_STATUSES;
  if (action === 'delete') return ['current', 'uncertain', ...ARCHIVE_STATUSES];
  return ['current', 'archived'];
}

function batchStatuses(action: MemoryOperationAction): PierrotMemoryStatus[] {
  if (action === 'restore') return ARCHIVE_STATUSES;
  if (action === 'delete') return ['current', 'uncertain', ...ARCHIVE_STATUSES];
  return [ACTIVE_STATUS];
}

function nextStatusFor(action: MemoryOperationAction): PierrotMemoryStatus {
  return action === 'complete' ? 'completed' : 'archived';
}

function isTaskKind(record: PierrotMemoryRecord): boolean {
  return record.kind === 'task' || record.kind === 'reminder';
}

function dedupe(records: PierrotMemoryRecord[], limit = 200): PierrotMemoryRecord[] {
  const seen = new Set<string>();
  const result: PierrotMemoryRecord[] = [];

  for (const record of records) {
    if (!record?.id || seen.has(record.id)) continue;
    seen.add(record.id);
    result.push(record);
    if (result.length >= limit) break;
  }

  return result;
}

function exactTitleMatches(records: PierrotMemoryRecord[], query: string): PierrotMemoryRecord[] {
  const needle = normalized(query);
  if (!needle) return [];
  return records.filter((record) => normalized(record.title) === needle);
}

export async function resolveMemoryOperation(input: {
  store: SupabaseClient;
  userId: string;
  intent: PierrotMemoryIntent;
  listContext: PierrotMemoryRecord[] | null;
}): Promise<MemoryOperationResolution> {
  const action = actionFromIntent(input.intent);
  const scope = scopeFromIntent(input.intent);

  if (!action) {
    return {
      status: 'no_target',
      action: 'complete',
      scope: 'single',
      candidates: [],
      projectRef: input.intent.projectRef,
    };
  }

  if (scope === 'project') {
    const projectRef = input.intent.projectRef?.trim() || '';
    if (!projectRef) {
      return {
        status: 'project_not_found',
        action,
        scope,
        candidates: [],
        projectRef: null,
      };
    }

    const resolved = await resolveExactProject(input.store, input.userId, projectRef);
    if (resolved.ambiguous) {
      return {
        status: 'project_ambiguous',
        action,
        scope,
        candidates: [],
        projectRef,
      };
    }
    if (!resolved.project) {
      return {
        status: 'project_not_found',
        action,
        scope,
        candidates: [],
        projectRef,
      };
    }

    const tasks = await listProjectTasks(input.store, input.userId, resolved.project.id, {
      statuses: batchStatuses(action),
      limit: 500,
    });

    if (tasks.length === 0) {
      return {
        status: 'empty_project',
        action,
        scope,
        candidates: [],
        projectRef,
      };
    }

    if (tasks.length > MAX_OPERATION_TARGETS) {
      return {
        status: 'too_many',
        action,
        scope,
        candidates: tasks.slice(0, 10),
        projectRef,
      };
    }

    return {
      status: 'resolved',
      action,
      scope,
      targets: tasks,
      project: resolved.project,
      requiresConfirmation: true,
    };
  }

  if (scope === 'all') {
    const tasks = await listMemoryRecords(input.store, {
      userId: input.userId,
      status: action === 'restore' ? undefined : 'active',
      statuses: batchStatuses(action),
      kinds: ['task', 'reminder'],
      limit: 200,
    });

    if (tasks.length === 0) {
      return {
        status: 'no_target',
        action,
        scope,
        candidates: [],
        projectRef: null,
      };
    }

    if (tasks.length > MAX_OPERATION_TARGETS) {
      return {
        status: 'too_many',
        action,
        scope,
        candidates: tasks.slice(0, 10),
        projectRef: null,
      };
    }

    return {
      status: 'resolved',
      action,
      scope,
      targets: dedupe(tasks),
      project: null,
      requiresConfirmation: true,
    };
  }

  if (scope === 'selection') {
    const context = dedupe(input.listContext || [], 100);
    let candidates = context.filter(
      (record) => isTaskKind(record) && batchStatuses(action).includes(record.status)
    );

    if (input.intent.listReference === 'last_two') candidates = candidates.slice(-2);

    if (candidates.length === 0) {
      return {
        status: 'not_found',
        action,
        scope,
        candidates: [],
        projectRef: null,
      };
    }

    if (candidates.length > MAX_OPERATION_TARGETS) {
      return {
        status: 'too_many',
        action,
        scope,
        candidates: candidates.slice(0, 10),
        projectRef: null,
      };
    }

    if (candidates.length === 1) {
      return {
        status: 'resolved',
        action,
        scope: 'single',
        targets: candidates,
        project: null,
        requiresConfirmation: false,
      };
    }

    return {
      status: 'resolved',
      action,
      scope,
      targets: candidates,
      project: null,
      requiresConfirmation: true,
    };
  }

  // Single target. "This task" only ever means the last listed record.
  if (input.intent.listReference === 'last' && input.listContext?.length) {
    const last = [...input.listContext]
      .reverse()
      .find((record) => isTaskKind(record) && singleStatuses(action).includes(record.status));

    return last
      ? {
          status: 'resolved',
          action,
          scope: 'single',
          targets: [last],
          project: null,
          requiresConfirmation: false,
        }
      : {
          status: 'not_found',
          action,
          scope: 'single',
          candidates: [],
          projectRef: null,
        };
  }

  const query = input.intent.query?.trim() || '';
  if (!query) {
    const context = dedupe(input.listContext || [], 100).filter(
      (record) => isTaskKind(record) && singleStatuses(action).includes(record.status)
    );

    if (context.length === 1) {
      return {
        status: 'resolved',
        action,
        scope: 'single',
        targets: context,
        project: null,
        requiresConfirmation: false,
      };
    }

    if (context.length > 1) {
      return {
        status: 'ambiguous',
        action,
        scope: 'single',
        candidates: context.slice(0, 10),
        projectRef: null,
      };
    }

    return {
      status: 'not_found',
      action,
      scope: 'single',
      candidates: [],
      projectRef: null,
    };
  }

  const found = await searchMemory(input.store, {
    userId: input.userId,
    query,
    statuses: singleStatuses(action),
    includeArchive: action === 'restore' || action === 'delete' || action === 'forget',
    limit: 20,
  });

  const records = dedupe(found.records, 20);
  const exact = exactTitleMatches(records, query);

  if (exact.length === 1) {
    return {
      status: 'resolved',
      action,
      scope: 'single',
      targets: exact,
      project: null,
      requiresConfirmation: false,
    };
  }

  if (exact.length > 1 || records.length > 1) {
    return {
      status: 'ambiguous',
      action,
      scope: 'single',
      candidates: records.slice(0, 10),
      projectRef: null,
    };
  }

  if (records.length === 1) {
    return {
      status: 'resolved',
      action,
      scope: 'single',
      targets: records,
      project: null,
      requiresConfirmation: false,
    };
  }

  return {
    status: 'not_found',
    action,
    scope: 'single',
    candidates: [],
    projectRef: null,
  };
}

export function createPendingMemoryOperation(
  resolution: Extract<MemoryOperationResolution, { status: 'resolved' }>
): PendingMemoryOperation {
  const requestedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();

  return {
    operationId: randomUUID(),
    action: resolution.action,
    scope: resolution.scope,
    targetIds: resolution.targets.map((record) => record.id),
    projectId: resolution.project?.id || null,
    projectName: resolution.project?.name || null,
    requestedAt,
    expiresAt,
    titles: resolution.targets.slice(0, 12).map((record) => ({
      id: record.id,
      title: record.title.slice(0, 90),
    })),
  };
}

function isPending(value: unknown): value is PendingMemoryOperation {
  const record = asRecord(value);
  if (!record) return false;
  if (typeof record.operationId !== 'string') return false;
  if (
    record.action !== 'complete' &&
    record.action !== 'archive' &&
    record.action !== 'forget' &&
    record.action !== 'delete' &&
    record.action !== 'restore'
  ) {
    return false;
  }
  if (
    record.scope !== 'single' &&
    record.scope !== 'selection' &&
    record.scope !== 'project' &&
    record.scope !== 'all'
  ) {
    return false;
  }
  if (!Array.isArray(record.targetIds)) return false;
  if (typeof record.requestedAt !== 'string' || typeof record.expiresAt !== 'string') return false;

  return record.targetIds.every((id) => typeof id === 'string');
}

export async function loadPendingMemoryOperation(
  store: SupabaseClient,
  conversationId: string
): Promise<PendingMemoryOperation | null> {
  const { data, error } = await store
    .from('pierrot_events')
    .select('payload,created_at')
    .eq('conversation_id', conversationId)
    .eq('event_name', 'assistant_replied')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !Array.isArray(data)) return null;

  for (const row of data) {
    const record = asRecord(row);
    if (!record) continue;
    const createdAt = typeof record.created_at === 'string' ? record.created_at : null;
    if (!createdAt) continue;
    const createdTime = Date.parse(createdAt);
    if (!Number.isFinite(createdTime) || Date.now() - createdTime > PENDING_TTL_MS) continue;

    const payload = asRecord(record.payload);
    const pending = payload?.memory_operation_pending;

    // Only the most recent assistant reply may carry a pending operation. A
    // newer reply without it means the owner has moved on; never let an older
    // preview be confirmed by a later, unrelated “да”.
    if (!isPending(pending)) return null;
    if (Date.parse(pending.expiresAt) < Date.now()) return null;

    return pending;
  }

  return null;
}

export function isMemoryOperationConfirmation(message: string): boolean {
  return /^(?:да[,\s]+)?(?:подтверждаю|подтверди|выполняй|выполняйте|да|yes[,\s]+confirm|confirm|proceed)[.!?]?$/i.test(
    message.trim()
  );
}

export function isMemoryOperationCancellation(message: string): boolean {
  return /^(?:нет|отмена|отмени|cancel|no|stop)[.!?]?$/i.test(message.trim());
}

async function executeSequentially(input: {
  store: SupabaseClient;
  userId: string;
  action: MemoryOperationAction;
  targets: PierrotMemoryRecord[];
}): Promise<{
  engine: 'sequential';
  failures: Set<string>;
  observed: Map<string, { id: string; title: string; status: string }>;
}> {
  const nextStatus = nextStatusFor(input.action);
  const archivedReason =
    input.action === 'complete'
      ? 'completed'
      : input.action === 'forget'
        ? 'owner_forget'
        : 'owner_archive';
  const eventReason =
    input.action === 'complete'
      ? 'owner_complete'
      : input.action === 'forget'
        ? 'owner_forget'
        : 'owner_archive';
  const failures = new Set<string>();
  const observed = new Map<string, { id: string; title: string; status: string }>();

  for (const target of input.targets) {
    if (target.status === nextStatus) {
      observed.set(target.id, {
        id: target.id,
        title: target.title,
        status: target.status,
      });
      continue;
    }

    try {
      const updated = await updateMemoryRecord(input.store, input.userId, target.id, {
        status: nextStatus,
        archivedReason,
        eventReason,
        eventSource: 'owner_chat',
      });
      if (updated.id !== target.id || updated.status !== nextStatus) {
        failures.add(target.id);
        observed.set(target.id, {
          id: target.id,
          title: target.title,
          status: updated.status,
        });
        continue;
      }

      observed.set(target.id, {
        id: updated.id,
        title: updated.title,
        status: updated.status,
      });
    } catch {
      failures.add(target.id);
      observed.set(target.id, {
        id: target.id,
        title: target.title,
        status: target.status,
      });
    }
  }

  return { engine: 'sequential', failures, observed };
}

async function executeViaRpc(input: {
  store: SupabaseClient;
  userId: string;
  action: MemoryOperationAction;
  targets: PierrotMemoryRecord[];
}): Promise<'rpc' | null> {
  if (input.targets.length < 2) return null;
  const nextStatus = nextStatusFor(input.action);
  const archivedReason =
    input.action === 'complete'
      ? 'completed'
      : input.action === 'forget'
        ? 'owner_forget'
        : 'owner_archive';
  const eventReason =
    input.action === 'complete'
      ? 'owner_complete'
      : input.action === 'forget'
        ? 'owner_forget'
        : 'owner_archive';

  const { error } = await input.store.rpc('pierrot_apply_decision_status', {
    p_user_id: input.userId,
    p_decision_ids: input.targets.map((target) => target.id),
    p_status: nextStatus,
    p_archived_reason: archivedReason,
    p_event_reason: eventReason,
  });

  if (error) {
    const code = String((error as { code?: unknown }).code || '');
    if (code === 'PGRST202' || code === '42883') return null;
    throw error;
  }

  return 'rpc';
}

export async function executeMemoryOperation(input: {
  store: SupabaseClient;
  userId: string;
  action: MemoryOperationAction;
  targets: PierrotMemoryRecord[];
}): Promise<{
  outcome: Omit<
    MemoryOperationOutcome,
    'status' | 'scope' | 'pending' | 'candidates' | 'projectName'
  >;
  engine: 'rpc' | 'sequential';
}> {
  const targets = dedupe(input.targets, 500);
  const nextStatus = nextStatusFor(input.action);
  let engine: 'rpc' | 'sequential' = 'sequential';
  let failures = new Set<string>();
  let observed = new Map<string, { id: string; title: string; status: string }>();

  if (targets.length > 1) {
    const viaRpc = await executeViaRpc({
      store: input.store,
      userId: input.userId,
      action: input.action,
      targets,
    }).catch(() => null);

    if (viaRpc) engine = 'rpc';
  }

  if (engine === 'sequential') {
    const result = await executeSequentially({
      store: input.store,
      userId: input.userId,
      action: input.action,
      targets,
    });
    failures = result.failures;
    observed = result.observed;
  } else {
    const refreshed = await listMemoryRecordsByIds(
      input.store,
      input.userId,
      targets.map((target) => target.id)
    ).catch(() => []);

    for (const record of refreshed) {
      observed.set(record.id, {
        id: record.id,
        title: record.title,
        status: record.status,
      });
    }
  }

  const byId = observed;

  let changed = 0;
  let already = 0;
  let failed = 0;
  const verified: MemoryOperationOutcome['targets'] = [];

  for (const target of targets) {
    const current = byId.get(target.id);
    const title = current?.title || target.title;
    const status = current?.status || target.status;

    if (failures.has(target.id) || !current) {
      failed += 1;
      verified.push({ id: target.id, title, status });
      continue;
    }

    if (current.status === nextStatus) {
      if (target.status === nextStatus) already += 1;
      else changed += 1;
    } else {
      failed += 1;
    }

    verified.push({ id: target.id, title, status: current.status });
  }

  if (engine === 'rpc') {
    await invalidateBrainStatus(input.store, input.userId).catch(() => undefined);
  }

  return {
    outcome: {
      action: input.action,
      changed,
      already,
      failed,
      targets: verified,
      engine,
    },
    engine,
  };
}

function actionLabel(action: MemoryOperationAction, language: 'ru' | 'en'): string {
  if (language === 'ru') {
    if (action === 'complete') return 'завершено';
    if (action === 'archive') return 'архивировано';
    if (action === 'forget') return 'убрано из активной памяти';
    if (action === 'delete') return 'удалено';
    return 'восстановлено';
  }

  if (action === 'complete') return 'completed';
  if (action === 'archive') return 'archived';
  if (action === 'forget') return 'removed from active memory';
  if (action === 'delete') return 'deleted';
  return 'restored';
}

function formatTargetList(targets: Array<{ title: string }>, limit = 15): string {
  return targets
    .slice(0, limit)
    .map((target, index) => `${index + 1}. ${target.title}`)
    .join('\n');
}

export function formatMemoryOperationOutcome(
  outcome: MemoryOperationOutcome,
  language: 'ru' | 'en'
): string {
  const total = outcome.targets.length;

  if (outcome.status === 'preview' && outcome.pending) {
    const list = formatTargetList(outcome.pending.titles);
    if (language === 'ru') {
      const scopeLabel =
        outcome.scope === 'project' && outcome.projectName
          ? `в проекте «${outcome.projectName}»`
          : outcome.scope === 'all'
            ? 'во всей памяти'
            : 'в выбранном списке';
      return `Нашёл ${total} активных задач ${scopeLabel}:\n\n${list}\n\nЭто массовая операция. Подтверди: «да, подтверждаю» или «отмена». Пока ничего не изменено.`;
    }
    const scopeLabel =
      outcome.scope === 'project' && outcome.projectName
        ? `in project “${outcome.projectName}”`
        : outcome.scope === 'all'
          ? 'across all memory'
          : 'in the selected list';
    return `I found ${total} active tasks ${scopeLabel}:\n\n${list}\n\nThis is a batch operation. Confirm with “yes, confirm” or “cancel”. Nothing has been changed yet.`;
  }

  if (outcome.status === 'project_not_found') {
    const name = outcome.projectName ? ` «${outcome.projectName}»` : '';
    return language === 'ru'
      ? `Проект${name} не найден среди точных названий. Массовая операция не выполнена. Ничего не изменено.`
      : `Project${name ? ` “${outcome.projectName}”` : ''} was not found by exact name. The batch operation was not performed. Nothing was changed.`;
  }

  if (outcome.status === 'project_ambiguous') {
    return language === 'ru'
      ? 'Несколько проектов совпадают с этим названием. Ничего не изменено. Уточни точный проект.'
      : 'Several projects match that name. Nothing was changed. Name the exact project.';
  }

  if (outcome.status === 'empty_project') {
    return language === 'ru'
      ? 'В этом проекте нет активных задач, связанных через project_id. Ничего не изменено.'
      : 'This project has no active tasks linked through project_id. Nothing was changed.';
  }

  if (outcome.status === 'too_many') {
    return language === 'ru'
      ? `Слишком много задач для одной безопасной операции (${total || '>40'}). Сузь проект или список до 40 задач. Ничего не изменено.`
      : `Too many tasks for one safe operation (${total || '>40'}). Narrow the project or list to 40 tasks. Nothing was changed.`;
  }

  if (outcome.status === 'not_found' || outcome.status === 'composition_changed') {
    return language === 'ru'
      ? 'Не нашёл ровно одну подходящую запись. Ничего не изменено. Уточни точный заголовок.'
      : 'I did not find exactly one matching record. Nothing was changed. Give the exact title.';
  }

  if (outcome.status === 'ambiguous') {
    return language === 'ru'
      ? `Нашёл несколько записей:\n\n${formatTargetList(
          outcome.candidates
        )}\n\nУточни точный заголовок. Ничего не изменено.`
      : `I found several records:\n\n${formatTargetList(
          outcome.candidates
        )}\n\nGive the exact title. Nothing was changed.`;
  }

  if (outcome.status === 'cancelled') {
    return language === 'ru'
      ? 'Отменил операцию. Ничего не изменено.'
      : 'Cancelled the operation. Nothing was changed.';
  }

  const label = actionLabel(outcome.action, language);
  const names = outcome.targets
    .filter((target) => target.status === nextStatusFor(outcome.action))
    .map((target) => `«${target.title}»`)
    .join(', ');

  if (outcome.failed > 0) {
    return language === 'ru'
      ? `${label[0].toUpperCase()}${label.slice(1)}: ${outcome.changed}. Не удалось: ${outcome.failed}. Всего в операции: ${total}. ${names ? `Подтверждено БД: ${names}.` : ''} Я не буду утверждать, что неудавшиеся записи изменены.`
      : `${label[0].toUpperCase()}${label.slice(1)}: ${outcome.changed}. Failed: ${outcome.failed}. Total: ${total}. ${names ? `Confirmed by DB: ${names}.` : ''} I will not claim the failed records were changed.`;
  }

  if (outcome.changed === 0) {
    const singular = outcome.already === 1;
    if (language === 'ru') {
      if (outcome.action === 'complete') {
        return singular
          ? `Задача «${outcome.targets[0]?.title || '—'}» уже выполнена. Ничего не менял.`
          : `Все ${outcome.already} задач уже выполнены. Ничего не менял.`;
      }
      if (outcome.action === 'forget') {
        return singular
          ? `«${outcome.targets[0]?.title || '—'}» уже убрана из активной памяти. Ничего не менял.`
          : `Все ${outcome.already} записей уже убраны из активной памяти. Ничего не менял.`;
      }
      return singular
        ? `«${outcome.targets[0]?.title || '—'}» уже в архиве. Ничего не менял.`
        : `Все ${outcome.already} записей уже в архиве. Ничего не менял.`;
    }

    return singular
      ? `“${outcome.targets[0]?.title || '—'}” was already ${label}. Nothing was changed.`
      : `All ${outcome.already} records were already ${label}. Nothing was changed.`;
  }

  if (outcome.scope === 'single') {
    const title = outcome.targets[0]?.title || '—';
    if (language === 'ru') {
      if (outcome.action === 'complete') return `Завершил задачу «${title}». История сохранена.`;
      if (outcome.action === 'forget')
        return `Убрал из активной памяти «${title}». История сохранена.`;
      return `Архивировал «${title}». История сохранена.`;
    }
    if (outcome.action === 'complete') return `Completed “${title}”. History is preserved.`;
    if (outcome.action === 'forget')
      return `Removed “${title}” from active memory. History is preserved.`;
    return `Archived “${title}”. History is preserved.`;
  }

  const scopePrefix =
    outcome.scope === 'project' && outcome.projectName
      ? language === 'ru'
        ? `В проекте «${outcome.projectName}»: `
        : `In project “${outcome.projectName}”: `
      : '';

  return language === 'ru'
    ? `${scopePrefix}найдено ${total} задач. ${label[0].toUpperCase()}${label.slice(1)}: ${outcome.changed}. История сохранена.`
    : `${scopePrefix}found ${total} tasks. ${label[0].toUpperCase()}${label.slice(1)}: ${outcome.changed}. History is preserved.`;
}
