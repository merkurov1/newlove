/**
 * Pure planning helpers for merging historical project conversations into one
 * canonical transcript. The production script uses the same ordering and
 * duplicate rules; keeping them pure makes the non-destructive contract
 * testable without a database.
 */

export type MergeMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  messageIndex: number;
  createdAt: string | null;
};

export type MergeAssignment = {
  messageId: string;
  sourceConversationId: string;
  originalMessageIndex: number;
  newMessageIndex: number | null;
  skippedDuplicate: boolean;
  duplicateOf: string | null;
};

export type MergePlan = {
  targetConversationId: string;
  messageCountBefore: number;
  messageCountAfter: number;
  duplicates: number;
  assignments: MergeAssignment[];
};

function time(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function duplicateKey(message: MergeMessage): string {
  const createdAt = message.createdAt
    ? new Date(message.createdAt).toISOString().slice(0, 19)
    : '';
  return `${message.role}\u0000${createdAt}\u0000${message.content.replace(/\s+/g, ' ').trim()}`;
}

export function compareMergeMessages(left: MergeMessage, right: MergeMessage): number {
  const leftTime = time(left.createdAt);
  const rightTime = time(right.createdAt);
  if (leftTime !== rightTime) return leftTime - rightTime;
  if (left.messageIndex !== right.messageIndex) return left.messageIndex - right.messageIndex;
  return left.id.localeCompare(right.id);
}

/**
 * Builds a continuous 1..N sequence oldest-first. Messages that are exact
 * repeats (same role, same truncated timestamp, same normalized text) are not
 * moved; they stay in their original conversation and are recorded as skipped.
 */
export function planProjectConversationMerge(
  targetConversationId: string,
  messages: MergeMessage[]
): MergePlan {
  const ordered = [...messages].sort(compareMergeMessages);
  const seen = new Map<string, string>();
  const assignments: MergeAssignment[] = [];
  let nextIndex = 0;
  let duplicates = 0;

  for (const message of ordered) {
    const key = duplicateKey(message);
    const duplicateOf = seen.get(key);
    if (duplicateOf) {
      duplicates += 1;
      assignments.push({
        messageId: message.id,
        sourceConversationId: message.conversationId,
        originalMessageIndex: message.messageIndex,
        newMessageIndex: null,
        skippedDuplicate: true,
        duplicateOf,
      });
      continue;
    }

    seen.set(key, message.id);
    nextIndex += 1;
    assignments.push({
      messageId: message.id,
      sourceConversationId: message.conversationId,
      originalMessageIndex: message.messageIndex,
      newMessageIndex: nextIndex,
      skippedDuplicate: false,
      duplicateOf: null,
    });
  }

  return {
    targetConversationId,
    messageCountBefore: messages.length,
    messageCountAfter: nextIndex,
    duplicates,
    assignments,
  };
}

export function planIsNoop(plan: MergePlan): boolean {
  return plan.assignments.every(
    (assignment) =>
      !assignment.skippedDuplicate &&
      assignment.sourceConversationId === plan.targetConversationId &&
      assignment.newMessageIndex === assignment.originalMessageIndex
  );
}
