import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import { listProjectTasks, moveDecisionToProject, resolveExactProject } from '@/lib/pierrot/projects/links';
import { createMemoryRecord, getMemoryRecord } from './store';
import type { PierrotMemoryRecord } from './types';

assertServerOnly('lib/pierrot/memory/taskCreation');

export type OwnerTaskCreationResult =
  | {
      status: 'created' | 'already_exists';
      task: PierrotMemoryRecord;
      project: PierrotProject | null;
      linkPersisted: boolean;
    }
  | { status: 'project_not_found' | 'project_ambiguous'; projectRef: string }
  | {
      status: 'existing_in_other_project';
      task: PierrotMemoryRecord;
      project: PierrotProject | null;
      existingProjectName: string | null;
    }
  | { status: 'invalid_content' }
  | {
      status: 'write_failed' | 'verification_failed' | 'link_failed';
      project: PierrotProject | null;
      task?: PierrotMemoryRecord;
      code: string;
    };

function taskTitle(content: string): string {
  const first = content.split(/[.!?\n]/)[0]?.trim() || content.trim();
  return (first.length > 96 ? `${first.slice(0, 93).trimEnd()}…` : first).slice(0, 200);
}

/**
 * Creates one owner task from an explicit command, links it through the
 * canonical project relation, then reads the row back. Nothing is reported as
 * created until the database row and its project link are both verified.
 */
export async function createOwnerTask(input: {
  store: SupabaseClient;
  userId: string;
  content: string;
  projectRef?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  originalMessage?: string;
  skipEmbedding?: boolean;
}): Promise<OwnerTaskCreationResult> {
  const content = input.content.replace(/\s+/g, ' ').trim().slice(0, 4_000);
  if (content.length < 3) return { status: 'invalid_content' };

  let project: PierrotProject | null = null;
  const projectRef = input.projectRef?.trim() || '';

  if (projectRef) {
    const resolved = await resolveExactProject(input.store, input.userId, projectRef);
    if (resolved.ambiguous) return { status: 'project_ambiguous', projectRef };
    if (!resolved.project) return { status: 'project_not_found', projectRef };
    project = resolved.project;
  }

  let created: Awaited<ReturnType<typeof createMemoryRecord>>;
  try {
    created = await createMemoryRecord(input.store, input.userId, {
      kind: 'task',
      title: taskTitle(content),
      content,
      rationale: input.originalMessage?.slice(0, 1_000) || null,
      project: project?.name || null,
      conversationId: input.conversationId || null,
      messageId: input.messageId || null,
      sourceRefs: [
        {
          type: 'owner_task_command',
          projectId: project?.id || null,
          projectRef: projectRef || null,
          originalMessage: (input.originalMessage || input.content).slice(0, 1_000),
        },
      ],
      ...(input.skipEmbedding ? { skipEmbedding: true } : {}),
    });
  } catch {
    return { status: 'write_failed', project, code: 'TASK_WRITE_FAILED' };
  }

  let verified: PierrotMemoryRecord | null = null;
  try {
    verified = await getMemoryRecord(input.store, input.userId, created.id);
  } catch {
    verified = null;
  }

  if (!verified || verified.id !== created.id) {
    return {
      status: 'verification_failed',
      project,
      task: verified || created,
      code: 'TASK_READBACK_FAILED',
    };
  }

  // A deduplicated record must not be silently moved out of another project
  // just because its wording matched. That was the source of cross-project
  // status changes.
  if (created.deduplicated && project) {
    const { data: existingLinks } = await input.store
      .from('pierrot_project_decisions')
      .select('project_id')
      .eq('owner_user_id', input.userId)
      .eq('decision_id', verified.id);

    const existingProjectIds = (Array.isArray(existingLinks) ? existingLinks : [])
      .map((row) => (row && typeof row.project_id === 'string' ? row.project_id : ''))
      .filter(Boolean);

    const mirroredProject = verified.project?.trim() || '';
    const targetMismatch =
      mirroredProject.length > 0 &&
      mirroredProject.toLocaleLowerCase() !== project.name.toLocaleLowerCase();

    const linkedToTarget = existingProjectIds.includes(project.id);
    if (
      (existingProjectIds.length > 0 && !linkedToTarget) ||
      (existingProjectIds.length === 0 && targetMismatch)
    ) {
      return {
        status: 'existing_in_other_project',
        task: verified,
        project,
        existingProjectName: mirroredProject || null,
      };
    }
  }

  let linkPersisted = false;
  if (project) {
    try {
      await moveDecisionToProject(input.store, input.userId, verified.id, project);
      const linked = await listProjectTasks(input.store, input.userId, project.id, {
        statuses: ['current', 'completed'],
        limit: 500,
      });
      linkPersisted = linked.some((record) => record.id === verified?.id);
    } catch {
      linkPersisted = false;
    }

    if (!linkPersisted) {
      return {
        status: 'link_failed',
        project,
        task: verified,
        code: 'PROJECT_TASK_LINK_NOT_CONFIRMED',
      };
    }
  }

  return {
    status: created.deduplicated ? 'already_exists' : 'created',
    task: verified,
    project,
    linkPersisted,
  };
}
