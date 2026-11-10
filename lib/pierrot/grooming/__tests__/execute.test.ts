/** @jest-environment node */

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { randomUUID } from 'crypto';
import { executeApprovedPlan } from '../execute';

const TABLES = [
  'pierrot_workspace_audits',
  'pierrot_workspace_proposals',
  'pierrot_workspace_operations',
  'pierrot_decisions',
  'pierrot_decision_events',
  'pierrot_memory_embeddings',
  'pierrot_brain_status_snapshots',
  'pierrot_projects',
  'pierrot_project_decisions',
  'pierrot_context_summaries',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_github_task_links',
];

const NOW = '2026-11-09T10:00:00.000Z';
// The fixture must stay in the future regardless of the calendar day the test
// suite runs on; a hard-coded next-day value made the test expire by itself.
const FUTURE = '2030-01-01T10:00:00.000Z';

function task(id: string, title = 'Task', status = 'current', updatedAt = '2026-11-01T10:00:00.000Z') {
  return {
    id,
    user_id: OWNER_ID,
    kind: 'task',
    title,
    content: title,
    status,
    project: 'Journal',
    tags: [],
    source_refs: [],
    importance: 0.6,
    confidence: 0.8,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: updatedAt,
  };
}

function proposal(input: {
  id?: string;
  auditId: string;
  ordinal: number;
  operation: string;
  entityId: string;
  params: Record<string, unknown>;
  beforeState: Record<string, unknown>;
  title?: string;
}) {
  return {
    id: input.id || randomUUID(),
    audit_id: input.auditId,
    user_id: OWNER_ID,
    ordinal: input.ordinal,
    operation: input.operation,
    entity_type: input.operation.includes('memory') ? 'memory' : 'task',
    entity_id: input.entityId,
    project_id: null,
    title: input.title || `Proposal ${input.ordinal}`,
    reason: 'Test reason',
    expected_result: 'Test result',
    source_refs: [],
    params: input.params,
    before_state: input.beforeState,
    confidence: 0.9,
    risk: 'confirmation',
    status: 'proposed',
    selected: false,
  };
}

function setup(proposals: Array<Record<string, unknown>>, tasks: Array<Record<string, unknown>>) {
  const db = new FakeSupabase(TABLES);
  const auditId = randomUUID();
  db.seed('pierrot_workspace_audits', [
    {
      id: auditId,
      user_id: OWNER_ID,
      conversation_id: 'conv-1',
      project_id: null,
      scope: 'all',
      status: 'prepared',
      request_message_id: 'request-1',
      summary: {
        messageCount: 0,
        taskCount: tasks.length,
        memoryCount: 0,
        projectCount: 0,
        githubLinkCount: 0,
        githubErrorCount: 0,
        staleSummaryCount: 0,
        duplicateCandidates: 0,
        ambiguousCount: 0,
        warnings: [],
      },
      snapshot: {},
      proposal_count: proposals.length,
      warning_count: 0,
      created_at: NOW,
      expires_at: FUTURE,
      updated_at: NOW,
    },
  ]);
  db.seed(
    'pierrot_workspace_proposals',
    proposals.map((item) => ({ ...item, audit_id: auditId }))
  );
  db.seed('pierrot_decisions', tasks);
  return { db, store: db.asClient(), auditId };
}

