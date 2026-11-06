import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotProjectSnapshot } from '../types';
import { listProjectConversationIds } from '../conversation';
import {
  loadProjectHistoryMessages,
  type ProjectHistoryMessage,
} from '../history';
import {
  createMemoryRecord,
  getMemoryRecord,
  listMemoryRecordsByIds,
  updateMemoryRecord,
} from '@/lib/pierrot/memory/store';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import { createOwnerTask } from '@/lib/pierrot/memory/taskCreation';
import { linkDecisionToProject, listDecisionIdsForProject, moveDecisionToProject } from '../links';
import {
  analyzeProjectReview,
  type ProjectReviewAnalysis,
  type ReviewCandidate,
  type ReviewExistingMaterial,
  type ReviewExistingTask,
} from './analyze';

assertServerOnly('lib/pierrot/projects/review/service');

const MAX_REVIEW_MESSAGES = 3_000;
const MAX_REPORT_CHARS = 4_000;
const RUN_STALE_MS = 10 * 60 * 1000;

type ReviewRunRow = {
  id: string;
  status: string;
  reply: string;
  summary: string;
  report: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
};

export type ProjectReviewResult = {
  runId: string;
  status: 'completed' | 'partial' | 'failed' | 'already_running' | 'replayed' | 'migration_required';
  reply: string;
  report: Record<string, unknown> | null;
  summary: string | null;
};

type OperationLog = {
  type:
    | 'task_created'
    | 'task_linked'
    | 'task_completed'
    | 'duplicate_merged'
    | 'idea_saved'
    | 'decision_recorded'
    | 'material_saved'
    | 'metadata_updated'
    | 'failed';
  objectId?: string;
  title: string;
  detail?: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMissingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist/i.test(value);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      String((error as { code?: unknown }).code || '') === '23505'
  );
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"')]+/iu);
  return match ? match[0].replace(/[.,;:!?]+$/g, '') : null;
}

async function insertRun(
  store: SupabaseClient,
  input: {
    projectId: string;
    ownerUserId: string;
    requestMessageId: string;
  }
): Promise<ReviewRunRow> {
  const now = new Date().toISOString();
  const { data, error } = await store
    .from('pierrot_project_reviews')
    .insert({
      project_id: input.projectId,
      owner_user_id: input.ownerUserId,
      request_message_id: input.requestMessageId,
      status: 'running',
      started_at: now,
      updated_at: now,
    })
    .select('id,status,reply,summary,report,started_at,completed_at')
    .single();

  if (error) throw error;
  return data as ReviewRunRow;
}

async function findRunByRequest(
  store: SupabaseClient,
  projectId: string,
  requestMessageId: string
): Promise<ReviewRunRow | null> {
  const { data, error } = await store
    .from('pierrot_project_reviews')
    .select('id,status,reply,summary,report,started_at,completed_at')
    .eq('project_id', projectId)
    .eq('request_message_id', requestMessageId)
    .maybeSingle();

  if (error) throw error;
  return (data as ReviewRunRow | null) || null;
}

async function findRunningRun(
  store: SupabaseClient,
  projectId: string
): Promise<ReviewRunRow | null> {
  const { data, error } = await store
    .from('pierrot_project_reviews')
    .select('id,status,reply,summary,report,started_at,completed_at')
    .eq('project_id', projectId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as ReviewRunRow | null) || null;
}

async function markRunRunning(store: SupabaseClient, runId: string): Promise<void> {
  const { error } = await store
    .from('pierrot_project_reviews')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: null,
      error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId);
  if (error) throw error;
}

function runningIsFresh(run: ReviewRunRow): boolean {
  const started = run.started_at ? Date.parse(run.started_at) : 0;
  return Number.isFinite(started) && Date.now() - started < RUN_STALE_MS;
}

function inProgressReply(projectName: string, language: 'ru' | 'en'): string {
  return language === 'ru'
    ? `Ревизия проекта «${projectName}» уже выполняется. Я не запускаю вторую параллельную ревизию и не создаю дубликаты.`
    : `A review of “${projectName}” is already running. I will not start a parallel review or create duplicates.`;
}

