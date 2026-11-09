/** @jest-environment node */

import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import {
  createSession,
  ensureMainHistory,
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
});
