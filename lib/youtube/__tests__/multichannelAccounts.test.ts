/** @jest-environment node */

/**
 * Stateful integration tests for the multi-account / multi-channel model.
 * They exercise the real persistence helpers against a tiny in-memory
 * Supabase-compatible table store, so account A and B, several channels and
 * shared project bindings are verified together instead of as isolated mocks.
 */

type Row = Record<string, unknown>;
type Filter = { type: 'eq' | 'in'; column: string; value: unknown };

type Table = {
  rows: Row[];
  nextId: number;
};

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) =>
    filter.type === 'eq'
      ? row[filter.column] === filter.value
      : Array.isArray(filter.value) && filter.value.includes(row[filter.column])
  );
}

function createStore() {
  const tables = new Map<string, Table>();
  let sequence = 0;

  function table(name: string): Table {
    if (!tables.has(name)) tables.set(name, { rows: [], nextId: 1 });
    return tables.get(name) as Table;
  }

  function from(name: string) {
    const current = table(name);
    let mode: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: Row | Row[] = {};
    let conflict: string[] = [];
    const filters: Filter[] = [];
    let orderColumn: string | null = null;
    let orderAscending = true;

    function selectedRows(): Row[] {
      const rows = current.rows.filter((row) => matches(row, filters));

      if (orderColumn) {
        rows.sort((first, second) => {
          const a = String(first[orderColumn as string] ?? '');
          const b = String(second[orderColumn as string] ?? '');
          return orderAscending ? a.localeCompare(b) : b.localeCompare(a);
        });
      }

      return rows.map((row) => ({ ...row }));
    }

    function run(): { data: Row | Row[] | null; error: { message: string } | null } {
      if (mode === 'update') {
        const updated: Row[] = [];
        for (const row of current.rows) {
          if (!matches(row, filters)) continue;
          Object.assign(row, payload as Row, { updated_at: new Date().toISOString() });
          updated.push({ ...row });
        }
        return { data: updated, error: null };
      }

      if (mode === 'insert') {
        const values = Array.isArray(payload) ? payload : [payload];
        const inserted = values.map((value) => {
          sequence += 1;
          const row = { id: value.id ?? `row-${sequence}`, ...value };
          current.rows.push(row);
          return { ...row };
        });
        return { data: inserted, error: null };
      }

      if (mode === 'upsert') {
        const values = Array.isArray(payload) ? payload : [payload];
        const result = values.map((value) => {
          const existing = current.rows.find((row) =>
            conflict.every((column) => row[column] === value[column])
          );

          if (existing) {
            Object.assign(existing, value);
            return { ...existing };
          }

          sequence += 1;
          const row = { id: value.id ?? `row-${sequence}`, ...value };
          current.rows.push(row);
          return { ...row };
        });
        return { data: result, error: null };
      }

      return { data: selectedRows(), error: null };
    }

    const builder = {
      select() {
        return builder;
      },
      update(value: Row) {
        mode = 'update';
        payload = value;
        return builder;
      },
      insert(value: Row) {
        mode = 'insert';
        payload = value;
        return builder;
      },
      upsert(value: Row | Row[], options?: { onConflict?: string }) {
        mode = 'upsert';
        payload = value;
        conflict = (options?.onConflict ?? 'id').split(',').map((item) => item.trim());
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ type: 'eq', column, value });
        return builder;
      },
      in(column: string, value: unknown[]) {
        filters.push({ type: 'in', column, value });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderColumn = column;
        orderAscending = options?.ascending !== false;
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle: async () => {
        const result = run();
        const rows = Array.isArray(result.data) ? result.data : [];
        return { data: rows[0] ?? null, error: result.error };
      },
      single: async () => {
        const result = run();
        const rows = Array.isArray(result.data) ? result.data : [];
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: 'no rows' } };
      },
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        try {
          return Promise.resolve(run()).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };

    return builder;
  }

  return {
    store: { from: jest.fn((name: string) => from(name)) } as never,
    rows: (name: string) => table(name).rows,
  };
}

jest.mock('@/lib/analytics/website/providers/oauth', () => ({
  refreshGoogleAccessToken: jest.fn(),
  revokeGoogleToken: jest.fn(async () => true),
}));

jest.mock('@/lib/analytics/website/tokenCrypto', () => ({
  openSecret: jest.fn(() => 'refresh-secret'),
  sealSecret: jest.fn((value: string) => ({
    ciphertext: `sealed:${value}`,
    iv: 'iv',
    tag: 'tag',
    keyVersion: 'v1:test',
  })),
}));

