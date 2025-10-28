import { generateSlug, transliterate } from '../slugUtils';

describe('slugUtils', () => {
  describe('transliterate', () => {
    it('should transliterate Russian text to Latin', () => {
      expect(transliterate('Привет Мир')).toBe('Privet Mir');
    });

    it('should handle empty string', () => {
      expect(transliterate('')).toBe('');
    });
  });

  describe('generateSlug', () => {
    it('should generate slug from title', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('should handle special characters', () => {
      expect(generateSlug('Hello, World!')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(generateSlug('Hello   World')).toBe('hello-world');
    });
  });
});
