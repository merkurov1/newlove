/** @jest-environment node */

import type { PierrotProject } from '@/lib/pierrot/projects/types';
import {
  buildProjectRailItems,
  isActiveProjectSession,
  projectRailHref,
  sessionRailHref,
  sortProjectRailItems,
  type ProjectRailHistoryRow,
  type ProjectRailSessionRow,
} from '../projectRail';
import type { ProjectRailItem } from '@/lib/pierrot/workspace/types';

function project(overrides: Partial<PierrotProject>): PierrotProject {
  return {
    id: 'project-1',
    ownerUserId: 'owner-1',
    slug: 'project-1',
    name: 'Project 1',
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: null,
    projectBrief: '',
    briefRevision: 1,
    lastActivityAt: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function session(overrides: Partial<ProjectRailSessionRow>): ProjectRailSessionRow {
  return {
    id: 'session-1',
    history_id: 'history-1',
    title: 'Session',
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    last_message_at: null,
    message_count: 0,
    ordinal: 1,
    ...overrides,
  };
}

describe('project rail data model', () => {
  it('sorts projects by the latest real message activity, not by creation date', () => {
    const projects = [
      project({
        id: 'old-created',
        slug: 'old-created',
        name: 'Old created',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      project({
        id: 'new-created',
        slug: 'new-created',
        name: 'New created',
        createdAt: '2026-11-09T00:00:00.000Z',
      }),
    ];
    const histories: ProjectRailHistoryRow[] = [
      {
        id: 'history-old',
        project_id: 'old-created',
        canonical_conversation_id: 'conversation-old',
      },
      {
        id: 'history-new',
        project_id: 'new-created',
        canonical_conversation_id: 'conversation-new',
      },
    ];
    const sessions: ProjectRailSessionRow[] = [
      session({
        id: 'session-old',
        history_id: 'history-old',
        last_message_at: '2026-11-08T12:00:00.000Z',
        message_count: 4,
      }),
      session({
        id: 'session-new',
        history_id: 'history-new',
        last_message_at: '2026-11-09T09:00:00.000Z',
        message_count: 2,
      }),
    ];

    const items = buildProjectRailItems(projects, histories, sessions);

    expect(items.map((item) => item.id)).toEqual(['new-created', 'old-created']);
    expect(items.map((item) => item.lastActivityAt)).toEqual([
      '2026-11-09T09:00:00.000Z',
      '2026-11-08T12:00:00.000Z',
    ]);
  });

  it('keeps projects without messages after active projects even if they are new', () => {
    const projects = [
      project({ id: 'empty-new', slug: 'empty-new', name: 'Empty new' }),
      project({ id: 'used', slug: 'used', name: 'Used' }),
    ];
    const items = buildProjectRailItems(
      projects,
      [
        { id: 'history-empty', project_id: 'empty-new', canonical_conversation_id: null },
        { id: 'history-used', project_id: 'used', canonical_conversation_id: null },
      ],
      [
        session({
          id: 'used-session',
          history_id: 'history-used',
          last_message_at: '2026-01-02T00:00:00.000Z',
          message_count: 1,
        }),
      ]
    );

    expect(items.map((item) => item.id)).toEqual(['used', 'empty-new']);
  });

  it('only exposes open sessions that contain messages', () => {
    expect(isActiveProjectSession({ ended_at: null, message_count: 3 })).toBe(true);
    expect(isActiveProjectSession({ ended_at: '2026-11-09T10:00:00.000Z', message_count: 3 })).toBe(
      false
    );
    expect(isActiveProjectSession({ ended_at: null, message_count: 0 })).toBe(false);
  });

  it('does not treat an ended session as a rail session even though it exists', () => {
    const items = buildProjectRailItems(
      [project({ id: 'project-a', slug: 'project-a', name: 'A' })],
      [{ id: 'history-a', project_id: 'project-a', canonical_conversation_id: 'conversation-a' }],
      [
        session({
          id: 'active',
          history_id: 'history-a',
          title: 'Active',
          ordinal: 2,
          message_count: 2,
          last_message_at: '2026-11-09T12:00:00.000Z',
        }),
        session({
          id: 'ended',
          history_id: 'history-a',
          title: 'Ended',
          ordinal: 1,
          message_count: 9,
          ended_at: '2026-11-08T12:00:00.000Z',
          last_message_at: '2026-11-08T12:00:00.000Z',
        }),
      ]
    );

    expect(items[0].sessions.map((item) => item.id)).toEqual(['active']);
    // Sorting still uses the latest real message activity, even if that
    // activity happened in a closed session.
    expect(items[0].lastActivityAt).toBe('2026-11-09T12:00:00.000Z');
  });

  it('assigns sessions to their own project and keeps only that fragment link', () => {
    const items = buildProjectRailItems(
      [
        project({ id: 'a', slug: 'alpha', name: 'Alpha' }),
        project({ id: 'b', slug: 'beta', name: 'Beta' }),
      ],
      [
        { id: 'history-a', project_id: 'a', canonical_conversation_id: null },
        { id: 'history-b', project_id: 'b', canonical_conversation_id: null },
      ],
      [
        session({ id: 'a-session', history_id: 'history-a', message_count: 1, ordinal: 1 }),
        session({ id: 'b-session', history_id: 'history-b', message_count: 1, ordinal: 1 }),
      ]
    );
    const alpha = items.find((item) => item.id === 'a');
    const beta = items.find((item) => item.id === 'b');

    expect(alpha?.sessions.map((item) => item.id)).toEqual(['a-session']);
    expect(beta?.sessions.map((item) => item.id)).toEqual(['b-session']);
    expect(alpha?.chatHref).toBe('/admin/pierrot?history=history-a');
    expect(sessionRailHref('history-a', 'a-session')).toBe(
      '/admin/pierrot?history=history-a&session=a-session'
    );
  });

  it('falls back to the project route when no permanent history exists yet', () => {
    expect(projectRailHref({ historyId: null, slug: 'art-engine' })).toBe(
      '/admin/pierrot?project=art-engine'
    );
  });

  it('sorts equal timestamps by name without using creation dates', () => {
    const items: ProjectRailItem[] = [
      {
        id: 'b',
        slug: 'b',
        name: 'Beta',
        status: 'active',
        historyId: null,
        canonicalConversationId: null,
        chatHref: '/admin/pierrot?project=b',
        lastActivityAt: null,
        sessions: [],
      },
      {
        id: 'a',
        slug: 'a',
        name: 'Alpha',
        status: 'active',
        historyId: null,
        canonicalConversationId: null,
        chatHref: '/admin/pierrot?project=a',
        lastActivityAt: null,
        sessions: [],
      },
    ];

    expect(sortProjectRailItems(items).map((item) => item.name)).toEqual(['Alpha', 'Beta']);
  });
});
