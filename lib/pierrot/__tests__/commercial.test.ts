/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { buildPierrotCommercialPrompt, planPierrotResponse } from '../commercial';
import { classifyPierrotIntent } from '../intents';
import { loadPierrotOfferPolicies } from '../offerPolicy';
import type { PierrotOfferRuntime } from '../offerAvailability';

function runtime(overrides: Partial<PierrotOfferRuntime>): PierrotOfferRuntime {
  return {
    offerId: 'heart_angel_postcard',
    available: null,
    priceMinorUnits: null,
    currency: 'GBP',
    subscribed: null,
    source: 'unverified',
    ...overrides,
  };
}

function plan(message: string, previousOfferId?: string) {
  return planPierrotResponse({
    intent: classifyPierrotIntent(message),
    language: 'en',
    previousOfferId,
  });
}

function planOnPostcardPage(message: string) {
  return planPierrotResponse({
    intent: classifyPierrotIntent(message),
    language: 'en',
    contextOfferId: 'heart_angel_postcard',
  });
}

describe('Pierrot commercial planner', () => {
  it('returns grounded postcard information with the existing order CTA', () => {
    const result = plan('Tell me about the Heart & Angel postcard');

    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('heart_angel_postcard');
    expect(result.reply).toContain('£29');
    expect(result.reply).toContain('postage included');
    expect(result.cta).toMatchObject({
      href: '/heartandangel/card#order',
      purpose: 'order',
      kind: 'internal',
    });
    expect(result.offerViewed).toBe(true);
    expect(result.ctaShown).toBe(true);
  });

  it('uses a verified live price when the postcard source returns one', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('I want to buy the Heart & Angel postcard'),
      language: 'en',
      runtime: runtime({
        available: true,
        priceMinorUnits: 3100,
        source: 'postcards',
      }),
    });

    expect(result.mode).toBe('offer');
    expect(result.reply).toContain('£31.00');
    expect(result.cta).not.toBeNull();
  });

  it('does not sell an unavailable postcard', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('I want to buy the Heart & Angel postcard'),
      language: 'en',
      runtime: runtime({
        available: false,
        source: 'postcards',
      }),
    });

    expect(result.offerUnavailable).toBe(true);
    expect(result.cta).toBeNull();
    expect(result.ctaShown).toBe(false);
    expect(result.reply?.toLowerCase()).toContain('unavailable');
  });

  it('withholds a CTA when the owner disables an offer', () => {
    const offerPolicies = loadPierrotOfferPolicies({
      PIERROT_OFFER_POLICY_JSON: JSON.stringify({
        heart_angel_postcard: { enabled: false },
      }),
    });
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('I want to buy the Heart & Angel postcard'),
      language: 'en',
      offerPolicies,
    });

    expect(result.offer?.id).toBe('heart_angel_postcard');
    expect(result.cta).toBeNull();
    expect(result.offerSelected).toBe(false);
    expect(result.ctaShown).toBe(false);
  });

  it('does not pretend an unverified stock state is available', () => {
    const result = plan('I want to buy the Heart & Angel postcard');

    expect(result.reply).toContain('cannot confirm live stock');
    expect(result.cta).not.toBeNull();
  });

  it('stops the sale after a refusal and offers navigation instead', () => {
    const result = plan('No thanks, I am not interested');

    expect(result.mode).toBe('decline');
    expect(result.commercialDeclined).toBe(true);
    expect(result.cta).toBeNull();
    expect(result.actions).toEqual([
      {
        kind: 'navigate',
        label: 'Return to navigation',
        sectionId: 'lobby',
      },
    ]);
  });

  it('answers a price question only from the live catalogue', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('How much is the Heart & Angel postcard?'),
      language: 'en',
      runtime: runtime({
        available: true,
        priceMinorUnits: 3100,
        source: 'postcards',
      }),
    });

    expect(result.offer?.id).toBe('heart_angel_postcard');
    expect(result.reply).toContain('£31.00');
    expect(result.reply).toContain('Postage included');
    expect(result.reply).not.toContain('£29');
    expect(result.cta?.href).toBe('/heartandangel/card#order');
  });

  it('explains the existing recipient and message fields', () => {
    const result = plan('Can I send the Heart & Angel postcard to someone else?');

    expect(result.reply).toContain('recipient');
    expect(result.reply).toContain('delivery address');
    expect(result.reply).toContain('personal message');
    expect(result.reply).toContain('Stripe');
    expect(result.cta).not.toBeNull();
  });

  it('admits that delivery terms are not confirmed', () => {
    const result = plan('How long does delivery take for the Heart & Angel postcard?');

    expect(result.reply).toContain('Postage is included');
    expect(result.reply).toContain('do not have a confirmed delivery time');
    expect(result.reply).not.toContain('days');
  });

  it('admits that material details are not confirmed', () => {
    const result = plan('What material and size is the Heart & Angel postcard?');
    const reply = (result.reply || '').toLowerCase();

    expect(reply).toContain('do not have confirmed details');
    expect(reply).not.toContain('gsm');
    expect(reply).not.toContain('limited edition');
  });

  it('answers availability from the catalogue, not from optimism', () => {
    const available = planPierrotResponse({
      intent: classifyPierrotIntent('Is the Heart & Angel postcard in stock?'),
      language: 'en',
      runtime: runtime({
        available: true,
        priceMinorUnits: 2900,
        source: 'postcards',
      }),
    });
    const unavailable = planPierrotResponse({
      intent: classifyPierrotIntent('Is the Heart & Angel postcard in stock?'),
      language: 'en',
      runtime: runtime({ available: false, source: 'postcards' }),
    });

    expect(available.reply).toContain('in stock');
    expect(available.cta).not.toBeNull();

    expect(unavailable.reply).toContain('unavailable');
    expect(unavailable.cta).toBeNull();
  });

  it('answers a price objection once, without pressure or a CTA', () => {
    const result = plan('The Heart & Angel postcard is too expensive');

    expect(result.offer?.id).toBe('heart_angel_postcard');
    expect(result.reply).toContain('physical');
    expect(result.reply).toContain('no pressure');
    expect(result.cta).toBeNull();
    expect(result.ctaShown).toBe(false);
  });

  it('resolves a demonstrative question on the postcard page', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('How much is this?'),
      language: 'en',
      contextOfferId: 'heart_angel_postcard',
      runtime: runtime({
        available: true,
        priceMinorUnits: 2900,
        source: 'postcards',
      }),
    });

    expect(planOnPostcardPage('How much is this?').offer?.id).toBe('heart_angel_postcard');
    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('heart_angel_postcard');
    expect(result.reply).toContain('£29.00');
  });

  it('never claims a purchase from a CTA or checkout session', () => {
    const purchase = plan('I want to buy the Heart & Angel postcard');
    const product = plan('What is the Heart & Angel postcard?');

    for (const result of [purchase, product]) {
      expect(result.reply?.toLowerCase()).not.toContain('purchased');
      expect(result.reply?.toLowerCase()).not.toContain('order confirmed');
      expect(result.reply?.toLowerCase()).not.toContain('paid');
    }
  });

  it('honours explicit navigation after a refusal without restarting the sale', () => {
    const result = plan('No thanks, take me to the Journal');

    expect(result.mode).toBe('navigation');
    expect(result.commercialDeclined).toBe(true);
    expect(result.cta).toBeNull();
    expect(result.actions).toEqual([
      {
        kind: 'navigate',
        label: 'Enter Journal',
        sectionId: 'journal',
      },
    ]);
  });

  it('keeps navigation explicit and marks a return from an offer', () => {
    const result = plan('Take me to the Journal', 'heart_angel_postcard');

    expect(result.mode).toBe('navigation');
    expect(result.actions).toEqual([
      {
        kind: 'navigate',
        label: 'Enter Journal',
        sectionId: 'journal',
      },
    ]);
    expect(result.commercialReturned).toEqual({
      fromOfferId: 'heart_angel_postcard',
      sectionId: 'journal',
    });
    expect(result.cta).toBeNull();
  });

  it('does not invent an unknown product', () => {
    const result = plan('How much is the golden unicorn?');

    expect(result.mode).toBe('unknown_product');
    expect(result.cta).toBeNull();
    expect(result.reply).not.toContain('£');
  });

  it('does not turn an unknown product into the postcard on its page', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('How much is the golden unicorn?'),
      language: 'en',
      contextOfferId: 'heart_angel_postcard',
    });

    expect(result.mode).toBe('unknown_product');
    expect(result.offer).toBeNull();
    expect(result.cta).toBeNull();
  });

  it('explains Journal versus Flow and points to the real subscription form', () => {
    const result = plan('What is Journal and Flow?');

    expect(result.offer?.id).toBe('journal_flow');
    expect(result.reply).toContain('Journal');
    expect(result.reply).toContain('Flow');
    expect(result.reply).toContain('/journal#subscribe');
    expect(result.reply?.toLowerCase()).toContain(
      'do not confirm whether the subscription is free or paid'
    );
    expect(result.cta?.href).toBe('/journal#subscribe');
  });

  it('runs the service qualification flow without treating access as a lead', () => {
    const service = planPierrotResponse({
      intent: classifyPierrotIntent('I need help analysing my collection'),
      language: 'en',
      serviceInquiry: {
        id: 'lead-12345678',
        status: 'qualified',
        needType: 'analysis',
        stage: 'exploring',
        timeline: 'this_quarter',
        questionsAsked: 2,
        qualified: true,
        nextQuestion: null,
        summary: 'analysis / exploring / this_quarter',
      },
    });
    const access = plan('Can I request access to Art Engine?');

    expect(service.reply).toContain('Summary');
    expect(service.links?.[0]?.href).toBe('/advising/request?lead=lead-12345678&lang=en');
    expect(service.cta).toBeNull();

    expect(access.offer?.id).toBe('art_engine');
    expect(access.cta?.href).toBe('/art-engine');
    expect(access.links).toEqual([]);
  });

  it('admits when the service qualification could not be stored', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('I need a consultation'),
      language: 'en',
      serviceInquiryUnavailable: true,
    });

    expect(result.reply).toContain('could not save the qualification');
    expect(result.cta?.href).toBe('https://wa.me/16467270865');
  });

  it('asks one qualification question when service state is incomplete', () => {
    const result = planPierrotResponse({
      intent: classifyPierrotIntent('I need a consultation'),
      language: 'en',
      serviceInquiry: {
        id: 'lead-12345678',
        status: 'new',
        needType: 'consultation',
        stage: null,
        timeline: null,
        questionsAsked: 1,
        qualified: false,
        nextQuestion: 'stage',
        summary: 'consultation',
      },
    });

    expect(result.reply).toContain('Where are you in the process');
    expect(result.actions?.length).toBeGreaterThan(0);
    expect(result.links).toEqual([]);
    expect(result.cta).toBeNull();
  });

  it('describes Art Engine as access, not a public purchase', () => {
    const info = plan('What is Art Engine?');
    const access = plan('Can I request access to Art Engine?');

    expect(info.mode).toBe('offer');
    expect(info.reply?.toLowerCase()).toContain('no public price');
    expect(info.reply?.toLowerCase()).not.toContain('buy');

    expect(access.mode).toBe('offer');
    expect(access.cta).toMatchObject({
      href: '/art-engine',
      purpose: 'request_access',
    });
  });

  it('keeps UNFRAMED conditional and does not confirm a direct purchase', () => {
    const result = plan('Can I buy UNFRAMED as an ebook?');

    expect(result.mode).toBe('offer');
    expect(result.reply).toContain('Apple Books');
    expect(result.reply).toContain('Barnes & Noble');
    expect(result.reply?.toLowerCase()).toContain('retailer');
    expect(result.reply?.toLowerCase()).not.toContain('buy the book here');
    expect(result.cta?.href).toBe('/unframed');
  });

  it('distinguishes UNFRAMED retail links, manuscript access and the publisher form', () => {
    const result = plan('Can I buy UNFRAMED as an ebook?');

    expect(result.offer?.id).toBe('unframed');
    expect(result.reply).toContain('Apple Books');
    expect(result.reply).toContain('Barnes & Noble');
    expect(result.reply).toContain('/unframed/book');
    expect(result.reply).toContain('proposal request');
    expect(result.links?.[0]?.href).toBe('/unframed/book');
    expect(result.cta?.href).toBe('/unframed');
  });

  it('lets the model answer only ordinary questions', () => {
    const result = plan('What is context architecture?');

    expect(result.useModel).toBe(true);
    expect(result.mode).toBe('model');
    expect(result.cta).toBeNull();
    expect(result.offerViewed).toBe(false);
  });

  it('grounds model prompts in the catalogue and forbids invented facts', () => {
    const result = plan('What is Art Engine?');
    const prompt = buildPierrotCommercialPrompt(result);

    expect(prompt).toContain('COMMERCIAL DECISION');
    expect(prompt).toContain('No public price');
    expect(prompt).toContain('Never invent a route, price');
    expect(prompt).toContain('Unknown');
  });
});
