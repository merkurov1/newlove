/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '../testSupport/fakeSupabase';
import { detectMemoryIntent } from '../intent';
import {
  createPendingMemoryOperation,
  executeMemoryOperation,
  formatMemoryOperationOutcome,
  isMemoryOperationCancellation,
  isMemoryOperationConfirmation,
  loadPendingMemoryOperation,
  resolveMemoryOperation,
} from '../operations';
import { moveDecisionToProject, resolveExactProject } from '@/lib/pierrot/projects/links';
import type { PierrotMemoryRecord } from '../types';

const TABLES = [
  'pierrot_decisions',
  'pierrot_decision_events',
  'pierrot_memory_embeddings',
  'pierrot_brain_status_snapshots',
  'pierrot_projects',
  'pierrot_project_decisions',
  'pierrot_dev_prompts',
  'pierrot_events',
];

function task(id: string, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: OWNER_ID,
    kind: 'task',
    title,
    content: `${title}. Детали задачи.`,
    status: 'current',
    project: null,
    tags: [],
    source_refs: [],
    importance: 0.6,
    confidence: 0.7,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function project(id: string, name: string, slug: string) {
  return {
    id,
    owner_user_id: OWNER_ID,
    slug,
    name,
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    project_brief: '',
    brief_revision: 1,
    last_activity_at: '2026-11-01T10:00:00.000Z',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
  };
}

function client() {
  const db = new FakeSupabase(TABLES);
  return { db, store: db.asClient() };
}

async function resolve(
  store: ReturnType<typeof client>['store'],
  message: string,
  listContext: PierrotMemoryRecord[] | null = null
) {
  const intent = detectMemoryIntent(message);
  return resolveMemoryOperation({ store, userId: OWNER_ID, intent, listContext });
}

describe('strict memory task operations', () => {
  it('completes exactly one task when ten similar records exist', async () => {
    const { db, store } = client();
    const rows = Array.from({ length: 10 }, (_, index) =>
      task(randomUUID(), `Обновить карточку Heart & Angel ${index + 1}`)
    );
    db.seed('pierrot_decisions', rows);

    const resolution = await resolve(
      store,
      'Пометь задачу Обновить карточку Heart & Angel 7 выполненной'
    );

    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;
    expect(resolution.targets).toHaveLength(1);
    expect(resolution.targets[0].id).toBe(rows[6].id);

    const result = await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    expect(result.outcome.changed).toBe(1);
    const completed = db.all('pierrot_decisions').filter((row) => row.status === 'completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe(rows[6].id);
  });

  it('does not mix tasks from different projects for a single command', async () => {
    const { db, store } = client();
    const bank = task(randomUUID(), 'Bank Leumi — проверить договор', { project: 'Bank Leumi' });
    const journal = task(randomUUID(), 'Journal — обновить выпуск', { project: 'Journal' });
    const analytics = task(randomUUID(), 'Google Analytics — проверить события', {
      project: 'Analytics',
    });
    db.seed('pierrot_decisions', [bank, journal, analytics]);

    const resolution = await resolve(store, 'Задача Bank Leumi — проверить договор выполнена');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;

    await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    const byId = new Map(db.all('pierrot_decisions').map((row) => [row.id, row]));
    expect(byId.get(bank.id)?.status).toBe('completed');
    expect(byId.get(journal.id)?.status).toBe('current');
    expect(byId.get(analytics.id)?.status).toBe('current');
  });

  it('completes only active tasks canonically linked to Journal', async () => {
    const { db, store } = client();
    const journalProject = project(randomUUID(), 'Journal', 'journal');
    const mediaProject = project(randomUUID(), 'Media', 'media');
    db.seed('pierrot_projects', [journalProject, mediaProject]);

    const journalOne = task(randomUUID(), 'Journal — выпуск 12');
    const journalTwo = task(randomUUID(), 'Journal — письмо подписчикам');
    const mediaOne = task(randomUUID(), 'Media — колонка');
    const unlinked = task(randomUUID(), 'Bank Leumi — отчёт');
    db.seed('pierrot_decisions', [journalOne, journalTwo, mediaOne, unlinked]);
    db.seed('pierrot_project_decisions', [
      {
        project_id: journalProject.id,
        decision_id: journalOne.id,
        owner_user_id: OWNER_ID,
      },
      {
        project_id: journalProject.id,
        decision_id: journalTwo.id,
        owner_user_id: OWNER_ID,
      },
      {
        project_id: mediaProject.id,
        decision_id: mediaOne.id,
        owner_user_id: OWNER_ID,
      },
      // unlinked intentionally has no relation row
    ]);

    const resolution = await resolve(store, 'Все задачи Journal выполнены');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;
    expect(resolution.requiresConfirmation).toBe(true);
    expect(resolution.targets.map((record) => record.id).sort()).toEqual(
      [journalOne.id, journalTwo.id].sort()
    );

    await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    const byId = new Map(db.all('pierrot_decisions').map((row) => [row.id, row]));
    expect(byId.get(journalOne.id)?.status).toBe('completed');
    expect(byId.get(journalTwo.id)?.status).toBe('completed');
    expect(byId.get(mediaOne.id)?.status).toBe('current');
    expect(byId.get(unlinked.id)?.status).toBe('current');
  });

  it('scopes “Задачи в Journal — выполнены” to Journal and never Media', async () => {
    const { db, store } = client();
    const journalProject = project(randomUUID(), 'Journal', 'journal');
    const mediaProject = project(randomUUID(), 'Media', 'media');
    db.seed('pierrot_projects', [journalProject, mediaProject]);

    const journal = task(randomUUID(), 'Journal — выпуск 12');
    const media = task(randomUUID(), 'Media — колонка');
    db.seed('pierrot_decisions', [journal, media]);
    db.seed('pierrot_project_decisions', [
      { project_id: journalProject.id, decision_id: journal.id, owner_user_id: OWNER_ID },
      { project_id: mediaProject.id, decision_id: media.id, owner_user_id: OWNER_ID },
    ]);

    const resolution = await resolve(store, 'Задачи в Journal - выполнены отметь это');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;
    expect(resolution.targets.map((record) => record.id)).toEqual([journal.id]);
    // Even one project task is a project-scoped batch: preview before write.
    expect(resolution.requiresConfirmation).toBe(true);

    await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    const byId = new Map(db.all('pierrot_decisions').map((row) => [row.id, row]));
    expect(byId.get(journal.id)?.status).toBe('completed');
    expect(byId.get(media.id)?.status).toBe('current');
  });

  it('asks for a project name instead of treating it as all-memory scope', async () => {
    const { db, store } = client();
    db.seed('pierrot_decisions', [
      task(randomUUID(), 'Journal — выпуск'),
      task(randomUUID(), 'Media — колонка'),
    ]);

    const resolution = await resolve(store, 'Так все задачи по проекту выполнены');
    expect(resolution.status).toBe('no_target');
    expect(db.all('pierrot_decisions').every((row) => row.status === 'current')).toBe(true);
  });

  it('restores the exact archived task and preserves history', async () => {
    const { db, store } = client();
    const row = task(randomUUID(), 'Восстановить эту задачу', { status: 'completed' });
    db.seed('pierrot_decisions', [row]);

    const intent = detectMemoryIntent('Ты случайно завершил эту задачу, восстанови её');
    expect(intent.action).toBe('restore');
    db.seed('pierrot_events', [
      {
        id: randomUUID(),
        conversation_id: 'conversation-1',
        event_name: 'assistant_replied',
        created_at: new Date().toISOString(),
        payload: {
          memory_list_ids: [row.id],
          memory_list_kinds: ['task'],
        },
      },
    ]);

    const resolution = await resolveMemoryOperation({
      store,
      userId: OWNER_ID,
      intent,
      listContext: [
        {
          id: row.id,
          kind: 'task',
          title: row.title,
          content: row.content,
          status: 'completed',
          project: null,
          tags: [],
          sourceRefs: [],
          conversationId: null,
          messageId: null,
          reviewAt: null,
          decidedAt: null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          importance: 0.6,
          confidence: 0.9,
          ownerRating: null,
          ownerRatingUpdatedAt: null,
          validFrom: null,
          validUntil: null,
          lastReferencedAt: null,
          archivedReason: null,
          supersededBy: null,
        } as PierrotMemoryRecord,
      ],
    });

    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;
    expect(resolution.targets.map((record) => record.id)).toEqual([row.id]);
  });

  it('refuses a project operation when Media is not an exact project name', async () => {
    const { db, store } = client();
    db.seed('pierrot_projects', [project(randomUUID(), 'Journal', 'journal')]);
    db.seed('pierrot_decisions', [
      task(randomUUID(), 'Media — колонка'),
      task(randomUUID(), 'Bank Leumi — отчёт'),
    ]);

    const resolution = await resolve(store, 'Все задачи по Media выполнены');
    expect(resolution.status).toBe('project_not_found');
    expect(resolution.status === 'resolved' ? [] : resolution.candidates).toHaveLength(0);
    expect(db.all('pierrot_decisions').every((row) => row.status === 'current')).toBe(true);
  });

  it('stops on ambiguity and changes nothing', async () => {
    const { db, store } = client();
    const first = task(randomUUID(), 'Обновить отчёт Bank');
    const second = task(randomUUID(), 'Обновить отчёт Journal');
    db.seed('pierrot_decisions', [first, second]);

    const resolution = await resolve(store, 'Пометь задачу Обновить отчёт выполненной');
    expect(resolution.status).toBe('ambiguous');
    expect(db.all('pierrot_decisions').every((row) => row.status === 'current')).toBe(true);
    expect(db.all('pierrot_decision_events')).toHaveLength(0);
  });

  it('uses the clarified exact title without widening the target', async () => {
    const { db, store } = client();
    const first = task(randomUUID(), 'Обновить отчёт Bank');
    const second = task(randomUUID(), 'Обновить отчёт Journal');
    db.seed('pierrot_decisions', [first, second]);

    expect((await resolve(store, 'Пометь задачу Обновить отчёт выполненной')).status).toBe(
      'ambiguous'
    );

    const clarified = await resolve(store, 'Пометь задачу Обновить отчёт Journal выполненной');
    expect(clarified.status).toBe('resolved');
    if (clarified.status !== 'resolved') return;
    expect(clarified.targets.map((record) => record.id)).toEqual([second.id]);
  });

  it('is idempotent on a repeated single command and does not duplicate events', async () => {
    const { db, store } = client();
    const row = task(randomUUID(), 'Проверить интеграцию памяти');
    db.seed('pierrot_decisions', [row]);

    const first = await resolve(store, 'Задача Проверить интеграцию памяти выполнена');
    expect(first.status).toBe('resolved');
    if (first.status !== 'resolved') return;
    await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: first.action,
      targets: first.targets,
    });

    const second = await resolve(store, 'Задача Проверить интеграцию памяти выполнена');
    expect(second.status).toBe('resolved');
    if (second.status !== 'resolved') return;
    const repeated = await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: second.action,
      targets: second.targets,
    });

    expect(repeated.outcome.changed).toBe(0);
    expect(repeated.outcome.already).toBe(1);
    expect(
      db.all('pierrot_decision_events').filter((event) => event.event_type === 'status_changed')
    ).toHaveLength(1);
  });

  it('reports a database failure without claiming completion', async () => {
    const { db, store } = client();
    const first = task(randomUUID(), 'Задача A');
    const second = task(randomUUID(), 'Задача B');
    db.seed('pierrot_decisions', [first, second]);
    db.failTable('pierrot_decision_events', 'XX000', 'event write failed');

    const resolution = await resolve(store, 'Заверши все мои текущие задачи');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;

    const result = await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    expect(result.outcome.changed).toBe(0);
    expect(result.outcome.failed).toBe(2);
    expect(db.all('pierrot_decisions').every((row) => row.status === 'current')).toBe(true);
  });

  it('uses the atomic RPC path for a confirmed batch and verifies actual rows', async () => {
    const { db, store } = client();
    const first = task(randomUUID(), 'Journal — A');
    const second = task(randomUUID(), 'Journal — B');
    db.seed('pierrot_decisions', [first, second]);

    db.onRpc('pierrot_apply_decision_status', (params) => {
      const ids = Array.isArray(params.p_decision_ids) ? params.p_decision_ids : [];
      for (const row of db.all('pierrot_decisions')) {
        if (ids.includes(row.id)) {
          row.status = String(params.p_status || 'completed');
          row.updated_at = new Date().toISOString();
        }
      }
      return { data: ids.map((id) => ({ decision_id: id })), error: null };
    });

    const resolution = await resolve(store, 'Заверши все мои текущие задачи');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;

    const result = await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    expect(result.engine).toBe('rpc');
    expect(result.outcome.changed).toBe(2);
    expect(db.all('pierrot_decisions').every((row) => row.status === 'completed')).toBe(true);
  });

  it('reports a partial batch using the rows the database actually changed', async () => {
    const { db, store } = client();
    const first = task(randomUUID(), 'Journal — один');
    const second = task(randomUUID(), 'Journal — два');
    db.seed('pierrot_decisions', [first, second]);

    db.onRpc('pierrot_apply_decision_status', () => {
      const row = db.all('pierrot_decisions')[0];
      row.status = 'completed';
      row.updated_at = new Date().toISOString();
      return { data: [{ decision_id: row.id }], error: null };
    });

    const resolution = await resolve(store, 'Заверши все мои текущие задачи');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;

    const result = await executeMemoryOperation({
      store,
      userId: OWNER_ID,
      action: resolution.action,
      targets: resolution.targets,
    });

    expect(result.outcome.changed).toBe(1);
    expect(result.outcome.failed).toBe(1);
    expect(db.all('pierrot_decisions').filter((row) => row.status === 'completed')).toHaveLength(1);
  });

  it('moves a memory task between projects and keeps one canonical relation', async () => {
    const { db, store } = client();
    const first = project(randomUUID(), 'Journal', 'journal');
    const second = project(randomUUID(), 'Heart & Angel', 'heart-and-angel');
    db.seed('pierrot_projects', [first, second]);
    const row = task(randomUUID(), 'Подготовить выпуск');
    db.seed('pierrot_decisions', [row]);
    db.seed('pierrot_project_decisions', [
      { project_id: first.id, decision_id: row.id, owner_user_id: OWNER_ID },
    ]);

    const target = await resolveExactProject(store, OWNER_ID, 'Heart & Angel');
    expect(target.project?.id).toBe(second.id);
    if (!target.project) return;

    await moveDecisionToProject(store, OWNER_ID, row.id, target.project);

    const links = db.all('pierrot_project_decisions').filter((link) => link.decision_id === row.id);
    expect(links).toHaveLength(1);
    expect(links[0].project_id).toBe(second.id);
    expect(db.all('pierrot_decisions')[0].project).toBe('Heart & Angel');
  });

  it('stores and reloads an exact pending operation for confirmation', async () => {
    const { db, store } = client();
    const first = task(randomUUID(), 'Journal — один');
    const second = task(randomUUID(), 'Journal — два');
    db.seed('pierrot_decisions', [first, second]);

    const resolution = await resolve(store, 'Заверши все мои текущие задачи');
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') return;

    const pending = createPendingMemoryOperation(resolution);
    db.seed('pierrot_events', [
      {
        id: randomUUID(),
        conversation_id: 'conversation-1',
        event_name: 'assistant_replied',
        created_at: new Date().toISOString(),
        payload: { memory_operation_pending: pending },
      },
    ]);

    const loaded = await loadPendingMemoryOperation(store, 'conversation-1');
    expect(loaded?.operationId).toBe(pending.operationId);
    expect(loaded?.targetIds.sort()).toEqual([first.id, second.id].sort());
    expect(isMemoryOperationConfirmation('да, подтверждаю')).toBe(true);
    expect(isMemoryOperationCancellation('отмена')).toBe(true);

    db.seed('pierrot_events', [
      ...db.all('pierrot_events'),
      {
        id: randomUUID(),
        conversation_id: 'conversation-1',
        event_name: 'assistant_replied',
        created_at: new Date(Date.now() + 1000).toISOString(),
        payload: { memory_status: 'other_answer' },
      },
    ]);

    expect(await loadPendingMemoryOperation(store, 'conversation-1')).toBeNull();
  });

  it('formats batch results using actual DB counts', () => {
    const text = formatMemoryOperationOutcome(
      {
        status: 'completed',
        action: 'complete',
        scope: 'project',
        changed: 2,
        already: 1,
        failed: 0,
        targets: [
          { id: '1', title: 'A', status: 'completed' },
          { id: '2', title: 'B', status: 'completed' },
          { id: '3', title: 'C', status: 'completed' },
        ],
        candidates: [],
        projectName: 'Journal',
        pending: null,
        engine: 'rpc',
      },
      'ru'
    );

    expect(text).toContain('найдено 3 задач');
    expect(text).toContain('Завершено: 2');
  });
});
