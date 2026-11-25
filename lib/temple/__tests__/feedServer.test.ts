import {
  TEMPLE_AGGREGATE_PAGE_SIZE,
  TEMPLE_INCOMPLETE_OR_FILTER,
  TEMPLE_INFRASTRUCTURE_OR_FILTER,
  TEMPLE_RITUAL_OR_FILTER,
  TEMPLE_TRACE_LIMIT,
  type TempleFeedPayload,
  type TempleLogRow,
} from '@/lib/temple/feed';
import {
  fetchRecentRitualRows,
  fetchWindowRitualRows,
  loadTempleFeed,
  resolveTempleFeed,
  type TempleFeedQueryClient,
} from '@/lib/temple/feed.server';
import { TtlCache } from '@/lib/temple/feedCache';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');

type FakeCall = {
  table: string;
  selectColumns: string;
  head: boolean;
  orFilter: string | null;
  gte: string | null;
  lte: string | null;
  orders: Array<{ column: string; ascending: boolean }>;
  limit: number | null;
  range: [number, number] | null;
};

type FakeResult = {
  data?: TempleLogRow[] | null;
  count?: number | null;
  error?: { message: string } | null;
};

class FakeQuery {
  private call: FakeCall;

  constructor(
    private readonly client: FakeClient,
    table: string
  ) {
    this.call = {
      table,
      selectColumns: '',
      head: false,
      orFilter: null,
      gte: null,
      lte: null,
      orders: [],
      limit: null,
      range: null,
    };
  }

  select(columns: string, options?: { count?: string; head?: boolean }) {
    this.call.selectColumns = columns;
    this.call.head = options?.head === true;
    return this;
  }

  or(filter: string) {
    this.call.orFilter = filter;
    return this;
  }

