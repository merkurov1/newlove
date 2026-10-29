/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  PIERROT_OFFER_IDS,
  PIERROT_OFFERS,
  getPierrotOfferById,
  getVerifiedOfferCta,
  isVerifiedPierrotInternalDestination,
  normalizePierrotOfferCta,
} from '../offers';

describe('Pierrot verified offer catalogue', () => {
  it('has one entry per known offer and only verified routes', () => {
    expect(PIERROT_OFFERS.map((offer) => offer.id)).toEqual([...PIERROT_OFFER_IDS]);

    for (const offer of PIERROT_OFFERS) {
      expect(isVerifiedPierrotInternalDestination(offer.route)).toBe(true);
      expect(offer.unknowns.length).toBeGreaterThan(0);
      expect(getVerifiedOfferCta(offer.id)).not.toBeNull();
    }
  });

  it('keeps the public postcard price and existing order route', () => {
    const offer = getPierrotOfferById('heart_angel_postcard');
    const price = offer.facts.find((fact) => fact.key === 'public_price');

    expect(price?.value).toBe('£29');
    expect(offer.cta.href).toBe('/heartandangel/card#order');
    expect(offer.availability.verifier).toBe('postcards');
  });

  it('does not invent unconfirmed physical or delivery facts', () => {
    const postcard = getPierrotOfferById('heart_angel_postcard');
    const factText = postcard.facts
      .map((fact) => fact.value)
      .join(' ')
      .toLowerCase();

    expect(factText).not.toContain('signed');
    expect(factText).not.toContain('limited edition');
    expect(factText).not.toContain('free shipping');
    expect(factText).not.toContain('worldwide');
    expect(factText).not.toContain('delivery within');
    expect(postcard.unknowns).toEqual(
      expect.arrayContaining(['Delivery time', 'Signed or limited editions'])
    );
  });

  it('separates Journal reading from Flow and does not claim free or paid terms', () => {
    const offer = getPierrotOfferById('journal_flow');
    const factText = offer.facts
      .map((fact) => `${fact.key}:${fact.value}`)
      .join(' ')
      .toLowerCase();

    expect(factText).toContain('journal');
    expect(factText).toContain('flow');
    expect(factText).toContain('notes');
    expect(factText).toContain('free or paid');
    expect(offer.cta.href).toBe('/journal#subscribe');
  });

  it('marks UNFRAMED as conditional and keeps direct-purchase claims out of facts', () => {
    const offer = getPierrotOfferById('unframed');
    const factText = offer.facts
      .map((fact) => fact.value)
      .join(' ')
      .toLowerCase();

    expect(offer.availability.status).toBe('conditional');
    expect(factText).toContain('apple books');
    expect(factText).toContain('barnes');
    expect(factText).toContain('/unframed/book');
    expect(factText).toContain('proposal request');
    expect(factText).not.toContain('buy the book');
    expect(factText).not.toContain('print edition');
    expect(offer.unknowns).toEqual(
      expect.arrayContaining([
        'Print, signed or limited editions',
        'Whether the private reader checkout is fully operational end-to-end',
      ])
    );
  });

  it('does not turn Art Engine access into a priced service', () => {
    const offer = getPierrotOfferById('art_engine');
    const factText = offer.facts
      .map((fact) => fact.value)
      .join(' ')
      .toLowerCase();

    expect(offer.kind).toBe('access');
    expect(offer.availability.status).toBe('access_request');
    expect(factText).toContain('no public price');
    expect(offer.cta.purpose).toBe('request_access');
  });

  it('rejects fabricated or tampered destinations', () => {
    expect(isVerifiedPierrotInternalDestination('/lobby')).toBe(true);
    expect(isVerifiedPierrotInternalDestination('/journal#subscribe')).toBe(true);
    expect(isVerifiedPierrotInternalDestination('/checkout')).toBe(false);
    expect(isVerifiedPierrotInternalDestination('//evil.example')).toBe(false);
    expect(isVerifiedPierrotInternalDestination('https://evil.example')).toBe(false);

    const cta = getVerifiedOfferCta('heart_angel_postcard');
    expect(cta).not.toBeNull();

    expect(
      normalizePierrotOfferCta({
        ...cta,
        href: '/api/postcards/order',
      })
    ).toBeNull();

    expect(getVerifiedOfferCta('journal_flow')).toMatchObject({
      href: '/journal#subscribe',
      kind: 'internal',
    });
  });
});
