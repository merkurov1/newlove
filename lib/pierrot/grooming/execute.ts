import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createMemoryRecord,
  getMemoryRecord,
  listMemoryRecordsByIds,
  updateMemoryRecord,
} from '@/lib/pierrot/memory/store';
import { createOwnerTask } from '@/lib/pierrot/memory/taskCreation';
import { mapProject, updatePierrotProject } from '@/lib/pierrot/projects/store';
import { listProjectTasks, moveDecisionToProject } from '@/lib/pierrot/projects/links';
import { createContextSummary, loadLatestContextSummary } from './context';
import {
  isGroomingStorageUnavailable,
  loadAuditById,
  markProposalResult,
  recordOperation,
  selectProposals,
  updateAuditStatus,
} from './store';
import { upsertGithubTaskLink } from './github';
import { normaliseUrlKey } from './signals';
import { recordTaskExperience } from '@/lib/pierrot/learning/store';
import type {
  GroomingExecutionReport,
  GroomingExecutionResult,
  GroomingProposal,
  GroomingRisk,
} from './types';

assertServerOnly('lib/pierrot/grooming/execute');

export class GroomingExecutionError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.name = 'GroomingExecutionError';
    this.code = code;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function riskAllowsSafe(proposal: GroomingProposal): boolean {
  const risk: GroomingRisk = proposal.risk;
  return risk !== 'confirmation';
}

async function updateKind(input: {
  store: SupabaseClient;
  userId: string;
  id: string;
  kind: string;
  tags?: string[];
}): Promise<{ id: string; title: string; kind: string }> {
  const current = await getMemoryRecord(input.store, input.userId, input.id);
  if (!current) throw new GroomingExecutionError('ENTITY_NOT_FOUND');
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    kind: input.kind,
    updated_at: now,
  };
  if (input.tags) patch.tags = input.tags.map((tag) => tag.slice(0, 40)).slice(0, 10);
  const { error } = await input.store
    .from('pierrot_decisions')
    .update(patch)
    .eq('id', input.id)
    .eq('user_id', input.userId);
  if (error) throw error;

  await input.store
    .from('pierrot_decision_events')
    .insert({
      decision_id: input.id,
      user_id: input.userId,
      event_type: 'updated',
      metadata: {
        source: 'workspace_grooming',
        fromKind: current.kind,
        toKind: input.kind,
        title: current.title,
      },
    })
    .then(
      () => undefined,
      () => undefined
    );

  const verified = await getMemoryRecord(input.store, input.userId, input.id);
  if (!verified || verified.kind !== input.kind) {
    throw new GroomingExecutionError('VERIFICATION_FAILED');
  }
  return { id: verified.id, title: verified.title, kind: verified.kind };
}

async function validateTarget(
  store: SupabaseClient,
  userId: string,
  proposal: GroomingProposal
): Promise<'ok' | 'stale' | 'missing'> {
  if (
    proposal.operation === 'create_context_summary' ||
    proposal.operation === 'update_context_summary'
  ) {
    const conversationId = text(proposal.params.conversationId) || proposal.entityId || '';
    if (!conversationId) return 'missing';
    const { data, error } = await store
      .from('pierrot_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? 'ok' : 'missing';
  }

  if (
    proposal.operation === 'update_project_context' ||
    proposal.operation === 'update_project_summary'
  ) {
    const projectId = text(proposal.params.projectId) || proposal.entityId || '';
    const project = projectId ? await getProjectFromStore(store, userId, projectId) : null;
    if (!project) return 'missing';
    const expected = proposal.beforeState;
    if (
      text(expected.updatedAt) &&
      project.updatedAt &&
      text(expected.updatedAt) !== project.updatedAt
    ) {
      return 'stale';
    }
    if (
      expected.briefRevision !== undefined &&
      Number(expected.briefRevision) !== project.briefRevision
    ) {
      return 'stale';
    }
    return 'ok';
  }

  if (proposal.operation === 'create_artifact') {
    const projectId = text(proposal.params.projectId) || proposal.entityId || '';
    if (!projectId) return 'missing';
    const project = await getProjectFromStore(store, userId, projectId);
    return project ? 'ok' : 'missing';
  }

  if (
    proposal.operation === 'create_task' ||
    proposal.operation === 'create_reminder' ||
    proposal.operation === 'create_memory'
  ) {
    return 'ok';
  }

  if (proposal.operation === 'link_project' || proposal.operation === 'move_task') {
    const projectId = text(proposal.params.projectId);
    if (!projectId) return 'missing';
    const project = await getProjectFromStore(store, userId, projectId);
    if (!project) return 'missing';
    const taskId = text(proposal.params.taskId) || proposal.entityId || '';
    if (!taskId) return 'missing';
    const task = await getMemoryRecord(store, userId, taskId);
    if (!task) return 'missing';
    if (
      text(proposal.beforeState.updatedAt) &&
      text(proposal.beforeState.updatedAt) !== task.updatedAt
    )
      return 'stale';
    return 'ok';
  }

  if (proposal.operation === 'create_issue' || proposal.operation === 'update_issue') {
    if (proposal.params.taskId) {
      return validateTarget(store, userId, {
        ...proposal,
        operation: 'update_task',
        params: { taskId: proposal.params.taskId },
      });
    }
    return 'ok';
  }

  const entityId =
    text(proposal.params.taskId) || text(proposal.params.memoryId) || proposal.entityId || '';
  if (!entityId) return 'ok';
  const record = await getMemoryRecord(store, userId, entityId);
  if (!record) return 'missing';
  const expected = proposal.beforeState;
  if (text(expected.updatedAt) && text(expected.updatedAt) !== record.updatedAt) return 'stale';
  if (text(expected.status) && text(expected.status) !== record.status) return 'stale';
  if (text(expected.kind) && text(expected.kind) !== record.kind) return 'stale';
  if (text(expected.title) && text(expected.title) !== record.title) return 'stale';
  return 'ok';
}

function resultDetail(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 800);
}

