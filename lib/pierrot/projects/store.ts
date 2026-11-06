import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { PierrotProject, PierrotProjectSnapshot, PierrotProjectStatus } from './types';
import { projectSlugBase, uniqueProjectSlug } from './slug';

assertServerOnly('lib/pierrot/projects/store');

const PROJECT_COLUMNS =
  'id,owner_user_id,slug,name,description,objective,status,priority,project_brief,brief_revision,conversation_id,last_activity_at,created_at,updated_at';
const PROJECT_COLUMNS_WITH_RATING = `${PROJECT_COLUMNS},owner_rating,owner_rating_updated_at`;
const PROJECT_COLUMNS_LEGACY =
  'id,owner_user_id,slug,name,description,objective,status,priority,project_brief,brief_revision,last_activity_at,created_at,updated_at';
const PROJECT_COLUMNS_LEGACY_WITH_RATING = `${PROJECT_COLUMNS_LEGACY},owner_rating,owner_rating_updated_at`;
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissingColumn(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST204|42703/.test(value) || /column .* does not exist/i.test(value);
}

async function selectProject(
  column: 'id' | 'slug',
  value: string,
  ownerUserId: string
): Promise<{ data: Record<string, unknown> | null; error: unknown }> {
  const client = getServerSupabaseClient({ useServiceRole: true });
  const run = (columns: string) =>
    client
      .from('pierrot_projects')
      .select(columns)
      .eq('owner_user_id', ownerUserId)
      .eq(column, value)
      .maybeSingle();

  const withRating = await run(PROJECT_COLUMNS_WITH_RATING);
  if (withRating.error && isMissingColumn(withRating.error)) {
    const legacy = await run(PROJECT_COLUMNS_LEGACY_WITH_RATING);
    if (!legacy.error) {
      return { data: (legacy.data as Record<string, unknown> | null) || null, error: null };
    }
    const oldest = await run(PROJECT_COLUMNS_LEGACY);
    return { data: (oldest.data as Record<string, unknown> | null) || null, error: oldest.error };
  }

  return {
    data: (withRating.data as Record<string, unknown> | null) || null,
    error: withRating.error,
  };
}

