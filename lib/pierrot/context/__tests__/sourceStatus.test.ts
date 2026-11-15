/** @jest-environment node */

import { beforeEach, describe, expect, it } from '@jest/globals';

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { detectContextQuery } from '../intent';
import { formatContextReport } from '../report';
import { runContextQuery } from '../retrieval';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const OPTIONS = { now: NOW, timezone: 'UTC', timezoneKnown: true };

const TABLES = [
  'pierrot_projects',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_project_conversations',
  'pierrot_decisions',
  'pierrot_project_decisions',
  'pierrot_project_artifacts',
  'pierrot_project_events',
  'pierrot_entities',
  'pierrot_entity_relations',
  'knowledge_documents',
  'knowledge_chunks',
  'pierrot_project_knowledge',
];

function seedMessages(db: FakeSupabase, count = 1) {
  db.seed('pierrot_conversations', [
    {
      id: 'main-chat',
      session_id: 'session-1',
      title: 'Главный чат',
      user_id: OWNER_ID,
      identity_type: 'owner',
      started_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-11T10:00:00.000Z',
      last_message_at: '2026-11-11T10:00:00.000Z',
    },
  ]);
  db.seed(
    'pierrot_messages',
    Array.from({ length: count }, (_, index) => ({
      id: `m${index + 1}`,
      conversation_id: 'main-chat',
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Сообщение ${index + 1}: вчера обсуждали UNFRAMED и книгу.`,
      created_at: `2026-11-10T${String(10 + (index % 10)).padStart(2, '0')}:00:00.000Z`,
      ingested_at: '2026-11-11T10:00:00.000Z',
      message_index: index + 1,
    }))
  );
}

async function run(message: string, db: FakeSupabase) {
  const plan = detectContextQuery(message, OPTIONS);
  expect(plan).not.toBeNull();
  return runContextQuery({
    store: db.asClient(),
    ownerUserId: OWNER_ID,
    plan: plan!,
    project: null,
    embeddingClient: null,
  });
}

describe('context source failure semantics', () => {
  let db: FakeSupabase;

  beforeEach(() => {
    db = new FakeSupabase(TABLES);
    seedMessages(db);
  });

  it('marks a successful empty history as empty, not unavailable', async () => {
    db.seed('pierrot_conversations', []);
    db.seed('pierrot_messages', []);
    const result = await run('Изучи историю наших диалогов за день', db);

    expect(result.sources.conversations.state).toBe('empty');
    expect(result.sources.messages.state).toBe('empty');
    expect(result.gaps.join(' ')).toContain('Сохранённых диалогов владельца не найдено');
  });

  it('reports a conversation read failure instead of claiming there is no history', async () => {
    db.failTable('pierrot_conversations', 'PGRST301', 'permission denied');
    const result = await run('Изучи историю наших диалогов за день', db);

    expect(result.sources.conversations.state).toBe('unavailable');
    expect(result.gaps.join(' ')).toContain('Историю диалогов не удалось прочитать');
    expect(result.gaps.join(' ')).toContain('не означает, что история пуста');
    expect(result.gaps.join(' ')).not.toContain('Сохранённых диалогов владельца не найдено');
  });

  it('reports a message timeout as an incomplete search, not as no matches', async () => {
    db.failTable('pierrot_messages', '57014', 'canceling statement due to statement timeout');
    const result = await run('Что мы обсуждали вчера?', db);

    expect(result.sources.messages.state).toBe('unavailable');
    expect(result.gaps.join(' ')).toContain('timeout');
    expect(result.gaps.join(' ')).toContain('не означает');

    const report = formatContextReport(result, 'ru');
    expect(report).not.toContain('Совпадений не найдено');
    expect(report).toContain('Пробелы');
  });

  it('keeps message data when an unrelated source fails', async () => {
    db.failTable('knowledge_documents', 'PGRST301', 'permission denied');
    const result = await run('Что мы обсуждали вчера?', db);

    expect(result.sources.brain.state).toBe('unavailable');
    expect(result.sources.messages.state).toBe('success');
    expect(result.hits.some((hit) => hit.sourceType === 'message')).toBe(true);
    expect(result.gaps.join(' ')).toContain('Brain временно недоступен');
  });

  it('marks a bounded history read as partial when it reaches the limit', async () => {
    seedMessages(db, 241);
    const result = await run('Что мы обсуждали?', db);

    expect(result.sources.messages.state).toBe('partial');
    expect(result.sources.messages.truncated).toBe(true);
    expect(result.gaps.join(' ')).toContain('ограничена последними');
  });
});
