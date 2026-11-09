import {
  GA_EVENTS,
  isGoogleAnalyticsEnabled,
  resetGaForTests,
  sanitizeGaParams,
  trackGaEvent,
} from '../ga4';

const originalNodeEnv = process.env.NODE_ENV;

function setProduction(value: boolean) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: value ? 'production' : 'test',
    configurable: true,
  });
}

afterEach(() => {
  setProduction(originalNodeEnv === 'production');
  resetGaForTests();
  delete (window as unknown as { gtag?: unknown }).gtag;
});

describe('GA4 environment gate', () => {
  it('is disabled outside production', () => {
    setProduction(false);
    expect(isGoogleAnalyticsEnabled()).toBe(false);
    expect(trackGaEvent(GA_EVENTS.pageView, { page_path: '/flow' })).toBe(false);
  });

  it('does not load or send anything outside production', () => {
    setProduction(false);
    const gtag = jest.fn();
    (window as unknown as { gtag: jest.Mock }).gtag = gtag;
    trackGaEvent(GA_EVENTS.pageView, { page_path: '/flow' });
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('GA4 payload safety', () => {
  it('drops private keys and nested objects', () => {
    const clean = sanitizeGaParams({
      section: 'flow',
      project: 'heart_angel',
      email: 'anton@example.com',
      message: 'private text',
      conversation_id: 'abc',
      food: 'apple',
      intake_item: 'coffee',
      brain_query: 'private',
      owner_id: 'owner-1',
      token: 'secret',
      nested: { a: 1 } as unknown as string,
      long: 'x'.repeat(300),
    });

    expect(clean).toMatchObject({
      section: 'flow',
      project: 'heart_angel',
    });
    expect(clean).not.toHaveProperty('email');
    expect(clean).not.toHaveProperty('message');
    expect(clean).not.toHaveProperty('conversation_id');
    expect(clean).not.toHaveProperty('food');
    expect(clean).not.toHaveProperty('intake_item');
    expect(clean).not.toHaveProperty('brain_query');
    expect(clean).not.toHaveProperty('owner_id');
    expect(clean).not.toHaveProperty('token');
    expect(clean).not.toHaveProperty('nested');
    expect((clean.long as string).length).toBe(100);
  });

  it('sends a sanitized event to gtag in production', () => {
    setProduction(true);
    const gtag = jest.fn();
    (window as unknown as { gtag: jest.Mock }).gtag = gtag;

    expect(
      trackGaEvent(GA_EVENTS.flowSubscribeStart, {
        method: 'email',
        language: 'ru',
        email: 'anton@example.com',
      })
    ).toBe(true);

    expect(gtag).toHaveBeenCalledWith('event', 'flow_subscribe_start', {
      method: 'email',
      language: 'ru',
    });
  });

  it('queues on dataLayer when gtag has not loaded yet', () => {
    setProduction(true);
    expect(trackGaEvent(GA_EVENTS.flowView, { section: 'flow' })).toBe(true);
    expect((window as unknown as { dataLayer: unknown[] }).dataLayer).toContainEqual({
      event: 'flow_view',
      section: 'flow',
    });
  });

  it('rejects invalid GA4 event names', () => {
    setProduction(true);
    expect(trackGaEvent('Not A Valid Name', { section: 'flow' })).toBe(false);
    expect(trackGaEvent('', { section: 'flow' })).toBe(false);
  });
});
