/** @jest-environment node */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import {
  FakeSupabase,
  OWNER_ID,
  OTHER_USER_ID,
  fakeEmbeddingClient,
} from '../testSupport/fakeSupabase';
import {
  buildMemoryContext,
  createMemoryRecord,
  deleteMemoryRecord,
  getMemoryRecord,
  listMemoryRecords,
  restoreMemoryRecord,
  searchMemory,
  updateMemoryRecord,
} from '../store';
import { indexMemoryEmbedding } from '../embeddings';
import { runMemorySteward } from '../steward';
import { detectMemoryIntent } from '../intent';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('Temporal Memory', () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it('creates a durable memory and a dated reminder', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const memory = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Предпочитает короткие ответы и ясные формулировки.',
      project: 'Pierrot',
      tags: ['tone'],
      skipEmbedding: true,
    });

    expect(memory.kind).toBe('memory');
    expect(memory.status).toBe('current');
    expect(memory.project).toBe('Pierrot');
    expect(memory.importance).toBeGreaterThan(0.5);
    expect(memory.validFrom).toBeTruthy();

    const reminder = await createMemoryRecord(store, OWNER_ID, {
      kind: 'reminder',
      content: 'Проверить интеграцию с LinkedIn.',
      reviewAt: '2026-12-01T09:00:00.000Z',
      skipEmbedding: true,
    });

    expect(reminder.kind).toBe('reminder');
    expect(reminder.reviewAt).toBe('2026-12-01T09:00:00.000Z');
    expect(reminder.validUntil).toBe('2026-12-01T09:00:00.000Z');
  });

  it('deduplicates a near-identical write instead of creating a second row', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const first = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Предпочитает короткие ответы.',
      skipEmbedding: true,
    });
    const second = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Предпочитает короткие ответы.',
      skipEmbedding: true,
    });

    expect(second.id).toBe(first.id);
    expect(second.deduplicated).toBe(true);
    expect(db.all('pierrot_decisions')).toHaveLength(1);
  });

  it('replaces an old agreement without deleting its history', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const old = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Ответы должны быть длинными и подробными.',
      skipEmbedding: true,
    });

    const replacement = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Ответы должны быть короткими вместо длинных.',
      possibleConflict: true,
      skipEmbedding: true,
    });

    expect(replacement.supersededRecordId).toBe(old.id);
    const oldAfter = await getMemoryRecord(store, OWNER_ID, old.id);
    expect(oldAfter?.status).toBe('superseded');
    expect(oldAfter?.supersededBy).toBe(replacement.id);

    const history = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'ответы длинными',
      historyOnly: true,
      lexicalOnly: true,
      limit: 10,
    });
    expect(history.records.map((record) => record.id)).toEqual(
      expect.arrayContaining([old.id, replacement.id])
    );
  });

  it('recognises a refinement and preserves the previous version', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const old = await createMemoryRecord(store, OWNER_ID, {
      kind: 'preference',
      content: 'Предпочитает короткие ответы.',
      skipEmbedding: true,
    });

    const refined = await createMemoryRecord(store, OWNER_ID, {
      kind: 'preference',
      content: 'Предпочитает короткие ответы и ясные формулировки без вводных фраз.',
      skipEmbedding: true,
    });

    expect(refined.supersededRecordId).toBe(old.id);
    const oldAfter = await getMemoryRecord(store, OWNER_ID, old.id);
    expect(oldAfter?.status).toBe('superseded');
    expect(oldAfter?.content).toBe('Предпочитает короткие ответы.');
  });

  it('marks a contradiction as uncertain instead of choosing a winner', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const original = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Бюджет проекта составляет 5000 рублей.',
      skipEmbedding: true,
    });

    const conflicting = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Бюджет проекта составляет 9000 рублей.',
      skipEmbedding: true,
    });

    expect(conflicting.status).toBe('uncertain');
    expect(conflicting.conflictRecordId).toBe(original.id);
    expect(conflicting.confidence).toBeLessThanOrEqual(0.45);

    const originalAfter = await getMemoryRecord(store, OWNER_ID, original.id);
    expect(originalAfter?.status).toBe('current');
    expect(originalAfter?.content).toContain('5000');
  });

  it('asks for a target instead of guessing when a replacement has no match', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    await expect(
      createMemoryRecord(store, OWNER_ID, {
        kind: 'memory',
        content: 'Совершенно новая тема вместо прежней.',
        possibleConflict: true,
        skipEmbedding: true,
      })
    ).rejects.toThrow('memory_replacement_ambiguous');

    expect(db.all('pierrot_decisions')).toHaveLength(0);
  });

  it('stores a record without an embedding and keeps lexical search working', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const record = await createMemoryRecord(store, OWNER_ID, {
      kind: 'saved',
      content: 'Отдельная подборка работ для институций.',
    });

    expect(record.indexingStatus).toBe('pending');
    expect(db.all('pierrot_memory_embeddings')[0]?.status).toBe('pending');

    const found = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'институций',
      lexicalOnly: true,
      limit: 5,
    });

    expect(found.records.map((item) => item.id)).toContain(record.id);
    expect(found.lexicalFallback).toBe(true);
  });

  it('uses semantic results in Russian and English, even without shared words', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const russian = await createMemoryRecord(store, OWNER_ID, {
      kind: 'preference',
      content: 'Не любит декоративный шум и визуальную суету.',
      skipEmbedding: true,
    });
    const english = await createMemoryRecord(store, OWNER_ID, {
      kind: 'preference',
      content: 'Prefers restrained typography and quiet layouts.',
      skipEmbedding: true,
    });

    const requested: string[] = [];

    db.onRpc('pierrot_memory_search', (params) => {
      const query = String(params.p_query_text || '');
      requested.push(query);
      const decisionId = /сдержанн|restrained/i.test(query) ? [russian.id, english.id] : [];

      return {
        data: decisionId.map((id, index) => ({
          decision_id: id,
          similarity: 0.91 - index * 0.05,
          lexical_score: 0,
          combined_score: 0.9 - index * 0.05,
        })),
        error: null,
      };
    });

    const ru = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'принципы сдержанности',
      embeddingClient: fakeEmbeddingClient(),
      limit: 5,
    });
    expect(ru.semanticUsed).toBe(true);
    expect(ru.records.map((record) => record.id)).toContain(russian.id);
    expect(requested[0]).toBe('принципы сдержанности');

    const en = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'restrained taste',
      embeddingClient: fakeEmbeddingClient(),
      limit: 5,
    });
    expect(en.records.map((record) => record.id)).toContain(english.id);
  });

  it('searches active memory by default and archive only when requested', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Активный принцип: говорить кратко.',
      skipEmbedding: true,
    });
    await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Активный принцип: сначала факт, потом вывод.',
      skipEmbedding: true,
    });
    await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Активный принцип: не льстить читателю.',
      skipEmbedding: true,
    });

    const archived = await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Старый принцип: писать длинно.',
      skipEmbedding: true,
    });
    await updateMemoryRecord(store, OWNER_ID, archived.id, {
      status: 'archived',
      archivedReason: 'owner_forget',
    });

    const active = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'принцип',
      lexicalOnly: true,
      limit: 10,
    });
    expect(active.records.some((record) => record.id === archived.id)).toBe(false);
    expect(active.records.every((record) => record.status === 'current')).toBe(true);

    const history = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'длинно',
      historyOnly: true,
      lexicalOnly: true,
      limit: 10,
    });
    expect(history.records.some((record) => record.id === archived.id)).toBe(true);
    expect(history.archiveSearched).toBe(true);

    const onlyArchived = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'принцип',
      statuses: ['archived'],
      lexicalOnly: true,
      limit: 10,
    });
    expect(onlyArchived.records.every((record) => record.status === 'archived')).toBe(true);
  });

  it('completes tasks, archives notes and restores from the archive', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const task = await createMemoryRecord(store, OWNER_ID, {
      kind: 'task',
      content: 'Подготовить институциональное письмо.',
      skipEmbedding: true,
    });
    const completed = await updateMemoryRecord(store, OWNER_ID, task.id, {
      status: 'completed',
      archivedReason: 'completed',
    });
    expect(completed.status).toBe('completed');

    const note = await createMemoryRecord(store, OWNER_ID, {
      kind: 'saved',
      content: 'Идея для подборки.',
      skipEmbedding: true,
    });
    const archived = await updateMemoryRecord(store, OWNER_ID, note.id, {
      status: 'archived',
      archivedReason: 'owner_archive',
    });
    expect(archived.status).toBe('archived');
    expect(archived.archivedReason).toBe('owner_archive');

    const restored = await restoreMemoryRecord(store, OWNER_ID, note.id);
    expect(restored.status).toBe('current');
    expect(restored.archivedReason).toBeNull();
  });

  it('keeps “забудь” archival and makes permanent deletion explicit', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    expect(detectMemoryIntent('Забудь про старый черновик')).toMatchObject({
      action: 'forget',
      permanent: false,
    });
    expect(detectMemoryIntent('Удали навсегда старый черновик')).toMatchObject({
      action: 'delete',
      permanent: true,
    });

    const record = await createMemoryRecord(store, OWNER_ID, {
      kind: 'saved',
      content: 'Старый черновик для статьи.',
      skipEmbedding: true,
    });
    await indexMemoryEmbedding(store, {
      decisionId: record.id,
      userId: OWNER_ID,
      text: `${record.title}\n${record.content}`,
      client: fakeEmbeddingClient(),
    });

    const forgotten = await updateMemoryRecord(store, OWNER_ID, record.id, {
      status: 'archived',
      archivedReason: 'owner_forget',
    });
    expect(forgotten.status).toBe('archived');
    expect(await getMemoryRecord(store, OWNER_ID, record.id)).not.toBeNull();

    await deleteMemoryRecord(store, OWNER_ID, record.id);
    expect(await getMemoryRecord(store, OWNER_ID, record.id)).toBeNull();
    expect(db.all('pierrot_memory_embeddings')).toHaveLength(0);
  });

  it('previews cleanup candidates without changing anything', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const stale = await createMemoryRecord(store, OWNER_ID, {
      kind: 'saved',
      content: 'Заметка о выставке в галерее.',
      importance: 0.3,
      skipEmbedding: true,
    });
    const row = db.all('pierrot_decisions').find((item) => item.id === stale.id);
    if (row) row.updated_at = isoDaysAgo(45);

    const preview = await runMemorySteward(store, OWNER_ID, { apply: false });
    expect(preview.candidates.some((candidate) => candidate.recordIds.includes(stale.id))).toBe(
      true
    );
    expect((await getMemoryRecord(store, OWNER_ID, stale.id))?.status).toBe('current');

    const applied = await runMemorySteward(store, OWNER_ID, { apply: true });
    expect(applied.applied.length).toBeGreaterThan(0);
    expect((await getMemoryRecord(store, OWNER_ID, stale.id))?.status).toBe('archived');
  });

  it('does not leak one owner’s memory to another user', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    await createMemoryRecord(store, OTHER_USER_ID, {
      kind: 'memory',
      content: 'Чужая приватная запись.',
      skipEmbedding: true,
    });

    expect(await listMemoryRecords(store, { userId: OWNER_ID, includeArchive: true })).toEqual([]);

    const result = await searchMemory(store, {
      userId: OWNER_ID,
      query: 'приватная',
      lexicalOnly: true,
    });
    expect(result.records).toEqual([]);
  });

  it('builds a two-level context with permanent core and open tasks', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    await createMemoryRecord(store, OWNER_ID, {
      kind: 'preference',
      content: 'Предпочитает короткие ответы.',
      skipEmbedding: true,
    });
    await createMemoryRecord(store, OWNER_ID, {
      kind: 'reminder',
      content: 'Проверить LinkedIn.',
      reviewAt: '2026-12-01T09:00:00.000Z',
      skipEmbedding: true,
    });

    const context = await buildMemoryContext(store, OWNER_ID);
    expect(context).toContain('OWNER MEMORY');
    expect(context).toContain('PERMANENT CORE');
    expect(context).toContain('короткие ответы');
    expect(context).toContain('Проверить LinkedIn');
    expect(context).toContain('due 2026-12-01');
    expect(context).toContain('lexical fallback');
  });
});
