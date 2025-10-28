import { validateEmail, validateSlug, sanitizeHtmlBasic } from '../security';

describe('security validation', () => {
  describe('validateEmail', () => {
    it('should validate correct email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
    });
  });

  describe('validateSlug', () => {
    it('should validate correct slug', () => {
      expect(validateSlug('hello-world')).toBe(true);
      expect(validateSlug('test-123')).toBe(true);
    });

    it('should reject invalid slug', () => {
      expect(validateSlug('Hello World')).toBe(false);
      expect(validateSlug('test_slug')).toBe(false);
      expect(validateSlug('test--slug')).toBe(false);
    });
  });

  describe('sanitizeHtmlBasic', () => {
    it('should remove script tags', () => {
      const html = '<p>Hello</p><script>alert("xss")</script>';
      expect(sanitizeHtmlBasic(html)).not.toContain('<script>');
    });

    it('should remove iframe tags', () => {
      const html = '<p>Hello</p><iframe src="evil.com"></iframe>';
      expect(sanitizeHtmlBasic(html)).not.toContain('<iframe>');
    });

    it('should remove javascript: protocol', () => {
      const html = '<a href="javascript:alert(1)">Click</a>';
      expect(sanitizeHtmlBasic(html)).not.toContain('javascript:');
    });
  });
});
