/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/youtube/channels', () => ({
  YOUTUBE_PROJECTS: [
    { slug: 'art-engine', name: 'Art Engine', defaultChannelHandle: '@merkurov-art' },
    { slug: 'unframed', name: 'UNFRAMED', defaultChannelHandle: '@unframed-tv' },
    { slug: 'pierrot', name: 'Pierrot', defaultChannelHandle: '@unframed-tv' },
    { slug: 'heart-and-angel', name: 'Heart & Angel', defaultChannelHandle: '@heartandangel' },
  ],
  isYouTubeProjectSlug: (value: unknown) =>
    ['art-engine', 'unframed', 'pierrot', 'heart-and-angel'].includes(String(value)),
  checkYouTubeMultichannelSchema: jest.fn(async () => ({
    ready: true,
    reason: 'ready',
    missingTables: [],
    code: null,
  })),
  listOAuthConnections: jest.fn(async () => [
    {
      id: 'connection-1',
      googleAccountEmail: 'Mercurio@example.com',
      status: 'connected',
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
      hasRefreshToken: true,
    },
  ]),
  listYouTubeChannels: jest.fn(async () => [
    {
      id: 'channel-record-1',
      connectionId: 'connection-1',
      channelId: 'UC_art',
      title: 'Merkurov Art',
      handle: '@merkurov-art',
      status: 'active',
    },
    {
      id: 'channel-record-2',
      connectionId: 'connection-1',
      channelId: 'UC_unframed',
      title: 'UNFRAMED',
      handle: '@unframed-tv',
      status: 'active',
    },
  ]),
  listProjectBindings: jest.fn(async () => []),
  bindChannelToProject: jest.fn(async () => ({
    id: 'binding-1',
    projectSlug: 'art-engine',
    channelRecordId: 'channel-record-1',
    channelId: 'UC_art',
    isActive: true,
  })),
  unbindProject: jest.fn(async () => undefined),
  disconnectOAuthConnection: jest.fn(async () => ({ revoked: true })),
  loadChannelAccessToken: jest.fn(),
  replaceConnectionChannels: jest.fn(),
}));

const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};
const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const channels = require('@/lib/youtube/channels') as {
  bindChannelToProject: jest.Mock;
  disconnectOAuthConnection: jest.Mock;
  checkYouTubeMultichannelSchema: jest.Mock;
  listOAuthConnections: jest.Mock;
};

function post(body: Record<string, unknown>): Request {
  return new Request('https://www.merkurov.love/api/admin/youtube/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
});

describe('multi-channel YouTube owner API', () => {
  it('rejects visitors before reading channel state', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels?project=art-engine')
    );

    expect(response.status).toBe(401);
  });

  it('returns every channel on one Google account without any token fields', async () => {
    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels?project=art-engine')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schemaReady).toBe(true);
    expect(body.schema).toEqual({
      ready: true,
      reason: 'ready',
      missingTables: [],
      code: null,
    });
    expect(body.channels).toHaveLength(2);
    expect(body.channels.map((item: { channelId: string }) => item.channelId)).toEqual([
      'UC_art',
      'UC_unframed',
    ]);
    expect(JSON.stringify(body)).not.toMatch(/token_ciphertext|refresh_token|access_token/i);
  });

  it('reports schemaReady=false with the missing table names instead of throwing', async () => {
    channels.checkYouTubeMultichannelSchema.mockResolvedValueOnce({
      ready: false,
      reason: 'missing_tables',
      missingTables: ['youtube_channels'],
      code: 'PGRST205',
    });

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels?project=art-engine')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schemaReady).toBe(false);
    expect(body.schema.missingTables).toEqual(['youtube_channels']);
    expect(body.message).toContain('youtube_channels');
  });

  it('returns a safe JSON error with HTTP status when state cannot be read', async () => {
    channels.listOAuthConnections.mockRejectedValueOnce(
      Object.assign(new Error('permission denied for table youtube_oauth_connections'), {
        code: '42501',
      })
    );

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/channels?project=art-engine')
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('state_read_failed');
    expect(body.code).toBe('42501');
    expect(body.retryable).toBe(true);
    expect(body.message).toMatch(/Не удалось прочитать состояние YouTube/);
    expect(JSON.stringify(body)).not.toMatch(/token_ciphertext|refresh_token|access_token/i);
  });

  it('binds a selected channel to the requested project for the owner', async () => {
    const response = await POST(
      post({ action: 'bind', project: 'art-engine', channelRecordId: 'channel-record-1' })
    );

    expect(response.status).toBe(200);
    expect(channels.bindChannelToProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerId: 'owner-1',
        projectSlug: 'art-engine',
        channelRecordId: 'channel-record-1',
      })
    );
  });

  it('supports a channel shared by two projects through separate bindings', async () => {
    await POST(post({ action: 'bind', project: 'unframed', channelRecordId: 'channel-record-2' }));
    await POST(post({ action: 'bind', project: 'pierrot', channelRecordId: 'channel-record-2' }));

    expect(channels.bindChannelToProject).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ projectSlug: 'unframed', channelRecordId: 'channel-record-2' })
    );
    expect(channels.bindChannelToProject).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ projectSlug: 'pierrot', channelRecordId: 'channel-record-2' })
    );
  });

  it('revokes and clears the connection for the owner', async () => {
    const response = await POST(post({ action: 'disconnect', connectionId: 'connection-1' }));

    expect(response.status).toBe(200);
    expect(channels.disconnectOAuthConnection).toHaveBeenCalledWith(expect.anything(), {
      ownerId: 'owner-1',
      connectionId: 'connection-1',
    });
  });
});
