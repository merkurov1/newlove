/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { learnedClassification } from '../types';
import { listTaskExperiences, recordTaskExperience } from '../store';

const TABLES = ['pierrot_task_experiences', 'pierrot_projects'];

describe('task experience store', () => {
  it('stores an owner correction with provenance and reads it back', async () => {
    const db = new FakeSupabase(TABLES);
    const store = db.asClient();

    const created = await recordTaskExperience(store, {
      userId: OWNER_ID,
      conversationId: 'conv-1',
      sourceMessageId: 'message-1',
      sourceText: 'Нет, это не задача, а правило проекта.',
      proposedKind: 'task',
      confirmedKind: 'constraint',
      proposedProjectId: null,
      confirmedProjectId: null,
      outcome: 'wrong_kind',
      reason: 'Owner corrected the classification.',
      source: 'chat_correction',
      analyzerVersion: 'test-v1',
      metadata: { projectSlug: 'journal' },
    });

    expect(created?.outcome).toBe('wrong_kind');
    const examples = await listTaskExperiences(store, { userId: OWNER_ID, limit: 10 });
    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({
      sourceMessageId: 'message-1',
      proposedKind: 'task',
      confirmedKind: 'constraint',
      source: 'chat_correction',
    });
  });

  it('degrades to no examples when the migration is absent', async () => {
    const db = new FakeSupabase(TABLES);
    db.failTable('pierrot_task_experiences', '42P01', 'relation does not exist');
    const store = db.asClient();

    await expect(
      recordTaskExperience(store, {
        userId: OWNER_ID,
        conversationId: null,
        sourceMessageId: null,
        sourceText: 'Тест',
        proposedKind: 'task',
        confirmedKind: null,
        proposedProjectId: null,
        confirmedProjectId: null,
        outcome: 'false_task',
        reason: null,
        source: 'manual',
        analyzerVersion: 'test-v1',
        metadata: {},
      })
    ).resolves.toBeNull();
    await expect(listTaskExperiences(store, { userId: OWNER_ID })).resolves.toEqual([]);
  });

  it('only treats an exact normalized sentence as a learned override', () => {
    const examples = [
      {
        id: 'e1',
        userId: OWNER_ID,
        conversationId: null,
        sourceMessageId: null,
        sourceText: 'Просто добавь это в задачи.',
        proposedKind: 'task',
        confirmedKind: null,
        proposedProjectId: null,
        confirmedProjectId: null,
        outcome: 'false_task' as const,
        reason: null,
        source: 'manual' as const,
        analyzerVersion: 'test',
        metadata: {},
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    expect(learnedClassification('Просто добавь это в задачи', examples)?.outcome).toBe(
      'false_task'
    );
    expect(learnedClassification('Просто добавь это в другие задачи', examples)).toBeNull();
  });
});
