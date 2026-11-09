import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotProjectSnapshot } from '../types';
import { loadProjectHistoryMessages } from '../history';
import { listDecisionIdsForProject } from '../links';
import { listProjectConversationIds } from '../conversation';
import { listDevTasks } from '@/lib/pierrot/dev/tasks';
import { listMemoryRecordsByIds } from '@/lib/pierrot/memory/store';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import { prepareWorkspaceAudit } from '@/lib/pierrot/grooming/service';
import { listTaskExperiences } from '@/lib/pierrot/learning/store';
import { analyzeProjectReview } from './analyze';
import { buildProjectReviewProposals } from './plan';

assertServerOnly('lib/pierrot/projects/review/service');

const MAX_REVIEW_MESSAGES = 5_000;

export type ProjectReviewResult = {
  runId: string;
  status: 'prepared' | 'completed' | 'partial' | 'failed' | 'already_running' | 'replayed';
  reply: string;
  report: Record<string, unknown> | null;
  summary: string | null;
  planView?: import('@/lib/pierrot/grooming/types').GroomingPlanView;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function extractUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"')]+/iu);
  return match ? match[0].replace(/[.,;:!?]+$/g, '') : null;
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
    .limit(500);

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

/**
 * Project review is now a plan-first operation. It reads the canonical project
 * conversation and existing records, produces concrete proposals and stores
 * them in the shared workspace audit. No task, memory, project or artifact is
 * changed until the owner approves that audit in a later turn.
 */
export async function prepareProjectReview(input: {
  store: SupabaseClient;
  ownerUserId: string;
  project: PierrotProjectSnapshot;
  conversationId: string;
  requestMessageId: string;
  language?: 'ru' | 'en';
}): Promise<ProjectReviewResult> {
  const { store, ownerUserId, project, conversationId, requestMessageId } = input;
  const language = input.language === 'en' ? 'en' : 'ru';

  const [messages, linkedRecords, artifacts, learningExamples, conversationIds, devTaskResult] =
    await Promise.all([
      loadProjectHistoryMessages(store, ownerUserId, project.id, {
        limit: MAX_REVIEW_MESSAGES,
      }),
      linkedMemoryRecords(store, ownerUserId, project.id),
      projectArtifacts(store, ownerUserId, project.id),
      listTaskExperiences(store, { userId: ownerUserId, limit: 300 }).catch(() => []),
      listProjectConversationIds(store, ownerUserId, project.id).catch(() => []),
      listDevTasks(ownerUserId, 200).catch(() => ({ tasks: [], migrationRequired: false })),
    ]);

  const linkedIds = new Set(linkedRecords.map((record) => record.id));
  const orphans = await orphanMirrorTasks(store, ownerUserId, project, linkedIds);
  const allRecords = [...linkedRecords, ...orphans];
  const tasks = allRecords.filter((record) => record.kind === 'task' || record.kind === 'reminder');
  const devTasks = devTaskResult.tasks.filter(
    (task) => !task.projectId || task.projectId === project.id
  );
  const decisions = allRecords.filter(
    (record) =>
      record.kind === 'decision' ||
      record.kind === 'position' ||
      record.kind === 'preference' ||
      record.kind === 'constraint'
  );

  const analysis = analyzeProjectReview({
    messages,
    existingTasks: [
      ...tasks.map((record) => ({
        id: record.id,
        title: record.title,
        content: record.content,
        status: record.status,
        createdAt: record.createdAt,
      })),
      // Dev tasks are a separate execution surface, not a second task store.
      // Treat an equivalent draft/used Dev task as an existing obligation so
      // project review does not create a duplicate local task.
      ...devTasks.map((task) => ({
        id: task.id,
        title: task.title,
        content: task.title,
        status: 'draft',
        createdAt: task.createdAt,
      })),
    ],
    existingDecisions: decisions.map((record) => ({
      id: record.id,
      title: record.title,
      content: record.content,
      status: record.status,
      kind: record.kind,
    })),
    existingMaterials: artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      url: artifact.url,
    })),
    learningExamples,
    projectName: project.name,
  });

  const plan = buildProjectReviewProposals({ project, analysis });
  if (messages.length >= MAX_REVIEW_MESSAGES) {
    plan.warnings.push(
      `История ограничена последними ${MAX_REVIEW_MESSAGES} сообщениями. Старые сообщения не удалены и доступны в чате; повторный аудит продолжит с сохранённой контрольной точки.`
    );
  }
  const prepared = await prepareWorkspaceAudit({
    store,
    userId: ownerUserId,
    conversationId,
    requestMessageId,
    scope: 'projects',
    projectId: project.id,
    language,
    additionalProposals: plan.proposals,
    additionalWarnings: plan.warnings,
    additionalAmbiguous: plan.ambiguous,
    summaryOverrides: {
      sourceMessageCount: messages.length,
      conversationCount: conversationIds.length,
      openTaskCount: tasks.filter((record) => record.status === 'current').length,
      decisionCount: decisions.filter((record) => record.status === 'current').length,
      materialCount: analysis.materials.length,
      contradictionCount: analysis.contradictions.length,
    },
  });

  return {
    runId: prepared.audit.id,
    status: 'prepared',
    reply: prepared.reply,
    summary: null,
    planView: prepared.planView,
    report: {
      version: 2,
      projectId: project.id,
      projectSlug: project.slug,
      conversationId,
      requestMessageId,
      auditId: prepared.audit.id,
      checked: messages.length + allRecords.length + artifacts.length + analysis.materials.length,
      proposalCount: prepared.audit.proposals.length,
      counts: {
        tasks: analysis.tasks.length,
        reminders: analysis.reminders.length,
        decisions: analysis.decisions.length,
        knowledge: analysis.knowledge.length,
        ideas: analysis.ideas.length,
        materials: analysis.materials.length,
        completions: analysis.completions.length,
        documents: analysis.skippedDocuments.length,
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Backwards-compatible entry point. It intentionally prepares a plan and never
 * applies it; execution goes through the shared grooming approval command.
 */
export async function runProjectReview(input: {
  store: SupabaseClient;
  ownerUserId: string;
  project: PierrotProjectSnapshot;
  conversationId: string;
  requestMessageId: string;
  language?: 'ru' | 'en';
}): Promise<ProjectReviewResult> {
  return prepareProjectReview(input);
}