function sourceTextFor(proposal: GroomingProposal): string | null {
  const ref = proposal.sourceRefs.find((item) => item.quote || item.title);
  return ref?.quote || ref?.title || null;
}

function proposalOutcome(
  proposal: GroomingProposal,
  result: GroomingExecutionResult['result']
): import('@/lib/pierrot/learning/types').TaskExperienceOutcome | null {
  if (result === 'skipped') return null;
  if (result === 'failed' || result === 'stale') {
    return proposal.operation.startsWith('create_') ? 'false_task' : 'display_error';
  }
  if (proposal.operation === 'create_task' || proposal.operation === 'create_reminder') {
    return 'confirmed';
  }
  if (proposal.operation === 'create_memory' || proposal.operation === 'create_artifact') {
    return 'confirmed';
  }
  if (proposal.operation === 'complete_task') return 'confirmed';
  if (proposal.operation === 'merge_tasks' || proposal.operation === 'merge_memory') {
    return 'duplicate';
  }
  if (proposal.operation === 'reclassify_task' || proposal.operation === 'reclassify_memory') {
    return 'wrong_kind';
  }
  if (proposal.operation === 'move_task' || proposal.operation === 'link_project') {
    return 'wrong_project';
  }
  if (proposal.operation === 'archive_task' || proposal.operation === 'archive_memory') {
    return text(proposal.params.reason) === 'command_artifact' ? 'false_task' : 'wrong_status';
  }
  return null;
}

function rejectedOutcome(
  proposal: GroomingProposal
): import('@/lib/pierrot/learning/types').TaskExperienceOutcome {
  if (proposal.operation.startsWith('create_') || proposal.operation.startsWith('reclassify_')) {
    return 'false_task';
  }
  if (proposal.operation === 'complete_task' || proposal.operation === 'archive_task') {
    return 'wrong_status';
  }
  if (proposal.operation === 'move_task' || proposal.operation === 'link_project') {
    return 'wrong_project';
  }
  if (proposal.operation === 'merge_tasks' || proposal.operation === 'merge_memory') {
    return 'duplicate';
  }
  return 'display_error';
}

