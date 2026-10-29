/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

const { loadConversationTranscript } = require('../pierrotIntelligence') as {
  loadConversationTranscript: (id: string) => Promise<unknown>;
};

describe('deleted Pierrot conversations', () => {
  it('returns null instead of inventing a transcript', async () => {
    await expect(
      loadConversationTranscript('11111111-1111-4111-8111-111111111111')
    ).resolves.toBeNull();
  });
});
