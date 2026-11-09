/** @jest-environment node */

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import {
  createContextSummary,
  listConversationSummaryCandidates,
  summaryVolumeReached,
} from '../context';

const TABLES = [
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_decisions',
  'pierrot_context_summaries',
];

const CONVERSATION_ID = 'conv-context-1';

function setup() {
  const db = new FakeSupabase(TABLES);
  db.seed('pierrot_conversations', [
    {
      id: CONVERSATION_ID,
      user_id: OWNER_ID,
      identity_type: 'owner',
      mode: 'site',
      title: 'Journal planning',
      updated_at: '2026-11-09T10:00:00.000Z',
    },
  ]);
  db.seed('pierrot_messages', [
    {
      id: 'm1',
      conversation_id: CONVERSATION_ID,
      role: 'user',
      content: 'Обсудим выпуск Journal и серию открыток.',
      message_index: 1,
      created_at: '2026-11-01T10:00:00.000Z',
    },
    {
      id: 'm2',
      conversation_id: CONVERSATION_ID,
      role: 'assistant',
      content: 'Предлагаю выпуск по средам.',
      message_index: 2,
      created_at: '2026-11-01T10:01:00.000Z',
    },
    {
      id: 'm3',
      conversation_id: CONVERSATION_ID,
      role: 'user',
      content: 'Решили: выпуск по средам. Что осталось проверить?',
      message_index: 3,
      created_at: '2026-11-01T10:02:00.000Z',
    },
  ]);
  db.seed('pierrot_decisions', [
    {
      id: 'd1',
      user_id: OWNER_ID,
      conversation_id: CONVERSATION_ID,
      kind: 'decision',
      title: 'Выпуск по средам',
      content: 'Выпуск по средам',
      status: 'current',
      project: 'Journal',
      tags: [],
      source_refs: [],
      created_at: '2026-11-01T10:02:00.000Z',
      updated_at: '2026-11-01T10:02:00.000Z',
    },
    {
      id: 't1',
      user_id: OWNER_ID,
      conversation_id: CONVERSATION_ID,
      kind: 'task',
      title: 'Проверить макет',
      content: 'Проверить макет',
      status: 'current',
      project: 'Journal',
      tags: [],
      source_refs: [],
      created_at: '2026-11-01T10:03:00.000Z',
      updated_at: '2026-11-01T10:03:00.000Z',
    },
  ]);
  return { db, store: db.asClient() };
}

describe('versioned context compression', () => {
  it('creates a summary version without touching original messages', async () => {
    const { db, store } = setup();
    const before = db.all('pierrot_messages').map((message) => ({ ...message }));

    const summary = await createContextSummary(store, {
      userId: OWNER_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(summary.version).toBe(1);
    expect(summary.summary).toContain('Выпуск по средам');
    expect(summary.summary).toContain('Проверить макет');
    expect(summary.sourceMessageStartIndex).toBe(1);
    expect(summary.sourceMessageEndIndex).toBe(3);
    expect(db.all('pierrot_messages')).toEqual(before);
  });

  it('increments versions and links the previous summary', async () => {
    const { db, store } = setup();
    const first = await createContextSummary(store, {
      userId: OWNER_ID,
      conversationId: CONVERSATION_ID,
    });
    const second = await createContextSummary(store, {
      userId: OWNER_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(second.version).toBe(2);
    expect(second.previousSummaryId).toBe(first.id);
    expect(db.all('pierrot_context_summaries')).toHaveLength(2);
    expect(db.all('pierrot_messages')).toHaveLength(3);
  });

  it('uses real volume thresholds', async () => {
    expect(summaryVolumeReached({ messageCount: 36, charCount: 100 })).toBe(true);
    expect(summaryVolumeReached({ messageCount: 10, charCount: 24_000 })).toBe(true);
    expect(summaryVolumeReached({ messageCount: 10, charCount: 4_000 })).toBe(false);
  });

  it('finds conversations that need a summary', async () => {
    const { store } = setup();
    const candidates = await listConversationSummaryCandidates(store, OWNER_ID, 10);
    expect(candidates.map((item) => item.conversationId)).toContain(CONVERSATION_ID);
  });
});