import {
  bindChannelToProject,
  clearChannelTokenCache,
  disconnectOAuthConnection,
  listOAuthConnections,
  listProjectBindings,
  listYouTubeChannels,
  loadChannelAccessToken,
  replaceConnectionChannels,
  resolveProjectChannel,
  saveOAuthConnection,
} from '../channels';

const oauth = require('@/lib/analytics/website/providers/oauth') as {
  refreshGoogleAccessToken: jest.Mock;
  revokeGoogleToken: jest.Mock;
};

type Discovered = {
  channelId: string;
  title: string | null;
  handle: string | null;
  uploadsPlaylistId: string | null;
  thumbnailUrl: string | null;
  hiddenSubscriberCount: boolean;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
};

function channel(id: string, handle: string, title = handle): Discovered {
  return {
    channelId: id,
    title,
    handle,
    uploadsPlaylistId: `UU_${id}`,
    thumbnailUrl: null,
    hiddenSubscriberCount: false,
    subscriberCount: 1,
    viewCount: 2,
    videoCount: 3,
  };
}

const ACCOUNT_A = {
  email: 'Merckurov@gmail.com',
  id: 'google-a',
  name: 'Merkurov',
};

const ACCOUNT_B = {
  email: 'unframed@example.com',
  id: 'google-b',
  name: 'UNFRAMED',
};

async function connect(
  store: never,
  account: typeof ACCOUNT_A,
  channels: Discovered[],
  token: string | null = `refresh-${account.id}`
) {
  const connection = await saveOAuthConnection(store, {
    ownerId: 'owner-1',
    googleAccountEmail: account.email,
    googleAccountId: account.id,
    googleAccountName: account.name,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    sealed: token ? { ciphertext: token, iv: 'iv', tag: 'tag', keyVersion: 'v1:test' } : null,
  });

  const saved = await replaceConnectionChannels(store, {
    connectionId: connection.id,
    ownerId: 'owner-1',
    channels,
  });

  return { connection, channels: saved };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearChannelTokenCache();
});

