/** @jest-environment node */

import {
  detectUrlMaterialKind,
  extractFirstUrl,
  formatUrlPreview,
  isUrlConfirmation,
  isUrlInput,
  type UrlPreviewResult,
} from '../urlIntake';

describe('Pierrot URL intake', () => {
  it('extracts a URL from a plain message and trims trailing punctuation', () => {
    expect(extractFirstUrl('Посмотри https://example.com/story?utm_source=x).')).toBe(
      'https://example.com/story?utm_source=x'
    );
    expect(extractFirstUrl('www.example.com/article')).toBe('www.example.com/article');
  });

  it('recognises explicit yes/no confirmations', () => {
    expect(isUrlConfirmation('Да')).toBe('yes');
    expect(isUrlConfirmation('Да, добавь')).toBe('yes');
    expect(isUrlConfirmation('yes please')).toBe('yes');
    expect(isUrlConfirmation('Нет')).toBe('no');
    expect(isUrlConfirmation('No.')).toBe('no');
    expect(isUrlConfirmation('Расскажи ещё')).toBeNull();
  });

  it('detects supported material classes without network calls', () => {
    expect(detectUrlMaterialKind('https://www.youtube.com/watch?v=abc')).toBe('video');
    expect(detectUrlMaterialKind('https://x.com/example/status/1')).toBe('social');
    expect(detectUrlMaterialKind('https://arxiv.org/abs/1234.5678')).toBe('research');
    expect(detectUrlMaterialKind('https://novayagazeta.ru/articles/2026/01/01/example')).toBe(
      'media'
    );
    expect(detectUrlMaterialKind('https://example.com/article/one')).toBe('article');
    expect(detectUrlMaterialKind('https://example.com/about')).toBe('website');
    expect(detectUrlMaterialKind('not a url')).toBeNull();
  });

  it('validates URL input before parsing', () => {
    expect(isUrlInput('https://example.com')).toBe(true);
    expect(isUrlInput('just words')).toBe(false);
    expect(isUrlInput('write to user@example.com')).toBe(false);
  });

  it('formats a preview and asks for confirmation only when it can be added', () => {
    const preview: UrlPreviewResult = {
      url: 'https://example.com/article',
      normalizedUrl: 'https://example.com/article',
      canonicalUrl: 'https://example.com/article',
      materialKind: 'article',
      pipeline: 'brain',
      title: 'Example article',
      outlet: 'example.com',
      author: null,
      publishedAt: null,
      language: 'en',
      summary: 'A short preview.',
      details: ['Text: 10 words'],
      contentHash: 'abc',
      duplicate: null,
      canAdd: true,
      blocker: null,
    };

    const text = formatUrlPreview(preview, 'ru');
    expect(text).toContain('Example article');
    expect(text).toContain('Добавить этот материал в Brain?');

    const unavailable = formatUrlPreview(
      { ...preview, canAdd: false, blocker: 'content_unavailable' },
      'ru'
    );
    expect(unavailable).not.toContain('Добавить этот материал в Brain?');
    expect(unavailable).toContain('В Brain не добавляю');
  });
});
