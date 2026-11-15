/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { getProjectStatusSummary } from '../status';

const db = new FakeSupabase([
  'pierrot_projects',
  'pierrot_project_decisions',
  'pierrot_dev_prompts',
  'pierrot_conversations',
  'pierrot_project_knowledge',
  'pierrot_project_artifacts',
  'pierrot_project_reviews',
]);

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(() => db.asClient()),
}));

const { getPierrotProjectSnapshot } = require('../store') as typeof import('../store');

const projectRow = {
  id: 'project-unframed',
  owner_user_id: OWNER_ID,
  slug: 'unframed',
  name: 'UNFRAMED',
  description: 'Book and series.',
  objective: 'Develop the book.',
  status: 'active',
  priority: 0,
  project_brief: 'Brief',
  brief_revision: 1,
  conversation_id: 'conversation-1',
  last_activity_at: '2026-11-11T10:00:00.000Z',
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-11-11T10:00:00.000Z',
};

const decisionRelation = {
  id: 'decision-1',
  title: 'Keep the book and the series distinct',
  content: 'They are related but not the same object.',
  status: 'current',
  kind: 'decision',
  updated_at: '2026-11-11T09:00:00.000Z',
  valid_from: '2026-11-01T00:00:00.000Z',
  valid_until: null,
};

function seedHealthy() {
  db.seed('pierrot_projects', [projectRow]);
  db.seed('pierrot_conversations', [
    {
      id: 'conversation-1',
      title: 'UNFRAMED',
      started_at: '2026-11-01T10:00:00.000Z',
    },
  ]);
  db.seed('pierrot_project_decisions', [
    {
      project_id: 'project-unframed',
      owner_user_id: OWNER_ID,
      decision: decisionRelation,
    },
  ]);
  db.seed('pierrot_dev_prompts', [
    {
      id: 'task-1',
      title: 'Draft chapter 14',
      task: 'Draft chapter 14',
      status: 'open',
      project_id: 'project-unframed',
      user_id: OWNER_ID,
      updated_at: '2026-11-11T09:30:00.000Z',
    },
  ]);
  db.seed('pierrot_project_artifacts', [
    {
      id: 'artifact-1',
      title: 'Chapter 14 draft',
      artifact_type: 'document',
      project_id: 'project-unframed',
      owner_user_id: OWNER_ID,
      updated_at: '2026-11-11T10:00:00.000Z',
    },
  ]);
  db.seed('pierrot_project_knowledge', [
    {
      project_id: 'project-unframed',
      owner_user_id: OWNER_ID,
      document: {
        id: 'doc-1',
        title: 'UNFRAMED manuscript',
        ingestion_status: 'completed',
        extraction_status: 'completed',
        chunk_count: 12,
        source_char_count: 42_000,
        access_class: 'owner',
      },
    },
  ]);
  db.seed('pierrot_project_reviews', [
    {
      id: 'review-1',
      project_id: 'project-unframed',
      owner_user_id: OWNER_ID,
      summary: 'The book is ahead of the series.',
      completed_at: '2026-11-10T10:00:00.000Z',
      status: 'completed',
    },
  ]);
}

describe('project snapshot source states', () => {
  beforeEach(() => {
    for (const table of [
      'pierrot_projects',
      'pierrot_project_decisions',
      'pierrot_dev_prompts',
      'pierrot_conversations',
      'pierrot_project_knowledge',
      'pierrot_project_artifacts',
      'pierrot_project_reviews',
    ]) {
      db.clearFailure(table);
    }
    seedHealthy();
  });

  it('marks successfully read non-empty sources as success and keeps their data', async () => {
    const snapshot = await getPierrotProjectSnapshot(OWNER_ID, 'unframed');

    expect(snapshot).not.toBeNull();
    expect(snapshot?.decisions).toHaveLength(1);
    expect(snapshot?.tasks).toHaveLength(1);
    expect(snapshot?.knowledge).toHaveLength(1);
    expect(snapshot?.artifacts).toHaveLength(1);
    expect(snapshot?.latestReview?.summary).toContain('book');
    expect(snapshot?.sourceStatus).toMatchObject({
      decisions: { state: 'success', count: 1 },
      tasks: { state: 'success', count: 1 },
      conversations: { state: 'success', count: 1 },
      knowledge: { state: 'success', count: 1 },
      artifacts: { state: 'success', count: 1 },
      reviews: { state: 'success', count: 1 },
    });
  });

  it('marks a genuinely empty source as empty, not failed', async () => {
    db.seed('pierrot_project_artifacts', []);
    const snapshot = await getPierrotProjectSnapshot(OWNER_ID, 'unframed');

    expect(snapshot?.artifacts).toEqual([]);
    expect(snapshot?.sourceStatus?.artifacts).toMatchObject({ state: 'empty', count: 0 });
  });

  it('keeps one source failure from erasing data from the other sources', async () => {
    db.failTable('pierrot_project_knowledge', '57014', 'canceling statement due to statement timeout');
    const snapshot = await getPierrotProjectSnapshot(OWNER_ID, 'unframed');

    expect(snapshot?.knowledge).toEqual([]);
    expect(snapshot?.knowledgeUnavailable).toContain('timeout');
    expect(snapshot?.sourceStatus?.knowledge).toMatchObject({
      state: 'unavailable',
      error: expect.stringContaining('timeout'),
    });
    expect(snapshot?.decisions).toHaveLength(1);
    expect(snapshot?.tasks).toHaveLength(1);
    expect(snapshot?.artifacts).toHaveLength(1);
  });

  it('marks a partial relation read as partial instead of empty', async () => {
    db.seed('pierrot_project_decisions', [
      {
        project_id: 'project-unframed',
        owner_user_id: OWNER_ID,
        decision: null,
      },
    ]);
    const snapshot = await getPierrotProjectSnapshot(OWNER_ID, 'unframed');

    expect(snapshot?.sourceStatus?.decisions).toMatchObject({
      state: 'partial',
      count: 1,
      truncated: true,
    });
  });

  it('does not report an empty project when every source failed', async () => {
    for (const table of [
      'pierrot_project_decisions',
      'pierrot_dev_prompts',
      'pierrot_conversations',
      'pierrot_project_knowledge',
      'pierrot_project_artifacts',
      'pierrot_project_reviews',
    ]) {
      db.failTable(table, 'PGRST301', 'permission denied');
    }
    const snapshot = await getPierrotProjectSnapshot(OWNER_ID, 'unframed');

    expect(snapshot).not.toBeNull();
    const summary = getProjectStatusSummary(snapshot!);
    expect(summary.label).toBe('Данные источников недоступны');
    expect(summary.explanation).toContain('ошибка чтения');
  });
});