async function recordProposalExperience(input: {
  store: SupabaseClient;
  userId: string;
  conversationId: string;
  auditId: string;
  proposal: GroomingProposal;
  result: GroomingExecutionResult['result'];
  rejected?: boolean;
}): Promise<void> {
  try {
    const outcome = input.rejected
      ? rejectedOutcome(input.proposal)
      : proposalOutcome(input.proposal, input.result);
    if (!outcome) return;

    const beforeKind = text(input.proposal.beforeState.kind) || null;
    const confirmedKind = input.rejected
      ? beforeKind
      : text(input.proposal.params.kind) ||
        (input.proposal.operation === 'create_task'
          ? 'task'
          : input.proposal.operation === 'create_reminder'
            ? 'reminder'
            : input.proposal.operation === 'create_memory'
              ? text(input.proposal.params.kind) || 'saved'
              : null);

    await recordTaskExperience(input.store, {
      userId: input.userId,
      conversationId: input.conversationId,
      sourceMessageId:
        input.proposal.sourceRefs.find((ref) => ref.id && ref.type === 'conversation_message')
          ?.id || null,
      sourceText: sourceTextFor(input.proposal),
      proposedKind:
        beforeKind || (input.rejected ? text(input.proposal.params.kind) || null : null),
      confirmedKind,
      proposedProjectId: input.proposal.projectId,
      confirmedProjectId: input.rejected
        ? input.proposal.projectId
        : text(input.proposal.params.projectId) || input.proposal.projectId,
      outcome,
      reason: input.rejected ? 'Owner rejected this proposed operation.' : input.proposal.reason,
      source: 'grooming',
      analyzerVersion: 'workspace-grooming-v1',
      metadata: {
        auditId: input.auditId,
        operation: input.proposal.operation,
        proposalId: input.proposal.id,
        risk: input.proposal.risk,
        rejected: input.rejected === true,
      },
    });
  } catch {
    // Experience capture is advisory and must never fail the approved action.
  }
}
async function getProjectFromStore(store: SupabaseClient, userId: string, projectId: string) {
  const { data, error } = await store
    .from('pierrot_projects')
    .select('*')
    .eq('id', projectId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProject(data as Record<string, unknown>) : null;
}

async function projectForProposal(
  store: SupabaseClient,
  userId: string,
  proposal: GroomingProposal
) {
  const projectId = text(proposal.params.projectId) || proposal.projectId || '';
  return projectId ? getProjectFromStore(store, userId, projectId) : null;
}

async function linkCreatedRecord(input: {
  store: SupabaseClient;
  userId: string;
  decisionId: string;
  projectId: string | null;
}): Promise<boolean> {
  if (!input.projectId) return true;
  const project = await getProjectFromStore(input.store, input.userId, input.projectId);
  if (!project) throw new GroomingExecutionError('PROJECT_NOT_FOUND');
  await moveDecisionToProject(input.store, input.userId, input.decisionId, project);
  const { data, error } = await input.store
    .from('pierrot_project_decisions')
    .select('project_id')
    .eq('owner_user_id', input.userId)
    .eq('decision_id', input.decisionId);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).some((row) => row && row.project_id === project.id);
}

