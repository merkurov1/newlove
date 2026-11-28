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

  it('uses a link preview title only for a link publication, then YouTube and the first body line', () => {
    const preview = normalizeFlowItem(
      item({
        type: 'link',
        source_url: 'https://example.com',
        metadata: { link_previews: [{ url: 'https://example.com', title: 'Link title' }] },
      })
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

  it('never uses a link preview title as the title of an article or note', () => {
    const preview = {
      url: 'https://t.me/PierrotAi_bot',
      title: 'Pierrot',
      site_name: 'Telegram',
    };

    const article = normalizeFlowItem(
      item({
        type: 'article',
        body_md: 'Журнал. История вопроса.\n\nАвторский текст о проекте.',
        source_url: preview.url,
        metadata: {
          link_previews: [
            preview,
            {
              url: 'https://example.com/research',
              title: 'Research page',
              site_name: 'Example',
            },
          ],
        },
      })
    );

    expect(article.title).toBe('Журнал. История вопроса.');
    expect(article.titleSource).toBe('body');
    expect(article.showTitle).toBe(false);
    expect(article.sourceUrl).toBe(preview.url);
    expect(article.links).toHaveLength(2);
    expect(article.links[0].url).toBe(preview.url);
    expect(article.links[0].title).toBe('Pierrot');
    expect(article.links[1].url).toBe('https://example.com/research');
    expect(article.links[1].title).toBe('Research page');

    const note = normalizeFlowItem(
      item({
        type: 'note',
        body_md: 'Заметка о ссылке.',
        metadata: {
          link_previews: [
            { url: 'https://example.com/news', title: 'Open Graph headline' },
          ],
        },
      })
    );

    expect(note.title).toBe('Заметка о ссылке.');
    expect(note.titleSource).toBe('body');
    expect(note.links[0].title).toBe('Open Graph headline');
  });

  it('ignores a persisted generated link title for an article but keeps a manual title', () => {
    const generated = normalizeFlowItem(
      item({
        title: 'Pierrot',
        type: 'article',
        body_md: 'Журнал. История вопроса.\n\nАвторский текст.',
        source_url: 'https://t.me/PierrotAi_bot',
        metadata: {
          title_source: 'link',
          generated_title: 'Pierrot',
          link_previews: [
            { url: 'https://t.me/PierrotAi_bot', title: 'Pierrot' },
          ],
        },
      })
    );

    expect(generated.title).toBe('Журнал. История вопроса.');
    expect(generated.titleSource).toBe('body');

    const manual = normalizeFlowItem(
      item({
        title: 'Журнал. История вопроса.',
        type: 'article',
        body_md: 'Авторский текст.',
        source_url: 'https://t.me/PierrotAi_bot',
        metadata: {
          title_source: 'manual',
          link_previews: [
            { url: 'https://t.me/PierrotAi_bot', title: 'Pierrot' },
          ],
        },
      })
    );

    expect(manual.title).toBe('Журнал. История вопроса.');
    expect(manual.titleSource).toBe('manual');
  });

  it('keeps the item Title field when it differs from a stale generated source', () => {
    const preview = {
      url: 'https://example.com/news',
      title: 'Open Graph headline',
      site_name: 'Example',
    };

    const link = normalizeFlowItem(
      item({
        title: 'Saved Flow title',
        type: 'link',
        source_url: preview.url,
        metadata: {
          title_source: 'link',
          generated_title: 'Open Graph headline',
          link_previews: [preview],
        },
      })
    );

    expect(link.title).toBe('Saved Flow title');
    expect(link.titleSource).toBe('manual');
    expect(link.showTitle).toBe(true);
    // The destination still keeps its own preview title on the link card.
    expect(link.links[0].title).toBe('Open Graph headline');

    const article = normalizeFlowItem(
      item({
        title: 'Saved article title',
        type: 'article',
        body_md: 'Первая строка статьи.\n\nОсновной текст.',
        source_url: preview.url,
        metadata: {
          title_source: 'link',
          generated_title: 'Open Graph headline',
          link_previews: [preview],
        },
      })
    );

    expect(article.title).toBe('Saved article title');
    expect(article.titleSource).toBe('manual');
    expect(article.showTitle).toBe(true);
    expect(article.links[0].title).toBe('Open Graph headline');
  });

  it('keeps an authored title even when a legacy row has no generated_title', () => {
    const content = normalizeFlowItem(
      item({
        title: 'Saved Flow title',
        type: 'link',
        source_url: 'https://example.com/news',
        metadata: {
          title_source: 'link',
          link_previews: [
            { url: 'https://example.com/news', title: 'Open Graph headline' },
          ],
        },
      })
    );

    expect(content.title).toBe('Saved Flow title');
    expect(content.titleSource).toBe('manual');
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

describe('Content Resolver — explicit Markdown headings', () => {
  it('promotes a leading ## heading to the card title and removes it from the body', () => {
    const content = normalizeFlowItem(
      item({
        type: 'photo',
        title: 'Heart & Angel > World > Temple',
        body_md:
          '## Heart & Angel > World > Temple \n\nФотография храма и его отражения.',
        metadata: {
          title_source: 'body',
          generated_title: 'Heart & Angel > World > Temple',
          images: [
            {
              url: 'https://cdn.example.com/temple.jpg',
              alt: 'Temple',
            },
          ],
        },
      })
    );

    expect(content.title).toBe('Heart & Angel > World > Temple');
    expect(content.titleSource).toBe('heading');
    expect(content.showTitle).toBe(true);
    expect(content.titleIsRedundant).toBe(false);
    expect(content.images).toHaveLength(1);
    expect(content.body).toBe('Фотография храма и его отражения.');
    expect(content.bodyExcerpt).toBe('Фотография храма и его отражения.');
    expect(content.bodyExcerpt).not.toContain('##');
    expect(content.bodyTruncated).toBe(false);
  });

  it('supports single # headings, surrounding whitespace/NBSP and inline formatting', () => {
    const content = normalizeFlowItem(
      item({
        type: 'article',
        body_md:
          '\n\u00a0\n#\u00a0**Bold** [linked](https://example.com) title ##\n\nПервый абзац после заголовка.',
      })
    );

    expect(content.title).toBe('Bold linked title');
    expect(content.titleSource).toBe('heading');
    expect(content.showTitle).toBe(true);
    expect(content.body).toBe('Первый абзац после заголовка.');
    expect(content.bodyExcerpt).toBe('Первый абзац после заголовка.');
    expect(content.bodyExcerpt).not.toContain('Bold');
  });

  it('shows a leading heading once when it repeats a manual title', () => {
    const content = normalizeFlowItem(
      item({
        type: 'article',
        title: 'Заголовок публикации',
        body_md: '## Заголовок публикации\n\nАвторский текст.',
        metadata: { title_source: 'manual' },
      })
    );

    expect(content.title).toBe('Заголовок публикации');
    expect(content.titleSource).toBe('manual');
    expect(content.showTitle).toBe(true);
    expect(content.titleIsRedundant).toBe(false);
    expect(content.body).toBe('Авторский текст.');
    expect(content.bodyExcerpt).toBe('Авторский текст.');
  });

  it('keeps a different manual title and leaves the heading as a section heading', () => {
    const content = normalizeFlowItem(
      item({
        type: 'article',
        title: 'Авторский заголовок',
        body_md: '## Раздел статьи\n\nТекст раздела.',
        metadata: { title_source: 'manual' },
      })
    );

    expect(content.title).toBe('Авторский заголовок');
    expect(content.titleSource).toBe('manual');
    expect(content.showTitle).toBe(true);
    expect(content.body).toContain('Раздел статьи');
    expect(content.bodyExcerpt).toContain('Раздел статьи');
  });

  it('keeps a plain photo caption in the body instead of inventing a title', () => {
    const content = normalizeFlowItem(
      item({
        type: 'photo',
        title: null,
        body_md: 'Тёплый вечер у моря.',
        metadata: {
          images: [{ url: 'https://cdn.example.com/sea.jpg' }],
        },
      })
    );

    expect(content.titleSource).toBe('body');
    expect(content.showTitle).toBe(false);
    expect(content.body).toBe('Тёплый вечер у моря.');
    expect(content.bodyExcerpt).toBe('Тёплый вечер у моря.');
  });

  it('keeps a plain first sentence in the body when there is no explicit heading', () => {
    const content = normalizeFlowItem(
      item({
        type: 'note',
        body_md: 'Это обычная первая фраза заметки.\n\nВторой абзац остаётся текстом.',
      })
    );

    expect(content.titleSource).toBe('body');
    expect(content.showTitle).toBe(false);
    expect(content.bodyExcerpt).toContain('Это обычная первая фраза заметки.');
  });

  it('does not spend the excerpt limit on a leading heading and still truncates the body', () => {
    const content = normalizeFlowItem(
      item({
        body_md: `## ${'Длинный заголовок '.repeat(20)}\n\n${'Слово '.repeat(120)}финал`,
      })
    );

    expect(content.titleSource).toBe('heading');
    expect(content.title.length).toBeLessThanOrEqual(160);
    expect(content.bodyExcerpt.startsWith('Слово')).toBe(true);
    expect(content.bodyExcerpt).not.toContain('Длинный заголовок');
    expect(content.bodyExcerpt.endsWith('…')).toBe(true);
    expect(content.bodyTruncated).toBe(true);
  });

  it('keeps the existing YouTube title and link preview behavior', () => {
    const video = normalizeFlowItem(
      item({
        type: 'video',
        title: 'DeepSeek | Merkurov x Pierrot',
        body_md: '',
        metadata: {
          title_source: 'youtube',
          generated_title: 'DeepSeek | Merkurov x Pierrot',
          youtube: {
            video_id: 'dQw4w9WgXcQ',
            title: 'DeepSeek | Merkurov x Pierrot',
          },
        },
      })
    );

    expect(video.title).toBe('DeepSeek | Merkurov x Pierrot');
    expect(video.titleSource).toBe('youtube');
    expect(video.showTitle).toBe(true);

    const link = normalizeFlowItem(
      item({
        type: 'link',
        title: 'Saved Flow title',
        source_url: 'https://example.com/news',
        metadata: {
          title_source: 'link',
          generated_title: 'Open Graph headline',
          link_previews: [
            {
              url: 'https://example.com/news',
              title: 'Open Graph headline',
              site_name: 'Example',
            },
          ],
        },
      })
    );

    expect(link.title).toBe('Saved Flow title');
    expect(link.titleSource).toBe('manual');
    expect(link.showTitle).toBe(true);
    expect(link.links[0].title).toBe('Open Graph headline');
  });

  it('keeps an empty body clean when the heading is the only content', () => {
    const content = normalizeFlowItem(
      item({ type: 'note', body_md: '### Только заголовок' })
    );

    expect(content.title).toBe('Только заголовок');
    expect(content.titleSource).toBe('heading');
    expect(content.showTitle).toBe(true);
    expect(content.body).toBe('');
    expect(content.bodyExcerpt).toBe('');
    expect(content.bodyTruncated).toBe(false);
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