async function linkedMemoryRecords(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<PierrotMemoryRecord[]> {
  const ids = await listDecisionIdsForProject(store, ownerUserId, projectId);
  if (ids.length === 0) return [];
  return listMemoryRecordsByIds(store, ownerUserId, ids);
}

async function orphanMirrorTasks(
  store: SupabaseClient,
  ownerUserId: string,
  project: PierrotProjectSnapshot,
  linkedIds: Set<string>
): Promise<PierrotMemoryRecord[]> {
  const { data, error } = await store
    .from('pierrot_decisions')
    .select('*')
    .eq('user_id', ownerUserId)
    .in('kind', ['task', 'reminder'])
    .eq('status', 'current')
    .eq('project', project.name)
    .limit(200);

  if (error) return [];

  const ids = (Array.isArray(data) ? data : [])
    .map((row) => (row && typeof row.id === 'string' ? row.id : ''))
    .filter(Boolean)
    .filter((id) => !linkedIds.has(id));
  if (ids.length === 0) return [];
  return listMemoryRecordsByIds(store, ownerUserId, ids);
}

async function projectArtifacts(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<Array<{ id: string; title: string; url: string | null; artifactType: string }>> {
  const { data, error } = await store
    .from('pierrot_project_artifacts')
    .select('id,title,content,artifact_type,metadata')
    .eq('project_id', projectId)
    .eq('owner_user_id', ownerUserId)
    .limit(500);

  if (error) return [];

  return (Array.isArray(data) ? data : []).map((row) => {
    const content = text(row.content);
    const metadataUrl =
      row.metadata && typeof row.metadata === 'object'
        ? text((row.metadata as Record<string, unknown>).url)
        : '';
    return {
      id: text(row.id),
      title: text(row.title),
      url: metadataUrl || extractUrl(content),
      artifactType: text(row.artifact_type) || 'document',
    };
  });
}

function verificationTitle(candidate: ReviewCandidate): string {
  return truncate(candidate.title || candidate.content, 180);
}

function isRecentObligation(candidate: ReviewCandidate, days = 180): boolean {
  if (!candidate.sourceCreatedAt) return true;
  const created = Date.parse(candidate.sourceCreatedAt);
  if (!Number.isFinite(created)) return true;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

async function linkReviewRecord(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  recordId: string,
  deduplicated: boolean
): Promise<'linked' | 'existing_elsewhere' | 'failed'> {
  try {
    if (deduplicated) {
      const { data: links, error } = await store
        .from('pierrot_project_decisions')
        .select('project_id')
        .eq('owner_user_id', ownerUserId)
        .eq('decision_id', recordId);
      if (error) return 'failed';
      const projectIds = (Array.isArray(links) ? links : [])
        .map((row) => (row && typeof row.project_id === 'string' ? row.project_id : ''))
        .filter(Boolean);
      if (projectIds.length > 0 && !projectIds.includes(projectId)) {
        return 'existing_elsewhere';
      }
      if (projectIds.includes(projectId)) return 'linked';
    }

    await linkDecisionToProject(store, ownerUserId, recordId, projectId);
    return 'linked';
  } catch {
    return 'failed';
  }
}

async function saveIdea(
  store: SupabaseClient,
  ownerUserId: string,
  project: PierrotProjectSnapshot,
  candidate: ReviewCandidate
): Promise<{
  status: 'created' | 'deduplicated' | 'existing_elsewhere' | 'failed';
  id?: string;
  error?: string;
}> {
  try {
    const created = await createMemoryRecord(store, ownerUserId, {
      kind: 'saved',
      title: verificationTitle(candidate),
      content: candidate.content,
      rationale: candidate.sourceMessageId
        ? `Project review source message ${candidate.sourceMessageId}`
        : 'Project review',
      project: project.name,
      tags: candidate.tags,
      conversationId: null,
      messageId: candidate.sourceMessageId,
      sourceRefs: [
        {
          type: 'project_review',
          projectId: project.id,
          messageId: candidate.sourceMessageId,
          messageIndex: candidate.sourceMessageIndex,
        },
      ],
      skipEmbedding: true,
    });

    const verified = await getMemoryRecord(store, ownerUserId, created.id);
    if (!verified) return { status: 'failed', error: 'IDEA_NOT_VERIFIED' };
    const linked = await linkReviewRecord(
      store,
      ownerUserId,
      project.id,
      verified.id,
      Boolean(created.deduplicated)
    );
    if (linked === 'existing_elsewhere') return { status: 'existing_elsewhere', id: verified.id };
    if (linked === 'failed') return { status: 'failed', id: verified.id, error: 'IDEA_LINK_FAILED' };
    return created.deduplicated
      ? { status: 'deduplicated', id: verified.id }
      : { status: 'created', id: verified.id };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'IDEA_WRITE_FAILED' };
  }
}

async function saveDecision(
  store: SupabaseClient,
  ownerUserId: string,
  project: PierrotProjectSnapshot,
  candidate: ReviewCandidate
): Promise<{
  status: 'created' | 'deduplicated' | 'existing_elsewhere' | 'failed';
  id?: string;
  error?: string;
}> {
  try {
    const created = await createMemoryRecord(store, ownerUserId, {
      kind: 'decision',
      title: verificationTitle(candidate),
      content: candidate.content,
      rationale: candidate.sourceMessageId
        ? `Owner decision recorded during project review (message ${candidate.sourceMessageId})`
        : 'Owner decision recorded during project review',
      project: project.name,
      tags: candidate.tags,
      conversationId: null,
      messageId: candidate.sourceMessageId,
      confidence: 0.9,
      sourceRefs: [
        {
          type: 'project_review',
          projectId: project.id,
          messageId: candidate.sourceMessageId,
          messageIndex: candidate.sourceMessageIndex,
          attribution: 'owner_message',
        },
      ],
      skipEmbedding: true,
    });

    const verified = await getMemoryRecord(store, ownerUserId, created.id);
    if (!verified) return { status: 'failed', error: 'DECISION_NOT_VERIFIED' };
    const linked = await linkReviewRecord(
      store,
      ownerUserId,
      project.id,
      verified.id,
      Boolean(created.deduplicated)
    );
    if (linked === 'existing_elsewhere') {
      return { status: 'existing_elsewhere', id: verified.id };
    }
    if (linked === 'failed') {
      return { status: 'failed', id: verified.id, error: 'DECISION_LINK_FAILED' };
    }
    return created.deduplicated
      ? { status: 'deduplicated', id: verified.id }
      : { status: 'created', id: verified.id };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'DECISION_WRITE_FAILED',
    };
  }
}

async function saveMaterial(
  store: SupabaseClient,
  ownerUserId: string,
  project: PierrotProjectSnapshot,
  candidate: ReviewAnalysisMaterial
): Promise<{ status: 'created' | 'failed'; id?: string; error?: string }> {
  try {
    const { data, error } = await store
      .from('pierrot_project_artifacts')
      .insert({
        project_id: project.id,
        owner_user_id: ownerUserId,
        title: truncate(candidate.title || candidate.url, 240),
        artifact_type: candidate.artifactType,
        content: candidate.url,
        source_conversation_id: null,
        metadata: {
          url: candidate.url,
          source_message_id: candidate.sourceMessageId,
          source_message_index: candidate.sourceMessageIndex,
          source_created_at: candidate.sourceCreatedAt,
          tags: candidate.tags,
          created_by: 'project_review',
        },
      })
      .select('id,title')
      .single();

    if (error || !data) return { status: 'failed', error: 'MATERIAL_WRITE_FAILED' };
    return { status: 'created', id: text((data as Record<string, unknown>).id) };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'MATERIAL_WRITE_FAILED',
    };
  }
}

