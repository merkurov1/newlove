/** @jest-environment node */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '../testSupport/fakeSupabase';
import { BRAIN_STATUS_FRESH_TTL_MS, computeBrainStatus, loadBrainStatus } from '../brainStatus';
import { clearLocalBrainSnapshot } from '../brainCache';
import { createMemoryRecord } from '../store';

const originalRag = process.env.PIERROT_RAG_ENABLED;

function decision(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: OWNER_ID,
    kind: 'memory',
    title: 'Запись',
    content: 'Содержание',
    status: 'current',
    importance: 0.7,
    confidence: 0.9,
    tags: [],
    source_refs: [],
    created_at: now,
    updated_at: now,
    valid_from: now,
    ...overrides,
  };
}

describe('Brain status', () => {
  beforeEach(() => {
    process.env.PIERROT_RAG_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalRag === undefined) delete process.env.PIERROT_RAG_ENABLED;
    else process.env.PIERROT_RAG_ENABLED = originalRag;
  });

  it('computes Stable from real counts without an AI call', async () => {
    const db = new FakeSupabase();
    db.seed('pierrot_decisions', [
      decision({ kind: 'memory', importance: 0.9 }),
      decision({ kind: 'preference' }),
    ]);

    const status = await computeBrainStatus(db.asClient(), OWNER_ID, { detailed: true });

    expect(status.state).toBe('stable');
    expect(status.storageAvailable).toBe(true);
    expect(status.retrievalAvailable).toBe(true);
    expect(status.metrics.activeRecords).toBe(2);
    expect(status.detail?.temporalMemory).toBe('ok');
    expect(status.checkedAt).toBeTruthy();
  });

  it('reports Updating while embeddings are pending', async () => {
    const db = new FakeSupabase();
    const record = decision({ id: crypto.randomUUID() });
    db.seed('pierrot_decisions', [record]);
    db.seed('pierrot_memory_embeddings', [
      {
        decision_id: record.id,
        user_id: OWNER_ID,
        status: 'pending',
        model_id: 'baai/bge-m3',
        dimensions: 1024,
        content_hash: 'x',
      },
    ]);

    const status = await computeBrainStatus(db.asClient(), OWNER_ID);
    expect(status.state).toBe('updating');
    expect(status.metrics.embeddingsPending).toBe(1);
    expect(status.summary).toContain('не полностью проиндексированы');
  });

  it('reports Attention for unresolved contradictions', async () => {
    const db = new FakeSupabase();
    db.seed('pierrot_decisions', [decision({ status: 'uncertain' })]);

    const status = await computeBrainStatus(db.asClient(), OWNER_ID);
    expect(status.state).toBe('attention');
    expect(status.metrics.conflicts).toBe(1);
    expect(status.issues.some((issue) => issue.code === 'conflicts')).toBe(true);
  });

  it('reports Degraded when storage is unavailable', async () => {
    const db = new FakeSupabase();
    db.failTable('pierrot_decisions');

    const status = await computeBrainStatus(db.asClient(), OWNER_ID);
    expect(status.state).toBe('degraded');
    expect(status.storageAvailable).toBe(false);
    expect(status.summary).toContain('Проверка не выполнена');
  });

  it('serves a cached snapshot and invalidates it after a meaningful write', async () => {
    const db = new FakeSupabase();
    db.seed('pierrot_decisions', [decision()]);
    const store = db.asClient();

    const first = await loadBrainStatus(store, OWNER_ID, { force: true });
    expect(first.metrics.activeRecords).toBe(1);

    // A direct insert that does not go through the memory store must not
    // invalidate the snapshot; the start screen still sees the cached value.
    db.rows('pierrot_decisions').push(decision());
    const cached = await loadBrainStatus(store, OWNER_ID);
    expect(cached.checkedAt).toBe(first.checkedAt);
    expect(cached.metrics.activeRecords).toBe(1);

    // A real memory write invalidates the snapshot.
    await createMemoryRecord(store, OWNER_ID, {
      kind: 'memory',
      content: 'Новая запись через штатный путь.',
      skipEmbedding: true,
    });
    const refreshed = await loadBrainStatus(store, OWNER_ID);
    expect(refreshed.metrics.activeRecords).toBe(3);
  });

  it('keeps a snapshot fresh for 24 hours and recomputes after expiry', async () => {
    expect(BRAIN_STATUS_FRESH_TTL_MS).toBe(24 * 60 * 60 * 1000);

    const db = new FakeSupabase();
    db.seed('pierrot_decisions', [decision()]);
    const store = db.asClient();

    clearLocalBrainSnapshot(OWNER_ID);
    const first = await loadBrainStatus(store, OWNER_ID, { force: true });
    expect(first.metrics.activeRecords).toBe(1);

    const rows = db.rows('pierrot_brain_status_snapshots');
    expect(rows).toHaveLength(1);

    rows[0].checked_at = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    clearLocalBrainSnapshot(OWNER_ID);
    const cached = await loadBrainStatus(store, OWNER_ID);
    expect(cached.checkedAt).toBe(rows[0].checked_at);

    // A direct insert bypasses the store invalidation, but the 24-hour expiry
    // must still force a coherent recomputation on the next new-chat screen.
    rows[0].checked_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.rows('pierrot_decisions').push(decision());
    clearLocalBrainSnapshot(OWNER_ID);

    const refreshed = await loadBrainStatus(store, OWNER_ID);
    expect(refreshed.metrics.activeRecords).toBe(2);
  });

  it('keeps the last known snapshot when a refresh cannot reach storage', async () => {
    const db = new FakeSupabase();
    db.seed('pierrot_decisions', [decision()]);
    const store = db.asClient();

    const first = await loadBrainStatus(store, OWNER_ID, { force: true });
    expect(first.state).toBe('stable');

    db.failTable('pierrot_decisions');
    const fallback = await loadBrainStatus(store, OWNER_ID, { force: true });

    expect(fallback.state).toBe('degraded');
    expect(fallback.stale).toBe(true);
    expect(fallback.metrics.activeRecords).toBe(first.metrics.activeRecords);
    expect(fallback.summary).toContain('последнее известное состояние');
  });

  it('does not report Stable when retrieval is disabled', async () => {
    process.env.PIERROT_RAG_ENABLED = 'false';
    const db = new FakeSupabase();
    db.seed('pierrot_decisions', [decision()]);

    const status = await computeBrainStatus(db.asClient(), OWNER_ID);
    expect(status.state).toBe('degraded');
    expect(status.retrievalAvailable).toBe(false);
  });
});
