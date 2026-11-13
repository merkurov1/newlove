import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordPierrotEvent } from '@/lib/pierrot/serverStore';
import {
  emptyEditorialContext,
  emptySourceConstraints,
  type EditorialContext,
  type EditorialSourceConstraints,
} from './types';

assertServerOnly('lib/pierrot/editorial/context');

export { emptyEditorialContext, emptySourceConstraints };

/**
 * Deterministic editorial continuity.
 *
 * The active project/document/task is stored as an append-only event in the
 * existing `pierrot_events` table (one row per user turn) and reconstructed from
 * the latest row. This reuses the conversation/observability architecture
 * instead of adding a second memory system.
 *
 * If the event store is unavailable, callers still have the browser transcript;
 * the loader reports that explicitly instead of silently inventing context.
 */

export const EDITORIAL_CONTEXT_EVENT = 'intent_classified';
export const EDITORIAL_CONTEXT_KEY_PREFIX = 'editorial_context:';
export const EDITORIAL_DIAGNOSTIC_KEY_PREFIX = 'editorial_diagnostic:';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown, limit = 40): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, limit);
}

function constraints(value: unknown): EditorialSourceConstraints {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptySourceConstraints();
  }
  const row = value as Record<string, unknown>;
  return {
    excludedTopics: stringList(row.excluded_topics ?? row.excludedTopics, 20),
    fromYear: numberOrNull(row.from_year ?? row.fromYear),
    toYear: numberOrNull(row.to_year ?? row.toYear),
    raw: stringList(row.raw, 20),
  };
}

export function editorialContextFromPayload(payload: unknown): EditorialContext | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const context = emptyEditorialContext();

  context.projectId = text(row.active_project_id ?? row.projectId) || null;
  context.projectSlug = text(row.active_project_slug ?? row.projectSlug) || null;
  context.projectName = text(row.active_project_name ?? row.projectName) || null;
  context.documentId = text(row.active_document_id ?? row.documentId) || null;
  context.documentTitle = text(row.active_document_title ?? row.documentTitle) || null;
  context.episodeId = text(row.active_episode_id ?? row.episodeId) || null;
  context.activeChapterNumber = numberOrNull(
    row.active_chapter_number ?? row.activeChapterNumber
  );
  context.activeTask = text(row.active_task ?? row.activeTask) || null;
  context.currentEditorialObjective =
    text(row.current_editorial_objective ?? row.currentEditorialObjective) || null;
  context.lastRetrievalScope =
    text(row.last_retrieval_scope ?? row.lastRetrievalScope) || null;
  context.lastEvidenceChunkIds = stringList(
    row.last_evidence_chunk_ids ?? row.lastEvidenceChunkIds,
    20
  );
  context.sourceConstraints = constraints(row.source_constraints ?? row.sourceConstraints);
  context.updatedAt = text(row.updated_at ?? row.updatedAt) || null;

  return context;
}

export function editorialContextToPayload(
  context: EditorialContext,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    active_project_id: context.projectId,
    active_project_slug: context.projectSlug,
    active_project_name: context.projectName,
    active_document_id: context.documentId,
    active_document_title: context.documentTitle,
    active_episode_id: context.episodeId,
    active_chapter_number: context.activeChapterNumber,
    active_task: context.activeTask,
    current_editorial_objective: context.currentEditorialObjective,
    last_retrieval_scope: context.lastRetrievalScope,
    last_evidence_chunk_ids: context.lastEvidenceChunkIds.slice(0, 10),
    source_constraints: {
      excluded_topics: context.sourceConstraints.excludedTopics.slice(0, 6),
      from_year: context.sourceConstraints.fromYear,
      to_year: context.sourceConstraints.toYear,
      raw: context.sourceConstraints.raw.slice(0, 6),
    },
    updated_at: context.updatedAt || new Date().toISOString(),
    ...extra,
  };
}

export function mergeEditorialContext(
  previous: EditorialContext | null | undefined,
  patch: Partial<EditorialContext>
): EditorialContext {
  const base = previous ? { ...previous } : emptyEditorialContext();
  const merged: EditorialContext = {
    ...base,
    ...patch,
    lastEvidenceChunkIds:
      patch.lastEvidenceChunkIds !== undefined
        ? patch.lastEvidenceChunkIds.slice(0, 20)
        : base.lastEvidenceChunkIds,
    sourceConstraints: patch.sourceConstraints || base.sourceConstraints,
    updatedAt: new Date().toISOString(),
  };

  return merged;
}