async function executeProposal(input: {
  store: SupabaseClient;
  userId: string;
  auditId: string;
  proposal: GroomingProposal;
  approvalAt: string | null;
}): Promise<GroomingExecutionResult> {
  const { store, userId, auditId, proposal } = input;
  const base = {
    proposalId: proposal.id,
    ordinal: proposal.ordinal,
    operation: proposal.operation,
    title: proposal.title,
    entityId: proposal.entityId,
  };

  const validation = await validateTarget(store, userId, proposal);
  if (validation !== 'ok') {
    return {
      ...base,
      result: validation === 'stale' ? 'stale' : 'failed',
      detail:
        validation === 'stale'
          ? 'Объект изменился после аудита. Операция остановлена; повторите аудит.'
          : 'Объект больше не существует. Операция не выполнена.',
      errorCode: validation === 'stale' ? 'STALE_PLAN' : 'ENTITY_NOT_FOUND',
    };
  }

  if (proposal.operation === 'create_task') {
    const content = text(proposal.params.content);
    if (content.length < 3) throw new GroomingExecutionError('INVALID_TASK_CONTENT');
    const created = await createOwnerTask({
      store,
      userId,
      content,
      projectRef: text(proposal.params.projectId) || null,
      messageId: proposal.sourceRefs[0]?.id || null,
      originalMessage: content,
      skipEmbedding: true,
    });
    if (created.status !== 'created' && created.status !== 'already_exists') {
      throw new GroomingExecutionError(`TASK_${created.status.toUpperCase()}`);
    }
    return {
      ...base,
      result: 'executed',
      detail:
        created.status === 'already_exists'
          ? `Задача уже существовала: «${created.task.title}». Дубликат не создан.`
          : `Создана задача «${created.task.title}».`,
      entityId: created.task.id,
    };
  }

  if (proposal.operation === 'create_reminder') {
    const content = text(proposal.params.content);
    if (content.length < 3) throw new GroomingExecutionError('INVALID_REMINDER_CONTENT');
    const project = await projectForProposal(store, userId, proposal);
    const created = await createMemoryRecord(store, userId, {
      kind: 'reminder',
      title: text(proposal.params.title) || undefined,
      content,
      project: project?.name || null,
      reviewAt: text(proposal.params.reviewAt) || null,
      tags: Array.isArray(proposal.params.tags)
        ? (proposal.params.tags as unknown[]).filter(
            (tag): tag is string => typeof tag === 'string'
          )
        : ['project-review', 'reminder'],
      conversationId: text(proposal.params.conversationId) || null,
      messageId: text(proposal.sourceRefs[0]?.id) || null,
      sourceRefs: proposal.sourceRefs as never,
      skipEmbedding: true,
    });
    const linked = await linkCreatedRecord({
      store,
      userId,
      decisionId: created.id,
      projectId: project?.id || null,
    });
    if (!linked) throw new GroomingExecutionError('PROJECT_LINK_NOT_CONFIRMED');
    return {
      ...base,
      result: 'executed',
      detail: created.deduplicated
        ? `Напоминание уже существовало: «${created.title}».`
        : `Создано напоминание «${created.title}».`,
      entityId: created.id,
    };
  }

  if (proposal.operation === 'create_artifact') {
    const project = await projectForProposal(store, userId, proposal);
    if (!project) throw new GroomingExecutionError('PROJECT_REQUIRED');
    const url = text(proposal.params.url);
    const title = text(proposal.params.title) || url;
    if (!url || title.length < 2) throw new GroomingExecutionError('ARTIFACT_FIELDS_REQUIRED');

    // Re-running an audit (or a second audit detecting the same link) must not
    // create a second material row.
    const { data: existingArtifacts, error: existingError } = await store
      .from('pierrot_project_artifacts')
      .select('id,title,content,metadata')
      .eq('project_id', project.id)
      .eq('owner_user_id', userId)
      .limit(2_000);
    if (existingError) throw existingError;
    const wantedKey = normaliseUrlKey(url);
    const duplicate = (Array.isArray(existingArtifacts) ? existingArtifacts : []).find((row) => {
      if (!row || typeof row !== 'object') return false;
      const item = row as Record<string, unknown>;
      const content = text(item.content);
      const metadata = object(item.metadata);
      const candidate = text(metadata.url) || (/https?:\/\//iu.test(content) ? content : '');
      return Boolean(candidate) && normaliseUrlKey(candidate) === wantedKey;
    });
    if (duplicate) {
      return {
        ...base,
        result: 'skipped',
        detail: `Материал уже существует: «${text((duplicate as Record<string, unknown>).title)}». Дубликат не создан.`,
        entityId: text((duplicate as Record<string, unknown>).id) || null,
      };
    }

    const { data, error } = await store
      .from('pierrot_project_artifacts')
      .insert({
        project_id: project.id,
        owner_user_id: userId,
        title: title.slice(0, 240),
        artifact_type: text(proposal.params.artifactType) || 'link',
        content: url,
        source_conversation_id: text(proposal.params.conversationId) || null,
        metadata: {
          url,
          source_message_id: text(proposal.sourceRefs[0]?.id) || null,
          source_refs: proposal.sourceRefs,
          created_by: 'workspace_grooming',
        },
      })
      .select('id,title')
      .single();
    if (error || !data) throw error || new GroomingExecutionError('ARTIFACT_WRITE_FAILED');
    return {
      ...base,
      result: 'executed',
      detail: `Сохранён материал «${text((data as Record<string, unknown>).title)}» (${url}).`,
      entityId: text((data as Record<string, unknown>).id) || null,
    };
  }

  if (proposal.operation === 'create_memory') {
    const content = text(proposal.params.content);
    const kind = text(proposal.params.kind) || 'saved';
    if (!content) throw new GroomingExecutionError('INVALID_MEMORY_CONTENT');
    const project = await projectForProposal(store, userId, proposal);
    const created = await createMemoryRecord(store, userId, {
      kind: kind as never,
      title: text(proposal.params.title) || undefined,
      content,
      project: text(proposal.params.project) || project?.name || null,
      tags: Array.isArray(proposal.params.tags)
        ? (proposal.params.tags as unknown[]).filter(
            (tag): tag is string => typeof tag === 'string'
          )
        : [],
      conversationId: text(proposal.params.conversationId) || null,
      messageId: text(proposal.sourceRefs[0]?.id) || null,
      sourceRefs: proposal.sourceRefs as never,
      skipEmbedding: true,
    });
    if (project) {
      await linkCreatedRecord({
        store,
        userId,
        decisionId: created.id,
        projectId: project.id,
      });
    }
    return {
      ...base,
      result: 'executed',
      detail: created.deduplicated
        ? `Запись уже существовала: «${created.title}».`
        : `Создана запись памяти «${created.title}».`,
      entityId: created.id,
    };
  }

  if (proposal.operation === 'merge_tasks' || proposal.operation === 'merge_memory') {
    const keeperId = text(proposal.params.keeperId);
    const duplicateIds = Array.isArray(proposal.params.duplicateIds)
      ? (proposal.params.duplicateIds as unknown[]).filter(
          (id): id is string => typeof id === 'string'
        )
      : [];
    const keeper = keeperId ? await getMemoryRecord(store, userId, keeperId) : null;
    if (!keeper) throw new GroomingExecutionError('KEEPER_NOT_FOUND');
    const duplicates = await listMemoryRecordsByIds(store, userId, duplicateIds);
    let merged = 0;
    for (const duplicate of duplicates) {
      if (duplicate.id === keeper.id) continue;
      if (duplicate.status !== 'current' && duplicate.status !== 'uncertain') continue;
      await updateMemoryRecord(store, userId, duplicate.id, {
        status: 'superseded',
        supersededBy: keeper.id,
        archivedReason: 'workspace_grooming_duplicate',
        eventReason: 'workspace_grooming_duplicate_merge',
        eventSource: auditId,
      });
      merged += 1;
    }
    if (merged === 0) {
      return {
        ...base,
        result: 'skipped',
        detail: 'Дубликаты уже неактивны; повторное объединение не требуется.',
        entityId: keeperId,
      };
    }
    return {
      ...base,
      result: 'executed',
      detail: `Объединено дублей: ${merged}. Основная запись: «${keeper.title}».`,
      entityId: keeperId,
    };
  }

  if (
    proposal.operation === 'complete_task' ||
    proposal.operation === 'reopen_task' ||
    proposal.operation === 'archive_task' ||
    proposal.operation === 'update_memory' ||
    proposal.operation === 'archive_memory' ||
    proposal.operation === 'update_task'
  ) {
    const entityId =
      text(proposal.params.taskId) || text(proposal.params.memoryId) || proposal.entityId || '';
    const patch = object(proposal.params.patch);
    const status =
      proposal.operation === 'complete_task'
        ? 'completed'
        : proposal.operation === 'reopen_task'
          ? 'current'
          : proposal.operation === 'archive_task' || proposal.operation === 'archive_memory'
            ? 'archived'
            : undefined;
    const updated = await updateMemoryRecord(store, userId, entityId, {
      ...(status ? { status } : {}),
      ...(text(patch.title) ? { title: text(patch.title) } : {}),
      ...(text(patch.content) ? { content: text(patch.content) } : {}),
      ...(patch.project !== undefined ? { project: text(patch.project) || null } : {}),
      ...(Array.isArray(patch.tags)
        ? {
            tags: (patch.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string'),
          }
        : {}),
      ...(status ? { eventReason: `workspace_grooming_${proposal.operation}` } : {}),
      ...(proposal.operation === 'archive_task' || proposal.operation === 'archive_memory'
        ? { archivedReason: text(proposal.params.reason) || 'workspace_grooming_archive' }
        : {}),
    });

    if (status && updated.status !== status) {
      throw new GroomingExecutionError('VERIFICATION_FAILED');
    }
    if (text(patch.title) && updated.title !== text(patch.title)) {
      throw new GroomingExecutionError('VERIFICATION_FAILED');
    }

    if (proposal.operation === 'complete_task' && proposal.params.repository) {
      await upsertGithubTaskLink(store, {
        userId,
        decisionId: updated.id,
        repository: text(proposal.params.repository) as never,
        issueNumber: Number(proposal.params.issueNumber || 0),
        issueUrl: text(proposal.params.issueUrl) || null,
        pullRequestNumber:
          Array.isArray(proposal.params.pullRequests) && proposal.params.pullRequests[0]
            ? Number((proposal.params.pullRequests[0] as Record<string, unknown>).number) || null
            : null,
        pullRequestUrl:
          Array.isArray(proposal.params.pullRequests) && proposal.params.pullRequests[0]
            ? text((proposal.params.pullRequests[0] as Record<string, unknown>).url) || null
            : null,
        lastState: 'closed',
        lastResult: 'confirmed_done',
      }).catch(() => undefined);
    }

    return {
      ...base,
      result: 'executed',
      detail:
        proposal.operation === 'complete_task'
          ? `Задача «${updated.title}» отмечена выполненной.`
          : proposal.operation === 'reopen_task'
            ? `Задача «${updated.title}» снова открыта.`
            : proposal.operation === 'archive_task' || proposal.operation === 'archive_memory'
              ? `Запись «${updated.title}» отправлена в архив.`
              : `Обновлена запись «${updated.title}».`,
      entityId: updated.id,
    };
  }

  if (proposal.operation === 'reclassify_task' || proposal.operation === 'reclassify_memory') {
    const entityId =
      text(proposal.params.taskId) || text(proposal.params.memoryId) || proposal.entityId || '';
    const kind = text(proposal.params.kind);
    if (!kind) throw new GroomingExecutionError('KIND_REQUIRED');
    const updated = await updateKind({
      store,
      userId,
      id: entityId,
      kind,
      tags: Array.isArray(proposal.params.tags)
        ? (proposal.params.tags as unknown[]).filter(
            (tag): tag is string => typeof tag === 'string'
          )
        : undefined,
    });
    return {
      ...base,
      result: 'executed',
      detail: `Запись «${updated.title}» переклассифицирована в ${kind}.`,
      entityId: updated.id,
    };
  }

  if (proposal.operation === 'link_project' || proposal.operation === 'move_task') {
    const taskId = text(proposal.params.taskId) || proposal.entityId || '';
    const projectId = text(proposal.params.projectId);
    const project = projectId ? await getProjectFromStore(store, userId, projectId) : null;
    if (!project) throw new GroomingExecutionError('PROJECT_NOT_FOUND');
    await moveDecisionToProject(store, userId, taskId, project);
    const linked = await listProjectTasks(store, userId, project.id, {
      statuses: ['current', 'uncertain', 'completed'],
      limit: 500,
    });
    if (!linked.some((record) => record.id === taskId)) {
      throw new GroomingExecutionError('PROJECT_LINK_NOT_CONFIRMED');
    }
    return {
      ...base,
      result: 'executed',
      detail: `Задача связана с проектом «${project.name}».`,
      entityId: taskId,
    };
  }

  if (
    proposal.operation === 'link_github_issue' ||
    proposal.operation === 'link_pull_request' ||
    proposal.operation === 'sync_remote_status'
  ) {
    const taskId = text(proposal.params.taskId) || proposal.entityId || '';
    const repository = text(proposal.params.repository);
    const issueNumber = Number(proposal.params.issueNumber || 0);
    if (!taskId || !repository || issueNumber <= 0) {
      throw new GroomingExecutionError('GITHUB_LINK_INVALID');
    }
    const link = await upsertGithubTaskLink(store, {
      userId,
      decisionId: taskId,
      repository: repository as never,
      issueNumber,
      issueUrl: text(proposal.params.issueUrl) || null,
      pullRequestNumber: Number(proposal.params.pullRequestNumber || 0) || null,
      pullRequestUrl: text(proposal.params.pullRequestUrl) || null,
      lastState: text(proposal.params.lastState) || null,
      lastResult: (text(proposal.params.lastResult) || null) as never,
    });
    return {
      ...base,
      result: 'executed',
      detail: `GitHub-связь сохранена: ${repository}#${link.issueNumber}.`,
      entityId: taskId,
      link: link.issueUrl,
    };
  }

  if (proposal.operation === 'create_issue') {
    const { createDevIssue } = await import('../dev/write');
    const repository = text(proposal.params.repository);
    const title = text(proposal.params.title);
    if (!repository || !title) throw new GroomingExecutionError('ISSUE_FIELDS_REQUIRED');
    const issue = await createDevIssue({
      repository,
      title,
      body: text(proposal.params.body),
      labels: Array.isArray(proposal.params.labels) ? proposal.params.labels : [],
      confirmed: true,
    });
    const taskId = text(proposal.params.taskId);
    if (taskId) {
      await upsertGithubTaskLink(store, {
        userId,
        decisionId: taskId,
        repository: repository as never,
        issueNumber: issue.number,
        issueUrl: issue.url,
        lastState: issue.state,
        lastResult: 'still_open',
      }).catch(() => undefined);
    }
    return {
      ...base,
      result: 'executed',
      detail: `Создана Issue #${issue.number}: ${issue.title}.`,
      entityId: taskId || null,
      link: issue.url,
    };
  }

  if (proposal.operation === 'update_issue') {
    const { updateDevIssueState } = await import('../dev/write');
    const repository = text(proposal.params.repository);
    const number = Number(proposal.params.number || 0);
    const state = text(proposal.params.state);
    if (!repository || number <= 0 || (state !== 'open' && state !== 'closed')) {
      throw new GroomingExecutionError('ISSUE_FIELDS_REQUIRED');
    }
    const issue = await updateDevIssueState({
      repository,
      number,
      state,
      confirmed: true,
    });
    return {
      ...base,
      result: 'executed',
      detail: `Issue #${issue.number} переведена в состояние ${issue.state}.`,
      entityId: proposal.entityId,
      link: issue.url,
    };
  }

  if (
    proposal.operation === 'update_project_context' ||
    proposal.operation === 'update_project_summary'
  ) {
    const projectId = text(proposal.params.projectId) || proposal.entityId || '';
    const summary = text(proposal.params.projectBrief) || text(proposal.params.summary) || '';
    if (!projectId || summary.length < 10) {
      throw new GroomingExecutionError('PROJECT_CONTEXT_REQUIRED');
    }
    const updated = await updatePierrotProject(userId, projectId, {
      projectBrief: summary,
      briefChangeNote: text(proposal.params.changeNote) || 'Workspace grooming update',
    });
    if (!updated) throw new GroomingExecutionError('PROJECT_NOT_FOUND');
    const verified = await getProjectFromStore(store, userId, projectId);
    if (!verified || verified.projectBrief !== summary) {
      throw new GroomingExecutionError('PROJECT_CONTEXT_NOT_CONFIRMED');
    }
    return {
      ...base,
      result: 'executed',
      detail: `Контекст проекта «${verified.name}» обновлён до ревизии ${verified.briefRevision}.`,
      entityId: verified.id,
    };
  }

  if (
    proposal.operation === 'create_context_summary' ||
    proposal.operation === 'update_context_summary'
  ) {
    const conversationId = text(proposal.params.conversationId) || proposal.entityId || '';
    if (!conversationId) throw new GroomingExecutionError('CONVERSATION_REQUIRED');
    const summary = await createContextSummary(store, { userId, conversationId });
    const verified = await loadLatestContextSummary(store, userId, conversationId);
    if (!verified || verified.version < summary.version) {
      throw new GroomingExecutionError('CONTEXT_SUMMARY_NOT_CONFIRMED');
    }
    return {
      ...base,
      result: 'executed',
      detail: `Создано резюме диалога, версия ${summary.version}; исходные сообщения сохранены.`,
      entityId: conversationId,
    };
  }

  if (proposal.operation === 'archive_context_reference') {
    return {
      ...base,
      result: 'skipped',
      detail:
        'Ссылка на контекст не удаляется: оригинальные сообщения и источники остаются неизменными.',
    };
  }

  return {
    ...base,
    result: 'failed',
    detail: `Операция ${proposal.operation} не поддерживается исполнителем.`,
    errorCode: 'UNSUPPORTED_OPERATION',
  };
}

export async function executeApprovedPlan(input: {
  store: SupabaseClient;
  userId: string;
  auditId: string;
  mode: 'all' | 'safe' | 'selected' | 'reject_all';
  ordinals?: number[];
}): Promise<GroomingExecutionReport> {
  const audit = await loadAuditById(input.store, input.userId, input.auditId);
  if (!audit) throw new GroomingExecutionError('AUDIT_NOT_FOUND');
  if (Date.parse(audit.expiresAt) <= Date.now()) {
    await updateAuditStatus(input.store, {
      auditId: audit.id,
      userId: input.userId,
      status: 'expired',
    });
    throw new GroomingExecutionError('AUDIT_EXPIRED');
  }
  if (!['prepared', 'approved'].includes(audit.status)) {
    if (
      audit.status === 'completed' ||
      audit.status === 'partial' ||
      audit.status === 'cancelled'
    ) {
      const results: GroomingExecutionResult[] = audit.proposals
        .filter((proposal) => proposal.status !== 'proposed')
        .map((proposal) => ({
          proposalId: proposal.id,
          ordinal: proposal.ordinal,
          operation: proposal.operation,
          result:
            proposal.status === 'executed'
              ? 'executed'
              : proposal.status === 'failed'
                ? 'failed'
                : proposal.status === 'stale'
                  ? 'stale'
                  : 'skipped',
          title: proposal.title,
          detail: 'Повторное исполнение не требуется: операция уже обработана.',
          entityId: proposal.entityId,
          errorCode: proposal.errorCode,
        }));
      return {
        auditId: audit.id,
        status: audit.status === 'partial' ? 'partial' : 'completed',
        results,
        executed: results.filter((item) => item.result === 'executed').length,
        skipped: results.filter((item) => item.result === 'skipped').length,
        failed: results.filter((item) => item.result === 'failed').length,
        stale: results.filter((item) => item.result === 'stale').length,
      };
    }
    throw new GroomingExecutionError('AUDIT_NOT_PENDING');
  }

  if (input.mode === 'reject_all') {
    await selectProposals(input.store, {
      auditId: audit.id,
      userId: input.userId,
      selectedIds: [],
      rejectedIds: audit.proposals
        .filter((proposal) => proposal.status === 'proposed')
        .map((proposal) => proposal.id),
    });
    await updateAuditStatus(input.store, {
      auditId: audit.id,
      userId: input.userId,
      status: 'cancelled',
      executedAt: new Date().toISOString(),
    });
    for (const proposal of audit.proposals.filter((item) => item.status === 'proposed')) {
      await recordProposalExperience({
        store: input.store,
        userId: input.userId,
        conversationId: audit.conversationId,
        auditId: audit.id,
        proposal,
        result: 'skipped',
        rejected: true,
      });
    }
    return {
      auditId: audit.id,
      status: 'completed',
      results: [],
      executed: 0,
      skipped: audit.proposals.filter((proposal) => proposal.status === 'proposed').length,
      failed: 0,
      stale: 0,
    };
  }

  const ordinals = new Set(input.ordinals || []);
  const selected = audit.proposals.filter((proposal) => {
    if (proposal.status !== 'proposed') return false;
    if (input.mode === 'all') return true;
    if (input.mode === 'safe') return riskAllowsSafe(proposal);
    return ordinals.has(proposal.ordinal);
  });

  if (selected.length === 0) {
    throw new GroomingExecutionError('NO_MATCHING_PROPOSALS');
  }

  const selectedIds = new Set(selected.map((proposal) => proposal.id));
  await selectProposals(input.store, {
    auditId: audit.id,
    userId: input.userId,
    selectedIds: selected.map((proposal) => proposal.id),
    rejectedIds:
      input.mode === 'all' || input.mode === 'safe'
        ? []
        : audit.proposals
            .filter(
              (proposal) =>
                proposal.status === 'proposed' && !selectedIds.has(proposal.id) && ordinals.size > 0
            )
            .map((proposal) => proposal.id),
  });

  if (input.mode === 'selected' && ordinals.size > 0) {
    for (const proposal of audit.proposals) {
      if (proposal.status !== 'proposed' || selectedIds.has(proposal.id)) continue;
      await recordProposalExperience({
        store: input.store,
        userId: input.userId,
        conversationId: audit.conversationId,
        auditId: audit.id,
        proposal,
        result: 'skipped',
        rejected: true,
      });
    }
  }

  const approvalAt = new Date().toISOString();
  await updateAuditStatus(input.store, {
    auditId: audit.id,
    userId: input.userId,
    status: 'executing',
    approvedAt: approvalAt,
  });

  const results: GroomingExecutionResult[] = [];
  for (const proposal of selected) {
    const current = await loadAuditById(input.store, input.userId, audit.id);
    const freshProposal = current?.proposals.find((item) => item.id === proposal.id);
    if (!freshProposal || !['proposed', 'approved'].includes(freshProposal.status)) {
      results.push({
        proposalId: proposal.id,
        ordinal: proposal.ordinal,
        operation: proposal.operation,
        result: 'skipped',
        title: proposal.title,
        detail: 'Операция уже выполнена или отклонена.',
        entityId: proposal.entityId,
      });
      continue;
    }

    let result: GroomingExecutionResult;
    try {
      result = await executeProposal({
        store: input.store,
        userId: input.userId,
        auditId: audit.id,
        proposal: freshProposal,
        approvalAt,
      });
    } catch (error) {
      if (isGroomingStorageUnavailable(error)) throw error;
      const code =
        error instanceof GroomingExecutionError
          ? error.code
          : error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code)
            : 'EXECUTION_FAILED';
      result = {
        proposalId: freshProposal.id,
        ordinal: freshProposal.ordinal,
        operation: freshProposal.operation,
        result: 'failed',
        title: freshProposal.title,
        detail:
          error instanceof Error
            ? error.message.slice(0, 500)
            : error && typeof error === 'object' && 'message' in error
              ? String((error as { message?: unknown }).message).slice(0, 500)
              : 'Операция не выполнена.',
        entityId: freshProposal.entityId,
        errorCode: code,
      };
    }
    results.push(result);

    await markProposalResult(input.store, {
      proposalId: freshProposal.id,
      userId: input.userId,
      status:
        result.result === 'executed'
          ? 'executed'
          : result.result === 'skipped'
            ? 'skipped'
            : result.result === 'stale'
              ? 'stale'
              : 'failed',
      result: {
        detail: result.detail,
        link: result.link || null,
        entityId: result.entityId,
      },
      errorCode: result.errorCode || null,
    });

    await recordOperation(input.store, {
      auditId: audit.id,
      proposalId: freshProposal.id,
      userId: input.userId,
      operation: freshProposal.operation,
      entityType: freshProposal.entityType,
      entityId: result.entityId,
      beforeState: freshProposal.beforeState,
      afterState: {
        result: result.result,
        detail: result.detail,
        link: result.link || null,
      },
      sourceRefs: freshProposal.sourceRefs,
      idempotencyKey: result.result === 'executed' ? `${audit.id}:${freshProposal.id}` : null,
      approvalAt,
      result: result.result,
      errorDetails: result.errorCode || null,
    }).catch((error) => {
      if (isGroomingStorageUnavailable(error)) throw error;
      const index = results.length - 1;
      if (index >= 0) {
        results[index] = {
          ...results[index],
          result: 'failed',
          detail: `${results[index].detail} Журнал операции не сохранился.`,
          errorCode: 'JOURNAL_WRITE_FAILED',
        };
      }
    });

    await recordProposalExperience({
      store: input.store,
      userId: input.userId,
      conversationId: audit.conversationId,
      auditId: audit.id,
      proposal: freshProposal,
      result: result.result,
    });
  }

  const failed = results.filter((item) => item.result === 'failed').length;
  const stale = results.filter((item) => item.result === 'stale').length;
  const skipped = results.filter((item) => item.result === 'skipped').length;
  const executed = results.filter((item) => item.result === 'executed').length;
  const status = failed > 0 || stale > 0 ? 'partial' : 'completed';

  await updateAuditStatus(input.store, {
    auditId: audit.id,
    userId: input.userId,
    status,
    executedAt: new Date().toISOString(),
  });

  return {
    auditId: audit.id,
    status,
    results,
    executed,
    skipped,
    failed,
    stale,
  };
}
