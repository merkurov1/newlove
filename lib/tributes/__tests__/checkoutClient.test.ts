import {
  createTributeCheckout,
  openSecureCheckout,
} from '@/lib/tributes/checkoutClient';

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: {
      get: () => 'application/json',
    },
  } as unknown as Response;
}

describe('Tribute checkout client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete (window as Window & { Telegram?: unknown }).Telegram;
  });

  it('posts the selected amount to the server-validated checkout route', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        url: 'https://checkout.stripe.com/c/pay/test',
        sessionId: 'cs_test_1234567890',
      })
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createTributeCheckout({
      amount: 20,
      donorName: 'Pilgrim',
      message: 'Fuel for the Temple',
    });

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/c/pay/test',
      sessionId: 'cs_test_1234567890',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(url).toBe('/api/tribute/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      amount: 20,
      currency: 'usd',
      donor_name: 'Pilgrim',
      message: 'Fuel for the Temple',
    });
  });

  it('keeps opaque Pierrot attribution when present', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        url: 'https://checkout.stripe.com/c/pay/test',
        sessionId: 'cs_test_1234567890',
      })
    );

    global.fetch = fetchMock as unknown as typeof fetch;
    const conversationId = '11111111-1111-4111-8111-111111111111';

    await createTributeCheckout({
      amount: 5,
      search: `?pierrot=ptri_${conversationId}`,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];

    expect(JSON.parse(String(init.body))).toMatchObject({
      pierrotAttribution: `ptri_${conversationId}`,
    });
  });

  it('surfaces the server error without inventing a checkout URL', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ error: 'Invalid amount' }, 400)
    ) as unknown as typeof fetch;

    await expect(createTributeCheckout({ amount: 0 })).rejects.toThrow(
      'Invalid amount'
    );
  });

  it('uses the Telegram openLink bridge when available', () => {
    const openLink = jest.fn();

    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'audit-init-data', openLink },
    };

    expect(
      openSecureCheckout('https://checkout.stripe.com/c/pay/test')
    ).toBe('telegram');
    expect(openLink).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/test',
      { try_instant_view: false }
    );
  });
});
