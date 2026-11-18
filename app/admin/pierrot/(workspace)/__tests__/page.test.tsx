/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdmin: jest.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));

jest.mock('@/lib/pierrot/workspace/data', () => ({
  loadOwnerHistoryView: jest.fn(),
  loadWorkspaceOverview: jest.fn(),
}));

jest.mock('@/lib/pierrot/projects/store', () => ({
  getPierrotProject: jest.fn(),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => null),
}));

jest.mock('@/lib/pierrot/memory/brainStatus', () => ({
  loadBrainStatus: jest.fn(async () => null),
}));

jest.mock('@/components/pierrot/workspace/ChatWorkspace', () => ({
  __esModule: true,
  default: () => null,
}));

const { redirect } = require('next/navigation') as { redirect: jest.Mock };
const { loadOwnerHistoryView, loadWorkspaceOverview } = require('@/lib/pierrot/workspace/data') as {
  loadOwnerHistoryView: jest.Mock;
  loadWorkspaceOverview: jest.Mock;
};
const { getPierrotProject } = require('@/lib/pierrot/projects/store') as {
  getPierrotProject: jest.Mock;
};
const { loadBrainStatus } = require('@/lib/pierrot/memory/brainStatus') as {
  loadBrainStatus: jest.Mock;
};
const { default: ChatPage } = require('../page') as {
  default: (props: { searchParams?: unknown }) => Promise<unknown>;
};

const OWNER_ID = '11111111-1111-4111-8111-111111111111';

const redirectMock = redirect as unknown as jest.Mock;

function view(overrides: Record<string, unknown> = {}) {
  return {
    scope: {
      history: { id: 'history-1', type: 'project', title: 'Project' },
      session: null,
      conversationId: 'conversation-1',
      conversationSessionId: 'conversation-session-1',
      project: { id: 'project-1', slug: 'alpha', name: 'Alpha' },
    },
    sessions: [],
    conversation: {
      id: 'conversation-1',
      sessionId: 'conversation-session-1',
      title: 'Alpha',
      consentState: 'granted',
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: 'Saved history',
          createdAt: '2026-11-09T10:00:00.000Z',
        },
      ],
      historyId: 'history-1',
      historyType: 'project',
      historyTitle: 'Alpha',
      projectId: 'project-1',
      projectSlug: 'alpha',
      projectName: 'Alpha',
      currentSessionId: null,
      activeSessionId: 'session-open',
      oldestSequence: 1,
      newestSequence: 1,
    },
    project: { id: 'project-1', slug: 'alpha', name: 'Alpha' },
    ...overrides,
  } as never;
}

describe('Pierrot chat page deep links', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves ?project= through the project canonical history', async () => {
    (getPierrotProject as unknown as jest.Mock).mockResolvedValueOnce({
      id: 'project-1',
      slug: 'alpha',
      name: 'Alpha',
    });
    (loadOwnerHistoryView as unknown as jest.Mock).mockResolvedValueOnce(view());

    await expect(ChatPage({ searchParams: Promise.resolve({ project: 'alpha' }) })).rejects.toThrow(
      'REDIRECT:/admin/pierrot?history=history-1'
    );

    expect(getPierrotProject).toHaveBeenCalledWith(OWNER_ID, 'alpha');
    expect(loadOwnerHistoryView).toHaveBeenCalledWith(OWNER_ID, {
      projectId: 'project-1',
      createSession: false,
    });
  });

  it('opens ?history= and ?session= instead of falling back to MAIN', async () => {
    const projectView = view();
    (loadOwnerHistoryView as unknown as jest.Mock).mockResolvedValueOnce(projectView);

    const element = (await ChatPage({
      searchParams: Promise.resolve({ history: 'history-1', session: 'session-1' }),
    })) as unknown as { props: Record<string, unknown> };

    expect(loadOwnerHistoryView).toHaveBeenCalledWith(OWNER_ID, {
      historyId: 'history-1',
      sessionId: 'session-1',
      createSession: false,
    });
    expect(element.props.conversation).toBe(projectView.conversation);
    expect(element.props.startNew).toBe(false);
  });

  it('honors ?new=1 after a reload of the same URL', async () => {
    (loadOwnerHistoryView as unknown as jest.Mock).mockResolvedValueOnce(view());
    (loadWorkspaceOverview as unknown as jest.Mock).mockResolvedValueOnce({});

    const element = (await ChatPage({
      searchParams: Promise.resolve({ history: 'history-1', new: '1' }),
    })) as unknown as { props: Record<string, unknown> };

    expect(loadOwnerHistoryView).toHaveBeenCalledWith(OWNER_ID, {
      historyId: 'history-1',
      sessionId: null,
      createSession: false,
    });
    expect(element.props.startNew).toBe(true);
    expect(loadBrainStatus).toHaveBeenCalled();
  });

  it('maps a legacy ?conversation= link to its permanent history URL', async () => {
    (loadOwnerHistoryView as unknown as jest.Mock).mockResolvedValueOnce(
      view({
        scope: {
          history: { id: 'history-9', type: 'main', title: 'Main' },
          session: { id: 'session-9' },
          conversationId: 'conversation-9',
          conversationSessionId: 'conversation-session-9',
          project: null,
        },
      })
    );

    await expect(
      ChatPage({ searchParams: Promise.resolve({ conversation: 'conversation-9' }) })
    ).rejects.toThrow('REDIRECT:/admin/pierrot?history=history-9&session=session-9');

    expect(loadOwnerHistoryView).toHaveBeenCalledWith(OWNER_ID, {
      conversationId: 'conversation-9',
      createSession: false,
    });
    expect(redirectMock).toHaveBeenCalled();
  });
});
