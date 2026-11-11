import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EvidenceClass } from './types';

assertServerOnly('lib/pierrot/context/store');

function isMissingRelation(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist|relation .*not found/i.test(value);
}

export type ProjectEventWrite = {
  projectId: string;
  eventType: string;
  title: string;
  description?: string;
  occurredAt?: string;
  evidenceClass: EvidenceClass;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only project timeline write. A missing migration must not break the
 * operation that produced the event; the caller still has its original record.
 */
export async function recordProjectEvent(
  store: SupabaseClient,
  ownerUserId: string,
  input: ProjectEventWrite
): Promise<void> {
  const { error } = await store.from('pierrot_project_events').insert({
    project_id: input.projectId,
    owner_user_id: ownerUserId,
    event_type: input.eventType,
    title: input.title.slice(0, 400),
    description: (input.description || '').slice(0, 4_000),
    occurred_at: input.occurredAt || new Date().toISOString(),
    recorded_at: new Date().toISOString(),
    evidence_class: input.evidenceClass,
    source_type: input.sourceType || null,
    source_id: input.sourceId || null,
    source_conversation_id: input.sourceConversationId || null,
    source_message_id: input.sourceMessageId || null,
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.9)),
    metadata: input.metadata || {},
  });

  if (error && !isMissingRelation(error)) throw error;
}

export async function recordProjectStatusChange(
  store: SupabaseClient,
  ownerUserId: string,
  input: {
    projectId: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string;
    evidenceClass: EvidenceClass;
    sourceRefs?: unknown[];
    changedAt?: string;
  }
): Promise<void> {
  const { error } = await store.from('pierrot_project_status_history').insert({
    project_id: input.projectId,
    owner_user_id: ownerUserId,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    reason: input.reason.slice(0, 1_000),
    evidence_class: input.evidenceClass,
    source_refs: input.sourceRefs || [],
    changed_at: input.changedAt || new Date().toISOString(),
  });

  if (error && !isMissingRelation(error)) throw error;
}
