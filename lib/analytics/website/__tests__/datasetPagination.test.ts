/** @jest-environment node */

import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { readRowsSafe } from '../dataset';

function eventRow(index: number) {
  return {
    id: `event-${String(index).padStart(5, '0')}`,
    conversation_id: 'conversation-1',
    event_name: 'message_sent',
    created_at: new Date(Date.UTC(2026, 10, 11, 0, 0, index)).toISOString(),
  };
}

describe('paginated internal analytics reads', () => {
  it('reads more than 1,000 rows across pages instead of truncating', async () => {
    const db = new FakeSupabase(['pierrot_events']);
    db.seed(
      'pierrot_events',
      Array.from({ length: 2500 }, (_, index) => eventRow(index))
    );

    const result = await readRowsSafe<Record<string, unknown>>(
      db.asClient(),
      'pierrot_events',
      (query) => query.eq('conversation_id', 'conversation-1'),
      { orderBy: 'id', pageSize: 1000 }
    );

    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(2500);
    expect(result.rows[0].id).toBe('event-00000');
    expect(result.rows[2499].id).toBe('event-02499');
  });

  it('distinguishes a query failure from a genuinely empty result', async () => {
    const failing = new FakeSupabase(['pierrot_events']);
    failing.failTable('pierrot_events');
    const failed = await readRowsSafe<Record<string, unknown>>(
      failing.asClient(),
      'pierrot_events',
      (query) => query,
      { orderBy: 'id' }
    );
    expect(failed.rows).toHaveLength(0);
    expect(failed.error).toContain('pierrot_events');

    const empty = new FakeSupabase(['pierrot_events']);
    const emptyResult = await readRowsSafe<Record<string, unknown>>(
      empty.asClient(),
      'pierrot_events',
      (query) => query,
      { orderBy: 'id' }
    );
    expect(emptyResult.rows).toHaveLength(0);
    expect(emptyResult.error).toBeNull();
  });

  it('keeps a stable order when pages are requested', async () => {
    const db = new FakeSupabase(['pierrot_events']);
    db.seed(
      'pierrot_events',
      Array.from({ length: 1201 }, (_, index) => eventRow(index))
    );

    const result = await readRowsSafe<Record<string, unknown>>(
      db.asClient(),
      'pierrot_events',
      (query) => query,
      { orderBy: 'id', pageSize: 500 }
    );

    const ids = result.rows.map((row) => String(row.id));
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(1201);
  });
});

// OWNER_ID is intentionally imported to keep this test aligned with the
// owner-scoped fake dataset used across the Pierrot analytics suites.
void OWNER_ID;
