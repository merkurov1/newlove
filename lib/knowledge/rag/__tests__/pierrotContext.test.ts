/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { buildUnframedUnavailablePrompt } from '../pierrotContext';

describe('owner Brain unavailable guidance', () => {
  it('states a timeout explicitly and does not imply absence', () => {
    const prompt = buildUnframedUnavailablePrompt('unavailable', 'timeout');

    expect(prompt).toContain('BRAIN_RETRIEVAL_TIMEOUT');
    expect(prompt).toMatch(/timeout, not evidence/i);
    expect(prompt).toMatch(/Do not say that no recipes, articles or documents exist/i);
  });

  it('does not turn a retrieval gap into a claim that no biography exists', () => {
    for (const outcome of ['unavailable', 'no_match', 'weak_match'] as const) {
      const prompt = buildUnframedUnavailablePrompt(outcome);

      expect(prompt).toMatch(/not (?:evidence|prove) that the owner has no biography/);
      expect(prompt).toContain('structured owner profile');
      expect(prompt).toContain('conversation history');
      expect(prompt).toContain('Do not');
    }
  });
});
