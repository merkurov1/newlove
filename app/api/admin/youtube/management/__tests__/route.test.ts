/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: 'owner-1', role: 'ADMIN' })),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/youtube/connection', () => ({
  loadYouTubeConnectionState: jest.fn(),
  loadYouTubeManagementAccessToken: jest.fn(async () => ({ accessToken: 'access-token' })),
}));

jest.mock('@/lib/youtube/managementAudit', () => ({
  recordYouTubeManagementAudit: jest.fn(async () => undefined),
}));

jest.mock('@/lib/youtube/management', () => {
  const actual = jest.requireActual('@/lib/youtube/management');
  return {
    ...actual,
    listChannelVideos: jest.fn(async () => ({ channelId: 'UC_shared', videos: [] })),
    updateVideoMetadata: jest.fn(async () => ({
      videoId: 'TmC6Lr5K4R8',
      title: 'Updated',
      publishedAt: null,
      privacyStatus: 'private',
      durationSeconds: null,
    })),
  };
});

const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};
const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const connection = require('@/lib/youtube/connection') as {
  loadYouTubeConnectionState: jest.Mock;
  loadYouTubeManagementAccessToken: jest.Mock;
};
const audit = require('@/lib/youtube/managementAudit') as {
  recordYouTubeManagementAudit: jest.Mock;
};
const management = require('@/lib/youtube/management') as {
  listChannelVideos: jest.Mock;
  updateVideoMetadata: jest.Mock;
};

const originalEnv = { ...process.env };

function state(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    connected: true,
    status: 'connected',
    channelId: 'UC_shared',
    channelTitle: 'Pierrot + UNFRAMED',
    accountLabel: 'Pierrot + UNFRAMED',
    googleAccountEmail: 'unframed@example.com',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    missingScopes: [],
    managementAuthorized: true,
    managementScopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.force-ssl',
    ],
    missingManagementScopes: [],
    managementAuthorizedAt: '2026-11-01T00:00:00.000Z',
    projectSlugs: ['pierrot', 'unframed'],
    connectedAt: '2026-11-01T00:00:00.000Z',
    lastCheckedAt: '2026-11-01T00:00:00.000Z',
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

function postRequest(body: Record<string, unknown>): Request {
  return new Request('https://www.merkurov.love/api/admin/youtube/management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.merkurov.love';
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
  connection.loadYouTubeConnectionState.mockResolvedValue(state());
  management.listChannelVideos.mockClear();
  management.updateVideoMetadata.mockClear();
  audit.recordYouTubeManagementAudit.mockClear();
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('GET /api/admin/youtube/management', () => {
  it('returns the shared channel and project-aware permission state to the owner', async () => {
    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/management?project=unframed')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project).toBe('unframed');
    expect(body.channel).toMatchObject({
      id: 'UC_shared',
      title: 'Pierrot + UNFRAMED',
      googleAccountEmail: 'unframed@example.com',
      shared: true,
    });
    expect(body.permissions.management).toBe(true);
    expect(body.permissions.connectUrl).toContain('project=unframed');
    expect(JSON.stringify(body)).not.toContain('access-token');
    expect(JSON.stringify(body)).not.toContain('refresh');
  });

  it('rejects visitors', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await GET(
      new Request('https://www.merkurov.love/api/admin/youtube/management')
    );

    expect(response.status).toBe(401);
  });
});

describe('POST /api/admin/youtube/management', () => {
  it('rejects non-owner requests before any write', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(
      postRequest({
        action: 'video.update',
        project: 'pierrot',
        params: { videoId: 'TmC6Lr5K4R8', title: 'x' },
      })
    );

    expect(response.status).toBe(401);
    expect(management.updateVideoMetadata).not.toHaveBeenCalled();
    expect(audit.recordYouTubeManagementAudit).not.toHaveBeenCalled();
  });

  it('refuses a write when the incremental management scope is missing', async () => {
    connection.loadYouTubeConnectionState.mockResolvedValue(
      state({
        scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        managementAuthorized: false,
        missingManagementScopes: [
          'https://www.googleapis.com/auth/youtube.upload',
          'https://www.googleapis.com/auth/youtube.force-ssl',
        ],
      })
    );

    const response = await POST(
      postRequest({
        action: 'video.update',
        project: 'pierrot',
        params: { videoId: 'TmC6Lr5K4R8', title: 'x' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('insufficient_permissions');
    expect(body.connectUrl).toContain('project=pierrot');
    expect(management.updateVideoMetadata).not.toHaveBeenCalled();
    expect(audit.recordYouTubeManagementAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'scope_missing', action: 'video.update' })
    );
  });

  it('requires an explicit confirmation before publishing/updating anything', async () => {
    const response = await POST(
      postRequest({
        action: 'video.update',
        project: 'unframed',
        params: { videoId: 'TmC6Lr5K4R8', title: 'Public title' },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.confirmationRequired).toBe(true);
    expect(body.confirmationToken).toBeTruthy();
    expect(body.preview).toMatchObject({ destructive: false, externallyVisible: true });
    expect(management.updateVideoMetadata).not.toHaveBeenCalled();
    expect(audit.recordYouTubeManagementAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'confirmation_required', project: 'unframed' })
    );
  });

  it('executes a confirmed write and records only an audit outcome', async () => {
    const preview = await POST(
      postRequest({
        action: 'video.update',
        project: 'unframed',
        params: { videoId: 'TmC6Lr5K4R8', title: 'Public title' },
      })
    );
    const previewBody = await preview.json();

    const response = await POST(
      postRequest({
        action: 'video.update',
        project: 'unframed',
        params: { videoId: 'TmC6Lr5K4R8', title: 'Public title' },
        confirmationToken: previewBody.confirmationToken,
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.videoId).toBe('TmC6Lr5K4R8');
    expect(management.updateVideoMetadata).toHaveBeenCalledTimes(1);
    expect(audit.recordYouTubeManagementAudit).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'completed',
        action: 'video.update',
        targetId: 'TmC6Lr5K4R8',
      })
    );
    expect(JSON.stringify(audit.recordYouTubeManagementAudit.mock.calls)).not.toContain(
      'Public title'
    );
    expect(JSON.stringify(body)).not.toContain('access-token');
  });

  it('rejects a confirmation token minted for different parameters', async () => {
    const preview = await POST(
      postRequest({
        action: 'video.update',
        project: 'pierrot',
        params: { videoId: 'TmC6Lr5K4R8', title: 'Preview title' },
      })
    );
    const previewBody = await preview.json();

    const response = await POST(
      postRequest({
        action: 'video.update',
        project: 'pierrot',
        params: { videoId: 'TmC6Lr5K4R8', title: 'Different title' },
        confirmationToken: previewBody.confirmationToken,
      })
    );

    expect(response.status).toBe(400);
    expect(management.updateVideoMetadata).not.toHaveBeenCalled();
  });

  it('allows read-only listing without confirmation but still checks owner auth', async () => {
    const response = await POST(
      postRequest({ action: 'channel.videos.list', project: 'pierrot', params: {} })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.channelId).toBe('UC_shared');
    expect(management.listChannelVideos).toHaveBeenCalledTimes(1);
  });
});
