/** @jest-environment node */

import {
  BrainUrlError,
  assertSafePublicUrl,
  getSourceDomain,
  isNovayaGazetaUrl,
  normalizeSourceUrl,
  publishedDateFromUrl,
  tryNormalizeSourceUrl,
} from '../url';

describe('Brain URL normalization', () => {
  it('strips tracking parameters, fragments and trailing slashes', () => {
    expect(
      normalizeSourceUrl(
        'http://Example.com/article/?utm_source=telegram&utm_medium=social&b=2&a=1#comments'
      )
    ).toBe('https://example.com/article?a=1&b=2');
  });

  it('treats http and https as the same article', () => {
    expect(normalizeSourceUrl('http://example.com/story')).toBe(
      normalizeSourceUrl('https://example.com/story/')
    );
  });

  it('adds a scheme to bare hostnames', () => {
    expect(normalizeSourceUrl('novayagazeta.eu/articles/123')).toBe(
      'https://novayagazeta.eu/articles/123'
    );
  });

  it('rejects unsupported schemes, credentials and invalid URLs', () => {
    expect(() => normalizeSourceUrl('file:///etc/passwd')).toThrow(BrainUrlError);
    expect(() => normalizeSourceUrl('https://user:pass@example.com/')).toThrow(BrainUrlError);
    expect(() => normalizeSourceUrl('not a url')).toThrow(BrainUrlError);
    expect(tryNormalizeSourceUrl('file:///etc/passwd')).toEqual({
      url: null,
      error: 'protocol_unsupported',
    });
  });

  it('blocks localhost, private IPs and metadata hosts without DNS', async () => {
    await expect(assertSafePublicUrl('http://localhost/')).rejects.toThrow(BrainUrlError);
    await expect(assertSafePublicUrl('http://127.0.0.1/')).rejects.toThrow(BrainUrlError);
    await expect(assertSafePublicUrl('http://169.254.169.254/')).rejects.toThrow(BrainUrlError);
    await expect(assertSafePublicUrl('http://[::1]/')).rejects.toThrow(BrainUrlError);
    await expect(assertSafePublicUrl('https://metadata.google.internal/')).rejects.toThrow(
      BrainUrlError
    );
  });

  it('normalizes the source domain', () => {
    expect(getSourceDomain('https://www.NovayaGazeta.ru/articles/2025/04/26/x')).toBe(
      'novayagazeta.ru'
    );
    expect(getSourceDomain('https://example.substack.com/p/post')).toBe('example.substack.com');
    expect(getSourceDomain('not a url')).toBeNull();
  });

  it('recovers only verifiable Novaya Gazeta dates from URL paths', () => {
    expect(isNovayaGazetaUrl('https://novayagazeta.ru/articles/2025/04/26/x')).toBe(true);
    expect(isNovayaGazetaUrl('https://novayagazeta.eu/articles/2025/04/26/x?utm_source=1')).toBe(
      true
    );
    expect(isNovayaGazetaUrl('https://example.com/articles/2025/04/26/x')).toBe(false);

    expect(publishedDateFromUrl('https://novayagazeta.ru/articles/2025/04/26/x')).toBe(
      '2025-04-26T00:00:00.000Z'
    );
    expect(publishedDateFromUrl('https://novayagazeta.eu/articles/2025/04/26/x')).toBe(
      '2025-04-26T00:00:00.000Z'
    );
    expect(publishedDateFromUrl('https://novayagazeta.ru/articles/2025/02/30/x')).toBeNull();
    expect(publishedDateFromUrl('https://novayagazeta.ru/articles/no-date')).toBeNull();
    expect(publishedDateFromUrl('https://example.com/articles/2025/04/26/x')).toBeNull();
  });
});
