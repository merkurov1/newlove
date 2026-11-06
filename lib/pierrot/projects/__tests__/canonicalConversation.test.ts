/** @jest-environment node */

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { randomUUID } from 'crypto';
import { ensureProjectConversation } from '../conversation';

const TABLES = [
  'pierrot_projects',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_project_conversations',
];

function project(conversationId: string | null = null) {
  return {
    id: randomUUID(),
    owner_user_id: OWNER_ID,
    slug: 'journal',
    name: 'Journal',
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    project_brief: '',
    brief_revision: 1,
    conversation_id: conversationId,
    last_activity_at: '2026-11-01T10:00:00.000Z',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
  };
}

function conversation(id: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    session_id: sessionId,
    identity_type: 'owner',
    user_id: OWNER_ID,
    mode: 'site',
    status: 'active',
    started_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('canonical project conversation', () => {
  it('creates one conversation and returns the same id on every open', async () => {
    const db = new FakeSupabase(TABLES);
    const row = project();
    db.seed('pierrot_projects', [row]);
    const store = db.asClient();

    const first = await ensureProjectConversation(store, OWNER_ID, row.id);
    const second = await ensureProjectConversation(store, OWNER_ID, row.id);

    expect(first?.conversationId).toBeTruthy();
    expect(second?.conversationId).toBe(first?.conversationId);
    expect(second?.sessionId).toBe(first?.sessionId);
    expect(db.all('pierrot_conversations')).toHaveLength(1);
    expect(db.all('pierrot_projects')[0].conversation_id).toBe(first?.conversationId);
  });

  it('adopts the newest legacy conversation instead of creating an empty chat', async () => {
    const db = new FakeSupabase(TABLES);
    const row = project();
    db.seed('pierrot_projects', [row]);
    db.seed('pierrot_conversations', [conversation('legacy-conv-1', 'legacy-session-1')]);
    db.seed('pierrot_project_conversations', [
      {
        project_id: row.id,
        conversation_id: 'legacy-conv-1',
        owner_user_id: OWNER_ID,
        created_at: '2026-11-01T10:00:00.000Z',
      },
    ]);
    const store = db.asClient();

    const result = await ensureProjectConversation(store, OWNER_ID, row.id);

    expect(result).toMatchObject({
      conversationId: 'legacy-conv-1',
      sessionId: 'legacy-session-1',
      created: false,
    });
    expect(db.all('pierrot_conversations')).toHaveLength(1);
  });

  it('always prefers the stored canonical id over other linked conversations', async () => {
    const db = new FakeSupabase(TABLES);
    const row = project('canonical-conv');
    db.seed('pierrot_projects', [row]);
    db.seed('pierrot_conversations', [
      conversation('canonical-conv', 'canonical-session'),
      conversation('older-conv', 'older-session'),
    ]);
    db.seed('pierrot_project_conversations', [
      {
        project_id: row.id,
        conversation_id: 'older-conv',
        owner_user_id: OWNER_ID,
        created_at: '2026-11-02T10:00:00.000Z',
      },
    ]);
    const store = db.asClient();

    const result = await ensureProjectConversation(store, OWNER_ID, row.id);

    expect(result?.conversationId).toBe('canonical-conv');
    expect(result?.sessionId).toBe('canonical-session');
  });
});
