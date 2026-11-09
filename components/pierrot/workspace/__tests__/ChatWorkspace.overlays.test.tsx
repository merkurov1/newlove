import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatWorkspace from '../ChatWorkspace';
import type {
  OwnerConversation,
  OwnerSessionListItem,
  WorkspaceOverview,
} from '@/lib/pierrot/workspace/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('../FlowWorkspace', () => ({
  __esModule: true,
  default: () => <div data-testid="flow-workspace" />,
}));

const overview = {
  period: 7,
  from: '2026-11-01T00:00:00.000Z',
  to: '2026-11-09T00:00:00.000Z',
  metrics: [],
  commercial: {},
  summary: '',
  generatedAt: '2026-11-09T00:00:00.000Z',
} as unknown as WorkspaceOverview;

const conversation: OwnerConversation = {
  id: 'conversation-1',
  sessionId: 'session-1',
  title: 'Session',
  consentState: 'granted',
  messages: [
    {
      id: 'message-1',
      role: 'assistant',
      content: 'Hello',
      createdAt: '2026-11-09T10:00:00.000Z',
    },
  ],
  historyId: 'history-1',
  historyTitle: 'Project Alpha',
  currentSessionId: 'session-1',
  oldestSequence: 1,
  newestSequence: 1,
};

const sessions: OwnerSessionListItem[] = [
  {
    id: 'session-1',
    historyId: 'history-1',
    title: 'Session',
    startedAt: '2026-11-09T09:00:00.000Z',
    endedAt: null,
    messageCount: 1,
    ordinal: 1,
    sourceConversationId: null,
    firstMessageSequence: 1,
    lastMessageSequence: 1,
  },
];

describe('ChatWorkspace Memory and Flow actions', () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('view=summary')) {
      return {
        ok: true,
        json: async () => ({
          counts: { memory: 1, saved: 0, reminder: 0 },
          reminders: [],
          available: true,
          activeTotal: 1,
          archivedTotal: 0,
          uncertainTotal: 0,
        }),
      } as Response;
    }
    return { ok: true, json: async () => ({ records: [] }) } as Response;
  });

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockClear();
  });

  function renderWorkspace(initialPanel?: 'memory' | 'flow') {
    return render(
      <ChatWorkspace
        ownerId="owner-1"
        overview={overview}
        sessions={sessions}
        conversation={conversation}
        startNew={false}
        initialPanel={initialPanel}
      />
    );
  }

  function openPanel(section: 'memory' | 'flow') {
    fireEvent(
      window,
      new CustomEvent('pierrot:open-panel', {
        detail: { section },
      })
    );
  }

  it('opens the existing Memory panel from the right-corner icon', async () => {
    renderWorkspace();

    openPanel('memory');

    await waitFor(() => {
      expect(document.getElementById('pw-memory-panel')).toBeInTheDocument();
    });
    expect(screen.getByText('Правила и долгосрочный контекст')).toBeInTheDocument();
  });

  it('opens the existing FlowWorkspace inside a single overlay', () => {
    renderWorkspace();

    openPanel('flow');

    expect(screen.getByRole('dialog', { name: 'Flow' })).toBeInTheDocument();
    expect(screen.getByTestId('flow-workspace')).toBeInTheDocument();
    expect(document.querySelectorAll('.pw-flow-overlay')).toHaveLength(1);
  });

  it('closes the Flow overlay with Escape and restores background scrolling', async () => {
    renderWorkspace();

    openPanel('flow');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Flow' })).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('never keeps Memory and Flow open at the same time', async () => {
    renderWorkspace();

    openPanel('memory');
    await waitFor(() => {
      expect(document.getElementById('pw-memory-panel')).toBeInTheDocument();
    });

    openPanel('flow');
    expect(document.getElementById('pw-memory-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Flow' })).toBeInTheDocument();
    expect(document.querySelectorAll('.pw-flow-overlay')).toHaveLength(1);

    openPanel('memory');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Flow' })).not.toBeInTheDocument();
    });
    expect(document.getElementById('pw-memory-panel')).toBeInTheDocument();
  });
});
