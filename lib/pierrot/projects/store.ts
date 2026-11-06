import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { PierrotProject, PierrotProjectSnapshot, PierrotProjectStatus } from './types';
import { projectSlugBase, uniqueProjectSlug } from './slug';

assertServerOnly('lib/pierrot/projects/store');

const PROJECT_COLUMNS =
  'id,owner_user_id,slug,name,description,objective,status,priority,project_brief,brief_revision,last_activity_at,created_at,updated_at';
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PierrotProjectValidationError extends Error {
  code: 'PROJECT_NAME_REQUIRED' | 'PROJECT_NAME_TOO_LONG' | 'PROJECT_BRIEF_TOO_LONG';

  constructor(code: PierrotProjectValidationError['code']) {
    super(code);
    this.name = 'PierrotProjectValidationError';
    this.code = code;
  }
}

async function uniqueSlug(ownerUserId: string, name: string): Promise<string> {
  const base = projectSlugBase(name);
  const client = getServerSupabaseClient({ useServiceRole: true });
  const { data, error } = await client
    .from('pierrot_projects')
    .select('slug')
    .eq('owner_user_id', ownerUserId)
    .like('slug', `${base}%`);
  if (error) throw error;

  return uniqueProjectSlug(
    name,
    (data || []).map((row) => text((row as Record<string, unknown>).slug))
  );
}

