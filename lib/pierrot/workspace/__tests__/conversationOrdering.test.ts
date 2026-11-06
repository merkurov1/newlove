import { sortOwnerConversations } from '../conversationOrdering';
import type { OwnerConversationListItem } from '../types';

function item(
  id: string,
  updatedAt: string,
  projectId: string | null,
  projectStatus: OwnerConversationListItem['projectStatus'] = null
): OwnerConversationListItem {
  return {
    id,
    sessionId: `session-${id}`,
    title: id,
    startedAt: updatedAt,
    updatedAt,
    consentState: 'granted',
    messageCount: 1,
    projectId,
    projectSlug: projectId ? id : null,
    projectName: projectId ? id : null,
    projectStatus,
  };
}

describe('sortOwnerConversations', () => {
  it('keeps active project conversations above other project and ordinary chats', () => {
    const result = sortOwnerConversations([
      item('ordinary', '2026-11-06T12:00:00Z', null),
      item('paused', '2026-11-06T13:00:00Z', 'paused', 'paused'),
      item('active', '2026-11-06T10:00:00Z', 'active', 'active'),
    ]);

    expect(result.map((conversation) => conversation.id)).toEqual(['active', 'paused', 'ordinary']);
  });

  it('sorts within each group by last activity', () => {
    const result = sortOwnerConversations([
      item('old', '2026-11-06T10:00:00Z', 'project', 'active'),
      item('new', '2026-11-06T11:00:00Z', 'project', 'active'),
    ]);

    expect(result.map((conversation) => conversation.id)).toEqual(['new', 'old']);
  });
});