  gte(column: string, value: string) {
    if (column === 'created_at') this.call.gte = value;
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

  range(from: number, to: number) {
    this.call.range = [from, to];
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

  constructor(private readonly resolver: (call: FakeCall) => FakeResult) {}

  from(table: string) {
    return new FakeQuery(this, table);
  }

  resolve(call: FakeCall): FakeResult {
    return this.resolver(call);
  }
}

function row(
  id: string,
  eventType: string,
  createdAt: string,
  author = 'Pilgrim',
  isPublicIdentity = false
): TempleLogRow {
  return {
    id,
    event_type: eventType,
    author,
    message: `${eventType} message`,
    created_at: createdAt,
    is_public_identity: isPublicIdentity,
  };
}

function ritualRows(): TempleLogRow[] {
  return [
    row('older', 'ASH', '2026-11-20T10:00:00.000Z', 'Alice', true),
    row('newer', 'VIGIL_SPARK', '2026-11-24T11:00:00.000Z', 'Alice', true),
  ];
}

function clientFor(rows: TempleLogRow[], counts?: {
  infrastructure?: number;
  incomplete?: number;
}): FakeClient {
  return new FakeClient((call) => {
    if (call.head) {
      if (call.orFilter === TEMPLE_INFRASTRUCTURE_OR_FILTER) {
        return { count: counts?.infrastructure ?? 4 };
      }
      if (call.orFilter === TEMPLE_INCOMPLETE_OR_FILTER) {
        return { count: counts?.incomplete ?? 3 };
      }
      return { count: rows.length + 7 };
    }

    if (call.orFilter !== TEMPLE_RITUAL_OR_FILTER) {
      return { data: [], error: null };
    }

    if (call.selectColumns.includes('audio_url')) {
      return { data: rows, error: null };
    }

    if (call.range && call.range[0] > 0) {
      return { data: [], error: null };
    }

    return { data: rows, error: null };
  });
}

describe('server trace query', () => {
  it('filters and orders ritual types in the database, excluding entry/nav by omission', async () => {
    const client = clientFor(ritualRows());

    await fetchRecentRitualRows(
      client as unknown as TempleFeedQueryClient,
      NOW
    );

    const call = client.calls[0];

    expect(call.table).toBe('temple_log');
    expect(call.orFilter).toBe(TEMPLE_RITUAL_OR_FILTER);
    expect(call.orFilter).not.toContain('event_type.ilike.ENTER');
    expect(call.orFilter).not.toContain('event_type.ilike.NAV');
    expect(call.orders).toEqual([{ column: 'created_at', ascending: false }]);
    expect(call.limit).toBeGreaterThanOrEqual(TEMPLE_TRACE_LIMIT);
    expect(call.lte).toBe(new Date(NOW).toISOString());
  });
});

describe('server Chronicles query', () => {
  it('reads the full inclusive window with database-side filtering and paging', async () => {
    const client = clientFor(ritualRows());
    const windowStart = NOW - 30 * 24 * 60 * 60 * 1000;

    const result = await fetchWindowRitualRows(
      client as unknown as TempleFeedQueryClient,
      windowStart,
      NOW
    );

    const call = client.calls[0];

    expect(result.rows).toHaveLength(2);
    expect(call.orFilter).toBe(TEMPLE_RITUAL_OR_FILTER);
    expect(call.gte).toBe(new Date(windowStart).toISOString());
    expect(call.lte).toBe(new Date(NOW).toISOString());
    expect(call.orders).toEqual([
      { column: 'created_at', ascending: false },
      { column: 'id', ascending: false },
    ]);
    expect(call.range).toEqual([0, TEMPLE_AGGREGATE_PAGE_SIZE - 1]);
  });
});

describe('feed assembly and cache behaviour', () => {
  it('returns no more than seven traces and aggregates the full window', async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row(
        `row-${index}`,
        index % 2 === 0 ? 'ash' : 'VIGIL_SPARK',
        new Date(NOW - index * 60_000).toISOString(),
        index === 0 ? 'Alice' : 'Pilgrim',
        index === 0
      )
    );
    const client = clientFor(rows, { infrastructure: 9, incomplete: 2 });

    const payload = await loadTempleFeed(
      client as unknown as TempleFeedQueryClient,
      { nowMs: NOW }
    );

    expect(payload.data).toHaveLength(TEMPLE_TRACE_LIMIT);
    expect(payload.data[0].canonical_type).toBe('ASH');
    expect(payload.stats.completedRituals).toBe(12);
    expect(payload.stats.vigilSparks).toBe(6);
    expect(payload.stats.namedAuthors).toBe(1);
    expect(payload.meta.stale).toBe(false);
    expect(payload.meta).not.toHaveProperty('ttlSeconds');
    expect(payload.stats).not.toHaveProperty('excluded');
  });

  it('reuses a fresh cache without calling the database', async () => {
    const cache = new TtlCache<TempleFeedPayload>(60_000, () => NOW);
    const seedClient = clientFor(ritualRows());
    const payload = await loadTempleFeed(
      seedClient as unknown as TempleFeedQueryClient,
      { nowMs: NOW }
    );

    cache.set(payload, NOW);

    const getClient = jest.fn(() => {
      throw new Error('database should not be called');
    });

    const result = await resolveTempleFeed({ getClient, nowMs: NOW + 1_000, cache });

    expect(result.cache).toBe('hit');
    expect(result.payload?.data).toHaveLength(2);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('keeps the last known good payload when the database fails', async () => {
    const cache = new TtlCache<TempleFeedPayload>(1_000, () => NOW);
    const seedClient = clientFor(ritualRows());
    const payload = await loadTempleFeed(
      seedClient as unknown as TempleFeedQueryClient,
      { nowMs: NOW }
    );

    cache.set(payload, NOW);

    const failingClient = new FakeClient(() => ({
      error: { message: 'database unavailable' },
    }));

    const result = await resolveTempleFeed({
      getClient: () => failingClient as unknown as TempleFeedQueryClient,
      nowMs: NOW + 5_000,
      cache,
    });

    expect(result.cache).toBe('stale');
    expect(result.error).toBe('database unavailable');
    expect(result.payload?.data).toHaveLength(2);
    expect(result.payload?.meta.stale).toBe(true);
    expect(result.payload?.meta).not.toHaveProperty('cache');
  });

  it('refreshes after invalidation and returns an error only when no snapshot exists', async () => {
    const cache = new TtlCache<TempleFeedPayload>(60_000, () => NOW);
    const firstClient = clientFor(ritualRows());
    const first = await resolveTempleFeed({
      getClient: () => firstClient as unknown as TempleFeedQueryClient,
      nowMs: NOW,
      cache,
    });

    expect(first.cache).toBe('miss');

    cache.invalidate();

    const secondClient = clientFor(ritualRows());
    const second = await resolveTempleFeed({
      getClient: () => secondClient as unknown as TempleFeedQueryClient,
      nowMs: NOW + 1,
      cache,
    });

    expect(second.cache).toBe('miss');
    expect(secondClient.calls.length).toBeGreaterThan(0);

    cache.invalidate();

    const failingClient = new FakeClient(() => ({
      error: { message: 'down' },
    }));
    const noSnapshot = await resolveTempleFeed({
      getClient: () => failingClient as unknown as TempleFeedQueryClient,
      nowMs: NOW + 2_000,
      cache,
    });

    expect(noSnapshot.cache).toBe('error');
    expect(noSnapshot.payload).toBeNull();
  });
});
