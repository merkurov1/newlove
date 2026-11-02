/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  FLOW_SITE_URL,
  normalizeFlowItem,
  truncatePlainText,
} from '../content';
import { resolveFlowMetadataFromContent } from '../metadata';

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
    published_at: '2026-10-28T09:00:00.000Z',
    updated_at: '2026-10-28T10:00:00.000Z',
    ...overrides,
  } as any;
}

describe('Content Resolver — mixed content', () => {
  it('keeps text, images with captions, video and several links together', () => {
    const content = normalizeFlowItem(
      item({
        type: 'article',
        title: 'Город как интерфейс',
        body_md: 'Основной текст о городе и памяти.\n\nВторой абзац.',
        metadata: {
          images: [
            {
              url: 'https://cdn.example.com/one.jpg',
              alt: 'Первый кадр',
              caption: 'Утро',
              width: 1200,
              height: 800,
            },
            'https://cdn.example.com/two.jpg',
          ],
          youtube: {
            video_id: 'dQw4w9WgXcQ',
            title: 'Видео о городе',
            thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          },
          link_previews: [
            {
              url: 'https://example.com/a',
              title: 'Первая ссылка',
              site_name: 'Example',
            },
            {
              url: 'https://example.com/b?x=1',
              title: 'Вторая ссылка',
              site_name: 'Example',
            },
          ],
        },
      })
    );

    expect(content.contentType).toBe('mixed');
    expect(content.body).toContain('Основной текст');
    expect(content.images).toHaveLength(2);
    expect(content.images[0].caption).toBe('Утро');
    expect(content.videos).toHaveLength(1);
    expect(content.videos[0].videoId).toBe('dQw4w9WgXcQ');
    expect(content.links).toHaveLength(2);
    expect(content.canonicalUrl).toBe(`${FLOW_SITE_URL}/flow/memory-notes`);
  });

  it('supports legacy single preview keys and legacy image fields', () => {
    const content = normalizeFlowItem(
      item({
        type: 'link',
        title: null,
        source_url: 'https://legacy.example/article',
        body_md: '',
        metadata: {
          link_preview: {
            url: 'https://legacy.example/article',
            title: 'Legacy title',
            description: 'Legacy description',
            image: 'https://legacy.example/cover.jpg',
            site_name: 'Legacy',
          },
          image: 'https://legacy.example/cover.jpg',
        },
      })
    );

    expect(content.title).toBe('Legacy title');
    expect(content.titleSource).toBe('link');
    expect(content.links[0].description).toBe('Legacy description');
    // The preview image is not duplicated as a separate gallery image.
    expect(content.images).toHaveLength(0);
  });

  it('understands camelCase legacy link preview arrays', () => {
    const content = normalizeFlowItem(
      item({
        type: 'link',
        title: null,
        metadata: {
          linkPreviews: [
            {
              url: 'https://example.com/one',
              title: 'One',
              siteName: 'Example',
            },
          ],
        },
      })
    );

    expect(content.title).toBe('One');
    expect(content.links[0].siteName).toBe('Example');
  });

  it('marks links already present in the body so they are not repeated', () => {
    const content = normalizeFlowItem(
      item({
        type: 'note',
        body_md: 'Читайте https://example.com/inside и думайте.',
        metadata: {
          link_previews: [
            { url: 'https://example.com/inside', title: 'Inside' },
          ],
        },
      })
    );

    expect(content.links[0].inBody).toBe(true);
  });

  it('reads media rows and builds public storage URLs', () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';

    const content = normalizeFlowItem(
      item({ type: 'photo', metadata: {} }),
      {
        media: [
          {
            storage_key: 'flow/item-1/photo one.jpg',
            alt: 'Медиа',
            width: 640,
            height: 480,
            mime: 'image/jpeg',
          },
        ],
      }
    );

    expect(content.media).toHaveLength(1);
    expect(content.media[0].url).toBe(
      'https://project.supabase.co/storage/v1/object/public/media/flow/item-1/photo%20one.jpg'
    );
    expect(content.media[0].width).toBe(640);
    process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  });
});

