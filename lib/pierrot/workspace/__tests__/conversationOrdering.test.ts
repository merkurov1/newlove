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
  it('puts every conversation in one chronological stream regardless of project', () => {
    const result = sortOwnerConversations([
      item('ordinary-old', '2026-11-06T09:00:00Z', null),
      item('paused', '2026-11-06T13:00:00Z', 'paused', 'paused'),
      item('active-old', '2026-11-06T10:00:00Z', 'active', 'active'),
      item('ordinary-new', '2026-11-06T14:00:00Z', null),
    ]);

    expect(result.map((conversation) => conversation.id)).toEqual([
      'ordinary-new',
      'paused',
      'active-old',
      'ordinary-old',
    ]);
  });

  it('uses the same last-activity ordering for projects and ordinary chats', () => {
    const result = sortOwnerConversations([
      item('old', '2026-11-06T10:00:00Z', 'project', 'active'),
      item('new', '2026-11-06T11:00:00Z', null),
    ]);

    expect(result.map((conversation) => conversation.id)).toEqual(['new', 'old']);
  });

  it('uses startedAt when updatedAt cannot be parsed', () => {
    const broken = item('broken', 'not-a-date', null);
    broken.startedAt = '2026-11-06T12:00:00Z';
    const valid = item('valid', '2026-11-06T11:00:00Z', null);

    expect(sortOwnerConversations([valid, broken]).map((entry) => entry.id)).toEqual([
      'broken',
      'valid',
    ]);
  });
});
