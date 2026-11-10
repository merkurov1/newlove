/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { buildPierrotAnswerSources } from '../types';

describe('Pierrot answer source provenance', () => {
  it('labels Media as the actual answer source', () => {
    const sources = buildPierrotAnswerSources({ brain: false, media: true, web: false });
    expect(sources).toMatchObject({ mode: 'media', label: 'MEDIA', media: true });
  });

  it('never labels a Media answer as Brain', () => {
    const sources = buildPierrotAnswerSources({ brain: false, media: true, web: false });
    expect(sources.brain).toBe(false);
    expect(sources.mode).not.toContain('brain');
  });

  it('supports combined sources without losing Media', () => {
    expect(
      buildPierrotAnswerSources({ brain: true, media: true, web: true })
    ).toMatchObject({
      mode: 'brain+media+web',
      label: 'BRAIN + MEDIA + WEB',
      brain: true,
      media: true,
      web: true,
    });
  });
});
