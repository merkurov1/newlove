/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/youtube/catalog', () => ({
  getProjectVideo: jest.fn(),
  resolveProjectAccessToken: jest.fn(),
}));

jest.mock('@/lib/youtube/management', () => ({
  updateEditableVideoMetadata: jest.fn(),
}));

jest.mock('@/lib/youtube/managementAudit', () => ({
  recordYouTubeManagementAudit: jest.fn(async () => undefined),
}));

const video = {
  videoId: 'TmC6Lr5K4R8',
  channelId: 'UC_art',
  title: 'Original title',
  description: 'Original description',
  tags: ['art'],
  categoryId: '27',
  defaultLanguage: 'ru',
  defaultAudioLanguage: 'ru',
  localized: null,
  publishedAt: '2026-01-01T00:00:00.000Z',
  thumbnailUrl: null,
  privacyStatus: 'public',
  uploadStatus: 'processed',
  publishAt: null,
  madeForKids: false,
  embeddable: true,
  license: 'youtube',
  publicStatsViewable: true,
  durationSeconds: 600,
  views: 100,
  likes: 10,
  comments: 2,
};

const { GET, POST } = require('../route') as {
  GET: (request: Request, context: { params: Promise<{ videoId: string }> }) => Promise<Response>;
  POST: (request: Request, context: { params: Promise<{ videoId: string }> }) => Promise<Response>;
};
const serverAuth = require('@/lib/serverAuth') as { requireAdminFromRequest: jest.Mock };
const catalog = require('@/lib/youtube/catalog') as {
  getProjectVideo: jest.Mock;
  resolveProjectAccessToken: jest.Mock;
};
const management = require('@/lib/youtube/management') as {
  updateEditableVideoMetadata: jest.Mock;
};
const audit = require('@/lib/youtube/managementAudit') as {
  recordYouTubeManagementAudit: jest.Mock;
};

function request(method: string, body?: Record<string, unknown>): Request {
  return new Request(
    'https://www.merkurov.love/api/admin/youtube/channels/videos/TmC6Lr5K4R8?project=art-engine',
    {
      method,
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    }
  );
}

const context = { params: Promise.resolve({ videoId: 'TmC6Lr5K4R8' }) };

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
  catalog.getProjectVideo.mockResolvedValue({
    video,
    channel: { channelId: 'UC_art', title: 'Merkurov Art', handle: '@merkurov-art' },
    connection: { googleAccountEmail: 'Mercurio@example.com', status: 'connected' },
  });
});

describe('video metadata editor API', () => {
  it('rejects visitors', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET(request('GET'), context);
    expect(response.status).toBe(401);
  });

  it('returns metadata and analysis to the owner without exposing tokens', async () => {
    const response = await GET(request('GET'), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.video.title).toBe('Original title');
    expect(body.fingerprint).toHaveLength(64);
    expect(body.analysis).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token|token_ciphertext/i);
  });

  it('previews a diff without writing anything to YouTube', async () => {
    const response = await POST(
      request('POST', { action: 'preview', changes: { title: 'New title' } }),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.diff.find((row: { field: string }) => row.field === 'title')).toMatchObject({
      before: 'Original title',
      after: 'New title',
      changed: true,
    });
    expect(management.updateEditableVideoMetadata).not.toHaveBeenCalled();
    expect(audit.recordYouTubeManagementAudit).not.toHaveBeenCalled();
  });

  it('requires an explicit confirmation token before a real write', async () => {
    const response = await POST(
      request('POST', { action: 'update', changes: { title: 'New title' } }),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.confirmationRequired).toBe(true);
    expect(body.confirmationToken).toEqual(expect.any(String));
    expect(body.diff).toBeDefined();
    expect(management.updateEditableVideoMetadata).not.toHaveBeenCalled();
    expect(audit.recordYouTubeManagementAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'owner-1',
        project: 'art-engine',
        status: 'confirmation_required',
        targetId: 'TmC6Lr5K4R8',
        changedFields: ['title'],
      })
    );
  });

  it('rejects an update with metadata that did not change', async () => {
    const response = await POST(
      request('POST', { action: 'update', changes: { title: 'Original title' } }),
      context
    );

    expect(response.status).toBe(400);
    expect(management.updateEditableVideoMetadata).not.toHaveBeenCalled();
  });
});
