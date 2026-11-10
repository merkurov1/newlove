/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildEvidenceDisclosure,
  buildSourceStatuses,
  guardAnswerEvidence,
} from '../evidence';

describe('Journal/Flow evidence honesty', () => {
  it('discloses an unavailable Journal instead of claiming it is empty', () => {
    const statuses = buildSourceStatuses({
      journal: { outcome: 'unavailable', code: 'journal_query_failed' },
      requested: { brain: false, media: false, web: false, journal: true },
    });

    expect(statuses.journal).toBe('error');

    const disclosure = buildEvidenceDisclosure(
      statuses,
      { brain: false, media: false, web: false, journal: true },
      'ru'
    );

    expect(disclosure).toMatch(/Journal/);
    expect(disclosure).toMatch(/не означает|недоступ/i);
  });

  it('replaces an invented issue claim when the Journal source failed', () => {
    const result = guardAnswerEvidence({
      reply: 'В последнем выпуске Journal №24 ты писал о таск-менеджерах.',
      statuses: {
        brain: 'not_requested',
        media: 'not_requested',
        web: 'not_requested',
        journal: 'error',
        flow: 'not_requested',
      },
      requested: { brain: false, media: false, web: false, journal: true },
      language: 'ru',
    });

    expect(result.violations).toContain('journal_claim_without_results');
    expect(result.reply).not.toContain('№24');
  });

  it('does not disclose a source that was successfully read', () => {
    const statuses = buildSourceStatuses({
      journal: { outcome: 'relevant_results' },
      flow: { outcome: 'relevant_results' },
      requested: { brain: false, media: false, web: false, journal: true, flow: true },
    });

    expect(
      buildEvidenceDisclosure(
        statuses,
        { brain: false, media: false, web: false, journal: true, flow: true },
        'ru'
      )
    ).toBeNull();
  });
});
