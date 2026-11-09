import { normalizeForComparison } from '@/lib/pierrot/memory/similarity';

export type TaskExperienceOutcome =
  | 'confirmed'
  | 'false_task'
  | 'missed_task'
  | 'duplicate'
  | 'wrong_status'
  | 'wrong_project'
  | 'wrong_kind'
  | 'display_error';

export type TaskExperienceSource = 'grooming' | 'chat_correction' | 'feedback' | 'manual';

export type TaskExperienceExample = {
  id: string;
  userId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  sourceText: string | null;
  proposedKind: string | null;
  confirmedKind: string | null;
  proposedProjectId: string | null;
  confirmedProjectId: string | null;
  outcome: TaskExperienceOutcome;
  reason: string | null;
  source: TaskExperienceSource;
  analyzerVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type TaskExperienceInput = Omit<TaskExperienceExample, 'id' | 'userId' | 'createdAt'> & {
  userId: string;
};

/**
 * Returns a learned override only for an exact normalized sentence. Approximate
 * similarity remains advisory context and must not suppress a new task.
 */
export function learnedClassification(
  sourceText: string,
  examples: TaskExperienceExample[]
): { outcome: TaskExperienceOutcome; confirmedKind: string | null } | null {
  const normalized = normalizeForComparison(sourceText);
  if (!normalized) return null;
  const exact = examples.find(
    (example) => example.sourceText && normalizeForComparison(example.sourceText) === normalized
  );
  return exact ? { outcome: exact.outcome, confirmedKind: exact.confirmedKind } : null;
}
