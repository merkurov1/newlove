/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import { FakeSupabase, OWNER_ID } from '../testSupport/fakeSupabase';
import { detectMemoryIntent } from '../intent';
import { createOwnerTask } from '../taskCreation';
import { listProjectTasks } from '@/lib/pierrot/projects/links';

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

describe('explicit task creation intent', () => {
  it.each([
    [
      'Добавь задачу в проект Journal на главной flow не дублировать заголовок',
      'Journal',
      'на главной flow не дублировать заголовок',
    ],
    [
      'В Heart & Angel добавь задачу — опустить шарик с сердечком на мобильных ниже',
      'Heart & Angel',
      'опустить шарик с сердечком на мобильных ниже',
    ],
    [
      'Добавь задачу в проект Art Engine: исправить публичную страницу лота',
      'Art Engine',
      'исправить публичную страницу лота',
    ],
  ])('parses %s', (message, projectRef, content) => {
    const intent = detectMemoryIntent(message);

    expect(intent.action).toBe('create_task');
    expect(intent.projectRef).toBe(projectRef);
    expect(intent.content).toBe(content);
  });

  it('does not guess which tasks “добавь это всё в задачи” means', () => {
    const intent = detectMemoryIntent('Добавь это все в задачи');

    expect(intent.action).toBe('clarify');
    expect(intent.reason).toBe('task_reference_ambiguous');
  });

  it('asks for the wording instead of creating an empty task', () => {
    const intent = detectMemoryIntent('Добавь задачу');

    expect(intent.action).toBe('create_task');
    expect(intent.content).toBeNull();
    expect(intent.reason).toBe('task_content_missing');
  });
});

describe('verified owner task creation', () => {
  it('creates one task, links it to the exact project and reads it back', async () => {
    const { db, store } = client();
    const journal = project(randomUUID(), 'Journal', 'journal');
    db.seed('pierrot_projects', [journal]);

    const result = await createOwnerTask({
      store,
      userId: OWNER_ID,
      content: 'на главной flow не дублировать заголовок',
      projectRef: 'Journal',
      skipEmbedding: true,
    });

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;
    expect(result.task.id).toBeTruthy();
    expect(result.task.status).toBe('current');
    expect(result.project?.id).toBe(journal.id);
    expect(result.linkPersisted).toBe(true);

    const linked = await listProjectTasks(store, OWNER_ID, journal.id, {
      statuses: ['current'],
    });
    expect(linked.map((task) => task.id)).toEqual([result.task.id]);
  });

  it('does not create a task when the requested project is unknown', async () => {
    const { db, store } = client();
    db.seed('pierrot_projects', [project(randomUUID(), 'Journal', 'journal')]);

    const result = await createOwnerTask({
      store,
      userId: OWNER_ID,
      content: 'исправить страницу лота',
      projectRef: 'Media',
      skipEmbedding: true,
    });

    expect(result.status).toBe('project_not_found');
    expect(db.all('pierrot_decisions')).toHaveLength(0);
  });

  it('does not move an identically worded task from another project', async () => {
    const { db, store } = client();
    const journal = project(randomUUID(), 'Journal', 'journal');
    const media = project(randomUUID(), 'Media', 'media');
    db.seed('pierrot_projects', [journal, media]);

    const existing = {
      id: randomUUID(),
      user_id: OWNER_ID,
      kind: 'task',
      title: 'Проверить выпуск',
      content: 'Проверить выпуск',
      status: 'current',
      project: 'Journal',
      tags: [],
      source_refs: [],
      importance: 0.6,
      confidence: 0.7,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
    };
    db.seed('pierrot_decisions', [existing]);
    db.seed('pierrot_project_decisions', [
      { project_id: journal.id, decision_id: existing.id, owner_user_id: OWNER_ID },
    ]);

    const result = await createOwnerTask({
      store,
      userId: OWNER_ID,
      content: 'Проверить выпуск',
      projectRef: 'Media',
      skipEmbedding: true,
    });

    expect(result.status).toBe('existing_in_other_project');
    const links = db
      .all('pierrot_project_decisions')
      .filter((link) => link.decision_id === existing.id);
    expect(links).toHaveLength(1);
    expect(links[0].project_id).toBe(journal.id);
  });

  it('is idempotent for an identical repeated command', async () => {
    const { db, store } = client();
    const journal = project(randomUUID(), 'Journal', 'journal');
    db.seed('pierrot_projects', [journal]);

    const input = {
      store,
      userId: OWNER_ID,
      content: 'проверить выпуск Journal',
      projectRef: 'Journal',
      skipEmbedding: true,
    } as const;

    const first = await createOwnerTask(input);
    const second = await createOwnerTask(input);

    expect(first.status).toBe('created');
    expect(second.status).toBe('already_exists');
    expect(db.all('pierrot_decisions')).toHaveLength(1);
  });
});
