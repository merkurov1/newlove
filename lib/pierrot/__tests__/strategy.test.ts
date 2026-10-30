/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { planPierrotResponse } from '../commercial';
import { classifyPierrotIntent } from '../intents';
import { resolvePierrotPageContext } from '../pageContext';
import {
  derivePierrotCommercialState,
  emptyPierrotCommercialState,
  scorePierrotOfferInterest,
  selectProactivePierrotOffer,
} from '../strategy';

function plan({
  message,
  pathname,
  history,
  runtime,
}: {
  message: string;
  pathname?: string;
  history?: unknown;
  runtime?: Parameters<typeof planPierrotResponse>[0]['runtime'];
}) {
  return planPierrotResponse({
    intent: classifyPierrotIntent(message),
    language: 'en',
    message,
    pathname,
    runtime,
    commercialState: derivePierrotCommercialState({ history }),
  });
}

describe('Pierrot page context', () => {
  it('maps the three commercial surfaces without treating every route as a product', () => {
    expect(resolvePierrotPageContext('/heartandangel/card')).toMatchObject({
      surface: 'postcard',
      contextOfferId: 'heart_angel_postcard',
      allowProactive: true,
    });
    expect(resolvePierrotPageContext('/unframed/book')).toMatchObject({
      surface: 'unframed_reader',
      contextOfferId: 'unframed',
    });
    expect(resolvePierrotPageContext('/journal')).toMatchObject({
      surface: 'journal',
      contextOfferId: 'journal_flow',
    });
    expect(resolvePierrotPageContext('/flow/join')).toMatchObject({
      surface: 'flow_join',
      allowProactive: false,
    });
    expect(resolvePierrotPageContext('/unframed/proposal')).toMatchObject({
      surface: 'unframed_proposal',
      allowProactive: false,
    });
    expect(resolvePierrotPageContext('/lobby')).toMatchObject({
      surface: 'other',
      contextOfferId: null,
    });
  });
});

