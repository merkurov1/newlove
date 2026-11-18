/** @jest-environment node */

import { randomUUID } from 'crypto';
import { describe, expect, it } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { appendPierrotMessage } from '@/lib/pierrot/serverStore';
import { loadHistoryMessagePage, resolveHistoryScope } from '@/lib/pierrot/history/store';
import { loadOwnerHistoryViewFromStore } from '../data';

const TABLES = [
  'pierrot_histories',
  'pierrot_sessions',
  'pierrot_messages',
  'pierrot_events',
  'pierrot_projects',
  'pierrot_conversations',
  'pierrot_project_conversations',
];

type ProjectSeed = {
  slug: string;
  name: string;
  id: string;
  conversationId: string;
  conversationSessionId: string;
  historyId: string;
  openSessionId: string;
  closedSessionId: string;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; sequence: number }>;
};

function createMatrixDatabase() {
  const db = new FakeSupabase(TABLES);
  let nextSequence = 1;

  const projects: ProjectSeed[] = ['alpha', 'beta', 'gamma'].map((slug) => ({
    slug,
    name: slug.toUpperCase(),
    id: randomUUID(),
    conversationId: randomUUID(),
    conversationSessionId: randomUUID(),
    historyId: randomUUID(),
    openSessionId: randomUUID(),
    closedSessionId: randomUUID(),
    messages: [],
  }));

  for (const project of projects) {
    project.messages = [
      {
        id: `${project.slug}-user-1`,
        role: 'user',
        content: `${project.name} first question`,
        sequence: nextSequence++,
      },
      {
        id: `${project.slug}-assistant-1`,
        role: 'assistant',
        content: `${project.name} saved answer`,
        sequence: nextSequence++,
      },
    ];
  }

  db.seed(
    'pierrot_conversations',
    projects.map((project) => ({
      id: project.conversationId,
      session_id: project.conversationSessionId,
      identity_type: 'owner',
      user_id: OWNER_ID,
      mode: 'site',
      consent_state: 'granted',
      title: project.name,
      started_at: '2026-11-09T10:00:00.000Z',
      updated_at: '2026-11-09T10:00:00.000Z',
    }))
  );

  db.seed(
    'pierrot_projects',
    projects.map((project) => ({
      id: project.id,
      owner_user_id: OWNER_ID,
      slug: project.slug,
      name: project.name,
      description: '',
      objective: '',
      status: 'active',
      priority: 0,
      project_brief: '',
      brief_revision: 1,
      conversation_id: project.conversationId,
      last_activity_at: '2026-11-09T10:00:00.000Z',
      created_at: '2026-11-09T10:00:00.000Z',
      updated_at: '2026-11-09T10:00:00.000Z',
    }))
  );

  db.seed(
    'pierrot_histories',
    projects.map((project) => ({
      id: project.historyId,
      owner_user_id: OWNER_ID,
      type: 'project',
      project_id: project.id,
      canonical_conversation_id: project.conversationId,
      title: project.name,
      metadata: {},
      next_message_sequence: project.messages[project.messages.length - 1].sequence,
      created_at: '2026-11-09T10:00:00.000Z',
      updated_at: '2026-11-09T10:00:00.000Z',
    }))
  );

  db.seed(
    'pierrot_sessions',
    projects.flatMap((project) => [
      {
        id: project.closedSessionId,
        history_id: project.historyId,
        conversation_id: project.conversationId,
        source_conversation_id: null,
        ordinal: 1,
        title: `${project.name} closed`,
        started_at: '2026-11-08T10:00:00.000Z',
        ended_at: '2026-11-08T12:00:00.000Z',
        last_message_at: '2026-11-08T12:00:00.000Z',
        message_count: 1,
        first_message_sequence: project.messages[0].sequence,
        last_message_sequence: project.messages[0].sequence,
        metadata: {},
        created_at: '2026-11-08T10:00:00.000Z',
        updated_at: '2026-11-08T12:00:00.000Z',
      },
      {
        id: project.openSessionId,
        history_id: project.historyId,
        conversation_id: project.conversationId,
        source_conversation_id: null,
        ordinal: 2,
        title: `${project.name} open`,
        started_at: '2026-11-09T10:00:00.000Z',
        ended_at: null,
        last_message_at: '2026-11-09T10:00:00.000Z',
        message_count: 1,
        first_message_sequence: project.messages[1].sequence,
        last_message_sequence: project.messages[1].sequence,
        metadata: {},
        created_at: '2026-11-09T10:00:00.000Z',
        updated_at: '2026-11-09T10:00:00.000Z',
      },
    ])
  );

  db.seed(
    'pierrot_messages',
    projects.flatMap((project) =>
      project.messages.map((message, index) => {
        const sessionId = index === 0 ? project.closedSessionId : project.openSessionId;
        return {
          id: message.id,
          conversation_id: project.conversationId,
          role: message.role,
          content: message.content,
          message_index: message.sequence,
          provider: null,
          created_at: `2026-11-09T10:0${index}:00.000Z`,
          history_id: project.historyId,
          session_id: sessionId,
          history_sequence: message.sequence,
        };
      })
    )
  );

  // Mirrors the reviewed SQL function: append only inside the history's
  // canonical conversation and the requested session.
  db.onRpc('pierrot_create_session', (params) => {
    const sessions = db
      .all('pierrot_sessions')
      .filter((session) => session.history_id === params.p_history_id);
    const history = db.all('pierrot_histories').find((row) => row.id === params.p_history_id);
    const row = {
      id: randomUUID(),
      history_id: params.p_history_id,
      conversation_id: history?.canonical_conversation_id ?? null,
      source_conversation_id: params.p_source_conversation_id ?? null,
      ordinal:
        sessions.reduce((max, session) => Math.max(max, Number(session.ordinal || 0)), 0) + 1,
      title: (params.p_title as string) || 'Новая сессия',
      started_at: '2026-11-09T11:00:00.000Z',
      ended_at: null,
      last_message_at: null,
      message_count: 0,
      first_message_sequence: null,
      last_message_sequence: null,
      metadata: {},
      created_at: '2026-11-09T11:00:00.000Z',
      updated_at: '2026-11-09T11:00:00.000Z',
    };
    db.all('pierrot_sessions').push(row);
    return { data: [row], error: null };
  });

  db.onRpc('pierrot_append_message_v2', (params) => {
    const conversation = db
      .all('pierrot_conversations')
      .find((row) => row.id === params.p_conversation_id);
    if (!conversation || conversation.session_id !== params.p_session_id) {
      return { data: null, error: { code: 'P0002', message: 'conversation_not_found' } };
    }

    const history = db.all('pierrot_histories').find((row) => row.id === params.p_history_id);
    if (!history) {
      return { data: null, error: { code: 'P0002', message: 'history_not_found' } };
    }
    if (history.canonical_conversation_id !== params.p_conversation_id) {
      return { data: null, error: { code: '22023', message: 'conversation_not_in_history' } };
    }

    const session = db.all('pierrot_sessions').find((row) => row.id === params.p_episode_id);
    if (!session || session.history_id !== params.p_history_id) {
      return { data: null, error: { code: 'P0002', message: 'session_not_found' } };
    }

    const existing = db.all('pierrot_messages').find((row) => row.id === params.p_message_id);
    if (existing) {
      return {
        data: [
          {
            sequence: existing.message_index,
            content: existing.content,
            inserted: false,
            history_sequence: existing.history_sequence,
          },
        ],
        error: null,
      };
    }

    const nextHistorySequence = Number(history.next_message_sequence || 0) + 1;
    history.next_message_sequence = nextHistorySequence;
    const messageIndex =
      db
        .all('pierrot_messages')
        .filter((row) => row.conversation_id === params.p_conversation_id)
        .reduce((max, row) => Math.max(max, Number(row.message_index || 0)), 0) + 1;

    db.all('pierrot_messages').push({
      id: params.p_message_id,
      conversation_id: params.p_conversation_id,
      role: params.p_role,
      content: params.p_content,
      message_index: messageIndex,
      provider: params.p_provider ?? null,
      created_at: '2026-11-09T12:00:00.000Z',
      history_id: params.p_history_id,
      session_id: params.p_episode_id,
      history_sequence: nextHistorySequence,
    });

    session.message_count = Number(session.message_count || 0) + 1;
    session.first_message_sequence = session.first_message_sequence ?? nextHistorySequence;
    session.last_message_sequence = nextHistorySequence;
    session.last_message_at = '2026-11-09T12:00:00.000Z';

    return {
      data: [
        {
          sequence: messageIndex,
          content: params.p_content,
          inserted: true,
          history_sequence: nextHistorySequence,
        },
      ],
      error: null,
    };
  });

  db.onRpc('pierrot_ensure_project_history', (params) => {
    const existing = db
      .all('pierrot_histories')
      .find((row) => row.project_id === params.p_project_id);
    if (existing) return { data: existing.id, error: null };
    return { data: null, error: { code: 'P0002', message: 'project_history_missing' } };
  });

  return { db, projects };
}

