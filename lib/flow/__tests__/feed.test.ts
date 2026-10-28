/**
 * @jest-environment node
 */

import * as cheerio from 'cheerio';
import {
  DEFAULT_FEED_LIMIT,
  FLOW_SITE_URL,
  absoluteMarkdownUrl,
  absoluteUrl,
  buildJsonFeed,
  buildRssFeed,
  cdata,
  createFeedChannel,
  escapeXml,
  feedQueryString,
  markdownToPlainText,
  parseFeedQuery,
  stripInvalidXml,
  toFeedEntry,
  toRssDate,
  type FlowFeedEntry,
} from '../feed';

const renderMarkdown = (markdown: string) =>
  markdown.trim() ? `<p>${escapeXml(markdown.trim())}</p>` : '';

/**
 * Namespaced tag names (`atom:link`, `content:encoded`) cannot be selected
 * with css-select, so tests match them by their literal XML name.
 */
function named($: cheerio.CheerioAPI, name: string) {
  return $('*').filter((_, node) => node.type === 'tag' && node.name === name);
}

function rawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Заметка о памяти',
    slug: 'pamyat',
    lang: 'ru',
    type: 'note',
    body_md: 'Первая строка.\n\nВторой абзац.',
    source_url: null,
    metadata: {},
    published_at: '2026-10-28T09:00:00.000Z',
    updated_at: '2026-10-28T10:00:00.000Z',
    created_at: '2026-10-28T08:00:00.000Z',
    ...overrides,
  };
}

function feedEntry(overrides: Partial<FlowFeedEntry> = {}): FlowFeedEntry {
  return {
    id: 'entry-1',
    title: 'Entry',
    url: `${FLOW_SITE_URL}/flow/entry`,
    summary: 'Summary',
    contentHtml: '<p>Body</p>',
    contentText: 'Body',
    publishedAt: '2026-10-28T09:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
    language: 'ru',
    type: 'note',
    typeLabel: 'Заметка',
    image: null,
    tags: ['Заметка', 'Русский'],
    ...overrides,
  };
}

function channel(entries: FlowFeedEntry[]) {
  return createFeedChannel({
    entries,
    feedUrl: `${FLOW_SITE_URL}/flow/rss`,
  });
}

describe('feed text helpers', () => {
  it('escapes XML and removes characters XML 1.0 forbids', () => {
    expect(escapeXml(`a < b & "c" 'd'`)).toBe('a &lt; b &amp; &quot;c&quot; &apos;d&apos;');

    const dirty = `ok\u0000\u0008\u000b\u001f\uFFFE text`;
    expect(stripInvalidXml(dirty)).toBe('ok text');
    expect(escapeXml(dirty)).not.toMatch(/[\u0000-\u0008\u000b\u001f]/);
  });

  it('splits a CDATA terminator instead of breaking the document', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
  });

  it('formats RFC 822 dates in GMT and tolerates invalid input', () => {
    expect(toRssDate('2026-10-28T09:00:00.000Z')).toBe('Wed, 28 Oct 2026 09:00:00 GMT');
    expect(toRssDate('not a date')).toBe('Thu, 01 Jan 1970 00:00:00 GMT');
  });

  it('strips markdown for plain-text summaries', () => {
    expect(
      markdownToPlainText(
        '# Заголовок\n\nТекст с [ссылкой](https://example.com) и ![картинкой](https://example.com/a.jpg).'
      )
    ).toBe('Заголовок Текст с ссылкой и картинкой.');

    expect(markdownToPlainText('| a | b |\n| - | - |\n| 1 | 2 |')).toBe('a b 1 2');
  });
});

