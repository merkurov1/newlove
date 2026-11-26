/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { normalizeFlowItem } from '../content';
import {
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_SAFE_CAPTION_LIMIT,
  TELEGRAM_SAFE_TEXT_LIMIT,
  clipTelegramPreviewExcerpt,
  composeTelegramPublication,
  ensureTelegramLinks,
  formatTelegramMessage,
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
    expect(result.fullHtml).toContain(`>${telegramFlowLabel('en')}</a>`);
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

  it('replaces a long article with one compact preview instead of splitting it', () => {
    const body = `${'Длинный текст про память и сети. '.repeat(300)}КОНЕЦ`;
    const result = composition({ title: 'Длинная статья', body_md: body });
    expect(result.isPreview).toBe(true);
    expect(result.textOnlyParts).toHaveLength(1);
    expect(result.textOnlyParts[0].length).toBeLessThanOrEqual(3900);
    expect(result.textOnlyParts.join(' ')).toContain('Длинный текст');
    expect(result.textOnlyParts.join(' ')).not.toContain('КОНЕЦ');
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
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

describe('Telegram composition — compact link row', () => {
  const VIDEO_URL = 'https://www.youtube.com/watch?v=abc123def45';
  const SECOND_URL = 'https://example.com/second-article';

  it('appends a single link directly after the body text without a blank line', () => {
    const result = composition({
      body_md: 'Публикация.',
      source_url: SOURCE_URL,
      metadata: {},
    });

    expect(result.fullHtml).toContain(
      `Публикация. <a href="${SOURCE_URL}">Источник</a> | <a href="${FLOW_URL}">Flow</a>`
    );
    expect(result.fullHtml).not.toContain('Читать в Flow');
    expect(result.fullHtml).not.toMatch(/Публикация\.\s*\n+\s*<a /);
  });

  it('formats the compatibility helper and legacy text formatter compactly', async () => {
    const expected =
      `Текст. <a href="${SOURCE_URL}">Источник</a> | ` +
      `<a href="${FLOW_URL}">Flow</a>`;

    expect(ensureTelegramLinks('Текст.', FLOW_URL, SOURCE_URL, 'ru')).toBe(expected);
    await expect(
      formatTelegramMessage(null, 'Текст.', FLOW_URL, 'ru', SOURCE_URL)
    ).resolves.toBe(expected);
  });

  it('keeps multiple links in one inline row separated by the exact separator', () => {
    const result = composition({
      body_md: 'Текст поста.',
      metadata: {
        link_previews: [
          {
            url: SOURCE_URL,
            title: 'Source title',
            site_name: 'Example',
          },
          {
            url: SECOND_URL,
            title: 'Second article',
            site_name: 'Example Two',
          },
        ],
      },
    });

    expect(result.fullHtml).toContain(
      `Текст поста. <a href="${SECOND_URL}">Second article</a> | ` +
        `<a href="${SOURCE_URL}">Источник</a> | <a href="${FLOW_URL}">Flow</a>`
    );
    expect(result.fullHtml.match(/ \| /g)).toHaveLength(2);
    expect(result.fullHtml).not.toMatch(/\|\s*\n/);
  });

  it('starts the message with the link row when there is no body text', () => {
    const result = composition({
      body_md: '',
      type: 'note',
      source_url: SOURCE_URL,
      metadata: {},
    });

    expect(result.titleVisible).toBe(true);
    expect(result.fullHtml.startsWith(`<a href="${SOURCE_URL}">Источник</a>`)).toBe(
      true
    );
    expect(result.fullHtml).toContain('<b>Заголовок</b>');
    expect(result.fullHtml).toContain(
      `<a href="${SOURCE_URL}">Источник</a> | <a href="${FLOW_URL}">Flow</a>`
    );
  });

  it('uses the same compact row for video attachments and keeps the source URL', () => {
    const result = composition({
      type: 'video',
      body_md: 'Видео.',
      metadata: {
        videos: [
          {
            url: VIDEO_URL,
            title: 'Clip',
            thumbnail: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg',
          },
        ],
      },
    });

    expect(result.fullHtml).toContain(
      `Видео. <a href="${VIDEO_URL}">Видео</a> | <a href="${FLOW_URL}">Flow</a>`
    );
    expect(hrefCount(result.fullHtml, VIDEO_URL)).toBe(1);
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
  });

  it('uses the compact row in image and article captions too', () => {
    const result = composition({
      type: 'article',
      title: 'Статья с обложкой',
      body_md: 'Короткий текст статьи.',
      source_url: SOURCE_URL,
      metadata: { image: 'https://cdn.example.com/cover.jpg' },
    });

    expect(result.mediaCaption).toContain(
      `Короткий текст статьи. <a href="${SOURCE_URL}">Источник</a> | ` +
        `<a href="${FLOW_URL}">Flow</a>`
    );
    expect(result.messageParts[0].kind).toBe('media');
  });

  it('does not repeat a destination that is both an attachment and a source', () => {
    const result = composition({
      type: 'video',
      body_md: 'Видео.',
      source_url: VIDEO_URL,
      metadata: {
        videos: [
          {
            url: VIDEO_URL,
            title: 'Clip',
            thumbnail: 'https://i.ytimg.com/vi/abc123def45/hqdefault.jpg',
          },
        ],
      },
    });

    expect(hrefCount(result.fullHtml, VIDEO_URL)).toBe(1);
    expect(result.fullHtml).toContain(
      `<a href="${VIDEO_URL}">Видео</a> | <a href="${FLOW_URL}">Flow</a>`
    );
  });

  it('escapes link labels and hrefs while preserving anchor entities', () => {
    const result = composition({
      body_md: 'A & B <tag>',
      source_url: SOURCE_URL,
      metadata: {
        link_previews: [
          { url: SOURCE_URL, title: 'Source', site_name: 'Example' },
          {
            url: 'https://example.com/a?x=1&y=2',
            title: '<unsafe> & label',
            site_name: 'Example',
          },
        ],
      },
    });

    expect(result.fullHtml).toContain('A &amp; B &lt;tag&gt;');
    expect(result.fullHtml).toContain(
      '<a href="https://example.com/a?x=1&amp;y=2">&lt;unsafe&gt; &amp; label</a>'
    );
    expect(result.fullHtml).not.toContain('<unsafe>');
    expect(result.validation.ok).toBe(true);
  });

  it('keeps anchors balanced in a long-form preview', () => {
    const result = composition({
      title: 'Длинный текст',
      body_md: `${'Длинный текст про память и сети. '.repeat(300)}КОНЕЦ`,
      source_url: SOURCE_URL,
      metadata: {},
    });

    expect(result.isPreview).toBe(true);
    expect(result.textOnlyParts).toHaveLength(1);
    const part = result.textOnlyParts[0];
    expect(part).toContain(FLOW_URL);
    expect(part).not.toContain('КОНЕЦ');
    expect((part.match(/<a\b/g) ?? []).length).toBe((part.match(/<\/a>/g) ?? []).length);
    expect(part.length).toBeLessThanOrEqual(3900);
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

  it('puts a long article preview in one image caption without a continuation', () => {
    const body = `${'Длинный абзац статьи. '.repeat(120)}ФИНАЛ`;
    const result = composition({
      type: 'article',
      title: 'Длинная статья',
      body_md: body,
      metadata: { image: 'https://cdn.example.com/cover.jpg' },
    });
    expect(result.isPreview).toBe(true);
    expect(result.mediaCaption).toBeTruthy();
    expect((result.mediaCaption ?? '').length).toBeLessThanOrEqual(950);
    expect(result.textContinuation).toHaveLength(0);
    expect(result.messageParts).toHaveLength(1);
    expect(result.messageParts[0].kind).toBe('media');
    expect(result.mediaCaption).toContain('Длинная статья');
    expect(result.mediaCaption).not.toContain('ФИНАЛ');
    expect(hrefCount(result.mediaCaption ?? '', FLOW_URL)).toBe(1);
  });
});

describe('Telegram composition — long-form preview', () => {
  function longBody(sentinel = 'ФИНАЛ') {
    return [
      'Первый абзац начинается с главной мысли и задаёт направление всего текста.',
      'Второй абзац добавляет подробности, примеры и объяснение того, почему это важно для читателя.',
      'Третий абзац развивает аргумент и не должен оказаться в коротком превью.',
      `${'Повторение аргумента для длины. '.repeat(60)}${sentinel}`,
    ].join('\n\n');
  }

  it('sends a long post without media as one title/excerpt/Flow preview', () => {
    const result = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
    });

    expect(result.isPreview).toBe(true);
    expect(result.preview?.excerptSource).toBe('body');
    expect(result.textOnlyParts).toHaveLength(1);
    expect(result.messageParts).toHaveLength(1);
    expect(result.fullHtml).toContain('<b>Длинная публикация</b>');
    expect(result.fullHtml).toContain('Первый абзац начинается');
    expect(result.fullHtml).toContain('…');
    expect(result.fullHtml).not.toContain('ФИНАЛ');
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
    expect(result.textOnlyParts[0].length).toBeLessThanOrEqual(
      TELEGRAM_SAFE_CAPTION_LIMIT
    );
  });

  it('prefers an authored excerpt over the body', () => {
    const result = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
      metadata: { excerpt: 'Авторский эксклюзивный фрагмент для превью.' },
    });

    expect(result.isPreview).toBe(true);
    expect(result.preview).toMatchObject({
      excerpt: 'Авторский эксклюзивный фрагмент для превью.',
      excerptSource: 'authored',
      truncated: false,
    });
    expect(result.fullHtml).toContain('Авторский эксклюзивный фрагмент');
    expect(result.fullHtml).not.toContain('Первый абзац начинается');
  });

  it('uses authored summary/description metadata when no excerpt exists', () => {
    const summary = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
      metadata: { summary: 'Краткое авторское резюме.' },
    });
    const description = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
      metadata: { description: 'Авторское описание публикации.' },
    });

    expect(summary.preview).toMatchObject({
      excerpt: 'Краткое авторское резюме.',
      excerptSource: 'authored',
    });
    expect(description.preview).toMatchObject({
      excerpt: 'Авторское описание публикации.',
      excerptSource: 'authored',
    });
  });

  it('falls back deterministically to the opening of the body', () => {
    const first = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
    });
    const second = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
    });

    expect(first.preview?.excerptSource).toBe('body');
    expect(first.preview?.excerpt).toBe(second.preview?.excerpt);
    expect(first.preview?.excerpt.startsWith('Первый абзац')).toBe(true);
    expect(first.preview?.excerpt).not.toContain('ФИНАЛ');
  });

  it('clips at paragraph and sentence boundaries with a restrained ellipsis', () => {
    const firstParagraph = `${'Первый абзац остаётся целиком, потому что он важен. '.repeat(3)}`;
    const secondParagraph = `${'Второй абзац не должен попасть в короткий фрагмент. '.repeat(20)}`;
    const paragraphClip = clipTelegramPreviewExcerpt(
      `${firstParagraph}\n\n${secondParagraph}`,
      260
    );

    expect(paragraphClip.truncated).toBe(true);
    expect(paragraphClip.text.startsWith('Первый абзац')).toBe(true);
    expect(paragraphClip.text).not.toContain('Второй абзац');
    expect(paragraphClip.text.endsWith('…')).toBe(true);

    const sentenceClip = clipTelegramPreviewExcerpt(
      `Первое предложение остаётся. Второе предложение тоже важно. ${'Дальше '.repeat(200)}`,
      96
    );

    expect(sentenceClip.text).toMatch(/[.!?]…$/);
    expect(sentenceClip.text.length).toBeLessThanOrEqual(96);
    expect(sentenceClip.text).not.toContain('\uFFFD');
  });

  it('escapes HTML and ampersands in an authored excerpt', () => {
    const result = composition({
      type: 'article',
      title: 'Безопасность',
      body_md: longBody(),
      metadata: { excerpt: 'A & B <unsafe>alert("x")</unsafe> & C' },
    });

    expect(result.isPreview).toBe(true);
    expect(result.fullHtml).toContain('A &amp; B');
    expect(result.fullHtml).toContain('&amp; C');
    expect(result.fullHtml).not.toContain('<unsafe>');
    expect(result.validation.ok).toBe(true);
  });

  it('never cuts a long URL through the middle', () => {
    const longUrl = `https://example.com/${'segment-'.repeat(35)}end`;
    const leading = clipTelegramPreviewExcerpt(
      `${longUrl} После ссылки идёт полезный авторский текст. ${'Ещё текст. '.repeat(80)}`,
      120
    );

    expect(leading.text).not.toContain('http');
    expect(leading.text).toContain('После ссылки');
    expect(leading.text.endsWith('…')).toBe(true);

    const inside = clipTelegramPreviewExcerpt(
      `Текст до ссылки. ${longUrl} Текст после ссылки. ${'Продолжение. '.repeat(100)}`,
      500
    );

    expect(inside.text).toContain('Текст до ссылки.');
    expect(inside.text).toContain(longUrl);
    expect(inside.text).not.toMatch(/https?:\/\/\S*…$/);
  });

  it('keeps RU and EN previews localized and intact', () => {
    const ru = composition({
      type: 'article',
      title: 'Русский заголовок',
      body_md: longBody(),
      lang: 'ru',
    });
    const en = composition({
      type: 'article',
      title: 'English title',
      body_md: `${'English paragraph explaining the argument. '.repeat(80)}THE END`,
      lang: 'en',
    });

    expect(ru.isPreview).toBe(true);
    expect(en.isPreview).toBe(true);
    expect(ru.fullHtml).toContain('Русский заголовок');
    expect(ru.fullHtml).toContain('Первый абзац');
    expect(en.fullHtml).toContain('English title');
    expect(en.fullHtml).toContain('English paragraph');
    expect(en.fullHtml).not.toContain('THE END');
    expect(en.fullHtml).toContain('>Flow</a>');
    expect(en.validation.ok).toBe(true);
  });

  it('keeps previews inside Telegram caption and text limits', () => {
    const textOnly = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
    });
    const withMedia = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: longBody(),
      metadata: { image: 'https://cdn.example.com/cover.jpg' },
    });

    expect(textOnly.fullHtml.length).toBeLessThanOrEqual(TELEGRAM_SAFE_CAPTION_LIMIT);
    expect(textOnly.textOnlyParts[0].length).toBeLessThanOrEqual(TELEGRAM_SAFE_TEXT_LIMIT);

    expect(withMedia.mediaCaption).toBeTruthy();
    expect((withMedia.mediaCaption ?? '').length).toBeLessThanOrEqual(
      TELEGRAM_CAPTION_LIMIT
    );
    expect((withMedia.mediaCaption ?? '').length).toBeLessThanOrEqual(
      TELEGRAM_SAFE_CAPTION_LIMIT
    );
    expect(withMedia.textContinuation).toHaveLength(0);
  });

  it('does not duplicate the Flow link or append an unnecessary source row', () => {
    const result = composition({
      type: 'article',
      title: 'Длинная публикация',
      body_md: `${longBody()} ${FLOW_URL}`,
      source_url: SOURCE_URL,
    });

    expect(result.isPreview).toBe(true);
    expect(hrefCount(result.fullHtml, FLOW_URL)).toBe(1);
    expect(result.fullHtml).not.toContain(`<a href="${SOURCE_URL}">Источник</a>`);
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
    expect(ru.fullHtml).toContain('>Flow</a>');
    expect(ru.fullHtml).toContain('Источник');
    expect(en.fullHtml).toContain('>Flow</a>');
    expect(en.fullHtml).toContain('Source');
    expect(ru.fullHtml).not.toContain('Читать в Flow');
    expect(en.fullHtml).not.toContain('Read on Flow');
    expect(telegramSourceLabel('en')).toBe('Source');
  });
});
