import {
  clearTributeConfirmedSessionsForTests,
  markTributeConfirmedOnce,
  trackTributeAmountSelected,
  trackTributeCheckoutCreated,
  trackTributePaymentConfirmed,
} from '@/lib/tributes/analytics';
import { resetGaForTests } from '@/lib/analytics/ga4';

const originalNodeEnv = process.env.NODE_ENV;

function events(): Array<Record<string, unknown>> {
  const dataLayer =
    (window as unknown as { dataLayer?: unknown[] }).dataLayer || [];

  return dataLayer.filter(
    (entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object'
  );
}

beforeEach(() => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'production',
    configurable: true,
  });
  resetGaForTests();
  clearTributeConfirmedSessionsForTests();
  window.sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: originalNodeEnv,
    configurable: true,
  });
  resetGaForTests();
});

describe('Tribute funnel analytics', () => {
  it('reports amount and checkout events without donor identity', () => {
    trackTributeAmountSelected(20, true);
    trackTributeCheckoutCreated(20);

    const [selected, created] = events();

    expect(selected).toMatchObject({
      event: 'tribute_amount_selected',
      amount: 20,
      currency: 'usd',
      preset: true,
    });
    expect(created).toMatchObject({
      event: 'tribute_checkout_created',
      amount: 20,
    });
    expect(JSON.stringify(events())).not.toMatch(/@|email|donor_name/i);
  });

  it('counts a confirmed payment once per checkout session', () => {
    expect(markTributeConfirmedOnce('cs_test_one')).toBe(true);
    expect(markTributeConfirmedOnce('cs_test_one')).toBe(false);

    trackTributePaymentConfirmed(20);

    expect(
      events().filter((entry) => entry.event === 'tribute_payment_confirmed')
    ).toHaveLength(1);
  });
});
