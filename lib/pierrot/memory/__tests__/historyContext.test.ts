/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '../testSupport/fakeSupabase';
import { loadOwnerHistoryContext } from '../historyContext';

const OTHER_ID = '99999999-9999-4999-8999-999999999999';
const TABLES = ['pierrot_conversations', 'pierrot_messages'];

describe('owner history context', () => {
  it('loads only the owner’s recent conversations and never another user', async () => {
    const db = new FakeSupabase(TABLES);
    const ownerConversation = randomUUID();
    const otherConversation = randomUUID();
    db.seed('pierrot_conversations', [
      {
        id: ownerConversation,
        user_id: OWNER_ID,
        title: 'Journal release',
        started_at: '2026-11-05T10:00:00.000Z',
      },
      {
        id: otherConversation,
        user_id: OTHER_ID,
        title: 'Private other user',
        started_at: '2026-11-06T10:00:00.000Z',
      },
    ]);
    db.seed('pierrot_messages', [
      {
        id: randomUUID(),
        conversation_id: ownerConversation,
        role: 'user',
        content: 'Решили сделать еженедельный выпуск.',
        created_at: '2026-11-05T10:00:00.000Z',
      },
      {
        id: randomUUID(),
        conversation_id: ownerConversation,
        role: 'assistant',
        content: 'Зафиксировал редакционный отбор.',
        created_at: '2026-11-05T10:01:00.000Z',
      },
      {
        id: randomUUID(),
        conversation_id: otherConversation,
        role: 'user',
        content: 'ЧУЖОЙ СЕКРЕТ',
        created_at: '2026-11-06T10:00:00.000Z',
      },
    ]);

    const context = await loadOwnerHistoryContext(db.asClient(), OWNER_ID, {
      excludeConversationId: null,
      limit: 5,
    });

    expect(context).toContain('Journal release');
    expect(context).toContain('еженедельный выпуск');
    expect(context).not.toContain('ЧУЖОЙ СЕКРЕТ');
    expect(context).not.toContain('Private other user');
  });

  it('excludes the current conversation to avoid repeating the live history', async () => {
    const db = new FakeSupabase(TABLES);
    const current = randomUUID();
    db.seed('pierrot_conversations', [
      {
        id: current,
        user_id: OWNER_ID,
        title: 'Current',
        started_at: '2026-11-06T10:00:00.000Z',
      },
    ]);
    db.seed('pierrot_messages', [
      {
        id: randomUUID(),
        conversation_id: current,
        role: 'user',
        content: 'current message',
        created_at: '2026-11-06T10:00:00.000Z',
      },
    ]);

    const context = await loadOwnerHistoryContext(db.asClient(), OWNER_ID, {
      excludeConversationId: current,
      limit: 5,
    });

    expect(context).toBeNull();
  });
});