describe('Pierrot proactive commercial decisions', () => {
  it('introduces the postcard for a relevant Heart & Angel conversation', () => {
    const result = plan({
      message: 'I have been thinking about love and distance lately.',
      pathname: '/heartandangel',
    });

    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('heart_angel_postcard');
    expect(result.proactive).toBe(true);
    expect(result.useModel).toBe(true);
    expect(result.commercialStage).toBe('interest');
    expect(result.commercialReason).toMatch(/written message/);
    expect(result.cta?.href).toBe('/heartandangel/card#order');
  });

  it('returns to a repeated postcard interest with a fresh reason', () => {
    const first = plan({
      message: 'I have been thinking about love and distance lately.',
      pathname: '/heartandangel',
    });
    const history = [
      { role: 'user', content: 'I have been thinking about love and distance lately.' },
      {
        role: 'assistant',
        content: 'A card can carry what a message cannot.',
        offerId: 'heart_angel_postcard',
        commercialMarker: { offerId: 'heart_angel_postcard', action: 'introduced' },
      },
    ];
    const second = plan({
      message: 'Maybe I should send something to someone I love.',
      pathname: '/heartandangel',
      history,
    });

    expect(first.proactive).toBe(true);
    expect(second.mode).toBe('offer');
    expect(second.offer?.id).toBe('heart_angel_postcard');
    expect(second.proactive).toBe(true);
    expect(second.commercialStage).toBe('consideration');
    expect(second.commercialReason).not.toBe(first.commercialReason);
    expect(second.commercialReason).toMatch(/physical piece/);
    expect(second.cta?.href).toBe('/heartandangel/card#order');
  });

  it('does not pitch the same offer after an explicit refusal', () => {
    const state = derivePierrotCommercialState({
      history: [
        {
          role: 'assistant',
          content: 'The card is here.',
          offerId: 'heart_angel_postcard',
          commercialMarker: { offerId: 'heart_angel_postcard', action: 'introduced' },
        },
        {
          role: 'user',
          content: 'No thanks, not interested.',
        },
        {
          role: 'assistant',
          content: 'Understood.',
          commercialMarker: { offerId: 'heart_angel_postcard', action: 'declined' },
        },
      ],
    });
    const selected = selectProactivePierrotOffer({
      message: 'I still think about love and distance.',
      intent: classifyPierrotIntent('I still think about love and distance.'),
      pathname: '/heartandangel',
      state,
    });

    expect(selected).toBeNull();
    expect(state.declinedOfferIds).toContain('heart_angel_postcard');
  });

  it('still answers a direct product question and an explicitly requested CTA after a refusal', () => {
    const state = derivePierrotCommercialState({
      history: [
        {
          role: 'assistant',
          content: 'Understood.',
          commercialMarker: { offerId: 'heart_angel_postcard', action: 'declined' },
        },
      ],
    });
    const price = planPierrotResponse({
      intent: classifyPierrotIntent('How much is the Heart & Angel postcard?'),
      language: 'en',
      message: 'How much is the Heart & Angel postcard?',
      pathname: '/heartandangel',
      commercialState: state,
    });
    const purchase = planPierrotResponse({
      intent: classifyPierrotIntent('Send me the order link for the Heart & Angel postcard'),
      language: 'en',
      message: 'Send me the order link for the Heart & Angel postcard',
      pathname: '/heartandangel',
      commercialState: state,
    });

    expect(price.reply).toContain('£29');
    expect(price.offer?.id).toBe('heart_angel_postcard');
    expect(price.cta?.href).toBe('/heartandangel/card#order');
    expect(purchase.cta?.href).toBe('/heartandangel/card#order');
  });

  it('leaves an unrelated question on a commercial page alone', () => {
    const result = plan({
      message: 'What is context architecture?',
      pathname: '/heartandangel',
    });

    expect(result.mode).toBe('model');
    expect(result.offer).toBeNull();
    expect(result.cta).toBeNull();
    expect(result.offerSelected).toBe(false);
    expect(result.proactive).toBe(false);
  });

  it('introduces UNFRAMED for a personal-history conversation', () => {
    const result = plan({
      message: 'I have been thinking about my father and the Soviet past.',
      pathname: '/unframed',
    });

    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('unframed');
    expect(result.proactive).toBe(true);
    expect(result.cta?.href).toBe('/unframed');
    expect(result.links).toEqual([
      { label: 'Open the private manuscript', href: '/unframed/book' },
    ]);
    expect(result.reply).toBeUndefined();
    expect(result.useModel).toBe(true);
  });

  it('routes publisher interest to the proposal, not consumer checkout', () => {
    const message = 'I am a literary agent interested in UNFRAMED. Can I see the proposal?';
    const intent = classifyPierrotIntent(message);
    const result = plan({ message, pathname: '/unframed' });

    expect(intent.publisherIntent).toBe(true);
    expect(result.offer?.id).toBe('unframed');
    expect(result.cta).toBeNull();
    expect(result.ctaShown).toBe(false);
    expect(result.links).toEqual([
      { label: 'Open the publisher proposal', href: '/unframed/proposal' },
    ]);
    expect(result.reply).toContain('/unframed/proposal');
    expect(result.reply).not.toContain('checkout');
  });

  it('introduces the Journal / Flow subscription for sustained reading interest', () => {
    const result = plan({
      message: 'I keep reading Anton’s essays and want to follow new work.',
      pathname: '/journal',
    });

    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('journal_flow');
    expect(result.proactive).toBe(true);
    expect(result.cta?.href).toBe('/journal#subscribe');
    expect(result.commercialReason).toMatch(/Journal/);
  });

  it('does not re-pitch a subscription to a verified subscriber', () => {
    const result = plan({
      message: 'How do I subscribe to Flow?',
      pathname: '/journal',
      runtime: {
        offerId: 'journal_flow',
        available: true,
        priceMinorUnits: null,
        currency: 'GBP',
        subscribed: true,
        source: 'subscription',
      },
    });

    expect(result.offer?.id).toBe('journal_flow');
    expect(result.cta).toBeNull();
    expect(result.ctaShown).toBe(false);
    expect(result.offerSelected).toBe(false);
    expect(result.reply?.toLowerCase()).toContain('active subscription');
    expect(result.links?.map((link) => link.href)).toEqual(['/flow', '/journal#issues']);
  });

  it('answers a demonstrative question on each commercial surface with that surface’s offer', () => {
    const postcard = plan({ message: 'What is this?', pathname: '/heartandangel' });
    const book = plan({ message: 'What is this?', pathname: '/unframed' });
    const journal = plan({ message: 'What is this?', pathname: '/journal' });

    expect(postcard.offer?.id).toBe('heart_angel_postcard');
    expect(postcard.cta?.href).toBe('/heartandangel/card#order');
    expect(book.offer?.id).toBe('unframed');
    expect(book.cta?.href).toBe('/unframed');
    expect(journal.offer?.id).toBe('journal_flow');
    expect(journal.cta?.href).toBe('/journal#subscribe');
  });

  it('treats “tell me more” on an offer page as qualified interest, once', () => {
    const first = plan({ message: 'Tell me more.', pathname: '/unframed' });
    const history = [
      { role: 'user', content: 'Tell me more.' },
      {
        role: 'assistant',
        content: 'It is a memoir.',
        offerId: 'unframed',
        commercialMarker: { offerId: 'unframed', action: 'introduced' },
      },
    ];
    const repeat = plan({ message: 'Tell me more.', pathname: '/unframed', history });

    expect(first.offer?.id).toBe('unframed');
    expect(first.proactive).toBe(true);
    expect(first.cta?.href).toBe('/unframed');
    expect(repeat.offer).toBeNull();
    expect(repeat.cta).toBeNull();
  });

  it('offers the Journal when a visitor asks to follow the writing', () => {
    const result = plan({
      message: 'I want to read more of your writing.',
      pathname: '/',
    });

    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('journal_flow');
    expect(result.proactive).toBe(true);
    expect(result.cta?.href).toBe('/journal#subscribe');
  });

  it('suggests continuity when a visitor says they love the work', () => {
    const result = plan({
      message: 'I love your work.',
      pathname: '/',
    });

    expect(result.mode).toBe('offer');
    expect(result.offer?.id).toBe('journal_flow');
    expect(result.proactive).toBe(true);
  });

  it('does not offer a subscription off-page when the signed-in visitor is subscribed', () => {
    const result = plan({
      message: 'I want to read more of your writing.',
      pathname: '/',
      runtime: {
        offerId: 'journal_flow',
        available: true,
        priceMinorUnits: null,
        currency: 'GBP',
        subscribed: true,
        source: 'subscription',
      },
    });

    expect(result.mode).toBe('model');
    expect(result.offer).toBeNull();
    expect(result.cta).toBeNull();
    expect(result.useModel).toBe(true);
  });

  it('does not treat a negative reaction as interest', () => {
    const result = plan({
      message: 'I do not like it.',
      pathname: '/heartandangel',
    });

    expect(result.mode).toBe('model');
    expect(result.offer).toBeNull();
  });

  it('does not let an Art Engine-adjacent page turn a general art question into a sale', () => {
    const result = plan({
      message: 'What is the difference between context and narrative?',
      pathname: '/art-engine',
    });

    expect(result.mode).toBe('model');
    expect(result.offer).toBeNull();
    expect(result.cta).toBeNull();
  });
});

