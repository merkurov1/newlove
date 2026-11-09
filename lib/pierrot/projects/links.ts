import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotMemoryRecord, PierrotMemoryStatus } from '@/lib/pierrot/memory/types';
import { listMemoryRecordsByIds } from '@/lib/pierrot/memory/store';
import { mapProject } from './store';
import { projectMatchesRef } from './matching';
import type { PierrotProject } from './types';
import { buildProjectChatContext } from './history';
import { getProjectConversationId } from './conversation';

assertServerOnly('lib/pierrot/projects/links');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `pierrot_project_decisions` is the canonical decision↔project relation.
 * `pierrot_decisions.project` is kept only as a display/legacy mirror; project
 * operations must never use substring matching on it.
 */
export async function linkDecisionToProject(
  store: SupabaseClient,
  ownerUserId: string,
  decisionId: string,
  projectId: string
): Promise<void> {
  const { error } = await store.from('pierrot_project_decisions').upsert(
    {
      project_id: projectId,
      decision_id: decisionId,
      owner_user_id: ownerUserId,
    },
    { onConflict: 'project_id,decision_id' }
  );

  if (error) throw new Error('project_decision_link_failed');
}

export async function unlinkDecisionFromProject(
  store: SupabaseClient,
  ownerUserId: string,
  decisionId: string,
  projectId: string
): Promise<void> {
  const { error } = await store
    .from('pierrot_project_decisions')
    .delete()
    .eq('owner_user_id', ownerUserId)
    .eq('decision_id', decisionId)
    .eq('project_id', projectId);

  if (error) throw new Error('project_decision_unlink_failed');
}

export async function listDecisionIdsForProject(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<string[]> {
  const { data, error } = await store
    .from('pierrot_project_decisions')
    .select('decision_id')
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId)
    .limit(500);

  if (error) throw new Error('project_decisions_unavailable');

  return (Array.isArray(data) ? data : [])
    .map((row) => (row && typeof row.decision_id === 'string' ? row.decision_id : ''))
    .filter(Boolean);
}

export async function listProjectTasks(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  options: { statuses?: PierrotMemoryStatus[]; limit?: number } = {}
): Promise<PierrotMemoryRecord[]> {
  const ids = await listDecisionIdsForProject(store, ownerUserId, projectId);
  if (ids.length === 0) return [];

  const records = await listMemoryRecordsByIds(store, ownerUserId, ids);
  const allowed = new Set(options.statuses || ['current']);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

  return records
    .filter((record) => allowed.has(record.status))
    .filter((record) => record.kind === 'task' || record.kind === 'reminder')
    .slice(0, limit);
}

/**
 * Loads a bounded transcript block for the project's permanent chat.
 *
 * This intentionally no longer mixes several previous conversations into the
 * prompt. The canonical conversation supplies the recent trace; an explicit
 * history search covers older material when the owner asks about the past.
 */
export async function loadProjectConversationContext(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  options: { limit?: number; excludeConversationId?: string | null; query?: string | null } = {}
): Promise<string | null> {
  const project = await resolveExactProject(store, ownerUserId, projectId);
  if (!project.project) return null;

  const canonical = await getProjectConversationId(store, ownerUserId, projectId);
  if (!canonical) return null;

  const context = await buildProjectChatContext({
    store,
    ownerUserId,
    project: {
      ...project.project,
      decisions: [],
      tasks: [],
      conversations: [],
      knowledge: [],
      artifacts: [],
    },
    conversationId: canonical,
    query: options.query || '',
    wantsHistory: Boolean(options.query),
    recentLimit: options.limit ?? 8,
  });

  return context || null;
}

export async function resolveExactProject(
  store: SupabaseClient,
  ownerUserId: string,
  projectRef: string
): Promise<{ project: PierrotProject | null; ambiguous: boolean }> {
  const ref = projectRef.trim();
  if (!ref) return { project: null, ambiguous: false };

  if (UUID_PATTERN.test(ref)) {
    const { data, error } = await store
      .from('pierrot_projects')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .eq('id', ref)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return { project: mapProject(data as Record<string, unknown>), ambiguous: false };
    }
  }

  const bySlug = await store
    .from('pierrot_projects')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('slug', ref)
    .maybeSingle();
  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) {
    return { project: mapProject(bySlug.data as Record<string, unknown>), ambiguous: false };
  }

  const { data, error } = await store
    .from('pierrot_projects')
    .select('*')
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;

  const matches = (Array.isArray(data) ? data : [])
    .map((row) => mapProject(row as Record<string, unknown>))
    .filter((project) => projectMatchesRef(project, ref));

  if (matches.length === 1) return { project: matches[0], ambiguous: false };
  return { project: null, ambiguous: matches.length > 1 };
}

/**
 * A decision has at most one canonical project. Moving it removes every other
 * relation first, then links the exact project id. The text column is only a
 * display mirror.
 */
export async function moveDecisionToProject(
  store: SupabaseClient,
  ownerUserId: string,
  decisionId: string,
  project: PierrotProject
): Promise<void> {
  const { data: existing, error: readError } = await store
    .from('pierrot_project_decisions')
    .select('project_id')
    .eq('owner_user_id', ownerUserId)
    .eq('decision_id', decisionId);
  if (readError) throw new Error('project_decision_link_failed');

  const previousProjectIds = (Array.isArray(existing) ? existing : [])
    .map((row) => (row && typeof row.project_id === 'string' ? row.project_id : ''))
    .filter(Boolean);

  const { error: clearError } = await store
    .from('pierrot_project_decisions')
    .delete()
    .eq('owner_user_id', ownerUserId)
    .eq('decision_id', decisionId);

  if (clearError) throw new Error('project_decision_unlink_failed');

  try {
    await linkDecisionToProject(store, ownerUserId, decisionId, project.id);
  } catch (error) {
    // Restore the previous canonical relation if the new link failed.
    for (const projectId of previousProjectIds) {
      await linkDecisionToProject(store, ownerUserId, decisionId, projectId).catch(() => undefined);
    }
    throw error;
  }

  // The relation is canonical; the text column is only a display mirror and
  // must not turn a successful move into a reported failure.
  await mirrorDecisionProjectName(store, ownerUserId, decisionId, project.name).catch(
    () => undefined
  );
}

export async function mirrorDecisionProjectName(
  store: SupabaseClient,
  ownerUserId: string,
  decisionId: string,
  projectName: string | null
): Promise<void> {
  const { error } = await store
    .from('pierrot_decisions')
    .update({ project: projectName, updated_at: new Date().toISOString() })
    .eq('user_id', ownerUserId)
    .eq('id', decisionId);

  if (error) throw new Error('memory_project_mirror_failed');
}
