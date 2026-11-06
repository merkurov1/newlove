import { assertServerOnly } from '@/lib/serverOnly';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

assertServerOnly('lib/pierrot/projects/conversation');

/**
 * One project owns exactly one canonical conversation.
 *
 * `pierrot_projects.conversation_id` is the single source of truth. The legacy
 * `pierrot_project_conversations` relation is kept as provenance for history
 * search and for the merge/rollback migration; it is never used to pick a
 * different active chat once a project has a canonical conversation.
 */
export type ProjectConversation = {
  projectId: string;
  conversationId: string;
  sessionId: string;
  /** The conversation already existed and was adopted, not created now. */
  adopted: boolean;
  /** The canonical conversation row was created by this call. */
  created: boolean;
};

type ProjectRow = {
  id: string;
  conversation_id?: string | null;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isMissingColumn(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST204|42703/.test(value) || /column .* does not exist/i.test(value);
}

function retentionExpiry(): string {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

async function readProject(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<ProjectRow | null> {
  const { data, error } = await store
    .from('pierrot_projects')
    .select('id,conversation_id')
    .eq('id', projectId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();

  if (error) throw error;
  return (data as ProjectRow | null) || null;
}

async function readConversation(
  store: SupabaseClient,
  ownerUserId: string,
  conversationId: string
): Promise<{ id: string; sessionId: string } | null> {
  const { data, error } = await store
    .from('pierrot_conversations')
    .select('id,session_id,user_id,identity_type,mode')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!data || typeof data.session_id !== 'string') return null;

  const row = data as Record<string, unknown>;
  const rowUserId = text(row.user_id);
  const identityType = text(row.identity_type);

  // Old conversations can predate identity attribution. They are safe to
  // adopt only when they are already linked to this owner's project relation;
  // that check happens in the caller. A row explicitly owned by somebody else
  // is never adopted.
  if (rowUserId && rowUserId !== ownerUserId) return null;
  if (identityType === 'visitor' || identityType === 'unknown') {
    const linked = await isLinkedToOwnerProject(store, ownerUserId, conversationId);
    if (!linked) return null;
  }
  if (row.mode === 'dev') return null;

  return { id: conversationId, sessionId: data.session_id };
}

async function isLinkedToOwnerProject(
  store: SupabaseClient,
  ownerUserId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await store
    .from('pierrot_project_conversations')
    .select('project_id')
    .eq('owner_user_id', ownerUserId)
    .eq('conversation_id', conversationId)
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

async function insertConversation(
  store: SupabaseClient,
  ownerUserId: string
): Promise<{ id: string; sessionId: string }> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const sessionId = randomUUID();
  const base = {
    id,
    session_id: sessionId,
    start_page: '/admin/pierrot',
    referrer: null,
    language: 'ru',
    consent_state: 'granted',
    consent_version: 'owner-project-workspace',
    status: 'active',
    started_at: now,
    updated_at: now,
    last_message_at: null,
    expires_at: retentionExpiry(),
    next_message_sequence: 0,
  };
  const full = {
    ...base,
    identity_type: 'owner',
    visitor_id: null,
    user_id: ownerUserId,
    identity_verified_at: now,
    identity_source: 'supabase_session',
    mode: 'site',
  };

  let result = await store
    .from('pierrot_conversations')
    .insert(full)
    .select('id,session_id')
    .single();

  if (result.error && isMissingColumn(result.error)) {
    // Older deployments may not yet have identity/mode columns. The canonical
    // project column is added in the same reviewed migration, but this keeps
    // the owner workspace usable on a partially migrated database.
    result = await store
      .from('pierrot_conversations')
      .insert(base)
      .select('id,session_id')
      .single();
  }

  if (result.error || !result.data) throw result.error || new Error('conversation_create_failed');

  return {
    id: text((result.data as Record<string, unknown>).id) || id,
    sessionId: text((result.data as Record<string, unknown>).session_id) || sessionId,
  };
}

async function newestLinkedConversation(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<string | null> {
  const { data, error } = await store
    .from('pierrot_project_conversations')
    .select('conversation_id')
    .eq('project_id', projectId)
    .eq('owner_user_id', ownerUserId)
    .limit(50);

  if (error) return null;
  const ids = (Array.isArray(data) ? data : [])
    .map((row) => (row && typeof row.conversation_id === 'string' ? row.conversation_id : ''))
    .filter(Boolean);
  if (ids.length === 0) return null;

  const { data: conversations, error: conversationError } = await store
    .from('pierrot_conversations')
    .select('id,last_message_at,updated_at,started_at')
    .in('id', ids)
    .limit(ids.length);
  if (conversationError) return ids[0];

  const ranked = (Array.isArray(conversations) ? conversations : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => ({
      id: String(row.id),
      at: Date.parse(String(row.last_message_at || row.updated_at || row.started_at || '')),
    }))
    .filter((row) => Number.isFinite(row.at))
    .sort((left, right) => right.at - left.at);

  return ranked[0]?.id || ids[0];
}

async function claimConversation(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  conversationId: string
): Promise<boolean> {
  const { data, error } = await store
    .from('pierrot_projects')
    .update({
      conversation_id: conversationId,
      updated_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', projectId)
    .eq('owner_user_id', ownerUserId)
    .is('conversation_id', null)
    .select('conversation_id');

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function linkCanonical(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string,
  conversationId: string
): Promise<void> {
  await store
    .from('pierrot_project_conversations')
    .upsert(
      {
        project_id: projectId,
        conversation_id: conversationId,
        owner_user_id: ownerUserId,
      },
      { onConflict: 'project_id,conversation_id' }
    )
    .then(
      () => undefined,
      () => undefined
    );
}

/**
 * Resolves the canonical project conversation, creating or adopting one only
 * when the project has no canonical id yet. Concurrency is resolved by the
 * conditional update plus the unique index on `pierrot_projects.conversation_id`.
 */
export async function ensureProjectConversation(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<ProjectConversation | null> {
  const project = await readProject(store, ownerUserId, projectId);
  if (!project) return null;

  if (project.conversation_id) {
    const existing = await readConversation(store, ownerUserId, project.conversation_id);
    if (existing) {
      await linkCanonical(store, ownerUserId, projectId, existing.id);
      return {
        projectId,
        conversationId: existing.id,
        sessionId: existing.sessionId,
        adopted: true,
        created: false,
      };
    }

    // A dangling or foreign canonical reference is cleared before a new one is
    // adopted/created. This only removes the pointer, never a transcript.
    await store
      .from('pierrot_projects')
      .update({ conversation_id: null, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('owner_user_id', ownerUserId)
      .eq('conversation_id', project.conversation_id)
      .then(
        () => undefined,
        () => undefined
      );
    project.conversation_id = null;
  }

  // Safe adoption: the newest legacy conversation linked to this project.
  // Older linked conversations remain intact for history search and for the
  // reviewed merge migration.
  const linkedId = await newestLinkedConversation(store, ownerUserId, projectId);
  if (linkedId) {
    const linked = await readConversation(store, ownerUserId, linkedId);
    if (linked) {
      const claimed = await claimConversation(store, ownerUserId, projectId, linked.id);
      if (claimed) {
        await linkCanonical(store, ownerUserId, projectId, linked.id);
        return {
          projectId,
          conversationId: linked.id,
          sessionId: linked.sessionId,
          adopted: true,
          created: false,
        };
      }

      const current = await readProject(store, ownerUserId, projectId);
      if (current?.conversation_id && current.conversation_id !== linked.id) {
        const winner = await readConversation(store, ownerUserId, current.conversation_id);
        if (winner) {
          return {
            projectId,
            conversationId: winner.id,
            sessionId: winner.sessionId,
            adopted: true,
            created: false,
          };
        }
      }
    }
  }

  const created = await insertConversation(store, ownerUserId);
  const claimed = await claimConversation(store, ownerUserId, projectId, created.id);

  if (claimed) {
    await linkCanonical(store, ownerUserId, projectId, created.id);
    return {
      projectId,
      conversationId: created.id,
      sessionId: created.sessionId,
      adopted: false,
      created: true,
    };
  }

  // Another request won the race. Remove the unused canonical conversation so
  // no orphan transcript can be mistaken for a second project chat.
  await store.from('pierrot_conversations').delete().eq('id', created.id);

  const current = await readProject(store, ownerUserId, projectId);
  if (!current?.conversation_id) return null;
  const winner = await readConversation(store, ownerUserId, current.conversation_id);
  if (!winner) return null;

  return {
    projectId,
    conversationId: winner.id,
    sessionId: winner.sessionId,
    adopted: true,
    created: false,
  };
}

export async function ensureProjectConversationForRef(
  store: SupabaseClient,
  ownerUserId: string,
  projectRef: string
): Promise<ProjectConversation | null> {
  const { data, error } = await store
    .from('pierrot_projects')
    .select('id')
    .eq('owner_user_id', ownerUserId)
    .or(`id.eq.${projectRef},slug.eq.${projectRef}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const id = data && typeof (data as Record<string, unknown>).id === 'string'
    ? String((data as Record<string, unknown>).id)
    : '';
  if (!id) return null;

  return ensureProjectConversation(store, ownerUserId, id);
}

/**
 * Returns the canonical conversation id without creating anything. Used by
 * listing code so a read never writes.
 */
export async function getProjectConversationId(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<string | null> {
  const { data, error } = await store
    .from('pierrot_projects')
    .select('conversation_id')
    .eq('id', projectId)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();

  if (error) throw error;
  const value = data && (data as Record<string, unknown>).conversation_id;
  return typeof value === 'string' && value ? value : null;
}

/** All conversations that belong to a project's history, canonical first. */
export async function listProjectConversationIds(
  store: SupabaseClient,
  ownerUserId: string,
  projectId: string
): Promise<string[]> {
  const canonical = await getProjectConversationId(store, ownerUserId, projectId);
  const { data, error } = await store
    .from('pierrot_project_conversations')
    .select('conversation_id')
    .eq('project_id', projectId)
    .eq('owner_user_id', ownerUserId)
    .limit(500);

  if (error && !/does not exist|PGRST205|42P01/i.test(String(error))) throw error;

  const ids = [
    ...(canonical ? [canonical] : []),
    ...(Array.isArray(data)
      ? data
          .map((row) => (row && typeof row.conversation_id === 'string' ? row.conversation_id : ''))
          .filter(Boolean)
      : []),
  ];

  return Array.from(new Set(ids));
}
