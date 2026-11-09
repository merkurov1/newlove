/** @jest-environment node */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { randomUUID } from 'crypto';

jest.mock('../../dev/repository', () => ({
  getDevRepositoryStatuses: jest.fn(async () => []),
}));
jest.mock('../../dev/tasks', () => ({
  listDevTasks: jest.fn(async () => ({ tasks: [], migrationRequired: false })),
}));

import type { PierrotProjectSnapshot } from '../types';

let prepareProjectReview: typeof import('../review/service').prepareProjectReview;
let approvePendingGroomingPlan: typeof import('@/lib/pierrot/grooming/service').approvePendingGroomingPlan;

beforeAll(async () => {
  ({ prepareProjectReview } = await import('../review/service'));
  ({ approvePendingGroomingPlan } = await import('@/lib/pierrot/grooming/service'));
});

const TABLES = [
  'pierrot_projects',
  'pierrot_project_conversations',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_project_decisions',
  'pierrot_project_artifacts',
  'pierrot_project_knowledge',
  'pierrot_project_reviews',
  'pierrot_decisions',
  'pierrot_decision_events',
  'pierrot_memory_embeddings',
  'pierrot_brain_status_snapshots',
  'pierrot_dev_prompts',
  'pierrot_events',
  'pierrot_workspace_audits',
  'pierrot_workspace_proposals',
  'pierrot_workspace_operations',
  'pierrot_context_summaries',
  'pierrot_github_task_links',
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

describe('project review preparation and approval', () => {
  it('creates a plan without mutating tasks, memory or artifacts', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Проверь публичную страницу лота до пятницы.', 1),
    ]);

    const result = await prepareProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });

    expect(result.status).toBe('prepared');
    expect(result.report?.proposalCount).toEqual(expect.any(Number));
    expect(db.all('pierrot_workspace_audits')).toHaveLength(1);
    expect(db.all('pierrot_workspace_proposals').length).toBeGreaterThan(0);
    expect(db.all('pierrot_decisions')).toHaveLength(0);
    expect(db.all('pierrot_project_artifacts')).toHaveLength(0);
  });

  it('is idempotent for the same command and does not duplicate plans', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Проверь публичную страницу лота до пятницы.', 1),
    ]);

    const first = await prepareProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });
    const second = await prepareProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });

    expect(second.runId).toBe(first.runId);
    expect(db.all('pierrot_workspace_audits')).toHaveLength(1);
    expect(db.all('pierrot_decisions')).toHaveLength(0);
  });

  it('applies only the approved task proposal and links it to the project', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Проверь публичную страницу лота до пятницы.', 1),
    ]);

    const prepared = await prepareProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });
    const audit = db
      .all('pierrot_workspace_audits')
      .find((item) => item.id === prepared.runId) as Record<string, unknown>;
    expect(audit).toBeTruthy();
    const createTask = db
      .all('pierrot_workspace_proposals')
      .find((item) => item.audit_id === prepared.runId && item.operation === 'create_task') as
      Record<string, unknown> | undefined;
    expect(createTask).toBeTruthy();

    const execution = await approvePendingGroomingPlan({
      store,
      userId: OWNER_ID,
      conversationId: CONVERSATION_ID,
      mode: 'selected',
      ordinals: [Number(createTask?.ordinal)],
      language: 'ru',
    });

    expect(execution?.report.executed).toBe(1);
    const tasks = db.all('pierrot_decisions').filter((item) => item.kind === 'task');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain('Проверь публичную страницу лота');
    const links = db
      .all('pierrot_project_decisions')
      .filter((item) => item.decision_id === tasks[0].id);
    expect(links).toHaveLength(1);
    expect(links[0].project_id).toBe(row.id);
  });

  it('rejecting the plan leaves all workspace records untouched', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Проверь публичную страницу лота до пятницы.', 1),
    ]);

    await prepareProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-1',
      language: 'ru',
    });

    await approvePendingGroomingPlan({
      store,
      userId: OWNER_ID,
      conversationId: CONVERSATION_ID,
      mode: 'reject_all',
      language: 'ru',
    });

    expect(db.all('pierrot_decisions')).toHaveLength(0);
    expect(db.all('pierrot_project_artifacts')).toHaveLength(0);
    expect(
      db.all('pierrot_workspace_proposals').every((proposal) => proposal.status === 'rejected')
    ).toBe(true);
  });

  it('keeps ideas, rules and reminders out of the task proposals', async () => {
    const { db, row, store } = setup();
    db.seed('pierrot_messages', [
      message('m1', 'user', 'Идея: можно было бы сделать серию открыток с архивными письмами.', 1),
      message('m2', 'user', 'Открытка не должна превращать Heart & Angel в интернет-магазин.', 2),
      message('m3', 'user', 'Напомни мне проверить макет завтра.', 3),
      message('m4', 'assistant', 'Предлагаю решение: использовать Art Engine для лотов.', 4),
    ]);

    const prepared = await prepareProjectReview({
      store,
      ownerUserId: OWNER_ID,
      project: snapshot(row),
      conversationId: CONVERSATION_ID,
      requestMessageId: 'user-message-2',
      language: 'ru',
    });

    const proposals = db
      .all('pierrot_workspace_proposals')
      .filter((item) => item.audit_id === prepared.runId);
    expect(proposals.filter((item) => item.operation === 'create_task')).toHaveLength(0);
    expect(proposals.filter((item) => item.operation === 'create_reminder')).toHaveLength(1);
    const memoryKinds = proposals
      .filter((item) => item.operation === 'create_memory')
      .map((item) => (item.params as Record<string, unknown>).kind);
    expect(memoryKinds).toEqual(expect.arrayContaining(['saved', 'constraint']));
  });
});
