/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockReturnValue: (value: unknown) => void;
  mockResolvedValue: (value: unknown) => void;
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};

function asMock(value: unknown): MockFn {
  return value as unknown as MockFn;
}

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(),
  deletePierrotConversation: jest.fn(),
  persistenceFailure: jest.fn(),
}));

const pierrotStore =
  require('@/lib/pierrot/serverStore') as typeof import('@/lib/pierrot/serverStore');
const { DELETE } = require('../route') as {
  DELETE: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/pierrot/conversations', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(pierrotStore.createPierrotStore).mockReturnValue({ mocked: true });
  asMock(pierrotStore.deletePierrotConversation).mockResolvedValue(undefined);
});

describe('DELETE /api/pierrot/conversations', () => {
  it('requires both random identifiers before deleting', async () => {
    const response = await DELETE(makeRequest({ conversationId }));

    expect(response.status).toBe(400);
    expect(pierrotStore.deletePierrotConversation).not.toHaveBeenCalled();
  });

  it('deletes only the conversation matching id and session', async () => {
    const response = await DELETE(makeRequest({ conversationId, sessionId }));

    expect(response.status).toBe(204);
    expect(asMock(pierrotStore.deletePierrotConversation).mock.calls[0]).toEqual([
      { mocked: true },
      conversationId,
      sessionId,
    ]);
  });
});
