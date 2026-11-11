/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import { RichText } from '@atproto/api';

import {
  buildBlueskyPresentation,
  isBlueskyDuplicate,
  validateBlueskyPresentation,
  type BlueskyPresentation,
} from '../blueskyPresentation';
import { normalizeFlowItem, graphemeLength } from '../content';
import { BLUESKY_MAX_GRAPHEMES } from '../blueskyPost';

const FLOW_URL = 'https://www.merkurov.love/flow/memory-notes';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    slug: 'memory-notes',
    title: null,
    body_md: '',
    source_url: null,
    type: 'note',
    lang: 'ru',
    metadata: {},
    published_at: '2026-11-10T09:00:00.000Z',
    updated_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  } as any;
}

function presentation(overrides: Record<string, unknown> = {}): BlueskyPresentation {
  return buildBlueskyPresentation({
    content: normalizeFlowItem(item(overrides)),
  });
}

function expectValid(post: BlueskyPresentation) {
  expect(validateBlueskyPresentation(post)).toEqual([]);
}

describe('Bluesky presentation matrix', () => {
  it('1. keeps a short Russian note as the actual thought', () => {
    const post = presentation({
      body_md: 'Короткая мысль о памяти и сетях.',
      type: 'note',
      lang: 'ru',
    });

    expect(post.presentationMode).toBe('note');
    expect(post.postText).toContain('Короткая мысль о памяти и сетях.');
    expect(post.postText.endsWith(FLOW_URL)).toBe(true);
    expect(post.cardTitle).toBe('Заметка');
    expect(post.cardDescription).toBeNull();
    expectValid(post);
  });

  it('2. keeps a short English note in the original language', () => {
    const post = presentation({
      body_md: 'A short thought about memory and networks.',
      type: 'note',
      lang: 'en',
    });

    expect(post.language).toBe('en');
    expect(post.postText).toContain('A short thought about memory and networks.');
    expect(post.cardTitle).toBe('Note');
    expect(post.cardDescription).toBeNull();
    expectValid(post);
  });

  it('3. summarizes a Russian long-form article without repeating its title', () => {
    const title = 'Город как интерфейс';
    const body = [
      'Городская память перестаёт быть архивом и становится протоколом.',
      'Инфраструктура определяет, какие истории вообще могут быть услышаны.',
      'Третье предложение добавляет детали о скорости и доступе.',
      'Четвёртое предложение описывает последствия для публичной речи.',
    ].join(' ');

    const post = presentation({ type: 'article', title, body_md: body });

    expect(post.presentationMode).toBe('article');
    expect(post.cardTitle).toBe(title);
    expect(post.postBody).not.toContain(title);
    expect(post.postBody.length).toBeGreaterThan(40);
    expect(post.postText.endsWith(FLOW_URL)).toBe(true);
    expect(graphemeLength(post.postText)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
    expectValid(post);
  });

  it('4. summarizes an English long-form article in English', () => {
    const title = 'The city as an interface';
    const body = [
      'Urban memory stops being an archive and becomes a protocol.',
      'Infrastructure decides which stories can be heard at all.',
      'The next paragraph adds detail about speed and access.',
      'The final paragraph describes what this means for public speech.',
    ].join(' ');

    const post = presentation({ type: 'article', title, body_md: body, lang: 'en' });

    expect(post.language).toBe('en');
    expect(post.cardTitle).toBe(title);
    expect(post.postBody).not.toContain(title);
    expect(post.postText).toContain('Urban memory');
    expectValid(post);
  });

  it('5. uses a manually supplied article title as the card title, not the post body', () => {
    const post = presentation({
      type: 'article',
      title: 'Ручной заголовок',
      body_md:
        'Основной аргумент статьи начинается здесь. Он развивается в нескольких предложениях и не повторяет заголовок.',
    });

    expect(post.cardTitle).toBe('Ручной заголовок');
    expect(post.postBody).not.toContain('Ручной заголовок');
    expectValid(post);
  });

  it('6. removes a title that duplicates the first paragraph', () => {
    const title = 'Город как интерфейс';
    const post = presentation({
      type: 'article',
      title,
      body_md:
        'Город как интерфейс. Первое предложение статьи раскрывает аргумент. Второе предложение добавляет контекст.',
    });

    expect(post.cardTitle).toBe(title);
    expect(post.postBody).not.toContain(title);
    expect(post.postText).not.toContain(`${title}\n\n${title}`);
    expectValid(post);
  });

  it('7. uses a native image embed for artwork with meaningful ALT text', () => {
    const post = presentation({
      type: 'photo',
      title: 'Акварель',
      body_md: 'Фрагмент серии о памяти.',
      metadata: {
        images: [
          {
            url: 'https://cdn.example.com/artwork.jpg',
            alt: 'Акварельный фрагмент с синей линией и тёплым пятном.',
            width: 1600,
            height: 1200,
          },
        ],
      },
    });

    expect(post.presentationMode).toBe('visual');
    expect(post.embedType).toBe('images');
    expect(post.nativeImageUrl).toBe('https://cdn.example.com/artwork.jpg');
    expect(post.imageAlt).toContain('Акварельный фрагмент');
    expect(post.postText).toContain('Фрагмент серии о памяти.');
    expect(post.postText.endsWith(FLOW_URL)).toBe(true);
    expectValid(post);
  });

  it('8. falls back to an external card instead of inventing ALT for a photograph', () => {
    const post = presentation({
      type: 'photo',
      title: 'Фотография',
      metadata: {
        images: [{ url: 'https://cdn.example.com/photo.jpg' }],
      },
    });

    expect(post.presentationMode).toBe('visual');
    expect(post.embedType).toBe('external');
    expect(post.nativeImageUrl).toBeNull();
    expect(post.imageAlt).toBeNull();
    expect(post.cardImage).toBe('https://cdn.example.com/photo.jpg');
    expectValid(post);
  });

  it('9. uses a video thumbnail only as a card image, never as the video itself', () => {
    const post = presentation({
      type: 'video',
      title: 'Видео о городе',
      metadata: {
        youtube: {
          video_id: 'dQw4w9WgXcQ',
          title: 'Видео о городе',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        },
      },
    });

    expect(post.presentationMode).toBe('visual');
    expect(post.embedType).toBe('external');
    expect(post.cardImageSource).toBe('video-thumbnail');
    expect(post.cardImage).toContain('dQw4w9WgXcQ');
    expect(post.nativeImageUrl).toBeNull();
    expect(post.imageAlt).toBeNull();
    expect(post.destinationUrl).toBe(FLOW_URL);
    expectValid(post);
  });

  it('10. preserves a Vietnamese source title while keeping Russian commentary separate', () => {
    const sourceUrl = 'https://vnexpress.net/ky-uc-do-thi-123456.html';
    const post = presentation({
      type: 'link',
      lang: 'ru',
      body_md: 'Русский комментарий о том, как источник описывает городскую память.',
      source_url: sourceUrl,
      metadata: {
        link_preview: {
          url: sourceUrl,
          title: 'Ký ức đô thị và những con đường',
          description: 'Bài viết kể về ký ức của thành phố qua những con đường.',
          image: 'https://vnexpress.net/images/city.jpg',
          site_name: 'VnExpress',
        },
      },
    });

    expect(post.presentationMode).toBe('link');
    expect(post.language).toBe('ru');
    expect(post.destinationUrl).toBe(sourceUrl);
    expect(post.cardTitle).toBe('Ký ức đô thị và những con đường');
    expect(post.cardDescription).toContain('Bài viết');
    expect(post.postBody).toContain('Русский комментарий');
    expect(post.postText).toContain(FLOW_URL);
    expect(post.postText).not.toContain(sourceUrl);
    expectValid(post);
  });

  it('11. keeps a long source URL as the destination without putting it into the post text', () => {
    const sourceUrl = `https://example.com/${'very-long-segment-'.repeat(12)}?utm_source=flow`;
    const post = presentation({
      type: 'link',
      body_md: 'Короткий комментарий к источнику.',
      source_url: sourceUrl,
      metadata: {
        link_preview: {
          url: sourceUrl,
          title: 'Long source',
          description: 'A source with a deliberately long URL.',
        },
      },
    });

    expect(post.destinationUrl).toBe(sourceUrl);
    expect(post.postText).not.toContain(sourceUrl);
    expect(post.postText.endsWith(FLOW_URL)).toBe(true);
    expectValid(post);
  });

  it('12. does not invent copy for empty metadata', () => {
    const post = presentation({ body_md: '', title: null, type: 'note', metadata: {} });

    expect(post.postBody).toBe('');
    expect(post.postText).toBe(FLOW_URL);
    expect(post.cardTitle).toBe('Заметка');
    expect(post.cardDescription).toBeNull();
    expectValid(post);
  });

  it('13. uses a generated Flow card when no real preview image exists', () => {
    const post = presentation({
      type: 'article',
      title: 'Статья без обложки',
      body_md: 'Текст статьи без изображения, но с достаточным содержанием.',
    });

    expect(post.cardImageSource).toBe('generated-flow-card');
    expect(post.cardImage).toContain('/flow/memory-notes/og?v=');
    expectValid(post);
  });

  it('15. uses a deterministic local summary when the AI provider fails', () => {
    const body = [
      'Первый тезис статьи остаётся центральным.',
      'Второй тезис объясняет причину.',
      'Третий тезис добавляет следствие для читателя.',
      'Четвёртый тезис содержит лишние детали.',
    ].join(' ');

    const post = presentation({ type: 'article', title: 'Заголовок', body_md: body });

    expect(post.usedSummary).toBe(false);
    expect(post.postBody).toContain('Первый тезис');
    expect(post.postBody.length).toBeGreaterThan(20);
    expectValid(post);
  });

  it('16. builds valid UTF-8 facets for Cyrillic and emoji text', () => {
    const post = presentation({
      body_md: 'Короткий текст с эмодзи 🙂 и кириллицей.',
      type: 'note',
    });
    const richText = new RichText({ text: post.postText });
    richText.detectFacetsWithoutResolution();

    const linkFacet = (richText.facets ?? []).find((facet) =>
      facet.features.some((feature) => feature.$type === 'app.bsky.richtext.facet#link')
    );
    const bytes = Buffer.from(post.postText, 'utf8');

    expect(linkFacet).toBeDefined();
    expect(
      bytes.subarray(linkFacet!.index.byteStart, linkFacet!.index.byteEnd).toString('utf8')
    ).toBe(FLOW_URL);
  });

  it('17. keeps a maximum-length post within the 300-grapheme limit', () => {
    const post = presentation({
      type: 'article',
      title: 'Длинный текст',
      body_md: 'Слово '.repeat(200),
    });

    expect(graphemeLength(post.postText)).toBeLessThanOrEqual(BLUESKY_MAX_GRAPHEMES);
    expect(post.postText.endsWith(FLOW_URL)).toBe(true);
    expect(post.postText).not.toContain('undefined');
    expectValid(post);
  });

  it('18. omits a card description that repeats the post text', () => {
    const sentence = 'Источник описывает городскую память через улицы и дома.';
    const sourceUrl = 'https://example.com/city-memory';
    const post = presentation({
      type: 'link',
      body_md: sentence,
      source_url: sourceUrl,
      metadata: {
        link_preview: {
          url: sourceUrl,
          title: 'Городская память',
          description: sentence,
        },
      },
    });

    expect(post.cardDescription).toBeNull();
    expect(post.postBody).toBe(sentence);
    expectValid(post);
  });

  it('19. never repeats the same title in post text and card title', () => {
    const title = 'Город как интерфейс';
    const post = presentation({
      type: 'note',
      title,
      body_md: title,
    });

    expect(post.postBody).toContain(title);
    expect(post.cardTitle).not.toBe(title);
    expect(isBlueskyDuplicate(post.postBody, post.cardTitle)).toBe(false);
    expectValid(post);
  });
});
