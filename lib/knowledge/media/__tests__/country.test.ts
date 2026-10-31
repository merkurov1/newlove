/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { inferMediaCountry } from '../country';

describe('Media country inference', () => {
  it('prefers an explicit country', () => {
    expect(
      inferMediaCountry({
        explicit: 'Germany',
        outlet: 'Новая газета',
        url: 'https://novayagazeta.ru/article',
      })
    ).toBe('Germany');
  });

  it('maps known outlets before falling back to a TLD', () => {
    expect(
      inferMediaCountry({
        outlet: 'The Washington Post',
        url: 'https://www.washingtonpost.com/world/article',
      })
    ).toBe('United States');
  });

  it('uses a country-code TLD when the outlet is unknown', () => {
    expect(
      inferMediaCountry({
        outlet: 'Unknown outlet',
        url: 'https://example.de/article',
      })
    ).toBe('Germany');
  });

  it('does not infer a country from a generic TLD or from language', () => {
    expect(
      inferMediaCountry({
        outlet: 'Unknown outlet',
        url: 'https://example.com/article',
      })
    ).toBeNull();
  });
});
