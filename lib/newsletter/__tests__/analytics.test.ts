/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { classifyNewsletterAudience } from '../analytics';

const subscribers = [
  { isActive: true, confirmedAt: '2026-01-01T00:00:00.000Z', unsubscribedAt: null },
  { isActive: true, confirmedAt: '2026-01-02T00:00:00.000Z', unsubscribedAt: null },
  { isActive: false, confirmedAt: null, unsubscribedAt: null },
  { isActive: false, confirmedAt: null, unsubscribedAt: null },
  { isActive: false, confirmedAt: null, unsubscribedAt: '2026-01-03T00:00:00.000Z' },
];

const events = [
  {
    event_name: 'subscription_failed',
    event_key: 'fail-1',
    subscriber_id: 'sub-3',
    payload: { reason: 'email_send' },
  },
  {
    event_name: 'subscription_failed',
    event_key: 'fail-2',
    subscriber_id: 'sub-3',
    payload: { reason: 'email_send' },
  },
  {
    event_name: 'subscription_failed',
    event_key: 'bot-1',
    subscriber_id: null,
    payload: { reason: 'honeypot' },
  },
  {
    event_name: 'subscription_failed',
    event_key: 'bot-2',
    subscriber_id: null,
    payload: { reason: 'turnstile_invalid' },
  },
  {
    event_name: 'subscription_failed',
    event_key: 'rate-1',
    subscriber_id: null,
    payload: { reason: 'rate_limited_ip' },
  },
  {
    event_name: 'subscription_submitted',
    event_key: 'submitted-1',
    subscriber_id: 'sub-3',
    payload: { status: 'pending_confirmation' },
  },
];

describe('newsletter analytics classification', () => {
  it('counts only confirmed subscribers as audience', () => {
    const metrics = classifyNewsletterAudience(subscribers, events);

    expect(metrics.confirmed).toBe(2);
    expect(metrics.active).toBe(2);
    expect(metrics.pending).toBe(2);
    expect(metrics.unsubscribed).toBe(1);
    expect(metrics.total).toBe(5);
  });

  it('separates delivery failures, automated blocks and rate limits', () => {
    const metrics = classifyNewsletterAudience(subscribers, events);

    expect(metrics.deliveryFailures).toBe(1);
    expect(metrics.suspectedAutomated).toBe(2);
    expect(metrics.rateLimited).toBe(1);
    expect(metrics.blockedReasons).toEqual({
      honeypot: 1,
      turnstile_invalid: 1,
      rate_limited_ip: 1,
    });
  });

  it('never classifies people from email formatting, domain or confirmation speed', () => {
    const metrics = classifyNewsletterAudience(
      [
        {
          isActive: true,
          confirmedAt: '2026-01-01T00:00:01.000Z',
          unsubscribedAt: null,
        },
      ],
      []
    );

    expect(metrics.confirmed).toBe(1);
    expect(metrics.suspectedAutomated).toBe(0);
  });
});
