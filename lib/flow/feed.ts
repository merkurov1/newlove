import { getLinkPreviews } from '@/lib/flow-issue/metadata';

/**
 * Reader-facing feed for the Flow stream.
 *
 * The XML is assembled without a serializer so the output stays readable in
 * tests and in `curl`. Everything that reaches the document goes through
 * `escapeXml` or `cdata`; control characters that XML 1.0 forbids are
 * dropped instead of corrupting an otherwise valid feed.
 */

export const FLOW_SITE_URL = 'https://www.merkurov.love';
export const FLOW_HOME_PATH = '/flow';
export const FLOW_FEED_PATH = '/flow/rss';
export const FLOW_FEED_JSON_PATH = '/flow/feed.json';

export const FLOW_FEED_TITLE = 'Flow — Anton Merkurov';
export const FLOW_FEED_DESCRIPTION =
  'Поток мыслей, заметок, ссылок и медиа Антона Меркурова. Notes, links, images and videos from Anton Merkurov.';
export const FLOW_FEED_LANGUAGE = 'ru';
export const FLOW_FEED_AUTHOR = 'Anton Merkurov';
export const FLOW_FEED_ICON = `${FLOW_SITE_URL}/icon`;
export const FLOW_FEED_ACCENT = '#990F3D';
export const FLOW_FEED_TTL_MINUTES = 60;

export const DEFAULT_FEED_LIMIT = 40;
export const MAX_FEED_LIMIT = 100;

export type FlowFeedEntry = {
  id: string;
  title: string;
  url: string;
  summary: string;
  contentHtml: string;
  contentText: string;
  /** ISO 8601. */
  publishedAt: string;
  /** ISO 8601 or null. */
  updatedAt: string | null;
  language: 'ru' | 'en';
  type: string;
  typeLabel: string;
  image: string | null;
  tags: string[];
};

export type FeedChannel = {
  title: string;
  link: string;
  description: string;
  language: string;
  feedUrl: string;
  icon: string;
  accentColor: string;
  lastBuildDate: Date;
  items: FlowFeedEntry[];
};

export type FeedQuery = {
  lang: 'ru' | 'en' | null;
  limit: number;
};

/* ------------------------------------------------------------------ */
/* XML safety                                                          */
/* ------------------------------------------------------------------ */

/**
 * Remove characters that are not allowed in XML 1.0 (C0 controls except
 * tab/newline/carriage return, lone surrogates, U+FFFE/U+FFFF). Some Flow
 * posts are pasted from chat clients, which do contain such characters.
 */
export function stripInvalidXml(value: string): string {
  let result = '';

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);

    if (allowed) result += character;
  }

  return result;
}

export function escapeXml(value: string): string {
  return stripInvalidXml(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function cdata(value: string): string {
  return `<![CDATA[${stripInvalidXml(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export function parseFeedDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** RFC 822/1123 date, always in GMT. */
export function toRssDate(value: unknown): string {
  const date = parseFeedDate(value);

  return (date ?? new Date(0)).toUTCString();
}

export function toIsoDate(value: unknown): string | null {
  return parseFeedDate(value)?.toISOString() ?? null;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export function markdownToPlainText(value: string): string {
  return (
    value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      // Markdown table borders and cells do not survive as plain text.
      .replace(/^\s*\|?[\s:|\-]*-[\s:|\-]*$/gm, ' ')
      .replace(/\s*\|\s*/g, ' ')
      .replace(/[*_~`]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const cut = value.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  const clipped = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;

  return `${clipped.trimEnd()}…`;
}

/** Absolute http(s) URL, or null when the value cannot be used safely. */
export function absoluteUrl(
  value: string | null | undefined,
  base: string = FLOW_SITE_URL
): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;

  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);

      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  // Unknown schemes (javascript:, data:, …) must never reach a reader.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed, base);

    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * URL transform for markdown content: relative paths become absolute and
 * every non-web scheme except mailto is removed.
 */
