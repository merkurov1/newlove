import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TaskExperienceExample,
  TaskExperienceInput,
  TaskExperienceOutcome,
  TaskExperienceSource,
} from './types';

assertServerOnly('lib/pierrot/learning/store');

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
  return /42P01|PGRST205|does not exist|relation .*not found/i.test(value);
}

function mapRow(row: Record<string, unknown>): TaskExperienceExample | null {
  const outcome = text(row.outcome) as TaskExperienceOutcome;
  const source = text(row.source) as TaskExperienceSource;
  if (!outcome || !source) return null;
  return {
    id: text(row.id),
    userId: text(row.user_id),
    conversationId: text(row.conversation_id) || null,
    sourceMessageId: text(row.source_message_id) || null,
    sourceText: text(row.source_text) || null,
    proposedKind: text(row.proposed_kind) || null,
    confirmedKind: text(row.confirmed_kind) || null,
    proposedProjectId: text(row.proposed_project_id) || null,
    confirmedProjectId: text(row.confirmed_project_id) || null,
    outcome,
    reason: text(row.reason) || null,
    source,
    analyzerVersion: text(row.analyzer_version) || 'task-analyzer-v2',
    metadata: object(row.metadata),
    createdAt: text(row.created_at),
  };
}

/**
 * Learning is advisory. If the migration is absent, classification and review
 * continue exactly as before and the caller is never failed by telemetry.
 */
export async function recordTaskExperience(
  store: SupabaseClient,
  input: TaskExperienceInput
): Promise<TaskExperienceExample | null> {
  const { data, error } = await store
    .from('pierrot_task_experiences')
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      source_message_id: input.sourceMessageId,
      source_text: input.sourceText?.slice(0, 4_000) || null,
      proposed_kind: input.proposedKind,
      confirmed_kind: input.confirmedKind,
      proposed_project_id: input.proposedProjectId,
      confirmed_project_id: input.confirmedProjectId,
      outcome: input.outcome,
      reason: input.reason?.slice(0, 1_000) || null,
      source: input.source,
      analyzer_version: input.analyzerVersion,
      metadata: input.metadata,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function listTaskExperiences(
  store: SupabaseClient,
  input: {
    userId: string;
    limit?: number;
    sourceMessageId?: string | null;
    outcomes?: TaskExperienceOutcome[];
  }
): Promise<TaskExperienceExample[]> {
  let query = store
    .from('pierrot_task_experiences')
    .select('*')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 200, 1), 500));

  if (input.sourceMessageId) query = query.eq('source_message_id', input.sourceMessageId);
  if (input.outcomes && input.outcomes.length > 0) query = query.in('outcome', input.outcomes);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row): row is TaskExperienceExample => Boolean(row));
}
