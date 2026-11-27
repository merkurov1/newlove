/** @jest-environment node */

jest.mock('../channels', () => ({
  resolveProjectChannel: jest.fn(),
  loadChannelAccessToken: jest.fn(),
}));

jest.mock('../api', () => ({
  fetchChannelResource: jest.fn(),
  fetchUploadsPage: jest.fn(),
  fetchVideoDetail: jest.fn(),
  fetchVideoDetails: jest.fn(),
}));

import { getProjectCatalogPage, getProjectVideo } from '../catalog';
import { YouTubeError } from '../types';

const channels = require('../channels') as {
  resolveProjectChannel: jest.Mock;
  loadChannelAccessToken: jest.Mock;
};
const api = require('../api') as {
  fetchChannelResource: jest.Mock;
  fetchUploadsPage: jest.Mock;
  fetchVideoDetail: jest.Mock;
  fetchVideoDetails: jest.Mock;
};

const store = {} as never;

const boundChannel = {
  id: 'channel-record-art',
  connectionId: 'connection-a',
  channelId: 'UC_art',
  title: 'Merkurov Art',
  handle: '@merkurov-art',
  uploadsPlaylistId: 'UU_art',
  thumbnailUrl: null,
  status: 'active',
  hiddenSubscriberCount: false,
  subscriberCount: 10,
  viewCount: 100,
  videoCount: 2,
  lastSyncedAt: null,
};

const connection = {
  id: 'connection-a',
  googleAccountId: 'google-a',
  googleAccountEmail: 'merckurov@gmail.com',
  googleAccountName: 'Merkurov',
  status: 'connected',
  scopes: [],
  connectedAt: '2026-01-01T00:00:00.000Z',
  lastCheckedAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  hasRefreshToken: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  channels.resolveProjectChannel.mockResolvedValue({
    binding: {
      id: 'binding-art',
      projectSlug: 'art-engine',
      channelRecordId: boundChannel.id,
      channelId: boundChannel.channelId,
      isActive: true,
      updatedAt: null,
    },
    channel: boundChannel,
    connection,
  });
  channels.loadChannelAccessToken.mockResolvedValue({
    accessToken: 'access-token',
    channel: boundChannel,
    connection,
  });
  api.fetchUploadsPage.mockResolvedValue({
    videoIds: ['video_1'],
    nextPageToken: null,
    totalResults: 1,
  });
  api.fetchVideoDetails.mockResolvedValue([
    {
      videoId: 'video_1',
      channelId: 'UC_art',
      title: 'Only the bound channel',
      description: 'Description',
      tags: [],
      categoryId: null,
      defaultLanguage: null,
      privacyStatus: 'public',
      uploadStatus: 'processed',
      publishedAt: null,
      durationSeconds: 60,
      thumbnailUrl: null,
      views: 1,
      likes: 0,
      comments: 0,
    },
  ]);
});

describe('project binding isolation for catalog and metadata', () => {
  it('lists videos from the uploads playlist of the project-bound channel only', async () => {
    const page = await getProjectCatalogPage({
      store,
      ownerId: 'owner-1',
      projectSlug: 'art-engine',
    });

    expect(page.channel.id).toBe('UC_art');
    expect(page.connection.googleAccountEmail).toBe('merckurov@gmail.com');
    expect(api.fetchUploadsPage).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-token' }),
      'UU_art',
      expect.anything()
    );
    expect(api.fetchUploadsPage).not.toHaveBeenCalledWith(
      expect.anything(),
      'UU_unframed',
      expect.anything()
    );
    expect(channels.loadChannelAccessToken).toHaveBeenCalledWith(expect.anything(), {
      ownerId: 'owner-1',
      channelRecordId: 'channel-record-art',
    });
  });

  it('refuses to open or edit a video that belongs to another channel', async () => {
    api.fetchVideoDetail.mockResolvedValue({
      videoId: 'video_other',
      channelId: 'UC_unframed',
      title: 'Another channel video',
    });

    await expect(
      getProjectVideo({
        store,
        ownerId: 'owner-1',
        projectSlug: 'art-engine',
        videoId: 'video_other',
      })
    ).rejects.toBeInstanceOf(YouTubeError);

    await expect(
      getProjectVideo({
        store,
        ownerId: 'owner-1',
        projectSlug: 'art-engine',
        videoId: 'video_other',
      })
    ).rejects.toMatchObject({ code: 'resource_not_found' });
  });

  it('fails closed when the project has no active binding', async () => {
    channels.resolveProjectChannel.mockResolvedValueOnce(null);

    await expect(
      getProjectCatalogPage({ store, ownerId: 'owner-1', projectSlug: 'unframed' })
    ).rejects.toMatchObject({ code: 'not_connected' });
    expect(api.fetchUploadsPage).not.toHaveBeenCalled();
  });
});