type ReviewAnalysisMaterial = ReviewCandidate & {
  url: string;
  artifactType: string;
};

function buildSummary(input: {
  project: PierrotProjectSnapshot;
  analysis: ProjectReviewAnalysis;
  activeTasks: ReviewExistingTask[];
  decisionsCount: number;
  materialCount: number;
  contradictions: ProjectReviewAnalysis['contradictions'];
}): string {
  const { project, analysis, activeTasks, decisionsCount, materialCount } = input;
  const priorities = activeTasks
    .filter((task) => task.status === 'current')
    .slice(0, 5)
    .map((task) => task.title);

  return [
    `Проект «${project.name}» (${project.status}).`,
    priorities.length
      ? `Ближайшие задачи: ${priorities.join('; ')}.`
      : 'Активных задач с явным следующим действием сейчас нет.',
    decisionsCount > 0
      ? `Зафиксировано решений: ${decisionsCount}.`
      : 'Решения в памяти проекта пока не зафиксированы.',
    materialCount > 0 ? `Материалов в проекте: ${materialCount}.` : '',
    analysis.openQuestions.length > 0
      ? `Открытых вопросов: ${analysis.openQuestions.length}.`
      : '',
    input.contradictions.length > 0
      ? 'В истории сохранены противоречивые решения; они не переписаны автоматически.'
      : 'Противоречий между активными решениями не обнаружено.',
    project.projectBrief
      ? `Проверенный бриф: ${truncate(project.projectBrief, 500)}`
      : 'Проверенный бриф пока не заполнен.',
  ]
    .filter(Boolean)
    .join(' ');
}