describe('feed URLs', () => {
  it('accepts only http(s) URLs and resolves relative ones', () => {
    expect(absoluteUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(absoluteUrl('/flow/a')).toBe(`${FLOW_SITE_URL}/flow/a`);
    expect(absoluteUrl('//cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(absoluteUrl('javascript:alert(1)')).toBeNull();
    expect(absoluteUrl('data:image/png;base64,AA')).toBeNull();
  });

  it('keeps anchors and mailto links in markdown content', () => {
    expect(absoluteMarkdownUrl('#section')).toBe('#section');
    expect(absoluteMarkdownUrl('mailto:hi@example.com')).toBe('mailto:hi@example.com');
    expect(absoluteMarkdownUrl('/flow')).toBe(`${FLOW_SITE_URL}/flow`);
    expect(absoluteMarkdownUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('feed query', () => {
  it('validates lang and clamps the limit', () => {
    const params = new URLSearchParams('lang=EN&limit=9999');
    expect(parseFeedQuery(params)).toEqual({
      lang: 'en',
      limit: 100,
    });

    expect(parseFeedQuery(new URLSearchParams('lang=de&limit=0'))).toEqual({
      lang: null,
      limit: DEFAULT_FEED_LIMIT,
    });
  });

  it('builds a canonical self-link query', () => {
    expect(feedQueryString({ lang: null, limit: DEFAULT_FEED_LIMIT })).toBe('');
    expect(feedQueryString({ lang: 'ru', limit: 10 })).toBe('?lang=ru&limit=10');
  });
});

describe('toFeedEntry', () => {
  it('uses link preview metadata for title, summary and image', () => {
    const entry = toFeedEntry(
      rawItem({
        id: 'link-1',
        type: 'link',
        title: null,
        slug: 'link-1',
        body_md: '',
        source_url: 'https://www.theguardian.com/article',
        metadata: {
          link_previews: [
            {
              url: 'https://www.theguardian.com/article',
              title: 'Palantir and Sadiq Khan drop legal battle',
              description: 'A detailed report about the Met contract.',
              site_name: 'The Guardian',
              image: 'https://i.guim.co.uk/img/media/cover.jpg?width=1200',
            },
          ],
        },
      }),
      renderMarkdown
    );

    expect(entry.title).toBe('Palantir and Sadiq Khan drop legal battle');
    expect(entry.summary).toContain('Met contract');
    expect(entry.image).toBe('https://i.guim.co.uk/img/media/cover.jpg?width=1200');
    expect(entry.contentHtml).toContain('The Guardian');
    expect(entry.contentHtml).toContain('https://www.theguardian.com/article');
    expect(entry.url).toBe(`${FLOW_SITE_URL}/flow/link-1`);
  });

  it('absolutizes relative photo URLs and keeps the caption', () => {
    const entry = toFeedEntry(
      rawItem({
        type: 'photo',
        title: '',
        body_md: '',
        slug: 'photo-1',
        metadata: {
          public_url: '/uploads/sea.jpg',
          alt: 'Вид на море',
          caption: 'Утро на побережье',
        },
      }),
      renderMarkdown
    );

    expect(entry.image).toBe(`${FLOW_SITE_URL}/uploads/sea.jpg`);
    expect(entry.contentHtml).toContain('Утро на побережье');
    expect(entry.contentHtml).toContain(`${FLOW_SITE_URL}/uploads/sea.jpg`);
    expect(entry.tags).toContain('Фото');
  });

  it('links a video to its YouTube watch page', () => {
    const entry = toFeedEntry(
      rawItem({
        type: 'video',
        title: 'Лекция о языке',
        slug: 'lecture',
        body_md: 'Запись лекции.',
        source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        metadata: {
          youtube: { video_id: 'dQw4w9WgXcQ' },
        },
      }),
      renderMarkdown
    );

    expect(entry.image).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(entry.contentHtml).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('buildRssFeed', () => {
  it('produces a well-formed RSS 2.0 document with modern namespaces', () => {
    const xml = buildRssFeed(
      channel([
        feedEntry(),
        feedEntry({
          id: 'entry-2',
          title: 'Second',
          type: 'photo',
          typeLabel: 'Фото',
          image: 'https://example.com/photo.jpg',
          publishedAt: '2026-10-27T09:00:00.000Z',
        }),
      ])
    );

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

    for (const namespace of [
      'http://www.w3.org/2005/Atom',
      'http://purl.org/rss/1.0/modules/content/',
      'http://purl.org/dc/elements/1.1/',
      'http://search.yahoo.com/mrss/',
      'http://webfeeds.org/rss/1.0',
    ]) {
      expect(xml).toContain(namespace);
    }

    const $ = cheerio.load(xml, { xmlMode: true });

    expect($('channel > title').first().text()).toBe('Flow — Anton Merkurov');
    expect(named($, 'atom:link').first().attr('rel')).toBe('self');
    expect($('channel > language').text()).toBe('ru');
    expect($('item')).toHaveLength(2);
    expect($('item').first().attr('xml:lang')).toBe('ru');
    expect($('item > guid').first().attr('isPermaLink')).toBe('false');
    expect($('item > pubDate').first().text()).toBe('Wed, 28 Oct 2026 09:00:00 GMT');
    expect($('item > description').first().text()).toBe('Summary');
    expect(named($, 'content:encoded').first().text()).toBe('<p>Body</p>');
  });

  it('adds enclosure and Media RSS data for photos', () => {
    const xml = buildRssFeed(
      channel([
        feedEntry({
          type: 'photo',
          image: 'https://example.com/photo.webp',
        }),
      ])
    );

    const $ = cheerio.load(xml, { xmlMode: true });

    expect($('item > enclosure').attr('url')).toBe('https://example.com/photo.webp');
    expect($('item > enclosure').attr('type')).toBe('image/webp');
    expect($('item > enclosure').attr('length')).toBe('0');
    expect(named($, 'media:thumbnail').first().attr('url')).toBe('https://example.com/photo.webp');
  });

  it('keeps the YouTube thumbnail out of the enclosure', () => {
    const xml = buildRssFeed(
      channel([
        feedEntry({
          type: 'video',
          typeLabel: 'Видео',
          image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }),
      ])
    );

    const $ = cheerio.load(xml, { xmlMode: true });

    // A thumbnail is not a playable file, so it must not be presented as an
    // enclosure (podcast clients would try to download it as the episode).
    expect($('item > enclosure')).toHaveLength(0);
    expect(named($, 'media:thumbnail').first().attr('url')).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    );
  });

  it('escapes unsafe text and keeps content CDATA valid', () => {
    const xml = buildRssFeed(
      channel([
        feedEntry({
          title: 'A <b>title</b> & more',
          summary: '5 > 3 & 2 < 4',
          contentHtml: '<p>safe ]]> tail</p>',
        }),
      ])
    );

    expect(xml).toContain('A &lt;b&gt;title&lt;/b&gt; &amp; more');
    expect(xml).toContain('5 &gt; 3 &amp; 2 &lt; 4');
    expect(xml).toContain('<![CDATA[<p>safe ]]]]><![CDATA[> tail</p>]]>');

    // Must still parse as XML.
    const $ = cheerio.load(xml, { xmlMode: true });
    expect(named($, 'content:encoded').first().text()).toBe('<p>safe ]]> tail</p>');
  });

  it('keeps an empty feed valid and free of build-time noise', () => {
    const xml = buildRssFeed(channel([]));

    expect(xml).not.toContain('<lastBuildDate>');
    expect(xml).not.toContain('<pubDate>');

    const $ = cheerio.load(xml, { xmlMode: true });
    expect($('channel > title').first().text()).toBe('Flow — Anton Merkurov');
    expect($('item')).toHaveLength(0);
  });

  it('sets Last-Modified from the newest updated timestamp', () => {
    const feed = channel([
      feedEntry({
        publishedAt: '2026-10-20T09:00:00.000Z',
        updatedAt: '2026-10-29T11:30:00.000Z',
      }),
      feedEntry({
        id: 'older',
        publishedAt: '2026-10-19T09:00:00.000Z',
        updatedAt: '2026-10-19T09:00:00.000Z',
      }),
    ]);

    expect(feed.lastBuildDate.toISOString()).toBe('2026-10-29T11:30:00.000Z');
  });
});

describe('buildJsonFeed', () => {
  it('produces JSON Feed 1.1', () => {
    const feed = JSON.parse(
      buildJsonFeed(
        channel([
          feedEntry({
            image: 'https://example.com/a.jpg',
            tags: ['Заметка', 'Русский'],
          }),
        ])
      )
    );

    expect(feed.version).toBe('https://jsonfeed.org/version/1.1');
    expect(feed.feed_url).toBe(`${FLOW_SITE_URL}/flow/rss`);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].id).toBe('entry-1');
    expect(feed.items[0].content_html).toBe('<p>Body</p>');
    expect(feed.items[0].date_modified).toBe('2026-10-28T10:00:00.000Z');
    expect(feed.items[0].image).toBe('https://example.com/a.jpg');
  });
});
