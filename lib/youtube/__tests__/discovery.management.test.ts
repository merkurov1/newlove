/** @jest-environment node */

jest.mock('@/lib/analytics/website/store', () => ({
  getStoredConnection: jest.fn(),
  upsertConnection: jest.fn(async () => undefined),
  markConnectionError: jest.fn(async () => undefined),
}));

jest.mock('../api', () => ({
  fetchChannelResource: jest.fn(),
}));

import { runYouTubeManagementDiscovery } from '../discovery';
import {
  YOUTUBE_ANALYTICS_READONLY_SCOPE,
  YOUTUBE_MANAGEMENT_SCOPES,
  YOUTUBE_READONLY_SCOPE,
} from '../config';

const storeModule = require('@/lib/analytics/website/store') as {
  getStoredConnection: jest.Mock;
  upsertConnection: jest.Mock;
};
const apiModule = require('../api') as { fetchChannelResource: jest.Mock };

const existing = {
  id: 'conn-youtube',
  provider: 'youtube',
  status: 'connected',
  account_label: 'Pierrot channel',
  external_id: 'UC_old',
  external_meta: { channel_id: 'UC_old', project_slugs: ['pierrot', 'unframed'] },
  scopes: [YOUTUBE_READONLY_SCOPE, YOUTUBE_ANALYTICS_READONLY_SCOPE],
  token_ciphertext: 'analytics-cipher',
  token_iv: 'analytics-iv',
  token_tag: 'analytics-tag',
  token_key_version: 'v1:test',
  connected_by: 'owner',
  connected_at: '2026-11-01T00:00:00.000Z',
  disabled_at: null,
  last_sync_at: null,
  last_sync_status: null,
  last_error_code: null,
  last_error_message: null,
  last_error_at: null,
  updated_at: '2026-11-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  storeModule.getStoredConnection.mockResolvedValue(existing);
  apiModule.fetchChannelResource.mockResolvedValue({
    id: 'UC_unframed',
    title: 'UNFRAMED',
    handle: '@unframed',
    uploadsPlaylistId: 'UU_unframed',
    subscribers: null,
    views: null,
    videoCount: null,
    hiddenSubscriberCount: false,
  });
});

describe('incremental YouTube management discovery', () => {
  it('connects a second Google account without touching the analytics credential', async () => {
    const result = await runYouTubeManagementDiscovery({} as never, {
      accessToken: 'unframed-access',
      scopes: [YOUTUBE_READONLY_SCOPE, ...YOUTUBE_MANAGEMENT_SCOPES],
      managementSealed: {
        ciphertext: 'management-cipher',
        iv: 'management-iv',
        tag: 'management-tag',
        keyVersion: 'v1:test',
      },
      connectedBy: 'owner',
      accountEmail: 'unframed@example.com',
      accountName: 'UNFRAMED',
      project: 'unframed',
    });

    expect(result).toMatchObject({
      status: 'connected',
      channelId: 'UC_unframed',
      channelTitle: 'UNFRAMED',
      accountEmail: 'unframed@example.com',
    });

    const upsert = storeModule.upsertConnection.mock.calls[0][1];
    expect(upsert).toMatchObject({
      provider: 'youtube',
      externalId: 'UC_unframed',
      managementSealed: {
        ciphertext: 'management-cipher',
        iv: 'management-iv',
        tag: 'management-tag',
      },
    });
    // The analytics refresh token is not part of this write at all.
    expect(upsert.sealed).toBeUndefined();
    expect(upsert.externalMeta).toMatchObject({
      google_account_email: 'unframed@example.com',
      management_project: 'unframed',
      project_slugs: ['pierrot', 'unframed'],
    });
    expect(upsert.scopes).toEqual(
      expect.arrayContaining([YOUTUBE_ANALYTICS_READONLY_SCOPE, ...YOUTUBE_MANAGEMENT_SCOPES])
    );
  });

  it('reports missing management scopes without calling YouTube or changing analytics', async () => {
    const result = await runYouTubeManagementDiscovery({} as never, {
      accessToken: 'unframed-access',
      scopes: [YOUTUBE_READONLY_SCOPE],
      accountEmail: 'unframed@example.com',
    });

    expect(result.status).toBe('not_granted');
    expect(result.code).toBe('insufficient_permissions');
    expect(apiModule.fetchChannelResource).not.toHaveBeenCalled();
    expect(storeModule.upsertConnection).not.toHaveBeenCalled();
  });
});
