/** @jest-environment node */

import { extractArticle } from '@/lib/knowledge/brain/extract';

import { evaluateMediaFailure, evaluateMediaTextQuality } from '../quality';

const longText =
  'The argument moves through institutions, newsrooms and households with enough detail to be useful. '.repeat(
    20
  );

function page(
  options: {
    paywall?: boolean;
    short?: boolean;
    lang?: string;
    extra?: string;
  } = {}
): string {
  const body = options.short ? 'Short note.' : longText;
  const paywall = options.paywall ? '<p>Subscribe to continue reading this article.</p>' : '';

  return `<html lang="${options.lang || 'en'}"><head><title>Test article</title>
    <link rel="canonical" href="https://example.com/article" /></head>
    <body><article><h1>Test article</h1>${paywall}
      <p>${body}</p><p>${body}</p><p>${body}</p>${options.extra || ''}
    </article></body></html>`;
}

describe('Media text quality', () => {
  it('classifies long complete text as full_text', () => {
    const article = extractArticle(page(), 'https://example.com/article');
    const quality = evaluateMediaTextQuality(article);

    expect(quality.quality).toBe('full_text');
    expect(quality.coverageStatus).toBe('completed');
  });

  it('classifies a paywalled page with usable text as partial_text', () => {
    const article = extractArticle(page({ paywall: true }), 'https://example.com/article');
    const quality = evaluateMediaTextQuality(article);

    expect(quality.quality).toBe('partial_text');
    expect(quality.coverageStatus).toBe('partial');
    expect(quality.errorCode).toBe('paywall_detected');
  });

  it('classifies a short paywall as blocked', () => {
    const article = extractArticle(
      page({ paywall: true, short: true }),
      'https://example.com/article'
    );
    const quality = evaluateMediaTextQuality(article);

    expect(quality.quality).toBe('blocked');
    expect(quality.coverageStatus).toBe('blocked');
  });

  it('classifies title and description only as metadata_only', () => {
    const article = extractArticle(page({ short: true }), 'https://example.com/article');
    const quality = evaluateMediaTextQuality(article);

    expect(quality.quality).toBe('metadata_only');
    expect(quality.coverageStatus).toBe('failed');
  });

  it('maps blocked HTTP responses to blocked quality', () => {
    expect(evaluateMediaFailure('http_status_403').quality).toBe('blocked');
    expect(evaluateMediaFailure('no_chunks').quality).toBe('metadata_only');
  });
});
