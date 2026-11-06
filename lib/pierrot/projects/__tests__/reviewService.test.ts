/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { randomUUID } from 'crypto';
import { runProjectReview } from '../review/service';
import type { PierrotProjectSnapshot } from '../types';

const TABLES = [
  'pierrot_projects',
  'pierrot_project_conversations',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_project_decisions',
  'pierrot_project_artifacts',
  'pierrot_project_reviews',
  'pierrot_decisions',
  'pierrot_decision_events',
  'pierrot_memory_embeddings',
  'pierrot_brain_status_snapshots',
  'pierrot_dev_prompts',
  'pierrot_events',
];

const CONVERSATION_ID = 'project-conv-1';
const SESSION_ID = 'project-session-1';

function projectRow() {
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
    conversation_id: CONVERSATION_ID,
    last_activity_at: '2026-11-01T10:00:00.000Z',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
  };
}

function snapshot(row: ReturnType<typeof projectRow>): PierrotProjectSnapshot {
  return {
    id: row.id,
    ownerUserId: OWNER_ID,
    slug: row.slug,
    name: row.name,
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: CONVERSATION_ID,
    projectBrief: '',
    briefRevision: 1,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decisions: [],
    tasks: [],
    conversations: [],
    knowledge: [],
    artifacts: [],
    latestReview: null,
  };
}

function message(id: string, role: 'user' | 'assistant', content: string, index: number) {
  return {
    id,
    conversation_id: CONVERSATION_ID,
    role,
    content,
    message_index: index,
    created_at: `2026-11-0${Math.min(index, 9)}T10:00:00.000Z`,
    provider: null,
  };
}

function setup() {
  const db = new FakeSupabase(TABLES);
  const row = projectRow();
  db.seed('pierrot_projects', [row]);
  db.seed('pierrot_conversations', [
    {
      id: CONVERSATION_ID,
      session_id: SESSION_ID,
      identity_type: 'owner',
      user_id: OWNER_ID,
      mode: 'site',
      status: 'active',
      started_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
    },
  ]);
  db.seed('pierrot_project_conversations', [
    { project_id: row.id, conversation_id: CONVERSATION_ID, owner_user_id: OWNER_ID },
  ]);
  return { db, row, store: db.asClient() };
}

describe('project review service', () => {
  it('is idempotent for the same command and does not duplicate tasks', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Проверь публичную страницу лота до пятницы.', 1),
    ]);

    const first = await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });
    const second = await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });

    expect(first.report?.counts).toMatchObject({ tasksCreated: 1 });
    expect(second.status).toBe('replayed');
    expect(db.all('pierrot_decisions').filter((item) => item.kind === 'task')).toHaveLength(1);
  });

  it('saves ideas as notes and never as tasks', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Идея: можно было бы сделать серию открыток с архивными письмами.', 1),
    ]);

    const result = await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-2',
      language: 'ru',
    });

    expect(result.report?.counts).toMatchObject({ tasksCreated: 0, ideasSaved: 1 });
    expect(db.all('pierrot_decisions').filter((item) => item.kind === 'task')).toHaveLength(0);
    expect(db.all('pierrot_decisions').filter((item) => item.kind === 'saved')).toHaveLength(1);
  });

  it('does not record Pierrot proposals as owner decisions', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'assistant', 'Предлагаю решение: использовать Art Engine для лотов.', 1),
      message('m2', 'user', 'Мне нравится.', 2),
    ]);

    const result = await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-3',
      language: 'ru',
    });

    expect(result.report?.counts).toMatchObject({ decisionsRecorded: 0 });
    expect(db.all('pierrot_decisions').filter((item) => item.kind === 'decision')).toHaveLength(0);
  });

  it('does not close an ambiguous task on “Готово” alone', async () => {
    const { db, row, store } = setup();
    const taskId = randomUUID();
    db.seed('pierrot_decisions', [
      {
        id: taskId,
        user_id: OWNER_ID,
        kind: 'task',
        title: 'Проверить макет',
        content: 'Проверить макет',
        status: 'current',
        project: 'Journal',
        tags: [],
        source_refs: [],
        importance: 0.6,
        confidence: 0.8,
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-01T10:00:00.000Z',
      },
    ]);
    db.seed('pierrot_project_decisions', [
      { project_id: row.id, decision_id: taskId, owner_user_id: OWNER_ID },
    ]);
    db.seed('pierrot_messages', [message('m1', 'user', 'Готово.', 1)]);

    await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-4',
      language: 'ru',
    });

    expect(db.all('pierrot_decisions').find((item) => item.id === taskId)?.status).toBe('current');
  });

  it('does not rewrite memory when a new decision contradicts an existing one', async () => {
    const { db, row, store } = setup();
    const decisionId = randomUUID();
    db.seed('pierrot_decisions', [
      {
        id: decisionId,
        user_id: OWNER_ID,
        kind: 'decision',
        title: 'Используем светлый фон',
        content: 'Используем светлый фон на странице выпуска',
        status: 'current',
        project: 'Journal',
        tags: [],
        source_refs: [],
        importance: 0.8,
        confidence: 0.9,
        created_at: '2026-11-01T10:00:00.000Z',
        updated_at: '2026-11-01T10:00:00.000Z',
      },
    ]);
    db.seed('pierrot_project_decisions', [
      { project_id: row.id, decision_id: decisionId, owner_user_id: OWNER_ID },
    ]);
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Не используем светлый фон на странице выпуска, решили тёмный.', 1),
    ]);

    const result = await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-6',
      language: 'ru',
    });

    expect(result.report?.counts).toMatchObject({ decisionsRecorded: 0 });
    expect(db.all('pierrot_decisions').find((item) => item.id === decisionId)?.status).toBe(
      'current'
    );
    expect(result.reply).toContain('Противоречие');
  });

  it('reports a partial result and never claims full success when a write fails', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Сохрани материал https://example.com/journal/archive', 1),
    ]);
    db.failTable('pierrot_project_artifacts', '42P01', 'relation does not exist');

    const result = await runProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-5',
      language: 'ru',
    });

    expect(result.status).toBe('partial');
    expect(result.reply).toContain('частично');
    expect(result.reply).toContain('Что не удалось');
  });
});