export function absoluteMarkdownUrl(url: string): string | null {
  if (!url) return url;
  if (url.startsWith('#')) return url;
  if (/^mailto:/i.test(url)) return url;

  return absoluteUrl(url, `${FLOW_SITE_URL}/`);
}

export function imageMimeType(url: string): string {
  let pathname = url;

  try {
    pathname = new URL(url).pathname;
  } catch {
    // Fall through to the extension checks below.
  }

  const extension = pathname.toLowerCase().split('.').pop()?.split(/[?#]/)[0];

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'avif':
      return 'image/avif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

/* ------------------------------------------------------------------ */
/* Query parsing                                                       */
/* ------------------------------------------------------------------ */

export function parseFeedQuery(searchParams: URLSearchParams): FeedQuery {
  const rawLang = (searchParams.get('lang') || '').trim().toLowerCase();

  const lang = rawLang === 'ru' || rawLang === 'en' ? rawLang : null;

  const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);

  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_FEED_LIMIT)
      : DEFAULT_FEED_LIMIT;

  return { lang, limit };
}

export function feedQueryString(query: FeedQuery): string {
  const params = new URLSearchParams();

  if (query.lang) params.set('lang', query.lang);
  if (query.limit !== DEFAULT_FEED_LIMIT) {
    params.set('limit', String(query.limit));
  }

  const value = params.toString();

  return value ? `?${value}` : '';
}

/* ------------------------------------------------------------------ */
/* Flow item → feed entry                                              */
/* ------------------------------------------------------------------ */

type TypeLabel = { ru: string; en: string };

const TYPE_LABELS: Record<string, TypeLabel> = {
  note: { ru: 'Заметка', en: 'Note' },
  article: { ru: 'Статья', en: 'Article' },
  link: { ru: 'Ссылка', en: 'Link' },
  photo: { ru: 'Фото', en: 'Photo' },
  video: { ru: 'Видео', en: 'Video' },
  quote: { ru: 'Цитата', en: 'Quote' },
};

const FALLBACK_LABEL: TypeLabel = {
  ru: 'Запись',
  en: 'Post',
};

type YouTubeInfo = {
  videoId: string | null;
  title: string | null;
  thumbnail: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function typeLabelFor(type: string, language: 'ru' | 'en'): string {
  return (TYPE_LABELS[type] ?? FALLBACK_LABEL)[language];
}

function languageFor(item: Record<string, unknown>): 'ru' | 'en' {
  return readString(item.lang) === 'en' ? 'en' : 'ru';
}

function youtubeFor(item: Record<string, unknown>): YouTubeInfo {
  const metadata = asRecord(item.metadata) ?? {};
  const youtube = asRecord(metadata.youtube);

  let videoId = readString(youtube?.video_id);
  const thumbnail = absoluteUrl(readString(youtube?.thumbnail_url));

  if (!videoId) {
    const sourceUrl = readString(item.source_url);

    if (sourceUrl) {
      videoId = youtubeIdFromUrl(sourceUrl);
    }
  }

  return {
    videoId,
    title: readString(youtube?.title),
    thumbnail: thumbnail ?? youtubeThumbnail(videoId),
  };
}

function youtubeIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);

    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const queryId = url.searchParams.get('v');
      if (queryId) return queryId;

      const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]+)/);

      return match?.[1] ?? null;
    }
  } catch {
    // Ignore malformed URLs.
  }

  return null;
}

function youtubeThumbnail(videoId: string | null): string | null {
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : null;
}