describe('workspace grooming execution', () => {
  it('executes only selected proposals and rejects the rest', async () => {
    const auditId = randomUUID();
    const db = new FakeSupabase(TABLES);
    db.seed('pierrot_workspace_audits', [
      {
        id: auditId,
        user_id: OWNER_ID,
        conversation_id: 'conv-1',
        project_id: null,
        scope: 'all',
        status: 'prepared',
        request_message_id: 'request-1',
        summary: { warnings: [] },
        snapshot: {},
        proposal_count: 2,
        warning_count: 0,
        created_at: NOW,
        expires_at: FUTURE,
        updated_at: NOW,
      },
    ]);
    db.seed('pierrot_workspace_proposals', [
      proposal({
        auditId,
        ordinal: 1,
        operation: 'archive_task',
        entityId: 'a',
        params: { taskId: 'a', reason: 'stale' },
        beforeState: { updatedAt: '2026-11-01T10:00:00.000Z', status: 'current', kind: 'task', title: 'A' },
        title: 'Archive A',
      }),
      proposal({
        auditId,
        ordinal: 2,
        operation: 'archive_task',
        entityId: 'b',
        params: { taskId: 'b', reason: 'stale' },
        beforeState: { updatedAt: '2026-11-01T10:00:00.000Z', status: 'current', kind: 'task', title: 'B' },
        title: 'Archive B',
      }),
    ]);
    db.seed('pierrot_decisions', [task('a', 'A'), task('b', 'B')]);
    const store = db.asClient();

    const report = await executeApprovedPlan({
      store,
      userId: OWNER_ID,
      auditId,
      mode: 'selected',
      ordinals: [1],
    });

    expect(report.executed).toBe(1);
    expect(db.all('pierrot_decisions').find((item) => item.id === 'a')?.status).toBe('archived');
    expect(db.all('pierrot_decisions').find((item) => item.id === 'b')?.status).toBe('current');
    expect(
      db.all('pierrot_workspace_proposals').find((item) => item.ordinal === 2)?.status
    ).toBe('rejected');
  });

  it('stops a stale operation when the entity changed after audit', async () => {
    const auditId = randomUUID();
    const db = new FakeSupabase(TABLES);
    db.seed('pierrot_workspace_audits', [
      {
        id: auditId,
        user_id: OWNER_ID,
        conversation_id: 'conv-1',
        project_id: null,
        scope: 'all',
        status: 'prepared',
        request_message_id: 'request-1',
        summary: { warnings: [] },
        snapshot: {},
        proposal_count: 1,
        warning_count: 0,
        created_at: NOW,
        expires_at: FUTURE,
        updated_at: NOW,
      },
    ]);
    db.seed('pierrot_workspace_proposals', [
      proposal({
        auditId,
        ordinal: 1,
        operation: 'archive_task',
        entityId: 'a',
        params: { taskId: 'a', reason: 'stale' },
        beforeState: { updatedAt: '2026-11-01T10:00:00.000Z', status: 'current', kind: 'task', title: 'A' },
      }),
    ]);
    db.seed('pierrot_decisions', [task('a', 'A', 'current', '2026-11-09T09:00:00.000Z')]);

    const report = await executeApprovedPlan({
      store: db.asClient(),
      userId: OWNER_ID,
      auditId,
      mode: 'all',
    });

    expect(report.stale).toBe(1);
    expect(db.all('pierrot_decisions')[0].status).toBe('current');
  });

  it('continues independent operations after a partial failure', async () => {
    const auditId = randomUUID();
    const db = new FakeSupabase(TABLES);
    db.seed('pierrot_workspace_audits', [
      {
        id: auditId,
        user_id: OWNER_ID,
        conversation_id: 'conv-1',
        project_id: null,
        scope: 'all',
        status: 'prepared',
        request_message_id: 'request-1',
        summary: { warnings: [] },
        snapshot: {},
        proposal_count: 2,
        warning_count: 0,
        created_at: NOW,
        expires_at: FUTURE,
        updated_at: NOW,
      },
    ]);
    db.seed('pierrot_workspace_proposals', [
      proposal({
        auditId,
        ordinal: 1,
        operation: 'archive_task',
        entityId: 'a',
        params: { taskId: 'a', reason: 'stale' },
        beforeState: { updatedAt: '2026-11-01T10:00:00.000Z', status: 'current', kind: 'task', title: 'A' },
      }),
      proposal({
        auditId,
        ordinal: 2,
        operation: 'archive_task',
        entityId: 'missing',
        params: { taskId: 'missing', reason: 'stale' },
        beforeState: {},
      }),
    ]);
    db.seed('pierrot_decisions', [task('a', 'A')]);

    const report = await executeApprovedPlan({
      store: db.asClient(),
      userId: OWNER_ID,
      auditId,
      mode: 'all',
    });

    expect(report.executed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.status).toBe('partial');
    expect(db.all('pierrot_decisions')[0].status).toBe('archived');
  });

  it('is idempotent when the same plan is executed again', async () => {
    const auditId = randomUUID();
    const db = new FakeSupabase(TABLES);
    db.seed('pierrot_workspace_audits', [
      {
        id: auditId,
        user_id: OWNER_ID,
        conversation_id: 'conv-1',
        project_id: null,
        scope: 'all',
        status: 'prepared',
        request_message_id: 'request-1',
        summary: { warnings: [] },
        snapshot: {},
        proposal_count: 1,
        warning_count: 0,
        created_at: NOW,
        expires_at: FUTURE,
        updated_at: NOW,
      },
    ]);
    db.seed('pierrot_workspace_proposals', [
      proposal({
        auditId,
        ordinal: 1,
        operation: 'archive_task',
        entityId: 'a',
        params: { taskId: 'a', reason: 'stale' },
        beforeState: { updatedAt: '2026-11-01T10:00:00.000Z', status: 'current', kind: 'task', title: 'A' },
      }),
    ]);
    db.seed('pierrot_decisions', [task('a', 'A')]);
    const store = db.asClient();

    const first = await executeApprovedPlan({ store, userId: OWNER_ID, auditId, mode: 'all' });
    const second = await executeApprovedPlan({ store, userId: OWNER_ID, auditId, mode: 'all' });

    expect(first.executed).toBe(1);
    expect(second.executed).toBe(1);
    expect(db.all('pierrot_decisions')).toHaveLength(1);
    expect(db.all('pierrot_workspace_operations')).toHaveLength(1);
  });

  it('rejects all without touching entities', async () => {
    const auditId = randomUUID();
    const db = new FakeSupabase(TABLES);
    db.seed('pierrot_workspace_audits', [
      {
        id: auditId,
        user_id: OWNER_ID,
        conversation_id: 'conv-1',
        project_id: null,
        scope: 'all',
        status: 'prepared',
        request_message_id: 'request-1',
        summary: { warnings: [] },
        snapshot: {},
        proposal_count: 1,
        warning_count: 0,
        created_at: NOW,
        expires_at: FUTURE,
        updated_at: NOW,
      },
    ]);
    db.seed('pierrot_workspace_proposals', [
      proposal({
        auditId,
        ordinal: 1,
        operation: 'archive_task',
        entityId: 'a',
        params: { taskId: 'a' },
        beforeState: {},
      }),
    ]);
    db.seed('pierrot_decisions', [task('a', 'A')]);

    await executeApprovedPlan({
      store: db.asClient(),
      userId: OWNER_ID,
      auditId,
      mode: 'reject_all',
    });

    expect(db.all('pierrot_decisions')[0].status).toBe('current');
    expect(db.all('pierrot_workspace_proposals')[0].status).toBe('rejected');
  });
});
