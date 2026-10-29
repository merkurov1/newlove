/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
};

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: 'admin', role: 'ADMIN' })),
  getServerSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/analytics/pierrotIntelligence', () => ({
  loadConversationTranscript: jest.fn(),
  redactPersonalData: (value: string) => value.replace(/person@example\.com/g, '[email]'),
}));

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: MockFn;
  getServerSupabaseClient: { mockReturnValue: (value: unknown) => void };
};
const analytics = require('@/lib/analytics/pierrotIntelligence') as {
  loadConversationTranscript: MockFn;
};
const exportRoute = require('../export/route') as {
  GET: (request: Request) => Promise<Response>;
};
const deleteRoute = require('../conversations/route') as {
  DELETE: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';

const transcript = {
  conversation: {
    id: conversationId,
    status: 'active',
    language: 'en',
    start_page: '/',
    started_at: '2026-10-10T10:00:00.000Z',
    ended_at: null,
  },
  messages: [
    {
      id: 'm1',
      conversation_id: conversationId,
      role: 'user',
      content: 'Write to person@example.com',
      message_index: 1,
      provider: null,
      created_at: '2026-10-10T10:00:30.000Z',
    },
  ],
  events: [],
  subscriptionEvents: [],
  lead: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
  serverAuth.getServerSupabaseClient.mockReturnValue({
    from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }),
  });
  analytics.loadConversationTranscript.mockResolvedValue(transcript);
});

describe('closed Pierrot admin API', () => {
  it('rejects an unauthenticated export request', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized'));

    const response = await exportRoute.GET(
      new Request(`http://localhost/api/admin/pierrot/export?conversation=${conversationId}`)
    );

    expect(response.status).toBe(401);
    expect(analytics.loadConversationTranscript).not.toHaveBeenCalled();
  });

  it('exports redacted admin data and no session id', async () => {
    const response = await exportRoute.GET(
      new Request(`http://localhost/api/admin/pierrot/export?conversation=${conversationId}`)
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('[email]');
    expect(body).not.toContain('person@example.com');
    expect(body).not.toContain('session_id');
  });

  it('rejects an unauthenticated delete request', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized'));

    const response = await deleteRoute.DELETE(
      new Request(`http://localhost/api/admin/pierrot/conversations?id=${conversationId}`, {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(401);
    expect(serverAuth.getServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('deletes only the requested conversation through the service role', async () => {
    const deletedTables: string[] = [];
    serverAuth.getServerSupabaseClient.mockReturnValue({
      from: (table: string) => ({
        delete: () => ({
          eq: async () => {
            deletedTables.push(table);
            return { error: null };
          },
        }),
      }),
    });

    const response = await deleteRoute.DELETE(
      new Request(`http://localhost/api/admin/pierrot/conversations?id=${conversationId}`, {
        method: 'DELETE',
      })
    );

    expect(response.status).toBe(200);
    expect(deletedTables).toEqual([
      'pierrot_conversations',
      'art_service_leads',
      'subscription_events',
    ]);
  });
});
