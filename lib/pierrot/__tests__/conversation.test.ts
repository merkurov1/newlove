/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  PIERROT_MAX_MESSAGE_LENGTH,
  detectPierrotLanguage,
  isPierrotClientEventName,
  isPierrotId,
  normalizePierrotConsent,
  normalizePierrotEventKey,
  sanitizePierrotEventPayload,
  sanitizePierrotPathname,
  sanitizePierrotReferrer,
} from '../conversation';

describe('Pierrot conversation validation', () => {
  it('accepts opaque browser ids but rejects path or SQL fragments', () => {
    expect(isPierrotId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isPierrotId('pierrot-12345678')).toBe(true);
    expect(isPierrotId('../../etc/passwd')).toBe(false);
    expect(isPierrotId("x'; drop table users;--")).toBe(false);
    expect(isPierrotId('short')).toBe(false);
    expect(isPierrotId('a'.repeat(65))).toBe(false);
  });

  it('keeps only a local route as a start page', () => {
    expect(sanitizePierrotPathname('/lobby?email=visitor@example.com#x')).toBe('/lobby');
    expect(sanitizePierrotPathname('//evil.example/path')).toBe('/');
    expect(sanitizePierrotPathname('https://evil.example')).toBe('/');
    expect(sanitizePierrotPathname('/a//b')).toBe('/a/b');
  });

  it('strips query strings and credentials from referrers', () => {
    expect(sanitizePierrotReferrer('https://news.example/story?q=private#section')).toBe(
      'https://news.example/story'
    );
    expect(sanitizePierrotReferrer('https://user:pass@news.example/story')).toBe(
      'https://news.example/story'
    );
    expect(sanitizePierrotReferrer('javascript:alert(1)')).toBeNull();
    expect(sanitizePierrotReferrer('not a url')).toBeNull();
  });

  it('detects only a coarse conversation language', () => {
    expect(detectPierrotLanguage('Расскажи про искусство')).toBe('ru');
    expect(detectPierrotLanguage('Tell me about art')).toBe('en');
    expect(detectPierrotLanguage('12345')).toBe('und');
  });

  it('normalizes consent without accepting arbitrary states', () => {
    expect(normalizePierrotConsent({ state: 'granted', version: 'v1' })).toEqual({
      state: 'granted',
      version: 'v1',
    });
    expect(normalizePierrotConsent({ state: 'yes' })).toBeNull();
    expect(normalizePierrotConsent(null)).toBeNull();
  });

  it('limits client events to real actions and whitelisted metadata', () => {
    expect(isPierrotClientEventName('navigation_completed')).toBe(true);
    expect(isPierrotClientEventName('message_sent')).toBe(false);
    expect(isPierrotClientEventName('purchase_confirmed')).toBe(false);

    expect(normalizePierrotEventKey('abc-123')).toBe('abc-123');
    expect(normalizePierrotEventKey('../bad key')).toBeNull();

    expect(
      sanitizePierrotEventPayload('action_clicked', {
        action_kind: 'navigate',
        section_id: 'art',
        label_length: 9,
        price: 999999,
        outcome: 'confirmed',
      })
    ).toEqual({ action_kind: 'navigate', section_id: 'art', label_length: 9 });

    expect(
      sanitizePierrotEventPayload('navigation_proposed', {
        section_id: 'not-a-section',
        route: 'https://evil.example',
      })
    ).toBeNull();

    expect(sanitizePierrotEventPayload('conversation_ended', { reason: 'new_chat' })).toEqual({
      reason: 'new_chat',
    });

    expect(
      sanitizePierrotEventPayload('offer_action_clicked', {
        offer_id: 'heart_angel_postcard',
        cta_kind: 'internal',
        destination: '/heartandangel/card#order',
      })
    ).toEqual({
      offer_id: 'heart_angel_postcard',
      cta_kind: 'internal',
      destination: '/heartandangel/card#order',
    });

    expect(
      sanitizePierrotEventPayload('offer_action_clicked', {
        offer_id: 'heart_angel_postcard',
        cta_kind: 'internal',
        destination: '/api/postcards/order',
      })
    ).toBeNull();

    expect(isPierrotClientEventName('subscribe_cta_clicked')).toBe(true);
    expect(
      sanitizePierrotEventPayload('subscribe_cta_clicked', {
        offer_id: 'journal_flow',
        email: 'private@example.com',
      })
    ).toEqual({ offer_id: 'journal_flow' });
    expect(
      sanitizePierrotEventPayload('subscribe_cta_clicked', {
        offer_id: 'heart_angel_postcard',
      })
    ).toBeNull();
  });

  it('keeps the validated message limit at 4000 characters', () => {
    expect(PIERROT_MAX_MESSAGE_LENGTH).toBe(4000);
  });
});
