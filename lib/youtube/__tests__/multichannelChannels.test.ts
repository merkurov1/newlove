/** @jest-environment node */

jest.mock('@/lib/analytics/website/providers/oauth', () => ({
  refreshGoogleAccessToken: jest.fn(),
  revokeGoogleToken: jest.fn(async () => undefined),
}));

jest.mock('@/lib/analytics/website/tokenCrypto', () => ({
  openSecret: jest.fn(() => 'refresh-secret'),
  sealSecret: jest.fn(() => ({
    ciphertext: 'rotated-cipher',
    iv: 'rotated-iv',
    tag: 'rotated-tag',
    keyVersion: 'v1:test',
  })),
}));

import {
  clearChannelTokenCache,
  disconnectOAuthConnection,
  loadChannelAccessToken,
} from '../channels';

const oauth = require('@/lib/analytics/website/providers/oauth') as {
  refreshGoogleAccessToken: jest.Mock;
  revokeGoogleToken: jest.Mock;
};

type Row = Record<string, unknown>;

function channelRow(overrides: Row = {}): Row {
  return {
    id: 'channel-record-1',
    connection_id: 'connection-1',
    owner_id: 'owner-1',
    channel_id: 'UC_art',
    title: 'Merkurov Art',
    handle: '@merkurov-art',
    uploads_playlist_id: 'UU_art',
    thumbnail_url: null,
    status: 'active',
    hidden_subscriber_count: false,
    subscriber_count: 10,
    view_count: 100,
    video_count: 2,
    last_synced_at: null,
    ...overrides,
  };
}

function connectionRow(overrides: Row = {}): Row {
  return {
    id: 'connection-1',
    owner_id: 'owner-1',
    google_account_id: 'google-1',
    google_account_email: 'mercurio@example.com',
    google_account_name: 'Merkurov',
    status: 'connected',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    token_ciphertext: 'cipher',
    token_iv: 'iv',
    token_tag: 'tag',
    token_key_version: 'v1:test',
    connected_at: '2026-01-01T00:00:00.000Z',
    last_checked_at: null,
    last_error_code: null,
    last_error_message: null,
    ...overrides,
  };
}

function fakeStore(input: {
  channel?: Row | null;
  connection?: Row | null;
  channels?: Row[];
}) {
  const updates: Array<{ table: string; payload: Row }> = [];
  const inserts: Array<{ table: string; payload: Row }> = [];

  function builder(table: string) {
    let action: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let payload: Row = {};
    const filters: Row = {};

    const resolveMaybe = () => {
      if (action !== 'select') return { data: null, error: null };
      if (table === 'youtube_channels') {
        const channel = input.channel ?? null;
        if (channel && filters.owner_id && filters.owner_id !== channel.owner_id) {
          return { data: null, error: null };
        }
        return { data: channel, error: null };
      }
      if (table === 'youtube_oauth_connections') {
        const connection = input.connection ?? null;
        if (connection && filters.owner_id && filters.owner_id !== connection.owner_id) {
          return { data: null, error: null };
        }
        return { data: connection, error: null };
      }
      return { data: null, error: null };
    };

    const resolveAwaited = () => {
      if (action === 'update') {
        updates.push({ table, payload });
        return { data: null, error: null };
      }
      if (action === 'insert' || action === 'upsert') {
        inserts.push({ table, payload });
        return { data: null, error: null };
      }
      if (table === 'youtube_channels') {
        return { data: input.channels ?? [], error: null };
      }
      return { data: [], error: null };
    };

    const api = {
      select() {
        return api;
      },
      update(value: Row) {
        action = 'update';
        payload = value;
        return api;
      },
      insert(value: Row) {
        action = 'insert';
        payload = value;
        return api;
      },
      upsert(value: Row) {
        action = 'upsert';
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return api;
      },
      in(column: string, value: unknown[]) {
        filters[column] = value;
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle: async () => resolveMaybe(),
      single: async () => resolveMaybe(),
      then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        try {
          return Promise.resolve(resolveAwaited()).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };

    return api;
  }

  return {
    store: { from: jest.fn((table: string) => builder(table)) } as never,
    updates,
    inserts,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearChannelTokenCache();
});

describe('multi-channel token lifecycle', () => {
  it('refreshes an access token, rotates the sealed refresh token and never returns it', async () => {
    const fake = fakeStore({ channel: channelRow(), connection: connectionRow() });
    oauth.refreshGoogleAccessToken.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'rotated-refresh-secret',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: null,
      tokenType: 'Bearer',
    });

    const result = await loadChannelAccessToken(fake.store, {
      ownerId: 'owner-1',
      channelRecordId: 'channel-record-1',
    });

    expect(result.accessToken).toBe('access-token');
    expect(JSON.stringify(result)).not.toContain('refresh-secret');
    expect(JSON.stringify(result)).not.toContain('rotated-refresh-secret');
    expect(fake.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'youtube_oauth_connections',
          payload: expect.objectContaining({ token_ciphertext: 'rotated-cipher' }),
        }),
      ])
    );
  });

  it('does not let another owner use the connection', async () => {
    const fake = fakeStore({ channel: channelRow(), connection: connectionRow() });

    await expect(
      loadChannelAccessToken(fake.store, {
        ownerId: 'someone-else',
        channelRecordId: 'channel-record-1',
      })
    ).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('requires reauthorization when Google rejects the refresh token', async () => {
    const fake = fakeStore({ channel: channelRow(), connection: connectionRow() });
    const rejected = Object.assign(new Error('invalid_grant'), { code: 'invalid_grant' });
    oauth.refreshGoogleAccessToken.mockRejectedValue(rejected);

    await expect(
      loadChannelAccessToken(fake.store, {
        ownerId: 'owner-1',
        channelRecordId: 'channel-record-1',
      })
    ).rejects.toMatchObject({ code: 'needs_reauthorization' });

    expect(fake.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'youtube_oauth_connections',
          payload: expect.objectContaining({ status: 'needs_reauthorization' }),
        }),
      ])
    );
  });

  it('revokes the Google grant and clears the local sealed token and bindings', async () => {
    const fake = fakeStore({
      channel: channelRow(),
      connection: connectionRow(),
      channels: [{ id: 'channel-record-1' }],
    });

    const result = await disconnectOAuthConnection(fake.store, {
      ownerId: 'owner-1',
      connectionId: 'connection-1',
    });

    expect(result.revoked).toBe(true);
    expect(oauth.revokeGoogleToken).toHaveBeenCalledWith('refresh-secret');
    expect(fake.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'youtube_oauth_connections',
          payload: expect.objectContaining({
            status: 'revoked',
            token_ciphertext: null,
            token_iv: null,
            token_tag: null,
          }),
        }),
        expect.objectContaining({
          table: 'youtube_channels',
          payload: expect.objectContaining({ status: 'disconnected' }),
        }),
        expect.objectContaining({
          table: 'youtube_project_bindings',
          payload: expect.objectContaining({ is_active: false }),
        }),
      ])
    );
  });
});
