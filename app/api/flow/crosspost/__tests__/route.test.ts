/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => undefined),
}));

jest.mock('@/lib/flow/items-cash', () => ({
  invalidateFlowCache: jest.fn(),
}));

jest.mock('@/lib/flow/crosspost', () => ({
  crosspostFlowItem: jest.fn(),
}));

const { POST } = require('../route') as {
  POST: (req: Request) => Promise<Response>;
};
const { crosspostFlowItem } = require('@/lib/flow/crosspost') as {
  crosspostFlowItem: jest.Mock;
};
const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/flow/crosspost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/flow/crosspost Meta channels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts facebook and threads and returns their independent statuses', async () => {
    crosspostFlowItem.mockResolvedValue({
      attemptedChannels: ['facebook', 'threads'],
      facebook: {
        id: 'fb-1',
        url: 'https://www.facebook.com/page-1/posts/1',
      },
      threads: null,
      channels: {
        facebook: {
          status: 'published',
          externalId: 'fb-1',
          externalUri: 'https://www.facebook.com/page-1/posts/1',
          attempts: 1,
          lastError: null,
          uncertain: false,
          messageIds: [],
        },
        threads: {
          status: 'failed',
          externalId: 'container-1',
          externalUri: null,
          attempts: 2,
          lastError: 'Threads publish request timed out.',
          uncertain: true,
          messageIds: [],
        },
      },
    });

    const response = await POST(
      request({
        title: 'Manual post',
        body_md: 'Body',
        channels: ['facebook', 'threads'],
        retryUncertain: true,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(crosspostFlowItem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Manual post' }),
      expect.objectContaining({
        channels: ['facebook', 'threads'],
        retryUncertain: true,
      })
    );

    expect(json.channels.facebook).toMatchObject({
      success: true,
      status: 'published',
      externalId: 'fb-1',
      externalUri: 'https://www.facebook.com/page-1/posts/1',
      attempts: 1,
      error: null,
      uncertain: false,
    });
    expect(json.channels.threads).toMatchObject({
      success: false,
      status: 'failed',
      externalId: 'container-1',
      externalUri: null,
      attempts: 2,
      error: 'Threads publish request timed out.',
      uncertain: true,
    });
    expect(json.attemptedChannels).toEqual(['facebook', 'threads']);
  });

  it('rejects unauthenticated requests before publishing', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(
      request({ title: 'Blocked', body_md: 'Body', channels: ['facebook'] })
    );

    expect(response.status).toBe(401);
    expect(crosspostFlowItem).not.toHaveBeenCalled();
  });
});
