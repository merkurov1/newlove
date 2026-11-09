import React from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('ChatWorkspace PWA controls', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ records: [] }),
    })) as unknown as typeof fetch;
  });

  function renderWorkspace() {
    return render(
      <ChatWorkspace
        ownerId="owner-1"
        overview={overview}
        sessions={sessions}
        conversation={conversation}
        startNew={false}
      />
    );
  }

  it('always sends granted consent so owner history is stored', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'components/pierrot/workspace/ChatWorkspace.tsx'),
      'utf8'
    );

    expect(source).toContain("state: 'granted'");
    expect(source).toContain('consent,');
    expect(source).not.toContain('setPierrotConsent');
  });

  it('does not render the memory management panel or its trigger', () => {
    renderWorkspace();

    expect(document.getElementById('pw-memory-panel')).not.toBeInTheDocument();
    expect(document.querySelector('.pw-side-trigger')).not.toBeInTheDocument();
    expect(screen.queryByText('Память')).not.toBeInTheDocument();
  });

  it('removes the consent/save status controls from the composer', () => {
    renderWorkspace();

    expect(screen.queryByText('Разрешить сохранение')).not.toBeInTheDocument();
    expect(screen.queryByText('Не сохранять')).not.toBeInTheDocument();
    expect(screen.queryByText('Сохранение включено · до 90 дней')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Отправить сообщение')).toBeInTheDocument();
  });

  it('does not expose message memory/Flow actions in the PWA chat', () => {
    renderWorkspace();

    expect(screen.queryByText('В память')).not.toBeInTheDocument();
    expect(screen.queryByText('Запомнить')).not.toBeInTheDocument();
    expect(screen.queryByText('Сохранить')).not.toBeInTheDocument();
    expect(screen.queryByText('Напомнить')).not.toBeInTheDocument();
    expect(screen.queryByText('Во Flow')).not.toBeInTheDocument();
  });

  it('ignores the retired legacy Flow overlay event', () => {
    renderWorkspace();

    fireEvent(
      window,
      new CustomEvent('pierrot:open-panel', {
        detail: { section: 'flow' },
      })
    );

    expect(screen.queryByRole('dialog', { name: 'Flow' })).not.toBeInTheDocument();
    expect(document.querySelector('.pw-flow-overlay')).not.toBeInTheDocument();
  });
});
