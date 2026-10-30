/** @jest-environment node */

import { parseGraphTypes } from '../visualization';

describe('Brain graph filters', () => {
  it('accepts known node types and ignores unknown ones', () => {
    expect(parseGraphTypes('document,person,concept')).toEqual([
      'document',
      'person',
      'concept',
    ]);
    expect(parseGraphTypes('document,alien')).toEqual(['document']);
    expect(parseGraphTypes(null)).toContain('theme');
  });
});