function collectImages(item: Record<string, unknown>): string[] {
  const metadata = asRecord(item.metadata) ?? {};
  const candidates: unknown[] = [];

  if (Array.isArray(metadata.images)) {
    candidates.push(...metadata.images);
  }

  for (const key of ['public_url', 'image', 'image_url', 'og_image']) {
    candidates.push(metadata[key]);
  }

  for (const preview of getLinkPreviews(metadata)) {
    candidates.push(preview.image);
    candidates.push(preview.image_url);
  }

  const urls = candidates
    .map((value) => {
      if (typeof value === 'string') return value;

      const record = asRecord(value);

      return readString(record?.url) ?? readString(record?.public_url);
    })
    .map((value) => absoluteUrl(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(urls)];
}

function permalinkFor(item: Record<string, unknown>): string {
  const slug = readString(item.slug);

  if (slug) {
    return `${FLOW_SITE_URL}/flow/${encodeURIComponent(slug)}`;
  }

  const sourceUrl = sourceUrlFor(item);

  return sourceUrl || `${FLOW_SITE_URL}${FLOW_HOME_PATH}`;
}

function sourceUrlFor(item: Record<string, unknown>): string | null {
  const metadata = asRecord(item.metadata) ?? {};
  const preview = getLinkPreviews(metadata)[0] ?? null;

  return (
    absoluteUrl(readString(metadata.canonical_url)) ??
    absoluteUrl(readString(preview?.url)) ??
    absoluteUrl(readString(item.source_url))
  );
}

function sourceNameFor(item: Record<string, unknown>): string {
  const metadata = asRecord(item.metadata) ?? {};
  const preview = getLinkPreviews(metadata)[0] ?? null;

  const explicit =
    readString(preview?.site_name) ?? readString(metadata.site_name) ?? readString(metadata.domain);

  if (explicit) return explicit;

  const sourceUrl = sourceUrlFor(item);

  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      // Ignore malformed URLs.
    }
  }

  return 'Flow';
}