export class PierrotProjectValidationError extends Error {
  code:
    | 'PROJECT_NAME_REQUIRED'
    | 'PROJECT_NAME_TOO_LONG'
    | 'PROJECT_BRIEF_TOO_LONG'
    | 'PROJECT_EXISTS';

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
    ownerRating:
      typeof row.owner_rating === 'number' && row.owner_rating >= 1 && row.owner_rating <= 10
        ? row.owner_rating
        : null,
    ownerRatingUpdatedAt: text(row.owner_rating_updated_at) || null,
    conversationId: text(row.conversation_id) || null,
    projectBrief: text(row.project_brief),
    briefRevision: Number(row.brief_revision || 1),
    lastActivityAt: text(row.last_activity_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function listPierrotProjects(ownerUserId: string): Promise<PierrotProject[]> {
  const client = getServerSupabaseClient({ useServiceRole: true });
  const run = (columns: string) =>
    client
      .from('pierrot_projects')
      .select(columns)
      .eq('owner_user_id', ownerUserId)
      .order('last_activity_at', { ascending: false });

  let result = await run(PROJECT_COLUMNS_WITH_RATING);
  if (result.error && isMissingColumn(result.error)) {
    result = await run(PROJECT_COLUMNS_LEGACY_WITH_RATING);
    if (result.error && isMissingColumn(result.error)) result = await run(PROJECT_COLUMNS_LEGACY);
  }
  if (result.error) throw result.error;
  return ((result.data || []) as unknown[]).map((row) => mapProject(row as Record<string, unknown>));
}

export async function getPierrotProject(
  ownerUserId: string,
  projectRef: string
): Promise<PierrotProject | null> {
  if (UUID_PATTERN.test(projectRef)) {
    const byId = await selectProject('id', projectRef, ownerUserId);
    if (byId.error) throw byId.error;
    if (byId.data) return mapProject(byId.data);
  }
  const bySlug = await selectProject('slug', projectRef, ownerUserId);
  if (bySlug.error) throw bySlug.error;
  return bySlug.data ? mapProject(bySlug.data) : null;
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
  const client = getServerSupabaseClient({ useServiceRole: true });
  const { data: existing } = await client
    .from('pierrot_projects')
    .select('id')
    .eq('owner_user_id', ownerUserId)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (existing) throw new PierrotProjectValidationError('PROJECT_EXISTS');

  const requestedSlug = text(input.slug).trim();
  const slug =
    requestedSlug && /^[a-z0-9][a-z0-9-]*$/.test(requestedSlug)
      ? requestedSlug.slice(0, 80)
      : await uniqueSlug(ownerUserId, name);
  let inserted: any = await getServerSupabaseClient({ useServiceRole: true })
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
  if (inserted.error && isMissingColumn(inserted.error)) {
    inserted = await getServerSupabaseClient({ useServiceRole: true })
      .from('pierrot_projects')
      .select(PROJECT_COLUMNS_LEGACY)
      .eq('owner_user_id', ownerUserId)
      .eq('slug', slug)
      .maybeSingle();
  }
  if (inserted.error) throw inserted.error;
  return mapProject(inserted.data as unknown as Record<string, unknown>);
}

export async function getPierrotProjectForConversation(
  ownerUserId: string,
  conversationId: string
): Promise<PierrotProject | null> {
  const client = getServerSupabaseClient({ useServiceRole: true });

  // Canonical path first: the project row itself owns the one true chat.
  const canonical = await client
    .from('pierrot_projects')
    .select(PROJECT_COLUMNS)
    .eq('owner_user_id', ownerUserId)
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (!canonical.error && canonical.data) {
    return mapProject(canonical.data as Record<string, unknown>);
  }

  // Compatibility for projects that have not run the reviewed merge yet. The
  // relation is provenance, not a competing "main chat" selector; it only maps
  // legacy conversation links back to the project that owns them.
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

export type PierrotProjectPatch = Partial<PierrotProject> & {
  /** Human-readable reason stored with the new brief revision. */
  briefChangeNote?: string;
};

export async function updatePierrotProject(
  ownerUserId: string,
  id: string,
  patch: PierrotProjectPatch
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
  if (patch.ownerRating !== undefined) {
    const rating = Number(patch.ownerRating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      throw new Error('PROJECT_RATING_INVALID');
    }
    update.owner_rating = rating;
    update.owner_rating_updated_at = new Date().toISOString();
  }
  const client = getServerSupabaseClient({ useServiceRole: true });
  const before = await client
    .from('pierrot_projects')
    .select('name,project_brief,brief_revision')
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  const previousName = typeof before.data?.name === 'string' ? before.data.name : null;
  const previousBrief =
    typeof before.data?.project_brief === 'string' ? before.data.project_brief : null;
  const briefChanged =
    patch.projectBrief !== undefined &&
    (previousBrief === null || patch.projectBrief.trim() !== previousBrief.trim());
  if (patch.projectBrief !== undefined) {
    if (briefChanged) {
      update.brief_revision = Number(before.data?.brief_revision || patch.briefRevision || 1) + 1;
    } else {
      delete update.project_brief;
    }
  }
  const runUpdate = (columns: string) =>
    client
      .from('pierrot_projects')
      .update(update)
      .eq('id', id)
      .eq('owner_user_id', ownerUserId)
      .select(columns)
      .maybeSingle();

  let result = await runUpdate(PROJECT_COLUMNS_WITH_RATING);
  if (result.error && isMissingColumn(result.error)) {
    if (patch.ownerRating !== undefined) {
      throw new Error('PROJECT_RATING_MIGRATION_REQUIRED');
    }
    result = await runUpdate(PROJECT_COLUMNS_LEGACY);
  }
  if (result.error) throw result.error;
  if (!result.data) return null;
  const data = result.data;

  if (briefChanged && patch.projectBrief !== undefined)
    await client.from('pierrot_project_brief_revisions').insert({
      project_id: id,
      revision: Number((data as unknown as Record<string, unknown>).brief_revision || 1),
      brief: patch.projectBrief,
      change_note: (patch.briefChangeNote || 'Owner update').slice(0, 240),
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

  return mapProject(data as unknown as Record<string, unknown>);
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

  // A project keeps one canonical conversation. The first explicit link can
  // claim an existing conversation; later links stay provenance-only so they
  // cannot silently open a second "main" chat.
  const claimed = await client
    .from('pierrot_projects')
    .update({ conversation_id: conversationId, updated_at: new Date().toISOString() })
    .eq('id', project.id)
    .eq('owner_user_id', ownerUserId)
    .is('conversation_id', null)
    .select('id');

  if (claimed.error) throw claimed.error;

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
  const [decisions, tasks, conversations, knowledge, artifacts, review] = await Promise.all([
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
    project.conversationId
      ? client
          .from('pierrot_conversations')
          .select('id,title,started_at')
          .eq('id', project.conversationId)
          .limit(1)
      : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
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
    client
      .from('pierrot_project_reviews')
      .select('id,summary,completed_at')
      .eq('project_id', project.id)
      .eq('owner_user_id', ownerUserId)
      .in('status', ['completed', 'partial'])
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(
        (result) => (result.error ? null : result),
        () => null
      ),
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
    latestReview:
      review?.data && typeof (review.data as Record<string, unknown>).summary === 'string'
        ? {
            summary: String((review.data as Record<string, unknown>).summary),
            completedAt: text((review.data as Record<string, unknown>).completed_at),
            runId: text((review.data as Record<string, unknown>).id),
          }
        : null,
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
      id: r.id || '',
      title: r.title || '',
      updatedAt: r.started_at || '',
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
