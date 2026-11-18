/** @jest-environment node */

import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import {
  createSession,
  ensureMainHistory,
  findEmptyOpenSession,
  loadHistoryContextMessages,
  loadHistoryMessagePage,
  resolveHistoryScope,
} from '../store';

const TABLES = [
  'pierrot_histories',
  'pierrot_sessions',
  'pierrot_messages',
  'pierrot_events',
  'pierrot_projects',
  'pierrot_conversations',
];

function buildStore() {
  const db = new FakeSupabase(TABLES);
  const historyId = randomUUID();
  const conversationId = randomUUID();
  const sessionId = randomUUID();
  const legacyId = randomUUID();
  const now = '2026-11-09T10:00:00.000Z';

  db.seed('pierrot_conversations', [
    {
      id: conversationId,
      session_id: randomUUID(),
      identity_type: 'owner',
      user_id: OWNER_ID,
      mode: 'site',
      consent_state: 'granted',
      title: 'Главная история',
      started_at: now,
      updated_at: now,
    },
    {
      id: legacyId,
      session_id: randomUUID(),
      identity_type: 'owner',
      user_id: OWNER_ID,
      mode: 'site',
      title: 'Старая беседа',
      started_at: now,
      updated_at: now,
    },
  ]);
  db.seed('pierrot_histories', [
    {
      id: historyId,
      owner_user_id: OWNER_ID,
      type: 'main',
      project_id: null,
      canonical_conversation_id: conversationId,
      title: 'Главная история',
      metadata: {},
      next_message_sequence: 6,
      created_at: now,
      updated_at: now,
    },
  ]);
  db.seed('pierrot_sessions', [
    {
      id: sessionId,
      history_id: historyId,
      conversation_id: conversationId,
      source_conversation_id: legacyId,
      ordinal: 1,
      title: 'Первая сессия',
      started_at: now,
      ended_at: null,
      last_message_at: now,
      message_count: 5,
      first_message_sequence: 1,
      last_message_sequence: 5,
      metadata: {},
      created_at: now,
      updated_at: now,
    },
  ]);
  db.seed(
    'pierrot_messages',
    Array.from({ length: 5 }, (_, index) => ({
      id: `message-${index + 1}`,
      conversation_id: conversationId,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${index + 1}`,
      message_index: index + 1,
      provider: null,
      created_at: `2026-11-09T10:0${index}:00.000Z`,
      history_id: historyId,
      session_id: sessionId,
      history_sequence: index + 1,
    }))
  );
  db.seed('pierrot_events', [
    {
      id: randomUUID(),
      conversation_id: conversationId,
      event_name: 'answer_feedback',
      event_key: 'answer_feedback:message-5',
      payload: { rating: 'up', message_id: 'message-5' },
      history_id: historyId,
      session_id: sessionId,
      created_at: now,
    },
  ]);

  return { db, historyId, conversationId, sessionId, legacyId };
}

describe('Pierrot permanent history store', () => {
  it('resolves MAIN without creating another history and selects the latest session', async () => {
    const { db, historyId, conversationId, sessionId } = buildStore();

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, { historyId });

    expect(scope?.history.id).toBe(historyId);
    expect(scope?.conversationId).toBe(conversationId);
    expect(scope?.session?.id).toBe(sessionId);
    expect(db.all('pierrot_histories')).toHaveLength(1);
  });

  it('creates a session inside the same history, never a new history', async () => {
    const { db, historyId, conversationId } = buildStore();
    const newSessionId = randomUUID();

    db.onRpc('pierrot_create_session', (params) => {
      const row = {
        id: newSessionId,
        history_id: params.p_history_id,
        conversation_id: conversationId,
        source_conversation_id: null,
        ordinal: 2,
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

    const session = await createSession(db.asClient(), OWNER_ID, historyId, 'Новая сессия');

    expect(session?.id).toBe(newSessionId);
    expect(db.all('pierrot_histories')).toHaveLength(1);
    expect(db.all('pierrot_sessions')).toHaveLength(2);
  });

  it('opens exactly the requested session message range inside the same history', async () => {
    const { db, historyId, conversationId, sessionId } = buildStore();
    const laterSessionId = randomUUID();

    db.seed('pierrot_sessions', [
      ...db.all('pierrot_sessions'),
      {
        id: laterSessionId,
        history_id: historyId,
        conversation_id: conversationId,
        source_conversation_id: null,
        ordinal: 2,
        title: 'Вторая сессия',
        started_at: '2026-11-09T11:00:00.000Z',
        ended_at: null,
        last_message_at: '2026-11-09T11:03:00.000Z',
        message_count: 3,
        first_message_sequence: 6,
        last_message_sequence: 8,
        metadata: {},
        created_at: '2026-11-09T11:00:00.000Z',
        updated_at: '2026-11-09T11:03:00.000Z',
      },
    ]);
    db.seed('pierrot_messages', [
      ...db.all('pierrot_messages'),
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `later-message-${index + 1}`,
        conversation_id: conversationId,
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Later ${index + 1}`,
        message_index: index + 6,
        provider: null,
        created_at: `2026-11-09T11:0${index}:00.000Z`,
        history_id: historyId,
        session_id: laterSessionId,
        history_sequence: index + 6,
      })),
    ]);

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, { historyId });

    const first = await loadHistoryMessagePage(db.asClient(), OWNER_ID, scope!, {
      limit: 20,
      sessionId,
    });
    const second = await loadHistoryMessagePage(db.asClient(), OWNER_ID, scope!, {
      limit: 20,
      sessionId: laterSessionId,
    });
    const wholeHistory = await loadHistoryMessagePage(db.asClient(), OWNER_ID, scope!, {
      limit: 20,
    });

    expect(first.messages.map((message) => message.historySequence)).toEqual([1, 2, 3, 4, 5]);
    expect(second.messages.map((message) => message.historySequence)).toEqual([6, 7, 8]);
    expect(wholeHistory.messages.map((message) => message.historySequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(second.hasMore).toBe(false);
    expect(second.historyMaxSequence).toBe(8);
  });

  it('loads a cursor page from the whole history and attaches feedback', async () => {
    const { db, historyId } = buildStore();
    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, { historyId });

    const page = await loadHistoryMessagePage(db.asClient(), OWNER_ID, scope!, {
      limit: 2,
      beforeSequence: 4,
    });

    expect(page.messages.map((message) => message.id)).toEqual(['message-2', 'message-3']);
    expect(page.hasMore).toBe(true);
    expect(page.oldestSequence).toBe(2);
    expect(page.historyMaxSequence).toBe(5);

    const lastPage = await loadHistoryMessagePage(db.asClient(), OWNER_ID, scope!, {
      limit: 2,
    });
    expect(lastPage.messages.map((message) => message.id)).toEqual(['message-4', 'message-5']);
    expect(lastPage.messages[1].feedback).toBe('up');
  });

  it('returns a bounded model context only from this history', async () => {
    const { db, historyId } = buildStore();

    const context = await loadHistoryContextMessages(db.asClient(), OWNER_ID, historyId, 3);

    expect(context.map((message) => message.content)).toEqual([
      'Message 3',
      'Message 4',
      'Message 5',
    ]);
  });

  it('opens an old conversation URL inside the same permanent history', async () => {
    const { db, historyId, sessionId, legacyId } = buildStore();

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      conversationId: legacyId,
    });

    expect(scope?.history.id).toBe(historyId);
    expect(scope?.session?.id).toBe(sessionId);
    expect(db.all('pierrot_histories')).toHaveLength(1);
    expect(db.all('pierrot_sessions')).toHaveLength(1);
  });

  it('does not mix messages from another history', async () => {
    const { db, historyId } = buildStore();
    const otherHistoryId = randomUUID();
    db.seed('pierrot_histories', [
      ...db.all('pierrot_histories'),
      {
        id: otherHistoryId,
        owner_user_id: OWNER_ID,
        type: 'main',
        project_id: null,
        canonical_conversation_id: null,
        title: 'Другая история',
        metadata: {},
        next_message_sequence: 1,
        created_at: '2026-11-09T09:00:00.000Z',
        updated_at: '2026-11-09T09:00:00.000Z',
      },
    ]);
    db.seed('pierrot_messages', [
      ...db.all('pierrot_messages'),
      {
        id: 'other-message',
        conversation_id: 'other-conversation',
        role: 'user',
        content: 'Не должно попасть в MAIN',
        message_index: 1,
        provider: null,
        created_at: '2026-11-09T09:00:00.000Z',
        history_id: otherHistoryId,
        session_id: null,
        history_sequence: 1,
      },
    ]);

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, { historyId });
    const page = await loadHistoryMessagePage(db.asClient(), OWNER_ID, scope!, { limit: 20 });

    expect(page.messages.map((message) => message.id)).not.toContain('other-message');
    expect(page.messages).toHaveLength(5);
  });

  it('is idempotent when MAIN is ensured repeatedly', async () => {
    const db = new FakeSupabase(TABLES);
    const historyId = randomUUID();
    const conversationId = randomUUID();
    db.seed('pierrot_conversations', [
      { id: conversationId, session_id: randomUUID(), identity_type: 'owner', user_id: OWNER_ID },
    ]);

    db.onRpc('pierrot_ensure_main_history', () => {
      const existing = db.all('pierrot_histories')[0];
      if (existing) return { data: existing.id, error: null };
      const row = {
        id: historyId,
        owner_user_id: OWNER_ID,
        type: 'main',
        project_id: null,
        canonical_conversation_id: conversationId,
        title: 'Главная история',
        metadata: {},
        next_message_sequence: 0,
        created_at: '2026-11-09T10:00:00.000Z',
        updated_at: '2026-11-09T10:00:00.000Z',
      };
      db.all('pierrot_histories').push(row);
      return { data: row.id, error: null };
    });

    const first = await ensureMainHistory(db.asClient(), OWNER_ID);
    const second = await ensureMainHistory(db.asClient(), OWNER_ID);

    expect(first?.id).toBe(historyId);
    expect(second?.id).toBe(historyId);
    expect(db.all('pierrot_histories')).toHaveLength(1);
  });

  it('keeps a closed session readable without treating it as the write target', async () => {
    const { db, historyId, conversationId, sessionId } = buildStore();
    const closedId = randomUUID();
    db.seed('pierrot_sessions', [
      ...db.all('pierrot_sessions'),
      {
        id: closedId,
        history_id: historyId,
        conversation_id: conversationId,
        source_conversation_id: null,
        ordinal: 9,
        title: 'Закрытая сессия',
        started_at: '2026-11-08T10:00:00.000Z',
        ended_at: '2026-11-08T12:00:00.000Z',
        last_message_at: '2026-11-08T12:00:00.000Z',
        message_count: 4,
        first_message_sequence: 1,
        last_message_sequence: 4,
        metadata: {},
        created_at: '2026-11-08T10:00:00.000Z',
        updated_at: '2026-11-08T12:00:00.000Z',
      },
    ]);

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId,
      episodeId: closedId,
    });

    expect(scope?.session?.id).toBe(closedId);
    expect(scope?.sessionActive).toBe(false);
    expect(scope?.activeSession?.id).toBe(sessionId);
    expect(db.all('pierrot_sessions')).toHaveLength(2);
  });

  it('continues an open session when the requested episode is closed', async () => {
    const { db, historyId, conversationId, sessionId } = buildStore();
    const closedId = randomUUID();
    db.seed('pierrot_sessions', [
      ...db.all('pierrot_sessions'),
      {
        id: closedId,
        history_id: historyId,
        conversation_id: conversationId,
        ordinal: 9,
        title: 'Закрытая сессия',
        started_at: '2026-11-08T10:00:00.000Z',
        ended_at: '2026-11-08T12:00:00.000Z',
        last_message_at: '2026-11-08T12:00:00.000Z',
        message_count: 4,
        metadata: {},
        created_at: '2026-11-08T10:00:00.000Z',
        updated_at: '2026-11-08T12:00:00.000Z',
      },
    ]);

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId,
      episodeId: closedId,
      createSession: true,
    });

    expect(scope?.session?.id).toBe(sessionId);
    expect(scope?.sessionActive).toBe(true);
    expect(scope?.activeSession?.id).toBe(sessionId);
    expect(db.all('pierrot_sessions')).toHaveLength(2);
  });

  it('creates a new open session for a write when every session is closed', async () => {
    const { db, historyId, conversationId } = buildStore();
    const closedId = randomUUID();
    const createdId = randomUUID();
    db.seed('pierrot_sessions', [
      {
        id: closedId,
        history_id: historyId,
        conversation_id: conversationId,
        source_conversation_id: null,
        ordinal: 1,
        title: 'Закрытая сессия',
        started_at: '2026-11-08T10:00:00.000Z',
        ended_at: '2026-11-08T12:00:00.000Z',
        last_message_at: '2026-11-08T12:00:00.000Z',
        message_count: 4,
        first_message_sequence: 1,
        last_message_sequence: 4,
        metadata: {},
        created_at: '2026-11-08T10:00:00.000Z',
        updated_at: '2026-11-08T12:00:00.000Z',
      },
    ]);
    db.onRpc('pierrot_create_session', (params) => {
      const row = {
        id: createdId,
        history_id: params.p_history_id,
        conversation_id: conversationId,
        source_conversation_id: null,
        ordinal: 2,
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

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId,
      episodeId: closedId,
      createSession: true,
    });

    expect(scope?.session?.id).toBe(createdId);
    expect(scope?.session?.endedAt).toBeNull();
    expect(scope?.activeSession?.id).toBe(createdId);
    expect(db.all('pierrot_sessions')).toHaveLength(2);
    // The closed episode is preserved untouched.
    expect(
      db.all('pierrot_sessions').find((row) => row.id === closedId)?.ended_at
    ).toBe('2026-11-08T12:00:00.000Z');
  });

  it('prefers the most recently active open session over ordinal order', async () => {
    const { db, historyId, conversationId } = buildStore();
    const olderActivityId = randomUUID();
    const newerActivityId = randomUUID();
    db.seed('pierrot_sessions', [
      {
        id: olderActivityId,
        history_id: historyId,
        conversation_id: conversationId,
        ordinal: 9,
        title: 'Ordinal 9, old activity',
        started_at: '2026-11-01T10:00:00.000Z',
        ended_at: null,
        last_message_at: '2026-11-01T12:00:00.000Z',
        message_count: 3,
        metadata: {},
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-01T12:00:00.000Z',
      },
      {
        id: newerActivityId,
        history_id: historyId,
        conversation_id: conversationId,
        ordinal: 4,
        title: 'Ordinal 4, recent activity',
        started_at: '2026-11-02T10:00:00.000Z',
        ended_at: null,
        last_message_at: '2026-11-11T12:00:00.000Z',
        message_count: 7,
        metadata: {},
        created_at: '2026-11-02T10:00:00.000Z',
        updated_at: '2026-11-11T12:00:00.000Z',
      },
    ]);

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId,
      createSession: true,
    });

    expect(scope?.session?.id).toBe(newerActivityId);
    expect(db.all('pierrot_sessions')).toHaveLength(2);
  });

  it('never creates an empty session just for viewing a history without sessions', async () => {
    const { db, historyId } = buildStore();
    db.seed('pierrot_sessions', []);

    const viewScope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId,
      createSession: false,
    });

    expect(viewScope?.session).toBeNull();
    expect(viewScope?.activeSession).toBeNull();
    expect(db.all('pierrot_sessions')).toHaveLength(0);

    // The continuous transcript is still readable.
    const page = await loadHistoryMessagePage(db.asClient(), OWNER_ID, viewScope!, { limit: 20 });
    expect(page.messages).toHaveLength(5);
  });

  it('creates exactly one open session when the first message is written', async () => {
    const { db, historyId, conversationId } = buildStore();
    const createdId = randomUUID();
    db.seed('pierrot_sessions', []);
    db.onRpc('pierrot_create_session', (params) => {
      const row = {
        id: createdId,
        history_id: params.p_history_id,
        conversation_id: conversationId,
        source_conversation_id: null,
        ordinal: 1,
        title: (params.p_title as string) || 'Новая сессия',
        started_at: '2026-11-09T11:00:00.000Z',
        ended_at: null,
        last_message_at: null,
        message_count: 0,
        metadata: {},
        created_at: '2026-11-09T11:00:00.000Z',
        updated_at: '2026-11-09T11:00:00.000Z',
      };
      db.all('pierrot_sessions').push(row);
      return { data: [row], error: null };
    });

    const writeScope = await resolveHistoryScope(db.asClient(), OWNER_ID, {
      historyId,
      createSession: true,
    });

    expect(writeScope?.session?.id).toBe(createdId);
    expect(writeScope?.sessionActive).toBe(true);
    expect(db.all('pierrot_sessions')).toHaveLength(1);
  });

  it('reuses the newest open empty session for an explicit new chat', async () => {
    const { db, historyId, conversationId } = buildStore();
    const emptyId = randomUUID();
    const closedEmptyId = randomUUID();
    db.seed('pierrot_sessions', [
      {
        id: emptyId,
        history_id: historyId,
        conversation_id: conversationId,
        ordinal: 3,
        title: 'Пустая',
        started_at: '2026-11-09T11:00:00.000Z',
        ended_at: null,
        last_message_at: null,
        message_count: 0,
        metadata: {},
        created_at: '2026-11-09T11:00:00.000Z',
        updated_at: '2026-11-09T11:00:00.000Z',
      },
      {
        id: closedEmptyId,
        history_id: historyId,
        conversation_id: conversationId,
        ordinal: 4,
        title: 'Пустая и закрытая',
        started_at: '2026-11-09T12:00:00.000Z',
        ended_at: '2026-11-09T12:30:00.000Z',
        last_message_at: null,
        message_count: 0,
        metadata: {},
        created_at: '2026-11-09T12:00:00.000Z',
        updated_at: '2026-11-09T12:30:00.000Z',
      },
    ]);

    const session = await findEmptyOpenSession(db.asClient(), historyId);

    expect(session?.id).toBe(emptyId);
  });

  it('repairs a project history with a missing canonical conversation pointer', async () => {
    const db = new FakeSupabase(TABLES);
    const projectId = randomUUID();
    const conversationId = randomUUID();
    const historyId = randomUUID();
    db.seed('pierrot_conversations', [
      {
        id: conversationId,
        session_id: randomUUID(),
        identity_type: 'owner',
        user_id: OWNER_ID,
        mode: 'site',
        started_at: '2026-11-09T10:00:00.000Z',
        updated_at: '2026-11-09T10:00:00.000Z',
      },
    ]);
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
    db.seed('pierrot_histories', [
      {
        id: historyId,
        owner_user_id: OWNER_ID,
        type: 'project',
        project_id: projectId,
        canonical_conversation_id: null,
        title: 'Question',
        metadata: {},
        next_message_sequence: 0,
        created_at: '2026-11-09T10:00:00.000Z',
        updated_at: '2026-11-09T10:00:00.000Z',
      },
    ]);
    db.onRpc('pierrot_ensure_project_history', (params) => {
      const project = db.all('pierrot_projects').find((row) => row.id === params.p_project_id);
      const history = db.all('pierrot_histories').find((row) => row.id === historyId);
      if (history) {
        history.canonical_conversation_id = project?.conversation_id || null;
      }
      return { data: historyId, error: null };
    });

    const scope = await resolveHistoryScope(db.asClient(), OWNER_ID, { historyId });

    expect(scope?.history.id).toBe(historyId);
    expect(scope?.conversationId).toBe(conversationId);
    expect(db.all('pierrot_sessions')).toHaveLength(0);
  });
});
