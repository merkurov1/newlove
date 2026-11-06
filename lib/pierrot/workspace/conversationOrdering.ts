import type { OwnerConversationListItem } from './types';

function groupRank(item: OwnerConversationListItem): number {
  if (!item.projectId) return 2;
  return item.projectStatus === 'active' ? 0 : 1;
}

export function sortOwnerConversations(
  conversations: OwnerConversationListItem[]
): OwnerConversationListItem[] {
  return [...conversations].sort((left, right) => {
    const groupOrder = groupRank(left) - groupRank(right);
    if (groupOrder !== 0) return groupOrder;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
