/** @jest-environment node */

import { randomUUID } from 'crypto';
import { describe, expect, it } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
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

type SeedOptions = {
  historyId?: string;
  projectId?: string | null;
  conversationId?: string;
  sessions?: Array<Record<string, unknown>>;
  messageRange?: Array<{ sessionId: string | null; index: number }>;
};

function seedHistory(db: FakeSupabase, options: SeedOptions = {}) {
  const now = '2026-11-09T10:00:00.000Z';
  const historyId = options.historyId || randomUUID();
  const conversationId = options.conversationId || randomUUID();
  const projectId = options.projectId === undefined ? null : options.projectId;

  db.seed('pierrot_conversations', [
    {
      id: conversationId,
      session_id: randomUUID(),
      identity_type: 'owner',
      user_id: OWNER_ID,
      mode: 'site',
      consent_state: 'granted',
      title: 'История',
      started_at: now,
      updated_at: now,
    },
  ]);

  if (projectId) {
    db.seed('pierrot_projects', [
      {
        id: projectId,
        owner_user_id: OWNER_ID,
        slug: 'project',
        name: 'Project',
        description: '',
        objective: '',
        status: 'active',
        priority: 0,
        project_brief: '',
        brief_revision: 1,
        conversation_id: conversationId,
        last_activity_at: now,
        created_at: now,
        updated_at: now,
      },
    ]);
  }

  db.seed('pierrot_histories', [
    {
      id: historyId,
      owner_user_id: OWNER_ID,
      type: projectId ? 'project' : 'main',
      project_id: projectId,
      canonical_conversation_id: conversationId,
      title: projectId ? 'Project' : 'Главная история',
      metadata: {},
      next_message_sequence: 10,
      created_at: now,
      updated_at: now,
    },
  ]);

  const sessions = (options.sessions || []).map((session) => ({
    history_id: historyId,
    conversation_id: conversationId,
    source_conversation_id: null,
    title: 'Сессия',
    started_at: now,
    ended_at: null,
    last_message_at: null,
    message_count: 0,
    first_message_sequence: null,
    last_message_sequence: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...session,
  }));
  db.seed('pierrot_sessions', sessions);

  const range = options.messageRange || [];
  db.seed(
    'pierrot_messages',
    range.map(({ sessionId, index }) => ({
      id: `message-${index}-${sessionId || 'none'}`,
      conversation_id: conversationId,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${index}`,
      message_index: index,
      provider: null,
      created_at: `2026-11-09T10:${String(index).padStart(2, '0')}:00.000Z`,
      history_id: historyId,
      session_id: sessionId,
      history_sequence: index,
    }))
  );

  return { historyId, conversationId, projectId };
}

describe('owner history view', () => {
  it('opens a history without sessions as a continuous readable transcript', async () => {
    const db = new FakeSupabase(TABLES);
    const { historyId } = seedHistory(db, {
      messageRange: [
        { sessionId: null, index: 1 },
        { sessionId: null, index: 2 },
      ],
    });

    const view = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      createSession: false,
    });

    expect(view).not.toBeNull();
    expect(view?.conversation.messages.map((message) => message.historySequence)).toEqual([1, 2]);
    expect(view?.conversation.currentSessionId).toBeNull();
    expect(view?.conversation.activeSessionId).toBeNull();
    expect(db.all('pierrot_sessions')).toHaveLength(0);
  });

  it('keeps a closed session readable while exposing a different open write target', async () => {
    const db = new FakeSupabase(TABLES);
    const closedId = randomUUID();
    const openId = randomUUID();
    const { historyId } = seedHistory(db, {
      sessions: [
        {
          id: closedId,
          ordinal: 1,
          title: 'Закрытая',
          ended_at: '2026-11-08T12:00:00.000Z',
          last_message_at: '2026-11-08T12:00:00.000Z',
          message_count: 2,
          first_message_sequence: 1,
          last_message_sequence: 2,
        },
        {
          id: openId,
          ordinal: 2,
          title: 'Открытая',
          ended_at: null,
          last_message_at: '2026-11-09T12:00:00.000Z',
          message_count: 2,
          first_message_sequence: 3,
          last_message_sequence: 4,
        },
      ],
      messageRange: [
        { sessionId: closedId, index: 1 },
        { sessionId: closedId, index: 2 },
        { sessionId: openId, index: 3 },
        { sessionId: openId, index: 4 },
      ],
    });

    const closedView = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      sessionId: closedId,
      createSession: false,
    });
    const openView = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      sessionId: openId,
      createSession: false,
    });
    const continuousView = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      createSession: false,
    });

    expect(closedView?.conversation.currentSessionId).toBe(closedId);
    expect(closedView?.conversation.activeSessionId).toBe(openId);
    expect(closedView?.conversation.messages.map((message) => message.historySequence)).toEqual([
      1, 2,
    ]);

    expect(openView?.conversation.currentSessionId).toBe(openId);
    expect(openView?.conversation.activeSessionId).toBe(openId);
    expect(openView?.conversation.messages.map((message) => message.historySequence)).toEqual([
      3, 4,
    ]);

    // The plain project link shows every episode, not only the latest range.
    expect(continuousView?.conversation.currentSessionId).toBeNull();
    expect(continuousView?.conversation.messages.map((message) => message.historySequence)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(db.all('pierrot_sessions')).toHaveLength(2);
  });

  it('chooses the most recently active open session when several are open', async () => {
    const db = new FakeSupabase(TABLES);
    const firstId = randomUUID();
    const secondId = randomUUID();
    const { historyId } = seedHistory(db, {
      sessions: [
        {
          id: firstId,
          ordinal: 7,
          title: 'Старая активность',
          ended_at: null,
          last_message_at: '2026-11-01T10:00:00.000Z',
          message_count: 2,
          first_message_sequence: 1,
          last_message_sequence: 2,
        },
        {
          id: secondId,
          ordinal: 3,
          title: 'Свежая активность',
          ended_at: null,
          last_message_at: '2026-11-11T10:00:00.000Z',
          message_count: 2,
          first_message_sequence: 3,
          last_message_sequence: 4,
        },
      ],
      messageRange: [
        { sessionId: firstId, index: 1 },
        { sessionId: firstId, index: 2 },
        { sessionId: secondId, index: 3 },
        { sessionId: secondId, index: 4 },
      ],
    });

    const view = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      createSession: false,
    });

    expect(view?.conversation.activeSessionId).toBe(secondId);
    expect(view?.conversation.messages).toHaveLength(4);
  });

  it('shows a newly started empty session as empty, not as the whole history', async () => {
    const db = new FakeSupabase(TABLES);
    const emptyId = randomUUID();
    const existingId = randomUUID();
    const { historyId } = seedHistory(db, {
      sessions: [
        {
          id: existingId,
          ordinal: 1,
          title: 'Существующая',
          ended_at: null,
          last_message_at: '2026-11-09T10:00:00.000Z',
          message_count: 2,
          first_message_sequence: 1,
          last_message_sequence: 2,
        },
        {
          id: emptyId,
          ordinal: 2,
          title: 'Новая',
          ended_at: null,
          last_message_at: null,
          message_count: 0,
          first_message_sequence: null,
          last_message_sequence: null,
        },
      ],
      messageRange: [
        { sessionId: existingId, index: 1 },
        { sessionId: existingId, index: 2 },
      ],
    });

    const emptyView = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      sessionId: emptyId,
      createSession: false,
    });
    const continuousView = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      historyId,
      createSession: false,
    });

    expect(emptyView?.conversation.currentSessionId).toBe(emptyId);
    expect(emptyView?.conversation.messages).toEqual([]);
    expect(emptyView?.conversation.emptyCurrentSession).toBe(true);
    // Continuous history still sees the existing dialogue.
    expect(continuousView?.conversation.messages).toHaveLength(2);
  });

  it('creates a project history on demand but never an empty session', async () => {
    const db = new FakeSupabase(TABLES);
    const projectId = randomUUID();
    const conversationId = randomUUID();
    const historyId = randomUUID();
    seedHistory(db, { projectId: null, conversationId });
    db.seed('pierrot_projects', [
      {
        id: projectId,
        owner_user_id: OWNER_ID,
        slug: 'question',
        name: 'Question',
        status: 'active',
        priority: 0,
        conversation_id: conversationId,
        last_activity_at: '2026-11-09T10:00:00.000Z',
        created_at: '2026-11-09T10:00:00.000Z',
        updated_at: '2026-11-09T10:00:00.000Z',
      },
    ]);
    db.seed('pierrot_histories', []);
    db.onRpc('pierrot_ensure_project_history', (params) => {
      const project = db.all('pierrot_projects').find((row) => row.id === params.p_project_id);
      const row = {
        id: historyId,
        owner_user_id: OWNER_ID,
        type: 'project',
        project_id: projectId,
        canonical_conversation_id: project?.conversation_id,
        title: 'Question',
        metadata: {},
        next_message_sequence: 0,
        created_at: '2026-11-09T10:00:00.000Z',
        updated_at: '2026-11-09T10:00:00.000Z',
      };
      db.all('pierrot_histories').push(row);
      return { data: row.id, error: null };
    });

    const view = await loadOwnerHistoryViewFromStore(db.asClient(), OWNER_ID, {
      projectId,
      createSession: false,
    });

    expect(view?.scope.history.id).toBe(historyId);
    expect(view?.scope.history.type).toBe('project');
    expect(view?.conversation.messages).toEqual([]);
    expect(view?.conversation.currentSessionId).toBeNull();
    expect(view?.conversation.activeSessionId).toBeNull();
    expect(db.all('pierrot_histories')).toHaveLength(1);
    expect(db.all('pierrot_sessions')).toHaveLength(0);
  });
});
