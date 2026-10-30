/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { getPierrotOfferPolicy, loadPierrotOfferPolicies } from '../offerPolicy';

describe('Pierrot offer policy', () => {
  it('contains product-specific frequency defaults', () => {
    const postcard = getPierrotOfferPolicy('heart_angel_postcard');
    const journal = getPierrotOfferPolicy('journal_flow');
    const advising = getPierrotOfferPolicy('advising');

    expect(postcard.maxShowsPerConversation).toBe(3);
    expect(postcard.cooldownTurns).toBeGreaterThan(0);
    expect(journal.requiresRepeatedEngagement).toBe(true);
    expect(journal.maxShowsPerConversation).toBeLessThan(postcard.maxShowsPerConversation);
    expect(advising.allowProactive).toBe(false);
  });

  it('allows owner overrides through PIERROT_OFFER_POLICY_JSON', () => {
    const policies = loadPierrotOfferPolicies({
      PIERROT_OFFER_POLICY_JSON: JSON.stringify({
        heart_angel_postcard: {
          maxShowsPerConversation: 1,
          cooldownTurns: 5,
          recommendationCopy: 'A card might carry this better than another message.',
        },
        journal_flow: {
          enabled: false,
        },
      }),
    });

    expect(policies.heart_angel_postcard).toMatchObject({
      maxShowsPerConversation: 1,
      cooldownTurns: 5,
      recommendationCopy: 'A card might carry this better than another message.',
    });
    expect(policies.journal_flow?.enabled).toBe(false);
  });

  it('ignores malformed policy JSON and clamps unsafe limits', () => {
    const malformed = loadPierrotOfferPolicies({
      PIERROT_OFFER_POLICY_JSON: '{not-json',
    });
    const clamped = loadPierrotOfferPolicies({
      PIERROT_OFFER_POLICY_JSON: JSON.stringify({
        heart_angel_postcard: {
          maxShowsPerConversation: 999,
          cooldownTurns: -4,
          priority: 99999,
        },
      }),
    });

    expect(malformed.heart_angel_postcard?.maxShowsPerConversation).toBe(3);
    expect(clamped.heart_angel_postcard?.maxShowsPerConversation).toBe(20);
    expect(clamped.heart_angel_postcard?.cooldownTurns).toBe(0);
    expect(clamped.heart_angel_postcard?.priority).toBe(1000);
  });
});
