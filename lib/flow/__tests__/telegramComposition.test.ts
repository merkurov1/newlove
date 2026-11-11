/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { normalizeFlowItem } from '../content';
import {
  composeTelegramPublication,
  splitTelegramHtml,
  takeTelegramHtmlHead,
  telegramFlowLabel,
  telegramSourceLabel,
} from '../telegramComposition';

const FLOW_URL = 'https://www.merkurov.love/flow/test-slug';
const SOURCE_URL = 'https://example.com/source-article';

function item(overrides: Record<string, unknown> = {}) {
  return normalizeFlowItem({
    id: 'item-1',
    slug: 'test-slug',
    title: 'Заголовок',
    body_md: 'Первый абзац.\n\nВторой абзац.',
    type: 'note',
    lang: 'ru',
    metadata: {},
    ...overrides,
  } as any);
}

function composition(overrides: Record<string, unknown> = {}) {
  return composeTelegramPublication(item(overrides));
}

function hrefCount(html: string, url: string): number {
  return (html.match(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
}

describe('Telegram composition — text', () => {
  it('formats a short Russian note as a finished editorial message', () => {
    const result = composition();
    expect(result.titleVisible).toBe(true);
    expect(result.fullHtml).toContain('<b>Заголовок</b>');
    expect(result.fullHtml).toContain('Первый абзац.');
    expect(result.fullHtml).toContain(`>${telegramFlowLabel('ru')}</a>`);
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
    expect(result.validation.ok).toBe(true);
  });

  it('formats a short English note with English interface labels', () => {
    const result = composition({
      title: 'A short note',
      body_md: 'A single thought.',
      lang: 'en',
      source_url: SOURCE_URL,
    });
    expect(result.fullHtml).toContain('Read on Flow');
    expect(result.fullHtml).toContain('>Source</a>');
    expect(result.fullHtml).not.toContain('Источник');
  });

  it('omits a title that repeats the opening sentence', () => {
    const result = composition({
      title: 'Первая мысль',
      body_md: 'Первая мысль. Продолжение текста.',
    });
    expect(result.titleVisible).toBe(false);
    expect(result.fullHtml).not.toContain('<b>Первая мысль</b>');
  });

  it('omits a title with punctuation differences from the opening sentence', () => {
    const result = composition({
      title: 'Первая мысль',
      body_md: 'Первая мысль! Продолжение текста.',
    });
    expect(result.titleVisible).toBe(false);
  });

  it('preserves paragraphs, lists and blockquotes', () => {
    const result = composition({
      title: 'Структура',
      body_md:
        'Первый абзац.\n\n1. Первый\n2. Второй\n\n- Пункт\n- Ещё пункт\n\n> Цитата\n> — Автор',
    });
    expect(result.fullHtml).toContain('Первый абзац.\n\n1. Первый');
    expect(result.fullHtml).toContain('• Пункт');
    expect(result.fullHtml).toContain('<blockquote>Цитата\n— Автор</blockquote>');
  });

  it('converts Markdown links and nested formatting', () => {
    const result = composition({
      title: 'Ссылки',
      body_md: '**Жирный *курсив*** и [сайт](https://example.com/path).',
    });
    expect(result.fullHtml).toContain(`<a href="https://example.com/path">сайт</a>`);
    expect(result.fullHtml).toContain('<b>Жирный <i>курсив</i></b>');
  });

  it('escapes raw HTML injection', () => {
    const result = composition({
      title: 'Безопасность',
      body_md: '<script>alert("x")</script> & текст',
    });
    expect(result.fullHtml).toContain('&lt;script&gt;alert("x")&lt;/script&gt;');
    expect(result.fullHtml).not.toContain('<script>');
  });

  it('splits text above 4096 characters without losing content', () => {
    const body = `${'Длинный текст про память и сети. '.repeat(300)}КОНЕЦ`;
    const result = composition({ title: 'Длинная статья', body_md: body });
    expect(result.textOnlyParts.length).toBeGreaterThan(1);
    expect(result.textOnlyParts.every((part) => part.length <= 3900)).toBe(true);
    expect(result.textOnlyParts.join(' ')).toContain('КОНЕЦ');
    expect(result.textOnlyParts.join(' ')).toContain('Длинный текст');
  });

  it('preserves Cyrillic and emoji at split boundaries', () => {
    const html = `<i>${'🙂 слово '.repeat(800)}</i>`;
    const parts = splitTelegramHtml(html, 500);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toContain('🙂');
    expect(parts.join('')).not.toContain('\uFFFD');
    expect(parts.every((part) => part.length <= 500)).toBe(true);
  });

  it('takes a balanced caption head and returns the untouched rest', () => {
    const html = `<b>${'абзац текста '.repeat(200)}</b>`;
    const { head, rest } = takeTelegramHtmlHead(html, 950);
    expect(head.length).toBeLessThanOrEqual(950);
    expect(head.endsWith('</b>')).toBe(true);
    expect(rest.length).toBeGreaterThan(0);
    expect(rest).toContain('абзац текста');
  });
});

describe('Telegram composition — links', () => {
  it('adds exactly one Flow link and one localized source link', () => {
    const result = composition({ source_url: SOURCE_URL });
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
    expect(result.fullHtml).toContain(`<a href="${SOURCE_URL}">Источник</a>`);
    expect(result.validation.ok).toBe(true);
  });

  it('links a source-derived title and does not add a second source label', () => {
    const result = composeTelegramPublication(
      normalizeFlowItem({
        id: 'item-link',
        slug: 'test-slug',
        body_md: 'Авторский комментарий.',
        source_url: SOURCE_URL,
        type: 'link',
        lang: 'en',
        metadata: {
          link_preview: {
            url: SOURCE_URL,
            title: 'A Source Article',
            site_name: 'Example',
          },
        },
      } as any)
    );

    expect(result.fullHtml).toContain(
      `<b><a href="${SOURCE_URL}">A Source Article</a></b>`
    );
    expect(result.fullHtml).not.toContain('>Source</a>');
    expect(hrefCount(result.fullHtml, SOURCE_URL)).toBe(1);
    expect(result.validation.ok).toBe(true);
  });

  it('does not duplicate a source link already present in the body', () => {
    const result = composition({
      body_md: `Текст со ссылкой: ${SOURCE_URL}`,
      source_url: SOURCE_URL,
    });
    expect(hrefCount(result.fullHtml, SOURCE_URL)).toBe(1);
    expect(result.fullHtml).not.toContain('>Источник</a>');
  });

  it('does not invent a source link when none exists', () => {
    const result = composition({ source_url: null });
    expect(result.sourceUrl).toBeNull();
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
    expect(result.fullHtml).not.toContain('Источник');
  });

  it('keeps a foreign-language source title unchanged', () => {
    const result = composeTelegramPublication(
      normalizeFlowItem({
        id: 'item-fr',
        slug: 'test-slug',
        title: 'Les frappes ukrainiennes',
        body_md: 'Commentaire.',
        source_url: SOURCE_URL,
        type: 'link',
        lang: 'ru',
        metadata: {
          link_preview: {
            url: SOURCE_URL,
            title: 'Les frappes ukrainiennes',
            site_name: 'Le Monde',
          },
        },
      } as any)
    );
    expect(result.fullHtml).toContain('Les frappes ukrainiennes');
    expect(result.fullHtml).toContain('Источник');
  });
});

describe('Telegram composition — media', () => {
  it('uses a single photograph as the lead element with a caption', () => {
    const result = composition({
      type: 'photo',
      title: 'Работа',
      body_md: 'Короткая подпись.',
      metadata: { image: 'https://cdn.example.com/photo.jpg' },
    });
    expect(result.media).toHaveLength(1);
    expect(result.media[0].kind).toBe('photo');
    expect(result.mediaCaption).toContain('Короткая подпись.');
    expect(result.mediaCaption).toContain(telegramFlowLabel('ru'));
    expect(result.messageParts[0]).toMatchObject({
      kind: 'media',
      mediaType: 'photo',
      showCaptionAboveMedia: true,
    });
  });

  it('groups multiple photographs into one album with one caption', () => {
    const result = composition({
      type: 'photo',
      body_md: 'Альбом.',
      metadata: {
        images: [
          'https://cdn.example.com/1.jpg',
          'https://cdn.example.com/2.jpg',
          'https://cdn.example.com/3.jpg',
        ],
      },
    });
    expect(result.mediaBatches).toHaveLength(1);
    expect(result.mediaBatches[0].items).toHaveLength(3);
    expect(result.messageParts[0].kind).toBe('media');
    expect(result.messageParts[0].kind === 'media' && result.messageParts[0].caption)
      .toContain('Альбом.');
  });

  it('splits more than ten photographs into logical groups', () => {
    const result = composition({
      type: 'photo',
      body_md: 'Двенадцать кадров.',
      metadata: {
        images: Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index}.jpg`),
      },
    });
    expect(result.mediaBatches).toHaveLength(2);
    expect(result.mediaBatches[0].items).toHaveLength(10);
    expect(result.mediaBatches[1].items).toHaveLength(2);
    expect(result.messageParts[0].kind === 'media' && result.messageParts[0].caption)
      .toContain('Двенадцать кадров.');
    expect(result.messageParts[1].kind === 'media' && result.messageParts[1].caption)
      .toBeUndefined();
  });

  it('ignores missing and unsafe image URLs', () => {
    const result = composition({
      type: 'photo',
      metadata: {
        images: ['javascript:alert(1)', 'ftp://example.com/not-an-http-image'],
      },
    });
    expect(result.media).toHaveLength(0);
    expect(result.mediaType).toBe('none');
  });

  it('keeps a downloadable video as a video', () => {
    const result = composition({
      type: 'video',
      body_md: 'Видео.',
      metadata: {
        videos: [
          {
            url: 'https://cdn.example.com/clip.mp4',
            title: 'Clip',
          },
        ],
      },
    });
    expect(result.media.some((media) => media.kind === 'video')).toBe(true);
    expect(result.mediaType).toBe('video');
  });

  it('uses an honest thumbnail fallback for a YouTube video', () => {
    const result = composition({
      type: 'video',
      body_md: 'Видео.',
      metadata: {
        videos: [
          {
            url: 'https://www.youtube.com/watch?v=abc123def45',
            title: 'Clip',
            thumbnail: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg',
          },
        ],
      },
    });
    expect(result.media.some((media) => media.kind === 'video_thumbnail')).toBe(true);
    expect(result.fullHtml).toContain('Видео</a>');
    expect(result.mediaType).toBe('video');
  });

  it('splits a long article with an image into a caption and continuation', () => {
    const body = `${'Длинный абзац статьи. '.repeat(120)}ФИНАЛ`;
    const result = composition({
      type: 'article',
      title: 'Длинная статья',
      body_md: body,
      metadata: { image: 'https://cdn.example.com/cover.jpg' },
    });
    expect(result.mediaCaption).toBeTruthy();
    expect((result.mediaCaption ?? '').length).toBeLessThanOrEqual(950);
    expect(result.textContinuation.length).toBeGreaterThan(0);
    expect(result.messageParts[0].kind).toBe('media');
    expect(result.messageParts.slice(1).every((part) => part.kind === 'text')).toBe(true);
    expect(result.textContinuation.join(' ')).toContain('ФИНАЛ');
  });
});

describe('Telegram composition — validation', () => {
  it('always exposes exactly one canonical Flow link', () => {
    const result = composition({
      body_md: `Текст [Flow](${FLOW_URL}) и ещё раз ${FLOW_URL}`,
      source_url: SOURCE_URL,
    });
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
    expect(result.validation.ok).toBe(true);
  });

  it('has deterministic output for identical input', () => {
    const first = composition({ source_url: SOURCE_URL });
    const second = composition({ source_url: SOURCE_URL });
    expect(first.fullHtml).toBe(second.fullHtml);
    expect(first.messageParts.length).toBe(second.messageParts.length);
  });

  it('does not require DeepSeek and never changes the author text', () => {
    const original = 'Авторский текст остаётся ровно таким.';
    const result = composition({ body_md: original });
    expect(result.fullHtml).toContain(original);
    expect(result.fullHtml).not.toContain('Adapted');
    expect(result.validation.ok).toBe(true);
  });

  it('uses the localized Flow and source labels', () => {
    const ru = composition({ source_url: SOURCE_URL, lang: 'ru' });
    const en = composition({ source_url: SOURCE_URL, lang: 'en' });
    expect(ru.fullHtml).toContain('Читать в Flow');
    expect(ru.fullHtml).toContain('Источник');
    expect(en.fullHtml).toContain('Read on Flow');
    expect(en.fullHtml).toContain('Source');
    expect(telegramSourceLabel('en')).toBe('Source');
  });
});
