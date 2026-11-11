import React from 'react';
import { render, screen } from '@testing-library/react';
import ChatWorkspace from '../ChatWorkspace';
import type {
  OwnerConversation,
  OwnerSessionListItem,
  WorkspaceOverview,
} from '@/lib/pierrot/workspace/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

const overview = {
  period: 7,
  from: '2026-11-01T00:00:00.000Z',
  to: '2026-11-09T00:00:00.000Z',
  metrics: [],
  commercial: {},
  summary: '',
  generatedAt: '2026-11-09T00:00:00.000Z',
} as unknown as WorkspaceOverview;

const sessions: OwnerSessionListItem[] = [];
const conversation: OwnerConversation = {
  id: 'conversation-1',
  sessionId: 'session-1',
  title: 'Bluesky',
  consentState: 'granted',
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Markdown fallback that must stay available.',
      createdAt: '2026-11-09T10:00:00.000Z',
      sessionId: 'session-1',
      response: {
        version: 1,
        language: 'ru',
        blocks: [
          {
            type: 'metric',
            title: 'Bluesky · период',
            metrics: [
              {
                label: 'Постов опубликовано',
                value: 12,
                unit: 'count',
                source: 'Bluesky archive',
                confidence: 'measured',
              },
            ],
          },
          {
            type: 'warning',
            level: 'info',
            text: 'Лайки — текущие счётчики, не события периода.',
          },
        ],
      },
    },
  ],
  historyId: 'history-1',
  historyTitle: 'Main',
  currentSessionId: 'session-1',
  oldestSequence: 1,
  newestSequence: 1,
};

describe('ChatWorkspace structured restoration', () => {
  it('renders a persisted structured response instead of flattening it to Markdown', () => {
    render(
      <ChatWorkspace
        ownerId="owner-1"
        overview={overview}
        sessions={sessions}
        conversation={conversation}
        startNew={false}
      />
    );

    expect(screen.getByText('Постов опубликовано')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(
      screen.getByText('Лайки — текущие счётчики, не события периода.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Markdown fallback that must stay available.')).not.toBeInTheDocument();
  });

  it('keeps old Markdown-only history readable', () => {
    render(
      <ChatWorkspace
        ownerId="owner-1"
        overview={overview}
        sessions={sessions}
        conversation={{
          ...conversation,
          messages: [
            {
              id: 'assistant-old',
              role: 'assistant',
              content: 'Old Markdown answer stays visible.',
              createdAt: '2026-11-08T10:00:00.000Z',
              sessionId: 'session-1',
            },
          ],
        }}
        startNew={false}
      />
    );

    expect(screen.getByText('Old Markdown answer stays visible.')).toBeInTheDocument();
  });
});
