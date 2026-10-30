/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { createPierrotPostcardRef } from '@/lib/pierrot/orderAttribution';

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEvent: jest.fn(async () => true),
}));

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
};

const serverStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEvent: MockFn;
};

const { confirmPostcardCheckoutSession } = require('../paymentConfirmation') as {
  confirmPostcardCheckoutSession: (
    store: SupabaseClient,
    session: Stripe.Checkout.Session
  ) => Promise<unknown>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const sessionId = 'cs_test_a1b2c3d4e5f6';

type StoreOptions = {
  order?: { id: string; status: string } | null;
  lookupError?: unknown;
  updateError?: unknown;
  conversation?: { session_id: string } | null;
};

function makeStore(options: StoreOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'postcard_orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  options.order === undefined
                    ? { id: 'order-1', status: 'PENDING' }
                    : options.order,
                error: options.lookupError ?? null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);

            return {
              eq: async () => ({ error: options.updateError ?? null }),
            };
          },
        };
      }

      if (table === 'pierrot_conversations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  options.conversation === undefined
                    ? { session_id: '22222222-2222-4222-8222-222222222222' }
                    : options.conversation,
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { store, updates };
}

function makeSession(overrides: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: sessionId,
    payment_status: 'paid',
    payment_intent: 'pi_123',
    amount_total: 2900,
    currency: 'gbp',
    metadata: {
      type: 'postcard_v1',
      orderId: 'order-1',
      postcardId: 'postcard_1',
      pierrotAttribution: createPierrotPostcardRef(conversationId),
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

beforeEach(() => {
  jest.clearAllMocks();
  serverStore.recordPierrotEvent.mockResolvedValue(true);
});

describe('existing postcard payment confirmation', () => {
  it('marks a paid postcard order PAID and records only safe attribution', async () => {
    const { store, updates } = makeStore();

    const outcome = await confirmPostcardCheckoutSession(store, makeSession());

    expect(outcome).toEqual({ status: 'confirmed', orderId: 'order-1' });
    expect(updates).toEqual([
      expect.objectContaining({
        status: 'PAID',
        stripePaymentIntentId: 'pi_123',
      }),
    ]);

    const call = serverStore.recordPierrotEvent.mock.calls[0];
    const eventInput = call?.[1] as
      { payload: Record<string, unknown>; [key: string]: unknown } | undefined;

    expect(eventInput).toMatchObject({
      conversationId,
      eventName: 'order_paid',
      eventKey: `order_paid:${sessionId}`,
    });
    expect(Object.keys(eventInput?.payload || {}).sort()).toEqual([
      'amount_total',
      'currency',
      'offer_id',
      'order_id',
      'product_id',
    ]);
    expect(JSON.stringify(eventInput)).not.toContain('@');
    expect(JSON.stringify(eventInput)).not.toContain('address');
    expect(JSON.stringify(eventInput)).not.toContain('message');
  });

  it('does not mark an unpaid session as paid', async () => {
    const { store, updates } = makeStore();

    const outcome = await confirmPostcardCheckoutSession(
      store,
      makeSession({ payment_status: 'unpaid' })
    );

    expect(outcome).toEqual({ status: 'ignored', reason: 'unpaid' });
    expect(updates).toHaveLength(0);
    expect(serverStore.recordPierrotEvent).not.toHaveBeenCalled();
  });

  it('acknowledges a repeated webhook without downgrading or re-recording', async () => {
    const { store, updates } = makeStore({
      order: { id: 'order-1', status: 'PAID' },
    });

    const outcome = await confirmPostcardCheckoutSession(store, makeSession());

    expect(outcome).toEqual({
      status: 'duplicate',
      orderId: 'order-1',
      orderStatus: 'PAID',
    });
    expect(updates).toHaveLength(0);
    expect(serverStore.recordPierrotEvent).not.toHaveBeenCalled();
  });

  it('rejects a missing order id before touching the database', async () => {
    const { store, updates } = makeStore();

    const outcome = await confirmPostcardCheckoutSession(
      store,
      makeSession({ metadata: { type: 'postcard_v1' } })
    );

    expect(outcome).toEqual({ status: 'rejected', code: 'missing_order' });
    expect(updates).toHaveLength(0);
  });

  it('returns a retryable rejection when the order update fails', async () => {
    const { store } = makeStore({ updateError: new Error('db down') });

    const outcome = await confirmPostcardCheckoutSession(store, makeSession());

    expect(outcome).toEqual({
      status: 'rejected',
      code: 'update_failed',
      orderId: 'order-1',
    });
    expect(serverStore.recordPierrotEvent).not.toHaveBeenCalled();
  });

  it('does not fail confirmation when attribution cannot be recorded', async () => {
    const { store } = makeStore({ conversation: null });

    const outcome = await confirmPostcardCheckoutSession(store, makeSession());

    expect(outcome).toEqual({ status: 'confirmed', orderId: 'order-1' });
    expect(serverStore.recordPierrotEvent).not.toHaveBeenCalled();
  });
});
