import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotMemoryRecord, PierrotMemoryStatus } from '@/lib/pierrot/memory/types';
import { listMemoryRecordsByIds } from '@/lib/pierrot/memory/store';
import { mapProject } from './store';
import type { PierrotProject } from './types';

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
 * Loads a compact, project-scoped conversation trace for the prompt. It never
 * reads conversations from another project: the IDs come only from the
 * canonical `pierrot_project_conversations` relation.
 */
export async function loadProjectConversationContext(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  options: { limit?: number; excludeConversationId?: string | null } = {}
): Promise<string | null> {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);
  const { data: links, error } = await store
    .from('pierrot_project_conversations')
    .select('conversation_id')
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (error) throw new Error('project_conversations_unavailable');

  const conversationIds = (Array.isArray(links) ? links : [])
    .map((row) => (row && typeof row.conversation_id === 'string' ? row.conversation_id : ''))
    .filter(Boolean)
    .filter((id) => id !== options.excludeConversationId)
    .slice(0, limit);

  if (conversationIds.length === 0) return null;

  const [{ data: conversations }, { data: messages }] = await Promise.all([
    store
      .from('pierrot_conversations')
      .select('id,title,started_at')
      .in('id', conversationIds),
    store
      .from('pierrot_messages')
      .select('conversation_id,role,content,created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(limit * 6),
  ]);

  const titles = new Map<string, string>();
  for (const row of conversations || []) {
    if (!row || typeof row.id !== 'string') continue;
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'Untitled';
    titles.set(row.id, title);
  }

  const byConversation = new Map<string, string[]>();
  for (const row of [...(messages || [])].reverse()) {
    if (!row || typeof row.conversation_id !== 'string' || typeof row.content !== 'string') {
      continue;
    }
    const content = row.content.replace(/\s+/g, ' ').trim().slice(0, 420);
    if (!content) continue;
    const line = `${row.role === 'assistant' ? 'Pierrot' : 'Owner'}: ${content}`;
    const list = byConversation.get(row.conversation_id) || [];
    list.push(line);
    byConversation.set(row.conversation_id, list);
  }

  const blocks: string[] = [];
  for (const id of conversationIds) {
    const lines = (byConversation.get(id) || []).slice(-4);
    if (lines.length === 0) continue;
    blocks.push(`- ${titles.get(id) || 'Project conversation'}\n${lines.map((line) => `  ${line}`).join('\n')}`);
  }

  if (blocks.length === 0) return null;
  return `RECENT PROJECT CONVERSATIONS (same project only):\n${blocks.join('\n')}`.slice(0, 4_000);
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

  const normalized = ref.toLocaleLowerCase();
  const matches = (Array.isArray(data) ? data : [])
    .map((row) => mapProject(row as Record<string, unknown>))
    .filter(
      (project) =>
        project.name.toLocaleLowerCase() === normalized ||
        project.slug.toLocaleLowerCase() === normalized
    );

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