function reportReply(input: {
  language: 'ru' | 'en';
  project: PierrotProjectSnapshot;
  status: 'completed' | 'partial';
  checked: number;
  counts: Record<string, number>;
  changes: string[];
  needsDecision: string[];
  summary: string;
  failures: string[];
}): string {
  const ru = input.language === 'ru';
  const header = ru ? '**Ревизия проекта завершена**' : '**Project review complete**';
  const partialHeader = ru ? '**Ревизия проекта завершена частично**' : '**Project review partially complete**';
  const lines = [
    input.status === 'completed' ? header : partialHeader,
    '',
    ru
      ? `- Найдено и проверено: ${input.checked} элементов.`
      : `- Found and checked: ${input.checked} items.`,
    ru
      ? `- Создано новых задач: ${input.counts.tasksCreated}.`
      : `- New tasks created: ${input.counts.tasksCreated}.`,
    ru
      ? `- Связано задач с проектом: ${input.counts.tasksLinked}.`
      : `- Tasks linked to the project: ${input.counts.tasksLinked}.`,
    ru
      ? `- Завершено явно выполненных задач: ${input.counts.tasksCompleted}.`
      : `- Explicitly completed tasks closed: ${input.counts.tasksCompleted}.`,
    ru
      ? `- Объединено дублей: ${input.counts.duplicatesMerged}.`
      : `- Duplicates merged: ${input.counts.duplicatesMerged}.`,
    ru
      ? `- Сохранено идей отдельно от задач: ${input.counts.ideasSaved}.`
      : `- Ideas saved outside the task list: ${input.counts.ideasSaved}.`,
    ru
      ? `- Зафиксировано решений: ${input.counts.decisionsRecorded}.`
      : `- Decisions recorded: ${input.counts.decisionsRecorded}.`,
    ru
      ? `- Обновлено материалов: ${input.counts.materialsSaved}.`
      : `- Materials saved: ${input.counts.materialsSaved}.`,
    ru
      ? `- Отправлено в архив: ${input.counts.archived}.`
      : `- Archived: ${input.counts.archived}.`,
    ru
      ? `- Требует вашего решения: ${input.needsDecision.length}.`
      : `- Requires your decision: ${input.needsDecision.length}.`,
  ];

  lines.push('', ru ? '**Что изменилось**' : '**What changed**');
  lines.push(
    input.changes.length
      ? input.changes.slice(0, 12).map((item) => `- ${item}`).join('\n')
      : ru
        ? 'Существенных изменений не потребовалось.'
        : 'No material changes were needed.'
  );

  if (input.failures.length > 0) {
    lines.push('', ru ? '**Что не удалось**' : '**What failed**');
    lines.push(input.failures.slice(0, 8).map((item) => `- ${item}`).join('\n'));
  }

  lines.push('', ru ? '**Что требует решения**' : '**Needs your decision**');
  lines.push(
    input.needsDecision.length
      ? input.needsDecision.slice(0, 10).map((item) => `- ${item}`).join('\n')
      : ru
        ? 'Неоднозначных случаев нет.'
        : 'No ambiguous cases.'
  );

  lines.push('', ru ? '**Состояние проекта**' : '**Project state**');
  lines.push(input.summary);

  return truncate(lines.join('\n'), MAX_REPORT_CHARS);
}

