import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProjectRail from '../ProjectRail';
import type { ProjectRailItem } from '@/lib/pierrot/workspace/types';

function item(overrides: Partial<ProjectRailItem>): ProjectRailItem {
  return {
    id: 'project-a',
    slug: 'project-a',
    name: 'Project A',
    status: 'active',
    historyId: 'history-a',
    canonicalConversationId: 'conversation-a',
    chatHref: '/admin/pierrot?history=history-a',
    lastActivityAt: '2026-11-09T10:00:00.000Z',
    sessions: [],
    ...overrides,
  };
}

const projects: ProjectRailItem[] = [
  item({
    id: 'project-a',
    slug: 'alpha',
    name: 'Alpha',
    historyId: 'history-a',
    chatHref: '/admin/pierrot?history=history-a',
    sessions: [
      {
        id: 'session-a',
        historyId: 'history-a',
        title: 'Alpha session',
        startedAt: '2026-11-09T09:00:00.000Z',
        lastActivityAt: '2026-11-09T10:00:00.000Z',
        messageCount: 4,
        ordinal: 1,
      },
    ],
  }),
  item({
    id: 'project-b',
    slug: 'beta',
    name: 'Beta',
    historyId: 'history-b',
    chatHref: '/admin/pierrot?history=history-b',
    sessions: [
      {
        id: 'session-b',
        historyId: 'history-b',
        title: 'Beta session',
        startedAt: '2026-11-08T09:00:00.000Z',
        lastActivityAt: '2026-11-08T10:00:00.000Z',
        messageCount: 2,
        ordinal: 1,
      },
    ],
  }),
];

describe('ProjectRail', () => {
  it('links each card to the canonical project chat and never renders a main history card', () => {
    const { container } = render(<ProjectRail projects={projects} activeHistoryId={null} />);

    expect(screen.getByRole('link', { name: 'Открыть общий чат проекта Alpha' })).toHaveAttribute(
      'href',
      '/admin/pierrot?history=history-a'
    );
    expect(screen.getByRole('link', { name: 'Открыть общий чат проекта Beta' })).toHaveAttribute(
      'href',
      '/admin/pierrot?history=history-b'
    );
    expect(screen.queryByText('Главная история')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.pw-project-rail-card')).toHaveLength(2);
  });

  it('expands several cards independently', () => {
    render(<ProjectRail projects={projects} activeHistoryId={null} />);

    expect(screen.queryByText('Alpha session')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta session')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть сессии проекта Alpha' }));
    expect(screen.getByText('Alpha session')).toBeInTheDocument();
    expect(screen.queryByText('Beta session')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть сессии проекта Beta' }));
    expect(screen.getByText('Alpha session')).toBeInTheDocument();
    expect(screen.getByText('Beta session')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть сессии проекта Alpha' }));
    expect(screen.queryByText('Alpha session')).not.toBeInTheDocument();
    expect(screen.getByText('Beta session')).toBeInTheDocument();
  });

  it('does not navigate or create a session when the + control is pressed', () => {
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    const push = jest.fn();
    const initialHref = window.location.href;

    try {
      render(<ProjectRail projects={projects} activeHistoryId={null} />);
      fireEvent.click(screen.getByRole('button', { name: 'Раскрыть сессии проекта Alpha' }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.location.href).toBe(initialHref);
      expect(push).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('opens the session with the correct history and session identifiers', () => {
    render(<ProjectRail projects={projects} activeHistoryId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Раскрыть сессии проекта Alpha' }));

    expect(screen.getByRole('link', { name: /Alpha session/ })).toHaveAttribute(
      'href',
      '/admin/pierrot?history=history-a&session=session-a'
    );
  });
});