export function mapProject(row: Record<string, unknown>): PierrotProject {
  return {
    id: text(row.id),
    ownerUserId: text(row.owner_user_id),
    slug: text(row.slug),
    name: text(row.name),
    description: text(row.description),
    objective: text(row.objective),
    status: (['active', 'paused', 'archived'].includes(text(row.status))
      ? text(row.status)
      : 'active') as PierrotProjectStatus,
    priority: Number(row.priority || 0),
    projectBrief: text(row.project_brief),
    briefRevision: Number(row.brief_revision || 1),
    lastActivityAt: text(row.last_activity_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function listPierrotProjects(ownerUserId: string): Promise<PierrotProject[]> {
  const { data, error } = await getServerSupabaseClient({ useServiceRole: true })
    .from('pierrot_projects')
    .select(PROJECT_COLUMNS)
    .eq('owner_user_id', ownerUserId)
    .order('last_activity_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapProject(row as Record<string, unknown>));
}

export async function getPierrotProject(
  ownerUserId: string,
  projectRef: string
): Promise<PierrotProject | null> {
  const client = getServerSupabaseClient({ useServiceRole: true });
  if (UUID_PATTERN.test(projectRef)) {
    const byId = await client
      .from('pierrot_projects')
      .select(PROJECT_COLUMNS)
      .eq('owner_user_id', ownerUserId)
      .eq('id', projectRef)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return mapProject(byId.data as Record<string, unknown>);
  }
  const bySlug = await client
    .from('pierrot_projects')
    .select(PROJECT_COLUMNS)
    .eq('owner_user_id', ownerUserId)
    .eq('slug', projectRef)
    .maybeSingle();
  if (bySlug.error) throw bySlug.error;
  return bySlug.data ? mapProject(bySlug.data as Record<string, unknown>) : null;
}

export async function createPierrotProject(
  ownerUserId: string,
  input: Partial<PierrotProject>
): Promise<PierrotProject> {
  const name = text(input.name).trim();
  if (!name) throw new PierrotProjectValidationError('PROJECT_NAME_REQUIRED');
  if (name.length > 160) throw new PierrotProjectValidationError('PROJECT_NAME_TOO_LONG');
  const projectBrief = text(input.projectBrief).trim();
  if (projectBrief.length > 20_000)
    throw new PierrotProjectValidationError('PROJECT_BRIEF_TOO_LONG');
  const requestedSlug = text(input.slug).trim();
  const slug =
    requestedSlug && /^[a-z0-9][a-z0-9-]*$/.test(requestedSlug)
      ? requestedSlug.slice(0, 80)
      : await uniqueSlug(ownerUserId, name);
  const { data, error } = await getServerSupabaseClient({ useServiceRole: true })
    .from('pierrot_projects')
    .insert({
      owner_user_id: ownerUserId,
      slug,
      name: name.slice(0, 160),
      description: text(input.description),
      objective: text(input.objective),
      project_brief: projectBrief,
      status: input.status || 'active',
      priority: Number(input.priority || 0),
    })
    .select(PROJECT_COLUMNS)
    .single();
  if (error) throw error;
  return mapProject(data as Record<string, unknown>);
}

export async function getPierrotProjectForConversation(
  ownerUserId: string,
  conversationId: string
): Promise<PierrotProject | null> {
  const client = getServerSupabaseClient({ useServiceRole: true });
  const { data, error } = await client
    .from('pierrot_project_conversations')
    .select('project_id')
    .eq('owner_user_id', ownerUserId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data?.project_id ? getPierrotProject(ownerUserId, String(data.project_id)) : null;
}

export async function deletePierrotProject(
  ownerUserId: string,
  projectRef: string
): Promise<boolean> {
  const project = await getPierrotProject(ownerUserId, projectRef);
  if (!project) return false;
  const { error } = await getServerSupabaseClient({ useServiceRole: true })
    .from('pierrot_projects')
    .delete()
    .eq('id', project.id)
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;
  return true;
}

/** Creates the pilot shell only; historical facts are deliberately not inferred. */
export async function ensureHeartAndAngelProject(ownerUserId: string): Promise<PierrotProject> {
  const existing = await getPierrotProject(ownerUserId, 'heart-and-angel');
  if (existing) return existing;
  return createPierrotProject(ownerUserId, {
    slug: 'heart-and-angel',
    name: 'Heart & Angel',
    description:
      'Pilot workspace for the existing Heart & Angel website and digital infrastructure.',
    objective:
      'Collect verified artistic, technical and commercial context without turning historical ideas into active work.',
    projectBrief:
      'Pilot project created as a reviewable shell. Verify existing artistic materials, website infrastructure, commercial components, decisions and current state before expanding this brief.',
  });
}

export async function updatePierrotProject(
  ownerUserId: string,
  id: string,
  patch: Partial<PierrotProject>
): Promise<PierrotProject | null> {
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  };
  for (const [key, column] of [
    ['name', 'name'],
    ['description', 'description'],
    ['objective', 'objective'],
    ['projectBrief', 'project_brief'],
    ['status', 'status'],
    ['priority', 'priority'],
  ] as const) {
    if (patch[key] !== undefined) update[column] = patch[key];
  }
  if (patch.projectBrief !== undefined)
    update.brief_revision = Number(patch.briefRevision || 1) + 1;
  const client = getServerSupabaseClient({ useServiceRole: true });
  const before = await client
    .from('pierrot_projects')
    .select('name')
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  const previousName = typeof before.data?.name === 'string' ? before.data.name : null;
  const { data, error } = await client
    .from('pierrot_projects')
    .update(update)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select(PROJECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (patch.projectBrief !== undefined)
    await client.from('pierrot_project_brief_revisions').insert({
      project_id: id,
      revision: Number((data as Record<string, unknown>).brief_revision || 1),
      brief: patch.projectBrief,
      change_note: 'Owner update',
      created_by: ownerUserId,
    });

  // Keep the legacy display mirror aligned after a rename. The relation table
  // remains the canonical source; this only prevents stale text in memory UI.
  if (previousName && patch.name && patch.name !== previousName) {
    const { data: links } = await client
      .from('pierrot_project_decisions')
      .select('decision_id')
      .eq('project_id', id)
      .eq('owner_user_id', ownerUserId)
      .limit(500);
    const ids = (Array.isArray(links) ? links : [])
      .map((row) => (row && typeof row.decision_id === 'string' ? row.decision_id : ''))
      .filter(Boolean);

    if (ids.length > 0) {
      await client
        .from('pierrot_decisions')
        .update({ project: patch.name, updated_at: new Date().toISOString() })
        .eq('user_id', ownerUserId)
        .in('id', ids);
    }
  }

  return mapProject(data as Record<string, unknown>);
}

export async function linkConversationToProject(
  ownerUserId: string,
  projectId: string,
  conversationId: string
): Promise<void> {
  const client = getServerSupabaseClient({ useServiceRole: true });
  const project = await getPierrotProject(ownerUserId, projectId);
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  const { data: conversation } = await client
    .from('pierrot_conversations')
    .select('id,user_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conversation || (conversation.user_id && conversation.user_id !== ownerUserId))
    throw new Error('CONVERSATION_NOT_FOUND');
  const { error } = await client.from('pierrot_project_conversations').upsert({
    project_id: project.id,
    conversation_id: conversationId,
    owner_user_id: ownerUserId,
  });
  if (error) throw error;
  await client
    .from('pierrot_projects')
    .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', project.id)
    .eq('owner_user_id', ownerUserId);
}

export async function getPierrotProjectSnapshot(
  ownerUserId: string,
  projectRef: string
): Promise<PierrotProjectSnapshot | null> {
  const project = await getPierrotProject(ownerUserId, projectRef);
  if (!project) return null;
  const client = getServerSupabaseClient({ useServiceRole: true });
  const [decisions, tasks, conversations, knowledge, artifacts] = await Promise.all([
    client
      .from('pierrot_project_decisions')
      .select('decision:pierrot_decisions(id,title,content,status,kind,updated_at)')
      .eq('project_id', project.id)
      .eq('owner_user_id', ownerUserId)
      .limit(12),
    client
      .from('pierrot_dev_prompts')
      .select('id,title,task,status,updated_at')
      .eq('project_id', project.id)
      .eq('user_id', ownerUserId)
      .order('updated_at', { ascending: false })
      .limit(12),
    client
      .from('pierrot_project_conversations')
      .select('conversation:pierrot_conversations(id,title,started_at)')
      .eq('project_id', project.id)
      .eq('owner_user_id', ownerUserId)
      .limit(12),
    client
      .from('pierrot_project_knowledge')
      .select('document:knowledge_documents(id,title,status)')
      .eq('project_id', project.id)
      .eq('owner_user_id', ownerUserId)
      .limit(12),
    client
      .from('pierrot_project_artifacts')
      .select('id,title,artifact_type,updated_at')
      .eq('project_id', project.id)
      .eq('owner_user_id', ownerUserId)
      .order('updated_at', { ascending: false })
      .limit(12),
  ]);
  const decisionRows = (decisions.data || []).map((r: any) => ({
    id: r.decision?.id || '',
    title: r.decision?.title || '',
    content: r.decision?.content || '',
    status: r.decision?.status || '',
    kind: r.decision?.kind || '',
    updatedAt: r.decision?.updated_at || '',
  }));

  const memoryTasks = decisionRows
    .filter((row: { kind: string }) => row.kind === 'task' || row.kind === 'reminder')
    .map((row: { id: string; title: string; status: string; updatedAt: string }) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updatedAt,
    }));

  return {
    ...project,
    decisions: decisionRows,
    tasks: [
      ...(tasks.data || []).map((r: any) => ({
        id: r.id,
        title: r.title || r.task || '',
        status: r.status || '',
        updatedAt: r.updated_at || '',
      })),
      ...memoryTasks,
    ],
    conversations: (conversations.data || []).map((r: any) => ({
      id: r.conversation?.id || '',
      title: r.conversation?.title || '',
      updatedAt: r.conversation?.started_at || '',
    })),
    knowledge: (knowledge.data || []).map((r: any) => ({
      id: r.document?.id || '',
      title: r.document?.title || null,
      status: r.document?.status || null,
    })),
    artifacts: (artifacts.data || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      artifactType: r.artifact_type,
      updatedAt: r.updated_at,
    })),
  };
}