describe('project chat history/session matrix', () => {
  it('opens each project’s own canonical history and never another project’s messages', async () => {
    const { db, projects } = createMatrixDatabase();

    for (const project of projects) {
      const byProject = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
        projectId: project.id,
        createSession: false,
      });
      const byHistory = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
        historyId: project.historyId,
        createSession: false,
      });

      for (const view of [byProject, byHistory]) {
        expect(view?.scope.history.id).toBe(project.historyId);
        expect(view?.scope.project?.slug).toBe(project.slug);
        expect(view?.conversation.historyId).toBe(project.historyId);
        expect(view?.conversation.projectSlug).toBe(project.slug);
        expect(view?.conversation.activeSessionId).toBe(project.openSessionId);
        expect(view?.conversation.messages.map((message) => message.content)).toEqual([
          `${project.name} first question`,
          `${project.name} saved answer`,
        ]);
      }
    }
  });

  it('keeps a closed episode readable while the open session stays the write target', async () => {
    const { db, projects } = createMatrixDatabase();
    const project = projects[1];

    const view = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId: project.historyId,
      sessionId: project.closedSessionId,
      createSession: false,
    });

    expect(view?.conversation.currentSessionId).toBe(project.closedSessionId);
    expect(view?.conversation.activeSessionId).toBe(project.openSessionId);
    expect(view?.conversation.messages.map((message) => message.content)).toEqual([
      `${project.name} first question`,
    ]);
  });

  it('viewing a history never creates an empty session', async () => {
    const { db, projects } = createMatrixDatabase();
    const before = db.all('pierrot_sessions').length;

    for (const project of projects) {
      await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
        projectId: project.id,
        createSession: false,
      });
      await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
        historyId: project.historyId,
        createSession: false,
      });
    }

    expect(db.all('pierrot_sessions')).toHaveLength(before);
  });

  it('writes without an open session by creating exactly one and preserving history on reload', async () => {
    const { db, projects } = createMatrixDatabase();
    // Close the open session for one project; the next write must create a
    // session instead of reusing a closed episode.
    const project = projects[2];
    const open = db.all('pierrot_sessions').find((row) => row.id === project.openSessionId);
    open!.ended_at = '2026-11-09T09:00:00.000Z';

    const writeScope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId: project.historyId,
      createSession: true,
    });
    expect(writeScope).not.toBeNull();
    expect(writeScope!.session?.id).not.toBe(project.closedSessionId);
    expect(writeScope!.session?.id).not.toBe(project.openSessionId);
    expect(writeScope!.sessionActive).toBe(true);

    const conversationId = writeScope!.conversationId;
    const sessionToken = writeScope!.conversationSessionId;
    const episodeId = writeScope!.session!.id;

    await appendPierrotMessage(db.asClient(), {
      conversationId,
      sessionId: sessionToken,
      historyId: project.historyId,
      episodeId,
      messageId: randomUUID(),
      role: 'user',
      content: 'New owner message',
    });
    await appendPierrotMessage(db.asClient(), {
      conversationId,
      sessionId: sessionToken,
      historyId: project.historyId,
      episodeId,
      messageId: randomUUID(),
      role: 'assistant',
      content: 'New saved reply',
    });

    const reloaded = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId: project.historyId,
      createSession: false,
    });
    expect(reloaded?.conversation.messages.map((message) => message.content)).toEqual([
      `${project.name} first question`,
      `${project.name} saved answer`,
      'New owner message',
      'New saved reply',
    ]);

    const sessionPage = await loadHistoryMessagePage(db.asClient(), OWNER_ID, reloaded!.scope, {
      sessionId: episodeId,
    });
    expect(sessionPage.messages.map((message) => message.content)).toEqual([
      'New owner message',
      'New saved reply',
    ]);

    // Reloading the same URL must reuse the open session, not create another.
    const secondWrite = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId: project.historyId,
      createSession: true,
    });
    expect(secondWrite?.session?.id).toBe(episodeId);
  });
});
