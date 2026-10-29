/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  appendPierrotPostcardAttribution,
  appendPierrotSubscriptionAttribution,
  appendPierrotUnframedAttribution,
  createPierrotPostcardRef,
  createPierrotSubscriptionRef,
  createPierrotUnframedRef,
  normalizePierrotPostcardRef,
  normalizePierrotSubscriptionRef,
  normalizePierrotUnframedRef,
  pierrotConversationIdFromRef,
  pierrotConversationIdFromSubscriptionRef,
  pierrotConversationIdFromUnframedRef,
  readPierrotPostcardAttribution,
} from '../orderAttribution';

const conversationId = '11111111-1111-4111-8111-111111111111';

describe('Pierrot postcard order attribution', () => {
  it('creates an opaque reference from the conversation id', () => {
    const ref = createPierrotPostcardRef(conversationId);

    expect(ref).toBe(`pcard_${conversationId}`);
    expect(ref).not.toContain('@');
    expect(pierrotConversationIdFromRef(ref)).toBe(conversationId);
  });

  it('rejects values that are not an opaque reference', () => {
    expect(normalizePierrotPostcardRef('hello@example.com')).toBeNull();
    expect(normalizePierrotPostcardRef('pcard_')).toBeNull();
    expect(normalizePierrotPostcardRef('pcard_../../etc/passwd')).toBeNull();
    expect(normalizePierrotPostcardRef(`pcard_${'a'.repeat(80)}`)).toBeNull();
  });

  it('adds attribution to the verified order CTA without changing its route', () => {
    const ref = createPierrotPostcardRef(conversationId);
    const href = appendPierrotPostcardAttribution('/heartandangel/card#order', ref);

    expect(href).toBe(`/heartandangel/card?pierrot=pcard_${conversationId}#order`);
    expect(href.startsWith('/heartandangel/card')).toBe(true);
  });

  it('reads only a valid attribution parameter from a URL query', () => {
    const ref = createPierrotPostcardRef(conversationId);

    expect(readPierrotPostcardAttribution(`?pierrot=${ref}`)).toBe(ref);
    expect(readPierrotPostcardAttribution('?pierrot=hello@example.com')).toBeNull();
    expect(readPierrotPostcardAttribution('?other=value')).toBeNull();
  });

  it('creates a separate opaque subscription reference', () => {
    const ref = createPierrotSubscriptionRef(conversationId);
    const href = appendPierrotSubscriptionAttribution('/journal#subscribe', ref);

    expect(ref).toBe(`psub_${conversationId}`);
    expect(normalizePierrotSubscriptionRef(ref)).toBe(ref);
    expect(pierrotConversationIdFromSubscriptionRef(ref)).toBe(conversationId);
    expect(href).toBe(`/journal?pierrot=psub_${conversationId}#subscribe`);
    expect(normalizePierrotSubscriptionRef(`pcard_${conversationId}`)).toBeNull();
  });

  it('creates a separate opaque UNFRAMED reference', () => {
    const ref = createPierrotUnframedRef(conversationId);
    const href = appendPierrotUnframedAttribution('/unframed/book', ref);

    expect(ref).toBe(`punf_${conversationId}`);
    expect(normalizePierrotUnframedRef(ref)).toBe(ref);
    expect(pierrotConversationIdFromUnframedRef(ref)).toBe(conversationId);
    expect(href).toBe(`/unframed/book?pierrot=punf_${conversationId}`);
    expect(normalizePierrotUnframedRef(`pcard_${conversationId}`)).toBeNull();
  });

  it('refuses to append to external or protocol-relative destinations', () => {
    const ref = createPierrotPostcardRef(conversationId);

    expect(appendPierrotPostcardAttribution('https://evil.example', ref)).toBe(
      'https://evil.example'
    );
    expect(appendPierrotPostcardAttribution('//evil.example', ref)).toBe('//evil.example');
  });
});
