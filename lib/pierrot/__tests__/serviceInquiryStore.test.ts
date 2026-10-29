/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEvent: jest.fn(async () => true),
  persistenceFailure: jest.fn(),
}));

const serverStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEvent: { mock: { calls: unknown[][] } };
};
const { advanceStoredServiceInquiry } =
  require('../serviceInquiryStore') as typeof import('../serviceInquiryStore');

function makeStore(options: { lookupError?: unknown } = {}) {
  const rows: Array<Record<string, unknown>> = [];
  let inserted: Record<string, unknown> | null = null;

  const store = {
    from(table: string) {
      if (table === 'art_service_leads') {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => {
                if (options.lookupError) return { data: null, error: options.lookupError };
                const row =
                  rows.find((item) => item.id === value) ||
                  rows.find((item) => item.conversation_id === value) ||
                  null;
                return { data: row, error: null };
              },
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              maybeSingle: async () => {
                inserted = { ...row };
                rows.push(inserted);
                return { data: inserted, error: null };
              },
            }),
          }),
          update: (row: Record<string, unknown>) => ({
            eq: async (_column: string, value: string) => {
              const target = rows.find((item) => item.id === value);
              if (target) Object.assign(target, row);
              return { error: null };
            },
          }),
        };
      }

      if (table === 'pierrot_conversations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { session_id: '22222222-2222-4222-8222-222222222222' },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store: store as unknown as SupabaseClient, rows };
}

beforeEach(() => {
  jest.clearAllMocks();
  serverStore.recordPierrotEvent.mock.calls.length = 0;
});

describe('service inquiry store', () => {
  it('creates a lead, advances qualification and records only category events', async () => {
    const { store, rows } = makeStore();

    const state = await advanceStoredServiceInquiry({
      store,
      conversationId: '11111111-1111-4111-8111-111111111111',
      message: 'I need help analysing my collection',
      userMessageId: '33333333-3333-4333-8333-333333333333',
    });

    expect(state?.needType).toBe('analysis');
    expect(state?.nextQuestion).toBe('stage');
    expect(rows[0]).toMatchObject({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      need_type: 'analysis',
      questions_asked: 1,
      last_message_id: '33333333-3333-4333-8333-333333333333',
    });

    const eventNames = serverStore.recordPierrotEvent.mock.calls.map(
      (call) => (call[1] as { eventName: string }).eventName
    );
    expect(eventNames).toContain('service_inquiry_started');
    expect(eventNames).toContain('service_need_selected');
    expect(JSON.stringify(serverStore.recordPierrotEvent.mock.calls)).not.toContain('@');
  });

  it('does not advance twice for the same user message id', async () => {
    const { store, rows } = makeStore();
    const conversationId = '11111111-1111-4111-8111-111111111111';
    const userMessageId = '33333333-3333-4333-8333-333333333333';

    const first = await advanceStoredServiceInquiry({
      store,
      conversationId,
      message: 'I need a consultation',
      userMessageId,
    });
    const second = await advanceStoredServiceInquiry({
      store,
      conversationId,
      message: 'I need a consultation',
      userMessageId,
    });

    expect(first?.questionsAsked).toBe(1);
    expect(second?.questionsAsked).toBe(1);
    expect(second?.nextQuestion).toBe('stage');
    expect(rows[0].questions_asked).toBe(1);
  });

  it('propagates a database lookup error', async () => {
    const { store } = makeStore({ lookupError: new Error('db down') });

    await expect(
      advanceStoredServiceInquiry({
        store,
        conversationId: '11111111-1111-4111-8111-111111111111',
        message: 'consultation',
        userMessageId: '33333333-3333-4333-8333-333333333333',
      })
    ).rejects.toThrow('db down');
  });
});
