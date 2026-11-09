import type { OwnerConversationListItem } from './types';

function activityTime(item: OwnerConversationListItem): number {
  const updated = item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN;
  if (Number.isFinite(updated)) return updated;
  const started = item.startedAt ? Date.parse(item.startedAt) : Number.NaN;
  return Number.isFinite(started) ? started : 0;
}

/**
 * One chronological stream. Project membership is metadata, not a sorting
 * group: an active project chat must not jump above a newer ordinary chat.
 */
export function sortOwnerConversations(
  conversations: OwnerConversationListItem[]
): OwnerConversationListItem[] {
  return [...conversations].sort((left, right) => {
    const timeOrder = activityTime(right) - activityTime(left);
    if (timeOrder !== 0) return timeOrder;
    return left.id.localeCompare(right.id);
  });
}