export type LoadedEditorialContext = {
  context: EditorialContext | null;
  unavailable: boolean;
  error: string | null;
};

export async function loadEditorialContext(input: {
  store: SupabaseClient | null;
  conversationId: string;
}): Promise<LoadedEditorialContext> {
  if (!input.store) return { context: null, unavailable: false, error: null };

  const { data, error } = await input.store
    .from('pierrot_events')
    .select('payload,created_at')
    .eq('conversation_id', input.conversationId)
    .eq('event_name', EDITORIAL_CONTEXT_EVENT)
    .like('event_key', `${EDITORIAL_CONTEXT_KEY_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { context: null, unavailable: true, error: error.message };
  }
  if (!data) return { context: null, unavailable: false, error: null };

  const context = editorialContextFromPayload((data as Record<string, unknown>).payload);
  if (context) {
    context.updatedAt =
      context.updatedAt || text((data as Record<string, unknown>).created_at) || null;
  }
  return { context, unavailable: false, error: null };
}

export async function saveEditorialContext(input: {
  store: SupabaseClient | null;
  conversationId: string;
  sessionId: string;
  userMessageId: string;
  context: EditorialContext;
  diagnostic?: Record<string, unknown>;
}): Promise<boolean> {
  if (!input.store) return false;

  try {
    return await recordPierrotEvent(input.store, {
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      eventName: EDITORIAL_CONTEXT_EVENT,
      eventKey: `${EDITORIAL_CONTEXT_KEY_PREFIX}${input.userMessageId}`,
      payload: editorialContextToPayload(input.context, {
        kind: 'editorial_context',
        ...input.diagnostic,
      }),
    });
  } catch {
    // Continuity must not break the answer if observability is unavailable.
    return false;
  }
}

export type StoredEditorialDiagnostic = {
  id: string;
  createdAt: string | null;
  payload: Record<string, unknown>;
};

export async function saveEditorialDiagnostic(input: {
  store: SupabaseClient | null;
  conversationId: string;
  sessionId: string;
  userMessageId: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  if (!input.store) return false;
  try {
    return await recordPierrotEvent(input.store, {
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      eventName: EDITORIAL_CONTEXT_EVENT,
      eventKey: `${EDITORIAL_DIAGNOSTIC_KEY_PREFIX}${input.userMessageId}`,
      payload: { kind: 'editorial_diagnostic', ...input.payload },
    });
  } catch {
    return false;
  }
}

export async function loadEditorialDiagnostics(input: {
  store: SupabaseClient | null;
  conversationId: string;
  limit?: number;
}): Promise<{ diagnostics: StoredEditorialDiagnostic[]; error: string | null }> {
  if (!input.store) return { diagnostics: [], error: null };
  const { data, error } = await input.store
    .from('pierrot_events')
    .select('id,payload,created_at')
    .eq('conversation_id', input.conversationId)
    .eq('event_name', EDITORIAL_CONTEXT_EVENT)
    .like('event_key', `${EDITORIAL_DIAGNOSTIC_KEY_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 50));

  if (error) return { diagnostics: [], error: error.message };

  return {
    diagnostics: (Array.isArray(data) ? data : []).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: text(item.id),
        createdAt: text(item.created_at) || null,
        payload:
          item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
            ? (item.payload as Record<string, unknown>)
            : {},
      };
    }),
    error: null,
  };
}

/**
 * A conservative first-turn inference. It only runs when no stored editorial
 * context exists and the chat itself is the UNFRAMED project conversation.
 * It never infers UNFRAMED from an unrelated message.
 */export function inferEditorialContext(input: {
  project: { id: string; slug: string; name: string } | null;
  documentId?: string | null;
  documentTitle?: string | null;
}): EditorialContext {
  const context = emptyEditorialContext();
  if (input.project && input.project.slug === 'unframed') {
    context.projectId = input.project.id;
    context.projectSlug = input.project.slug;
    context.projectName = input.project.name;
  }
  context.documentId = input.documentId ?? null;
  context.documentTitle = input.documentTitle ?? null;
  return context;
}
