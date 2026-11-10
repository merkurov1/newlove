import React from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatWorkspace from '../ChatWorkspace';
import type {
  OwnerConversation,
  OwnerSessionListItem,
  WorkspaceOverview,
} from '@/lib/pierrot/workspace/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
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

const sessions: OwnerSessionListItem[] = [
  {
    id: 'session-1',
    historyId: 'history-1',
    title: 'Session one',
    startedAt: '2026-11-09T09:00:00.000Z',
    endedAt: null,
    messageCount: 1,
    ordinal: 1,
    sourceConversationId: null,
    firstMessageSequence: 1,
    lastMessageSequence: 1,
  },
  {
    id: 'session-2',
    historyId: 'history-1',
    title: 'Session two',
    startedAt: '2026-11-09T11:00:00.000Z',
    endedAt: null,
    messageCount: 1,
    ordinal: 2,
    sourceConversationId: null,
    firstMessageSequence: 2,
    lastMessageSequence: 2,
  },
];

const conversation: OwnerConversation = {
  id: 'conversation-1',
  sessionId: 'session-1',
  title: 'Session one',
  consentState: 'granted',
  messages: [
    {
      id: 'message-1',
      role: 'assistant',
      content: 'Hello from session one',
      createdAt: '2026-11-09T10:00:00.000Z',
      sessionId: 'session-1',
    },
  ],
  historyId: 'history-1',
  historyTitle: 'Main',
  currentSessionId: 'session-1',
  oldestSequence: 1,
  newestSequence: 1,
};

function workspace(activeConversation: OwnerConversation) {
  return (
    <ChatWorkspace
      ownerId="owner-1"
      overview={overview}
      sessions={sessions}
      conversation={activeConversation}
      startNew={false}
    />
  );
}

function getComposer(): HTMLTextAreaElement {
  return screen.getByLabelText('Сообщение Пьеро') as HTMLTextAreaElement;
}

describe('ChatWorkspace composer stability', () => {
  it('does not remount the workspace with a dynamic server key', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'app/admin/pierrot/(workspace)/page.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/<ChatWorkspace\s+key=/);
  });

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ reply: 'ok', recorded: true }),
    })) as unknown as typeof fetch;
  });

  it('keeps the draft and focus when the parent re-renders with new messages', () => {
    const { rerender } = render(workspace(conversation));
    const composer = getComposer();

    composer.focus();
    fireEvent.change(composer, { target: { value: 'draft that must survive' } });

    rerender(
      workspace({
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: 'message-2',
            role: 'user',
            content: 'Background update',
            createdAt: '2026-11-09T10:01:00.000Z',
            sessionId: 'session-1',
          },
        ],
      })
    );

    expect(getComposer()).toHaveValue('draft that must survive');
    expect(document.activeElement).toBe(composer);
  });

  it('keeps the draft and focus when switching sessions and returning', () => {
    const { rerender } = render(workspace(conversation));
    const composer = getComposer();

    composer.focus();
    fireEvent.change(composer, { target: { value: 'unsent thought' } });

    rerender(
      workspace({
        ...conversation,
        id: 'conversation-2',
        sessionId: 'session-2',
        currentSessionId: 'session-2',
        title: 'Session two',
        messages: [
          {
            id: 'message-2',
            role: 'assistant',
            content: 'Hello from session two',
            createdAt: '2026-11-09T12:00:00.000Z',
            sessionId: 'session-2',
          },
        ],
        oldestSequence: 2,
        newestSequence: 2,
      })
    );

    expect(screen.getByText('Hello from session two')).toBeInTheDocument();
    expect(getComposer()).toHaveValue('unsent thought');
    expect(document.activeElement).toBe(composer);

    rerender(workspace(conversation));

    expect(screen.getByText('Hello from session one')).toBeInTheDocument();
    expect(getComposer()).toHaveValue('unsent thought');
    expect(document.activeElement).toBe(composer);
  });

  it('keeps a long draft across parent updates', () => {
    const longDraft = 'Long draft line.\n'.repeat(250);
    const { rerender } = render(workspace(conversation));
    const composer = getComposer();

    fireEvent.change(composer, { target: { value: longDraft } });
    rerender(workspace(conversation));

    expect(getComposer()).toHaveValue(longDraft);
  });

  it('clears the submitted draft only after the request is accepted', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;

    render(workspace(conversation));
    const composer = getComposer();

    fireEvent.change(composer, { target: { value: 'first message' } });
    fireEvent.click(screen.getByLabelText('Отправить сообщение'));

    expect(getComposer()).toHaveValue('first message');

    await act(async () => {
      resolveFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ reply: 'accepted', recorded: true }),
      });
    });

    await waitFor(() => {
      expect(getComposer()).toHaveValue('');
    });
  });

  it('does not erase text typed immediately after sending', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    ) as unknown as typeof fetch;

    render(workspace(conversation));
    const composer = getComposer();

    fireEvent.change(composer, { target: { value: 'first message' } });
    fireEvent.click(screen.getByLabelText('Отправить сообщение'));
    fireEvent.change(composer, { target: { value: 'next message' } });

    await act(async () => {
      resolveFetch({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ reply: 'accepted', recorded: true }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('accepted')).toBeInTheDocument();
    });
    expect(getComposer()).toHaveValue('next message');
  });
});