describe('Content Resolver — title rules', () => {
  it('keeps a meaningful manual title above every other source', () => {
    const content = normalizeFlowItem(
      item({
        title: 'Ручной заголовок',
        body_md: 'Первая строка тела.',
        metadata: { youtube: { video_id: 'dQw4w9WgXcQ', title: 'YouTube' } },
      })
    );

    expect(content.title).toBe('Ручной заголовок');
    expect(content.titleSource).toBe('manual');
  });

  it('uses a link preview title, then a YouTube title, then the first body line', () => {
    const preview = normalizeFlowItem(
      item({ metadata: { link_previews: [{ url: 'https://example.com', title: 'Link title' }] } })
    );
    expect(preview.title).toBe('Link title');
    expect(preview.titleSource).toBe('link');

    const video = normalizeFlowItem(
      item({
        type: 'video',
        metadata: { youtube: { video_id: 'dQw4w9WgXcQ', title: 'Video title' } },
      })
    );
    expect(video.title).toBe('Video title');
    expect(video.titleSource).toBe('youtube');

    const body = normalizeFlowItem(
      item({ body_md: 'Первая строка заметки.\n\nВторая строка.' })
    );
    expect(body.title).toBe('Первая строка заметки.');
    expect(body.titleSource).toBe('body');
  });

  it('rejects filenames, URLs, dates and generic placeholders as titles', () => {
    const content = normalizeFlowItem(
      item({
        title: 'IMG_0759.jpeg',
        type: 'photo',
        metadata: { images: ['https://cdn.example.com/photo.jpg'] },
      })
    );

    expect(content.title).toBe('Фото');
    expect(content.titleSource).toBe('fallback');
    expect(content.showTitle).toBe(false);
  });

  it('uses Russian or English neutral fallbacks', () => {
    expect(
      normalizeFlowItem(item({ type: 'photo', lang: 'ru', metadata: {} })).title
    ).toBe('Фото');

    expect(
      normalizeFlowItem(item({ type: 'photo', lang: 'en', metadata: {} })).title
    ).toBe('Photo');
  });

  it('hides a redundant visible title so it does not repeat the body', () => {
    const content = normalizeFlowItem(
      item({
        title: 'Заголовок',
        body_md: 'Заголовок\n\nПродолжение текста.',
      })
    );

    expect(content.title).toBe('Заголовок');
    expect(content.showTitle).toBe(false);
    expect(content.titleIsRedundant).toBe(true);
  });
});

describe('Content Resolver — excerpts', () => {
  it('shows short text in full', () => {
    const content = normalizeFlowItem(
      item({ body_md: 'Короткая заметка о памяти.' })
    );

    expect(content.bodyExcerpt).toBe('Короткая заметка о памяти.');
    expect(content.bodyTruncated).toBe(false);
  });

  it('cuts long text near 400 normalized characters without broken words', () => {
    const text = `${'Слово '.repeat(120)}финал`;
    const result = truncatePlainText(text, 400);

    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(401);
    expect(result.text.endsWith('…')).toBe(true);
    expect(result.text).not.toMatch(/\s…$/);
    expect(result.text).not.toContain('Слов…');
  });

  it('does not count Markdown markup toward the feed length', () => {
    const content = normalizeFlowItem(
      item({
        body_md: `**${'слово '.repeat(80)}** [ссылка](https://example.com)`,
      })
    );

    expect(content.bodyText).not.toContain('**');
    expect(content.bodyTruncated).toBe(true);
  });
});

describe('Content Metadata Resolver', () => {
  it('prefers a real attached image and omits invented dimensions', () => {
    const content = normalizeFlowItem(
      item({
        type: 'photo',
        title: 'Фотография',
        metadata: {
          images: [{ url: 'https://cdn.example.com/a.jpg', alt: 'Подпись' }],
          link_previews: [
            { url: 'https://example.com', image: 'https://example.com/preview.jpg' },
          ],
        },
      })
    );

    const metadata = resolveFlowMetadataFromContent(content);

    expect(metadata.previewImage).toBe('https://cdn.example.com/a.jpg');
    expect(metadata.cardImage).toBe('https://cdn.example.com/a.jpg');
    expect(metadata.imageWidth).toBeNull();
    expect(metadata.imageHeight).toBeNull();
    expect(metadata.imageAlt).toBe('Подпись');
    expect(metadata.isGeneratedCard).toBe(false);
  });

  it('uses the YouTube thumbnail for a video without attached images', () => {
    const content = normalizeFlowItem(
      item({
        type: 'video',
        title: 'Видео',
        metadata: { youtube: { video_id: 'dQw4w9WgXcQ', title: 'Video' } },
      })
    );

    const metadata = resolveFlowMetadataFromContent(content);

    expect(metadata.previewImage).toContain('dQw4w9WgXcQ');
    expect(metadata.isGeneratedCard).toBe(false);
  });

  it('falls back to a versioned branded card', () => {
    const content = normalizeFlowItem(item({ body_md: 'Заметка без картинки.' }));
    const metadata = resolveFlowMetadataFromContent(content);

    expect(metadata.isGeneratedCard).toBe(true);
    expect(metadata.previewImage).toContain('/flow/memory-notes/og?v=');
    expect(metadata.imageWidth).toBe(1200);
    expect(metadata.imageHeight).toBe(630);
    expect(metadata.imageType).toBe('image/png');
  });

  it('changes the card version when title or update time changes', () => {
    const first = resolveFlowMetadataFromContent(
      normalizeFlowItem(item({ body_md: 'Первая версия.' }))
    );
    const second = resolveFlowMetadataFromContent(
      normalizeFlowItem(
        item({
          body_md: 'Первая версия.',
          updated_at: '2026-10-29T10:00:00.000Z',
        })
      )
    );

    expect(first.version).not.toBe(second.version);
    expect(first.canonicalUrl).toBe(second.canonicalUrl);
    expect(first.canonicalUrl.startsWith('https://www.merkurov.love/')).toBe(true);
  });
});