/**
 * A deterministic, bounded project review. It uses one database scan of the
 * project's history and the existing memory/task/artifact stores. It never
 * calls the language model, never deletes anything and never closes an
 * ambiguous task.
 */
export async function runProjectReview(input: {
  store: SupabaseClient;
  ownerUserId: string;
  project: PierrotProjectSnapshot;
  conversationId: string;
  requestMessageId: string;
  language?: 'ru' | 'en';
}): Promise<ProjectReviewResult> {
  const { store, ownerUserId, project, conversationId, requestMessageId } = input;
  const language = input.language === 'en' ? 'en' : 'ru';

  let run: ReviewRunRow;
  try {
    const existing = await findRunByRequest(store, project.id, requestMessageId);
    if (existing) {
      if (existing.status === 'completed' || existing.status === 'partial') {
        return {
          runId: existing.id,
          status: 'replayed',
          reply: existing.reply,
          report: existing.report || null,
          summary: existing.summary || null,
        };
      }
      if (existing.status === 'running' && runningIsFresh(existing)) {
        return {
          runId: existing.id,
          status: 'already_running',
          reply: inProgressReply(project.name, language),
          report: null,
          summary: null,
        };
      }
      await markRunRunning(store, existing.id);
      run = { ...existing, status: 'running', started_at: new Date().toISOString() };
    } else {
      const running = await findRunningRun(store, project.id);
      if (running && runningIsFresh(running)) {
        return {
          runId: running.id,
          status: 'already_running',
          reply: inProgressReply(project.name, language),
          report: null,
          summary: null,
        };
      }
      run = await insertRun(store, {
        projectId: project.id,
        ownerUserId,
        requestMessageId,
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const running = await findRunningRun(store, project.id).catch(() => null);
      return {
        runId: running?.id || '',
        status: 'already_running',
        reply: inProgressReply(project.name, language),
        report: null,
        summary: null,
      };
    }
    if (isMissingTable(error)) {
      return {
        runId: '',
        status: 'migration_required',
        reply:
          language === 'ru'
            ? 'Ревизия проекта ещё не включена: в базе нет таблицы отчётов ревизий. Применение миграции `2026-11-24_pierrot_canonical_project_chat.sql` требуется до запуска. Ничего не изменено.'
            : 'Project review is not enabled yet: the review report table is missing. Apply `2026-11-24_pierrot_canonical_project_chat.sql` first. Nothing was changed.',
        report: null,
        summary: null,
      };
    }
    throw error;
  }

  const operations: OperationLog[] = [];
  const failures: string[] = [];
  const needsDecision: string[] = [];
  const changes: string[] = [];
  const counts = {
    tasksCreated: 0,
    tasksLinked: 0,
    tasksCompleted: 0,
    duplicatesMerged: 0,
    ideasSaved: 0,
    decisionsRecorded: 0,
    materialsSaved: 0,
    archived: 0,
  };

  try {
    const [messages, linkedRecords, artifacts] = await Promise.all([
      loadProjectHistoryMessages(store, ownerUserId, project.id, {
        limit: MAX_REVIEW_MESSAGES,
      }),
      linkedMemoryRecords(store, ownerUserId, project.id),
      projectArtifacts(store, ownerUserId, project.id),
    ]);

    const linkedIds = new Set(linkedRecords.map((record) => record.id));
    const orphans = await orphanMirrorTasks(store, ownerUserId, project, linkedIds);
    const allRecords = [...linkedRecords, ...orphans];
    const tasks = allRecords.filter((record) => record.kind === 'task' || record.kind === 'reminder');
    const decisions = allRecords.filter(
      (record) =>
        record.kind === 'decision' ||
        record.kind === 'position' ||
        record.kind === 'preference' ||
        record.kind === 'constraint'
    );

    const existingTasks: ReviewExistingTask[] = tasks.map((record) => ({
      id: record.id,
      title: record.title,
      content: record.content,
      status: record.status,
      createdAt: record.createdAt,
    }));
    const existingDecisions = decisions.map((record) => ({
      id: record.id,
      title: record.title,
      content: record.content,
      status: record.status,
      kind: record.kind,
    }));
    const existingMaterials: ReviewExistingMaterial[] = artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      url: artifact.url,
    }));

    const analysis = analyzeProjectReview({
      messages,
      existingTasks,
      existingDecisions,
      existingMaterials,
    });

    // 1. Explicit tasks: create only verified, concrete next actions. An old
    // message is not automatically a new task; it is reported for a decision.
    for (const candidate of analysis.tasks.slice(0, 20)) {
      if (!isRecentObligation(candidate)) {
        needsDecision.push(
          `Старое указание «${candidate.title}» (${String(candidate.sourceCreatedAt).slice(
            0,
            10
          )}) не превращено в новую задачу автоматически. Подтверди, если оно всё ещё актуально.`
        );
        continue;
      }

      const result = await createOwnerTask({
        store,
        userId: ownerUserId,
        content: candidate.content,
        projectRef: project.id,
        conversationId,
        messageId: candidate.sourceMessageId,
        originalMessage: candidate.content,
        skipEmbedding: true,
      });

      if (result.status === 'created' || result.status === 'already_exists') {
        if (result.status === 'created') {
          counts.tasksCreated += 1;
          operations.push({
            type: 'task_created',
            objectId: result.task.id,
            title: result.task.title,
          });
          changes.push(`Создана задача «${result.task.title}».`);
        }
      } else if (result.status === 'existing_in_other_project') {
        needsDecision.push(
          `«${result.task.title}» уже существует в другом проекте${
            result.existingProjectName ? ` («${result.existingProjectName}»)` : ''
          }. Я не переносил её без подтверждения.`
        );
      } else {
        failures.push(`Задача «${candidate.title}» не сохранена (${result.status}).`);
      }
    }

    // 2. Explicit, unambiguous completions. Ambiguous ones never reach here.
    for (const completion of analysis.completions.slice(0, 10)) {
      try {
        const updated = await updateMemoryRecord(store, ownerUserId, completion.taskId, {
          status: 'completed',
          eventReason: 'project_review_explicit_completion',
          eventSource: completion.sourceMessageId,
        });
        counts.tasksCompleted += 1;
        operations.push({
          type: 'task_completed',
          objectId: updated.id,
          title: updated.title,
          detail: completion.evidence,
        });
        changes.push(`Задача «${updated.title}» отмечена выполненной по явному указанию.`);
      } catch {
        failures.push(`Не удалось подтвердить завершение задачи «${completion.taskTitle}».`);
      }
    }

    // 3. Exact duplicate tasks: reversible merge with superseded_by history.
    for (const group of analysis.duplicateGroups.filter((item) => item.exact).slice(0, 10)) {
      const records = await listMemoryRecordsByIds(store, ownerUserId, group.taskIds);
      const active = records
        .filter((record) => record.status === 'current' || record.status === 'uncertain')
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      if (active.length < 2) continue;
      const keeper = active[0];

      for (const duplicate of active.slice(1)) {
        try {
          await updateMemoryRecord(store, ownerUserId, duplicate.id, {
            status: 'superseded',
            supersededBy: keeper.id,
            archivedReason: 'project_review_exact_duplicate',
            eventReason: 'project_review_duplicate_merge',
            eventSource: run.id,
          });
          counts.duplicatesMerged += 1;
          counts.archived += 1;
          operations.push({
            type: 'duplicate_merged',
            objectId: duplicate.id,
            title: duplicate.title,
            detail: `Оставлена запись ${keeper.id}`,
          });
          changes.push(`Дубль «${duplicate.title}» объединён с основной задачей.`);
        } catch {
          failures.push(`Не удалось объединить дубль «${duplicate.title}».`);
        }
      }
    }

    for (const group of analysis.duplicateGroups.filter((item) => !item.exact)) {
      needsDecision.push(
        `Похожие задачи «${group.title}» не объединены автоматически: ${group.reason}`
      );
    }

    // 4. Ideas are notes, never tasks.
    for (const candidate of analysis.ideas.slice(0, 20)) {
      const saved = await saveIdea(store, ownerUserId, project, candidate);
      if (saved.status === 'created') {
        counts.ideasSaved += 1;
        operations.push({ type: 'idea_saved', objectId: saved.id, title: candidate.title });
        changes.push(`Сохранена идея «${candidate.title}» отдельно от задач.`);
      } else if (saved.status === 'existing_elsewhere') {
        needsDecision.push(
          `Идея «${candidate.title}» уже связана с другим проектом. Я не переносил её автоматически.`
        );
      } else if (saved.status === 'failed') {
        failures.push(`Идея «${candidate.title}» не сохранена (${saved.error}).`);
      }
    }

    // 5. Owner decisions only. Contradictory candidates are not written.
    const contradictionCandidateIds = new Set(
      analysis.contradictions.flatMap((item) => [item.leftId, item.rightId])
    );
    for (const candidate of analysis.decisions.slice(0, 20)) {
      const candidateId = `candidate:${candidate.sourceMessageId}:${candidate.title}`;
      if (contradictionCandidateIds.has(candidateId)) {
        needsDecision.push(
          `Решение «${candidate.title}» противоречит более ранней формулировке. Я сохранил его как вопрос, а не переписал память.`
        );
        continue;
      }

      const saved = await saveDecision(store, ownerUserId, project, candidate);
      if (saved.status === 'created') {
        counts.decisionsRecorded += 1;
        operations.push({ type: 'decision_recorded', objectId: saved.id, title: candidate.title });
        changes.push(`Зафиксировано решение «${candidate.title}».`);
      } else if (saved.status === 'existing_elsewhere') {
        needsDecision.push(
          `Решение «${candidate.title}» уже связано с другим проектом. Я не переносил его автоматически.`
        );
      } else if (saved.status === 'failed') {
        failures.push(`Решение «${candidate.title}» не сохранено (${saved.error}).`);
      }
    }

    // 6. Materials: keep original URLs, do not infer content.
    for (const candidate of analysis.materials.slice(0, 30)) {
      const saved = await saveMaterial(store, ownerUserId, project, candidate as ReviewAnalysisMaterial);
      if (saved.status === 'created') {
        counts.materialsSaved += 1;
        operations.push({ type: 'material_saved', objectId: saved.id, title: candidate.title });
        changes.push(`Сохранён материал «${candidate.title}» (${candidate.url}).`);
      } else {
        failures.push(`Материал «${candidate.title}» не сохранён (${saved.error}).`);
      }
    }

    // 7. Orphan tasks whose legacy mirror names this exact project may be
    // linked reversibly. Cross-project or ambiguous mirrors stay untouched.
    for (const orphan of orphans.slice(0, 50)) {
      const mirror = normalize(orphan.project || '');
      if (mirror !== normalize(project.name) && mirror !== normalize(project.slug)) continue;

      try {
        await moveDecisionToProject(store, ownerUserId, orphan.id, project);
        counts.tasksLinked += 1;
        operations.push({ type: 'task_linked', objectId: orphan.id, title: orphan.title });
        changes.push(`Задача «${orphan.title}» связана с проектом.`);
      } catch {
        failures.push(`Не удалось связать задачу «${orphan.title}» с проектом.`);
      }
    }

    // 8. Non-critical metadata: fill an empty legacy project mirror only for
    // tasks already linked canonically.
    for (const record of linkedRecords
      .filter((item) => item.kind === 'task' || item.kind === 'reminder')
      .filter((item) => item.status === 'current' && !item.project)
      .slice(0, 50)) {
      try {
        await updateMemoryRecord(store, ownerUserId, record.id, {
          project: project.name,
          eventReason: 'project_review_metadata',
        });
        operations.push({
          type: 'metadata_updated',
          objectId: record.id,
          title: record.title,
          detail: 'Заполнено имя проекта',
        });
      } catch {
        failures.push(`Не удалось обновить метаданные задачи «${record.title}».`);
      }
    }

    // 9. Report unresolved items without mutating them.
    for (const question of analysis.openQuestions.slice(0, 10)) {
      needsDecision.push(`Открытый вопрос: «${truncate(question.content, 220)}»`);
    }
    for (const ambiguous of analysis.ambiguousTaskCandidates.slice(0, 8)) {
      needsDecision.push(
        `«${truncate(ambiguous.content, 200)}» похоже на обсуждение, а не на задачу. Не создаю её автоматически.`
      );
    }
    for (const contradiction of analysis.contradictions.slice(0, 8)) {
      needsDecision.push(
        `Противоречие: «${contradiction.leftTitle}» и «${contradiction.rightTitle}». ${contradiction.reason}`
      );
    }
    for (const ideaTask of analysis.ideaLikeTasks.slice(0, 8)) {
      needsDecision.push(
        `Задача «${ideaTask.title}» похожа на идею. ${ideaTask.reason}`
      );
    }

    // Forgotten obligations: an owner-specified review/due date is in the past
    // but the task is still current. Do not close it automatically.
    const now = Date.now();
    for (const task of tasks
      .filter((item) => item.status === 'current' && item.reviewAt)
      .filter((item) => {
        const due = item.reviewAt ? Date.parse(item.reviewAt) : Number.NaN;
        return Number.isFinite(due) && due < now;
      })
      .slice(0, 10)) {
      needsDecision.push(
        `Просроченная задача «${task.title}» (срок ${String(task.reviewAt).slice(0, 10)}). Я не закрываю её без подтверждения.`
      );
    }

    const activeTasks = tasks
      .filter((task) => task.status === 'current')
      .map((task) => ({ id: task.id, title: task.title, content: task.content, status: task.status }));
    const summary = buildSummary({
      project,
      analysis,
      activeTasks,
      decisionsCount: decisions.filter((decision) => decision.status === 'current').length + counts.decisionsRecorded,
      materialCount: artifacts.length + counts.materialsSaved,
      contradictions: analysis.contradictions,
    });

    const checked =
      messages.length + allRecords.length + artifacts.length + analysis.materials.length;
    const status: 'completed' | 'partial' = failures.length > 0 ? 'partial' : 'completed';
    const reply = reportReply({
      language,
      project,
      status,
      checked,
      counts,
      changes,
      needsDecision,
      summary,
      failures,
    });

    const report = {
      version: 1,
      projectId: project.id,
      conversationId,
      requestMessageId,
      checked,
      counts,
      operations,
      failures,
      needsDecision,
      summary,
      messageCount: messages.length,
      generatedAt: new Date().toISOString(),
    };

    const { error: saveError } = await store
      .from('pierrot_project_reviews')
      .update({
        status,
        reply,
        summary,
        report,
        error_code: failures.length > 0 ? 'PARTIAL_FAILURE' : null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    if (saveError) {
      failures.push('Отчёт ревизии не удалось сохранить в базе.');
      return {
        runId: run.id,
        status: 'failed',
        reply:
          language === 'ru'
            ? `Ревизия выполнила часть операций, но отчёт не сохранился. Я не могу подтвердить итог. Успешных операций: ${operations.length}.`
            : `The review performed some operations but the report could not be saved. Successful operations: ${operations.length}.`,
        report,
        summary,
      };
    }

    return { runId: run.id, status, reply, report, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PROJECT_REVIEW_FAILED';
    const partialReply =
      language === 'ru'
        ? `Ревизия проекта не завершилась. Успешных операций до ошибки: ${operations.length}. Повторный запуск не создаст уже сохранённые задачи благодаря проверке дублей. Причина: ${truncate(
            message,
            240
          )}`
        : `The project review did not finish. Successful operations before the error: ${operations.length}. A retry will not duplicate already saved tasks. Reason: ${truncate(
            message,
            240
          )}`;

    await store
      .from('pierrot_project_reviews')
      .update({
        status: 'failed',
        reply: partialReply,
        report: {
          version: 1,
          projectId: project.id,
          requestMessageId,
          operations,
          failures,
          error: message,
          generatedAt: new Date().toISOString(),
        },
        error_code: 'REVIEW_FAILED',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id)
      .then(
        () => undefined,
        () => undefined
      );

    return {
      runId: run.id,
      status: 'failed',
      reply: partialReply,
      report: null,
      summary: null,
    };
  }
}
