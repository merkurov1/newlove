/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { classifyPierrotIntent } from '../intents';

describe('Pierrot intent classification', () => {
  it('keeps normal section navigation deterministic', () => {
    const intent = classifyPierrotIntent('Take me to the Journal');

    expect(intent.name).toBe('navigation');
    expect(intent.sectionId).toBe('journal');
    expect(intent.uncertain).toBe(false);
  });

  it('recognises an exact section name as navigation', () => {
    const intent = classifyPierrotIntent('Lobby');

    expect(intent.name).toBe('navigation');
    expect(intent.sectionId).toBe('lobby');
  });

  it('answers an ordinary question without forcing a product', () => {
    const intent = classifyPierrotIntent('What is context architecture?');

    expect(intent.name).toBe('general_question');
    expect(intent.offerId).toBeUndefined();
    expect(intent.uncertain).toBe(false);
  });

  it('distinguishes information from purchase intent', () => {
    const information = classifyPierrotIntent('How much is the Heart & Angel postcard?');
    const purchase = classifyPierrotIntent('I want to buy the Heart & Angel postcard');

    expect(information.name).toBe('offer_information');
    expect(information.offerId).toBe('heart_angel_postcard');

    expect(purchase.name).toBe('purchase_intent');
    expect(purchase.offerId).toBe('heart_angel_postcard');
  });

  it('recognises subscription, service and book intents', () => {
    const subscription = classifyPierrotIntent('How do I subscribe to Flow?');
    const service = classifyPierrotIntent('Do you take consulting clients?');
    const book = classifyPierrotIntent('Can I buy UNFRAMED as an ebook?');

    expect(subscription.name).toBe('subscription_intent');
    expect(subscription.offerId).toBe('journal_flow');

    expect(service.name).toBe('service_inquiry');
    expect(service.offerId).toBe('advising');

    expect(book.name).toBe('book_inquiry');
    expect(book.offerId).toBe('unframed');
  });

  it('handles Art Engine as access, not a purchasable product or Art section', () => {
    const info = classifyPierrotIntent('What is Art Engine?');
    const access = classifyPierrotIntent('Can I request access to Art Engine?');
    const open = classifyPierrotIntent('Open Art Engine');

    expect(info.name).toBe('offer_information');
    expect(info.offerId).toBe('art_engine');

    expect(access.name).toBe('service_inquiry');
    expect(access.offerId).toBe('art_engine');
    expect(access.accessRequest).toBe(true);
    expect(info.accessRequest).toBe(false);

    expect(open.name).not.toBe('navigation');
    expect(open.offerId).toBe('art_engine');
  });

  it('treats art-market acquisition or analysis as a service inquiry, not a product', () => {
    const acquisition = classifyPierrotIntent('I need help acquiring a work for my collection');
    const analysis = classifyPierrotIntent('Can you analyse my collection and its valuation?');

    expect(acquisition.name).toBe('service_inquiry');
    expect(acquisition.offerId).toBe('advising');
    expect(acquisition.accessRequest).toBe(false);

    expect(analysis.name).toBe('service_inquiry');
    expect(analysis.offerId).toBe('advising');
  });

  it('routes a human handoff request to the existing contact', () => {
    const intent = classifyPierrotIntent('Can I talk to Anton directly?');

    expect(intent.name).toBe('handoff_request');
    expect(intent.offerId).toBe('advising');
  });

  it('stops selling after an explicit refusal', () => {
    const intent = classifyPierrotIntent('No thanks, I am not interested');

    expect(intent.declined).toBe(true);
    expect(intent.name).toBe('unknown');
  });

  it('allows navigation after a refusal without restarting the sale', () => {
    const intent = classifyPierrotIntent('No thanks, take me to the Journal');

    expect(intent.declined).toBe(true);
    expect(intent.name).toBe('navigation');
    expect(intent.sectionId).toBe('journal');
  });

  it('handles Russian commercial phrasing without treating one word as intent', () => {
    const info = classifyPierrotIntent('Сколько стоит открытка?');
    const purchase = classifyPierrotIntent('Хочу купить открытку');
    const refusal = classifyPierrotIntent('Нет спасибо');

    expect(info.name).toBe('offer_information');
    expect(info.offerId).toBe('heart_angel_postcard');

    expect(purchase.name).toBe('purchase_intent');
    expect(purchase.offerId).toBe('heart_angel_postcard');

    expect(refusal.declined).toBe(true);
    expect(refusal.name).toBe('unknown');
  });

  it('does not infer an unknown product from a single generic word', () => {
    expect(classifyPierrotIntent('price').name).toBe('unknown');

    const unknownProduct = classifyPierrotIntent('How much is the golden unicorn?');

    expect(unknownProduct.name).toBe('unknown');
    expect(unknownProduct.unknownProduct).toBe(true);
  });

  it('marks genuinely ambiguous requests as uncertain or unknown', () => {
    const intent = classifyPierrotIntent('Can you help me with this?');

    expect(['unknown', 'uncertain']).toContain(intent.name);
    expect(intent.uncertain).toBe(true);
    expect(intent.confidence).toBeLessThan(0.6);
  });

  it('classifies the postcard question topic without inventing an answer', () => {
    expect(classifyPierrotIntent('How much is the Heart & Angel postcard?').topic).toBe('price');
    expect(
      classifyPierrotIntent('Can I send the Heart & Angel postcard to someone else?').topic
    ).toBe('recipient');
    expect(
      classifyPierrotIntent('How long does delivery take for the Heart & Angel postcard?').topic
    ).toBe('delivery');
    expect(classifyPierrotIntent('What material is the Heart & Angel postcard?').topic).toBe(
      'materials'
    );
    expect(classifyPierrotIntent('Is the Heart & Angel postcard in stock?').topic).toBe(
      'availability'
    );
    expect(classifyPierrotIntent('The Heart & Angel postcard is too expensive').topic).toBe(
      'price_objection'
    );
  });

  it('recognises a demonstrative question on a product page', () => {
    const intent = classifyPierrotIntent('What is this?');

    expect(intent.topic).toBe('product');
  });
});
