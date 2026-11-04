/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/pierrot/commercialAnalytics', () => ({
  recordPierrotDonationCompleted: jest.fn(async () => true),
}));

const analytics = require('@/lib/pierrot/commercialAnalytics') as {
  recordPierrotDonationCompleted: {
    mockClear: () => void;
    mock: { calls: unknown[][] };
  };
};

const { confirmTributeCheckoutSession } = require('@/lib/tributes/paymentConfirmation') as {
  confirmTributeCheckoutSession: (
    store: unknown,
    session: unknown
  ) => Promise<{ status: string; [key: string]: unknown }>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';

type StoreOptions = {
  existing?: Record<string, unknown> | null;
  lookupError?: unknown;
  insertError?: unknown;
};

function makeStore(options: StoreOptions = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const templeLogs: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'temple_log') {
        return {
          insert: (row: Record<string, unknown>) => {
            templeLogs.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table !== 'tributes') throw new Error(`Unexpected table ${table}`);

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.existing ?? null,
              error: options.lookupError ?? null,
            }),
          }),
        }),
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return Promise.resolve({ error: options.insertError ?? null });
        },
      };
    },
  };

  return { store, inserted, templeLogs };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_tribute_test',
    payment_status: 'paid',
    amount_total: 2000,
    currency: 'usd',
    metadata: {
      type: 'tribute_v1',
      donor_name: 'Pilgrim',
      message: 'Fuel for the Temple',
      pierrotAttribution: `ptri_${conversationId}`,
      ...overrides,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  analytics.recordPierrotDonationCompleted.mockClear();
});

describe('Tribute payment confirmation', () => {
  it('ignores non-Tribute and unpaid sessions', async () => {
    const { store, templeLogs } = makeStore();

    expect(
      (await confirmTributeCheckoutSession(store, session({ type: 'postcard_v1' }))).status
    ).toBe('ignored');
    expect(
      (
        await confirmTributeCheckoutSession(store, {
          ...session(),
          payment_status: 'unpaid',
        })
      ).status
    ).toBe('ignored');
    expect(analytics.recordPierrotDonationCompleted.mock.calls).toHaveLength(0);
    expect(templeLogs).toHaveLength(0);
  });

  it('inserts one Tribute and one dedicated donation event for a paid session', async () => {
    const { store, inserted, templeLogs } = makeStore();

    const outcome = await confirmTributeCheckoutSession(store, session());

    expect(outcome.status).toBe('confirmed');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      amount_cents: 2000,
      currency: 'usd',
      status: 'succeeded',
      stripe_session_id: 'cs_tribute_test',
    });
    expect(templeLogs).toHaveLength(1);
    expect(templeLogs[0]).toMatchObject({
      event_type: 'TRIBUTE',
      author: 'Pilgrim',
    });
    expect(analytics.recordPierrotDonationCompleted).toHaveBeenCalledWith(
      store,
      expect.objectContaining({
        conversationId,
        eventKey: 'donation_completed:cs_tribute_test',
        offerId: 'temple_tribute',
        amountTotal: 2000,
        currency: 'usd',
        source: 'tribute_webhook',
      })
    );
  });

  it('does not insert a second Tribute on a repeated webhook but can backfill attribution', async () => {
    const { store, inserted, templeLogs } = makeStore({
      existing: { id: 'tribute-1' },
    });

    const outcome = await confirmTributeCheckoutSession(store, session());

    expect(outcome.status).toBe('duplicate');
    expect(inserted).toHaveLength(0);
    expect(templeLogs).toHaveLength(0);
    expect(analytics.recordPierrotDonationCompleted).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a concurrent unique-constraint insert as a duplicate', async () => {
    const { store, inserted, templeLogs } = makeStore({
      insertError: { code: '23505' },
    });

    const outcome = await confirmTributeCheckoutSession(store, session());

    expect(outcome.status).toBe('duplicate');
    expect(inserted).toHaveLength(1);
    expect(templeLogs).toHaveLength(0);
    expect(analytics.recordPierrotDonationCompleted).toHaveBeenCalledTimes(1);
  });

  it('rejects a session without a trustworthy amount', async () => {
    const { store } = makeStore();

    const outcome = await confirmTributeCheckoutSession(store, {
      ...session(),
      amount_total: null,
    });

    expect(outcome).toMatchObject({ status: 'rejected', code: 'missing_amount' });
    expect(analytics.recordPierrotDonationCompleted).toHaveBeenCalledTimes(0);
  });
});