function titleFor(item: Record<string, unknown>, language: 'ru' | 'en', label: string): string {
  const metadata = asRecord(item.metadata) ?? {};
  const preview = getLinkPreviews(metadata)[0] ?? null;
  const youtube = youtubeFor(item);
  const body = readString(item.body_md) ?? '';

  const candidates = [
    readString(item.title),
    readString(metadata.title),
    youtube.title,
    readString(preview?.title),
    readString(metadata.alt),
    readString(metadata.caption),
    truncate(markdownToPlainText(body).split(/(?<=[.!?…])\s+/)[0] || '', 90),
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  const date = parseFeedDate(item.published_at);

  return date ? `${label} · ${date.toISOString().slice(0, 10)}` : label;
}

function summaryFor(item: Record<string, unknown>, title: string): string {
  const metadata = asRecord(item.metadata) ?? {};
  const preview = getLinkPreviews(metadata)[0] ?? null;
  const body = readString(item.body_md) ?? '';

  const candidates = [
    readString(metadata.description),
    readString(preview?.description),
    markdownToPlainText(body),
  ];

  for (const candidate of candidates) {
    if (candidate) return truncate(candidate, 300);
  }

  return truncate(title, 300);
}

function captionFor(item: Record<string, unknown>): string | null {
  const metadata = asRecord(item.metadata) ?? {};

  return readString(metadata.caption) ?? readString(metadata.alt) ?? null;
}

/**
 * Convert a raw `items` row into a feed entry.
 *
 * `renderMarkdown` is injected so the pure XML layer stays testable without
 * pulling the markdown renderer (an ESM React pipeline) into unit tests.
 */
export function toFeedEntry(
  item: Record<string, unknown>,
  renderMarkdown: (markdown: string) => string
): FlowFeedEntry {
  const language = languageFor(item);
  const type = readString(item.type) ?? 'note';
  const label = typeLabelFor(type, language);
  const title = titleFor(item, language, label);
  const url = permalinkFor(item);
  const body = readString(item.body_md) ?? '';
  const bodyHtml = body ? renderMarkdown(body) : '';
  const preview = getLinkPreviews(asRecord(item.metadata) ?? {})[0] ?? null;
  const sourceUrl = sourceUrlFor(item);
  const sourceName = sourceNameFor(item);
  const images = collectImages(item);
  const caption = captionFor(item);
  const youtube = youtubeFor(item);
  const videoId = youtube.videoId;
  const publishedAt =
    toIsoDate(item.published_at) ?? toIsoDate(item.created_at) ?? new Date().toISOString();

  const html: string[] = [];

  if (type === 'video' && videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

    if (youtube.thumbnail) {
      html.push(
        `<p><a href="${escapeXml(watchUrl)}"><img src="${escapeXml(
          youtube.thumbnail
        )}" alt="${escapeXml(title)}" /></a></p>`
      );
    }

    html.push(
      `<p><a href="${escapeXml(watchUrl)}">${
        language === 'ru' ? 'Смотреть' : 'Watch'
      } on YouTube</a></p>`
    );
  } else if (images.length) {
    const figureHref = type === 'link' && sourceUrl ? sourceUrl : url;
    const limit = type === 'photo' ? 6 : 1;

    images.slice(0, limit).forEach((image, index) => {
      const figcaption =
        index === 0 && caption ? `<figcaption>${escapeXml(caption)}</figcaption>` : '';

      html.push(
        `<figure><a href="${escapeXml(figureHref)}"><img src="${escapeXml(image)}" alt="${escapeXml(
          caption ?? title
        )}" /></a>${figcaption}</figure>`
      );
    });
  }

  if (type === 'link') {
    if (preview) {
      const previewUrl = absoluteUrl(readString(preview.url)) ?? sourceUrl;
      const previewTitle = readString(preview.title) ?? sourceName;
      const previewDescription = readString(preview.description);

      html.push(
        `<p><strong>${
          previewUrl
            ? `<a href="${escapeXml(previewUrl)}">${escapeXml(previewTitle)}</a>`
            : escapeXml(previewTitle)
        }</strong>${
          previewDescription ? `<br />${escapeXml(previewDescription)}` : ''
        }<br /><em>${escapeXml(sourceName)}</em></p>`
      );
    } else if (sourceUrl) {
      html.push(
        `<p>${language === 'ru' ? 'Источник' : 'Source'}: <a href="${escapeXml(
          sourceUrl
        )}">${escapeXml(sourceName)}</a></p>`
      );
    }
  }

  if (bodyHtml) html.push(bodyHtml);

  html.push(
    `<p><a href="${escapeXml(url)}">${
      language === 'ru' ? 'Открыть в Flow' : 'Open in Flow'
    } →</a></p>`
  );

  const contentHtml = html.join('\n');
  const plainBody = markdownToPlainText(body);

  return {
    id: readString(item.id) ?? url,
    title,
    url,
    summary: summaryFor(item, title),
    contentHtml,
    contentText: truncate(plainBody || summaryFor(item, title), 4000),
    publishedAt,
    updatedAt: toIsoDate(item.updated_at),
    language,
    type,
    typeLabel: label,
    image: images[0] ?? youtube.thumbnail,
    tags: [
      label,
      language === 'ru' ? 'Русский' : 'English',
      ...(type === 'link' && sourceName !== 'Flow' ? [sourceName] : []),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Channel and documents                                               */
/* ------------------------------------------------------------------ */

export function createFeedChannel(options: {
  entries: FlowFeedEntry[];
  feedUrl: string;
  language?: string;
  title?: string;
  description?: string;
  link?: string;
}): FeedChannel {
  const timestamps = options.entries
    .map((entry) => parseFeedDate(entry.updatedAt ?? entry.publishedAt))
    .filter((date): date is Date => date !== null)
    .map((date) => date.getTime());

  const lastBuildDate = new Date(timestamps.length ? Math.max(...timestamps) : Date.now());

  lastBuildDate.setUTCMilliseconds(0);

  return {
    title: options.title ?? FLOW_FEED_TITLE,
    link: options.link ?? `${FLOW_SITE_URL}${FLOW_HOME_PATH}`,
    description: options.description ?? FLOW_FEED_DESCRIPTION,
    language: options.language ?? FLOW_FEED_LANGUAGE,
    feedUrl: options.feedUrl,
    icon: FLOW_FEED_ICON,
    accentColor: FLOW_FEED_ACCENT,
    lastBuildDate,
    items: options.entries,
  };
}

function buildRssItem(entry: FlowFeedEntry): string {
  // An enclosure is a media attachment. A photo is the attachment itself; a
  // video only has a YouTube thumbnail, which belongs in media:thumbnail but
  // must not be advertised as the playable file.
  const enclosure =
    entry.image && entry.type === 'photo'
      ? `\n      <enclosure url="${escapeXml(entry.image)}" type="${imageMimeType(
          entry.image
        )}" length="0" />`
      : '';

  const media = entry.image
    ? `\n      <media:thumbnail url="${escapeXml(entry.image)}" />${
        entry.type === 'photo'
          ? `\n      <media:content url="${escapeXml(
              entry.image
            )}" medium="image" type="${imageMimeType(entry.image)}" />`
          : ''
      }`
    : '';

  const categories = entry.tags
    .map((tag) => `\n      <category>${escapeXml(tag)}</category>`)
    .join('');

  return `    <item xml:lang="${entry.language}">
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(entry.url)}</link>
      <guid isPermaLink="false">${escapeXml(entry.id)}</guid>
      <pubDate>${toRssDate(entry.publishedAt)}</pubDate>
      <dc:creator>${escapeXml(FLOW_FEED_AUTHOR)}</dc:creator>${
        entry.updatedAt ? `\n      <atom:updated>${escapeXml(entry.updatedAt)}</atom:updated>` : ''
      }${categories}
      <description>${escapeXml(entry.summary)}</description>
      <content:encoded>${cdata(entry.contentHtml)}</content:encoded>${enclosure}${media}
    </item>`;
}

/**
 * RSS 2.0 with the modules real readers and aggregators expect:
 * Atom self link, Dublin Core author, content:encoded, Media RSS,
 * WebFeeds icon/accent and the syndication update period.
 */
export function buildRssFeed(channel: FeedChannel): string {
  const items = channel.items.map(buildRssItem).join('\n');

  const newest = channel.items[0];

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"
  xmlns:webfeeds="http://webfeeds.org/rss/1.0">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(channel.description)}</description>
    <language>${escapeXml(channel.language)}</language>
    <copyright>© ${new Date().getUTCFullYear()} ${escapeXml(FLOW_FEED_AUTHOR)}</copyright>${
      channel.items.length
        ? `\n    <lastBuildDate>${toRssDate(channel.lastBuildDate)}</lastBuildDate>`
        : ''
    }${newest ? `\n    <pubDate>${toRssDate(newest.publishedAt)}</pubDate>` : ''}
    <ttl>${FLOW_FEED_TTL_MINUTES}</ttl>
    <generator>Flow · merkurov.love</generator>
    <docs>https://www.rssboard.org/rss-specification</docs>
    <webfeeds:icon>${escapeXml(channel.icon)}</webfeeds:icon>
    <webfeeds:accentColor>${escapeXml(channel.accentColor)}</webfeeds:accentColor>
    <sy:updatePeriod>hourly</sy:updatePeriod>
    <sy:updateFrequency>1</sy:updateFrequency>
${items}
  </channel>
</rss>
`;
}

/**
 * JSON Feed 1.1 mirror of the RSS document for clients that prefer JSON.
 */
export function buildJsonFeed(channel: FeedChannel): string {
  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: channel.title,
    home_page_url: channel.link,
    feed_url: channel.feedUrl,
    description: channel.description,
    icon: channel.icon,
    favicon: `${FLOW_SITE_URL}/favicon.ico`,
    language: channel.language,
    authors: [
      {
        name: FLOW_FEED_AUTHOR,
        url: FLOW_SITE_URL,
      },
    ],
    items: channel.items.map((entry) => ({
      id: entry.id,
      url: entry.url,
      title: entry.title,
      summary: entry.summary,
      content_html: entry.contentHtml,
      content_text: entry.contentText,
      date_published: entry.publishedAt,
      date_modified: entry.updatedAt ?? entry.publishedAt,
      language: entry.language,
      image: entry.image ?? undefined,
      tags: entry.tags,
    })),
  };

  return `${JSON.stringify(feed, null, 2)}\n`;
}
