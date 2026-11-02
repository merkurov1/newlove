/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { buildUnframedUnavailablePrompt } from '../pierrotContext';

describe('owner Brain unavailable guidance', () => {
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
