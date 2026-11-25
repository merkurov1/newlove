import {
  TEMPLE_RITUAL_OR_FILTER,
  type TempleLogRow,
} from '@/lib/temple/feed';
import {
  fetchTempleChronicleRows,
  loadTempleChroniclesPage,
  type TempleChroniclesQueryClient,
} from '@/lib/temple/chronicles.server';
import {
  decodeTempleCursor,
  encodeTempleCursor,
} from '@/lib/temple/chronicles';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');

type FakeCall = {
  table: string;
  selectColumns: string;
  orFilters: string[];
  lte: string | null;
  orders: Array<{ column: string; ascending: boolean }>;
  limit: number | null;
};

type FakeResult = {
  data?: TempleLogRow[] | null;
  error?: { message: string } | null;
};

class FakeQuery {
  private call: FakeCall;

  constructor(private readonly client: FakeClient, table: string) {
    this.call = {
      table,
      selectColumns: '',
      orFilters: [],
      lte: null,
      orders: [],
      limit: null,
    };
  }

  select(columns: string) {
    this.call.selectColumns = columns;
    return this;
  }

  or(filter: string) {
    this.call.orFilters.push(filter);
    return this;
  }

  lte(column: string, value: string) {
    if (column === 'created_at') this.call.lte = value;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.call.orders.push({
      column,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(count: number) {
    this.call.limit = count;
    return this;
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    this.client.calls.push(this.call);
    return Promise.resolve(this.client.resolve(this.call)).then(
      onfulfilled,
      onrejected
    );
  }
}

class FakeClient {
  readonly calls: FakeCall[] = [];

  constructor(private readonly rows: TempleLogRow[]) {}

  from(table: string) {
    return new FakeQuery(this, table);
  }

  resolve(): FakeResult {
    return { data: this.rows, error: null };
  }
}

function row(
  id: string,
  eventType: string,
  createdAt: string,
  author = 'Anonymous',
  isPublicIdentity = false
): TempleLogRow {
  return {
    id,
    event_type: eventType,
    author,
    created_at: createdAt,
    is_public_identity: isPublicIdentity,
  };
}

describe('chronicle server query', () => {
  it('selects only allowlisted public columns and orders stably', async () => {
    const client = new FakeClient([
      row('a', 'ASH', '2026-11-24T11:00:00.000Z'),
    ]);

    await fetchTempleChronicleRows(
      client as unknown as TempleChroniclesQueryClient,
      { limit: 5, nowMs: NOW }
    );

    const call = client.calls[0];

    expect(call.table).toBe('temple_log');
    expect(call.selectColumns).toBe(
      'id,event_type,author,created_at,is_public_identity'
    );
    expect(call.selectColumns).not.toContain('message');
    expect(call.selectColumns).not.toContain('user_id');
    expect(call.orFilters).toEqual([TEMPLE_RITUAL_OR_FILTER]);
    expect(call.lte).toBe(new Date(NOW).toISOString());
    expect(call.orders).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
    expect(call.limit).toBe(6);
  });

  it('adds a keyset cursor filter for older pages', async () => {
    const client = new FakeClient([]);
    const cursor = encodeTempleCursor({
      occurredAt: '2026-11-24T10:00:00.000Z',
      id: 'trace-9',
    });

    await fetchTempleChronicleRows(
      client as unknown as TempleChroniclesQueryClient,
      { before: decodeTempleCursor(cursor), limit: 2, nowMs: NOW }
    );

    expect(client.calls[0].orFilters[1]).toBe(
      'created_at.lt.2026-11-24T10:00:00.000Z,and(created_at.eq.2026-11-24T10:00:00.000Z,id.lt.trace-9)'
    );
  });

  it('returns a page and rejects a tampered cursor', async () => {
    const client = new FakeClient([
      row('a', 'ASH', '2026-11-24T11:00:00.000Z'),
      row('b', 'CAST', '2026-11-24T10:00:00.000Z'),
    ]);

    const page = await loadTempleChroniclesPage(
      client as unknown as TempleChroniclesQueryClient,
      { limit: 1, nowMs: NOW }
    );

    expect(page.badCursor).toBe(false);
    expect(page.page.events.map((event) => event.id)).toEqual(['a']);
    expect(page.page.hasMore).toBe(true);

    const bad = await loadTempleChroniclesPage(
      client as unknown as TempleChroniclesQueryClient,
      { before: 'tampered', nowMs: NOW }
    );

    expect(bad.badCursor).toBe(true);
    expect(bad.page.events).toEqual([]);
  });
});