describe('two independent Google accounts and shared channels', () => {
  it('connects A then B, persists every channel and routes projects independently', async () => {
    const fake = createStore();
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);
    const b = await connect(fake.store, ACCOUNT_B, [
      channel('UC_unframed', '@unframed-tv', 'UNFRAMED'),
      channel('UC_heart', '@heartandangel', 'Heart & Angel'),
    ]);

    const connections = await listOAuthConnections(fake.store, 'owner-1');
    const channels = await listYouTubeChannels(fake.store, 'owner-1');
    expect(connections).toHaveLength(2);
    expect(channels).toHaveLength(3);
    expect(new Set(channels.map((item) => item.connectionId))).toEqual(
      new Set([a.connection.id, b.connection.id])
    );

    const art = channels.find((item) => item.channelId === 'UC_art');
    const unframed = channels.find((item) => item.channelId === 'UC_unframed');
    const heart = channels.find((item) => item.channelId === 'UC_heart');
    expect(art && unframed && heart).toBeTruthy();

    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
      channelRecordId: art!.id,
    });
    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      channelRecordId: unframed!.id,
    });
    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'pierrot',
      channelRecordId: unframed!.id,
    });
    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'heart-and-angel',
      channelRecordId: heart!.id,
    });

    const [artRoute, unframedRoute, pierrotRoute, heartRoute] = await Promise.all([
      resolveProjectChannel(fake.store, 'owner-1', 'art-engine'),
      resolveProjectChannel(fake.store, 'owner-1', 'unframed'),
      resolveProjectChannel(fake.store, 'owner-1', 'pierrot'),
      resolveProjectChannel(fake.store, 'owner-1', 'heart-and-angel'),
    ]);

    expect(artRoute?.channel.channelId).toBe('UC_art');
    expect(unframedRoute?.channel.channelId).toBe('UC_unframed');
    expect(pierrotRoute?.channel.channelId).toBe('UC_unframed');
    expect(heartRoute?.channel.channelId).toBe('UC_heart');
    // @unframed-tv is one channel entity used by two projects.
    expect(unframedRoute?.channel.id).toBe(pierrotRoute?.channel.id);
    expect(unframedRoute?.connection.googleAccountEmail).toBe('unframed@example.com');
    expect(artRoute?.connection.googleAccountEmail).toBe('merckurov@gmail.com');
  });

  it('connects B then A with the same result and does not overwrite grant A', async () => {
    const fake = createStore();
    const b = await connect(fake.store, ACCOUNT_B, [
      channel('UC_unframed', '@unframed-tv', 'UNFRAMED'),
      channel('UC_heart', '@heartandangel', 'Heart & Angel'),
    ]);
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);

    const connections = await listOAuthConnections(fake.store, 'owner-1');
    expect(connections).toHaveLength(2);

    const raw = fake.rows('youtube_oauth_connections');
    const rowA = raw.find((row) => row.id === a.connection.id);
    const rowB = raw.find((row) => row.id === b.connection.id);
    expect(rowA?.token_ciphertext).toBe('refresh-google-a');
    expect(rowB?.token_ciphertext).toBe('refresh-google-b');
  });

  it('keeps one channel bound to two projects through two active bindings', async () => {
    const fake = createStore();
    const b = await connect(fake.store, ACCOUNT_B, [
      channel('UC_unframed', '@unframed-tv', 'UNFRAMED'),
    ]);
    const unframed = b.channels.find((item) => item.channelId === 'UC_unframed');

    const first = await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      channelRecordId: unframed!.id,
    });
    const second = await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'pierrot',
      channelRecordId: unframed!.id,
    });

    expect(first.channelRecordId).toBe(second.channelRecordId);
    const bindings = await listProjectBindings(fake.store, 'owner-1');
    expect(bindings.filter((item) => item.isActive)).toHaveLength(2);

    // Re-binding the same project updates the existing row instead of adding
    // a second active row.
    const again = await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      channelRecordId: unframed!.id,
    });
    expect(again.id).toBe(first.id);
    expect(
      (await listProjectBindings(fake.store, 'owner-1')).filter((item) => item.isActive)
    ).toHaveLength(2);
  });

  it('disconnecting account A leaves account B channels, token and bindings intact', async () => {
    const fake = createStore();
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);
    const b = await connect(fake.store, ACCOUNT_B, [
      channel('UC_unframed', '@unframed-tv', 'UNFRAMED'),
      channel('UC_heart', '@heartandangel', 'Heart & Angel'),
    ]);
    const art = a.channels.find((item) => item.channelId === 'UC_art');
    const unframed = b.channels.find((item) => item.channelId === 'UC_unframed');
    const heart = b.channels.find((item) => item.channelId === 'UC_heart');

    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
      channelRecordId: art!.id,
    });
    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'unframed',
      channelRecordId: unframed!.id,
    });
    await bindChannelToProject(fake.store, {
      ownerId: 'owner-1',
      projectSlug: 'heart-and-angel',
      channelRecordId: heart!.id,
    });

    const result = await disconnectOAuthConnection(fake.store, {
      ownerId: 'owner-1',
      connectionId: a.connection.id,
    });
    expect(result.revoked).toBe(true);

    const connections = await listOAuthConnections(fake.store, 'owner-1');
    const connectionA = connections.find((item) => item.id === a.connection.id);
    const connectionB = connections.find((item) => item.id === b.connection.id);
    expect(connectionA?.status).toBe('revoked');
    expect(connectionA?.hasRefreshToken).toBe(false);
    expect(connectionB?.status).toBe('connected');
    expect(connectionB?.hasRefreshToken).toBe(true);

    const channels = await listYouTubeChannels(fake.store, 'owner-1');
    expect(channels.find((item) => item.channelId === 'UC_art')?.status).toBe('disconnected');
    expect(channels.find((item) => item.channelId === 'UC_unframed')?.status).toBe('active');
    expect(channels.find((item) => item.channelId === 'UC_heart')?.status).toBe('active');

    expect(await resolveProjectChannel(fake.store, 'owner-1', 'art-engine')).toBeNull();
    expect(
      (await resolveProjectChannel(fake.store, 'owner-1', 'unframed'))?.channel.channelId
    ).toBe('UC_unframed');
    expect(
      (await resolveProjectChannel(fake.store, 'owner-1', 'heart-and-angel'))?.channel.channelId
    ).toBe('UC_heart');
  });

  it('retains the sealed token when account A reconnects without a refresh token', async () => {
    const fake = createStore();
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);

    const reconnected = await saveOAuthConnection(fake.store, {
      ownerId: 'owner-1',
      googleAccountEmail: ACCOUNT_A.email,
      googleAccountId: ACCOUNT_A.id,
      googleAccountName: ACCOUNT_A.name,
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      sealed: null,
    });

    expect(reconnected.id).toBe(a.connection.id);
    expect(reconnected.hasRefreshToken).toBe(true);
    const raw = fake.rows('youtube_oauth_connections').find((row) => row.id === a.connection.id);
    expect(raw?.token_ciphertext).toBe('refresh-google-a');

    const connections = await listOAuthConnections(fake.store, 'owner-1');
    expect(connections).toHaveLength(1);
  });

  it('refuses to bind a disconnected channel or a grant that needs reauthorization', async () => {
    const fake = createStore();
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);
    const art = a.channels.find((item) => item.channelId === 'UC_art');

    const connectionRow = fake
      .rows('youtube_oauth_connections')
      .find((row) => row.id === a.connection.id);
    expect(connectionRow).toBeTruthy();
    connectionRow!.status = 'needs_reauthorization';

    await expect(
      bindChannelToProject(fake.store, {
        ownerId: 'owner-1',
        projectSlug: 'art-engine',
        channelRecordId: art!.id,
      })
    ).rejects.toMatchObject({ code: 'needs_reauthorization' });

    connectionRow!.status = 'connected';
    await disconnectOAuthConnection(fake.store, {
      ownerId: 'owner-1',
      connectionId: a.connection.id,
    });

    await expect(
      bindChannelToProject(fake.store, {
        ownerId: 'owner-1',
        projectSlug: 'art-engine',
        channelRecordId: art!.id,
      })
    ).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('does not leak or reuse another owner channel when binding', async () => {
    const fake = createStore();
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);
    const art = a.channels[0];

    await expect(
      bindChannelToProject(fake.store, {
        ownerId: 'owner-2',
        projectSlug: 'art-engine',
        channelRecordId: art.id,
      })
    ).rejects.toMatchObject({ code: 'resource_not_found' });

    expect(await listOAuthConnections(fake.store, 'owner-2')).toHaveLength(0);
  });

  it('keeps the same Google email as a separate grant per owner', async () => {
    const fake = createStore();
    const a = await saveOAuthConnection(fake.store, {
      ownerId: 'owner-1',
      googleAccountEmail: ACCOUNT_A.email,
      googleAccountId: ACCOUNT_A.id,
      googleAccountName: ACCOUNT_A.name,
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      sealed: { ciphertext: 'owner-1-token', iv: 'iv', tag: 'tag', keyVersion: 'v1:test' },
    });
    const b = await saveOAuthConnection(fake.store, {
      ownerId: 'owner-2',
      googleAccountEmail: ACCOUNT_A.email,
      googleAccountId: ACCOUNT_A.id,
      googleAccountName: ACCOUNT_A.name,
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      sealed: { ciphertext: 'owner-2-token', iv: 'iv', tag: 'tag', keyVersion: 'v1:test' },
    });

    expect(a.id).not.toBe(b.id);
    expect(await listOAuthConnections(fake.store, 'owner-1')).toHaveLength(1);
    expect(await listOAuthConnections(fake.store, 'owner-2')).toHaveLength(1);
    expect(
      fake.rows('youtube_oauth_connections').find((row) => row.id === a.id)?.token_ciphertext
    ).toBe('owner-1-token');
    expect(
      fake.rows('youtube_oauth_connections').find((row) => row.id === b.id)?.token_ciphertext
    ).toBe('owner-2-token');
  });

  it('refreshes only the selected connection and leaves the other grant untouched', async () => {
    const fake = createStore();
    const a = await connect(fake.store, ACCOUNT_A, [
      channel('UC_art', '@merkurov-art', 'Merkurov Art'),
    ]);
    const b = await connect(fake.store, ACCOUNT_B, [
      channel('UC_unframed', '@unframed-tv', 'UNFRAMED'),
    ]);
    const unframed = b.channels.find((item) => item.channelId === 'UC_unframed');
    const art = a.channels.find((item) => item.channelId === 'UC_art');
    oauth.refreshGoogleAccessToken.mockResolvedValue({
      accessToken: 'access-token-b',
      refreshToken: null,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: null,
      tokenType: 'Bearer',
    });

    const token = await loadChannelAccessToken(fake.store, {
      ownerId: 'owner-1',
      channelRecordId: unframed.id,
    });

    expect(token.channel.channelId).toBe('UC_unframed');
    expect(token.connection.id).toBe(b.connection.id);
    expect(token.connection.id).not.toBe(a.connection.id);

    // Account A still point to its own record even though both channels exist.
    const stillA = await resolveProjectChannel(fake.store, 'owner-1', 'unframed');
    expect(stillA).toBeNull();
    expect(
      fake.rows('youtube_oauth_connections').find((row) => row.id === art?.connectionId)
    ).toBeTruthy();
  });
});