describe('Pierrot commercial state', () => {
  it('merges transcript markers with trusted server events', () => {
    const state = derivePierrotCommercialState({
      history: [
        {
          role: 'assistant',
          content: 'The card.',
          offerId: 'heart_angel_postcard',
          commercialMarker: { offerId: 'heart_angel_postcard', action: 'introduced' },
        },
      ],
      events: [
        {
          eventName: 'intent_classified',
          payload: { topic: 'price_objection', offer_id: 'heart_angel_postcard' },
        },
        {
          eventName: 'commercial_declined',
          payload: { offer_id: 'journal_flow' },
        },
        {
          eventName: 'order_paid',
          payload: { offer_id: 'heart_angel_postcard' },
        },
      ],
      subscriptionEvents: [{ eventName: 'subscription_confirmed', payload: {} }],
    });

    expect(state.introducedOfferIds).toContain('heart_angel_postcard');
    expect(state.objectionOfferIds).toContain('heart_angel_postcard');
    expect(state.declinedOfferIds).toContain('journal_flow');
    expect(state.purchasedOfferIds).toContain('heart_angel_postcard');
    expect(state.subscribedOfferIds).toContain('journal_flow');
    expect(state.offerIntroductions.heart_angel_postcard).toBe(1);
  });

  it('does not treat page views or a generic word as purchase intent', () => {
    expect(scorePierrotOfferInterest('What is context architecture?', 'unframed').score).toBe(0);
    expect(scorePierrotOfferInterest('I like the layout', 'heart_angel_postcard').score).toBe(0);
    expect(emptyPierrotCommercialState().declinedOfferIds).toEqual([]);
  });
});
