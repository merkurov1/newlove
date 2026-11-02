import {
  markdownToPlainText,
  normalizeFlowItem,
  truncatePlainText,
  type FlowContent,
} from './content';
import { resolveFlowMetadataFromContent } from './metadata';

export { markdownToPlainText };

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

/* markdownToPlainText is implemented in the shared Content Resolver. */

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
  mixed: { ru: 'Запись', en: 'Post' },
};

const FALLBACK_LABEL: TypeLabel = {
  ru: 'Запись',
  en: 'Post',
};

function typeLabelFor(type: string, language: 'ru' | 'en'): string {
  return (TYPE_LABELS[type] ?? FALLBACK_LABEL)[language];
}

function feedImageFor(
  content: FlowContent,
  previewImage: string
): string | null {
  return (
    content.images[0]?.url ??
    content.videos.find((video) => video.thumbnail)?.thumbnail ??
    content.links.find((link) => link.image)?.image ??
    previewImage ??
    null
  );
}

/**
 * Convert a raw `items` row into a feed entry through the shared Content
 * Resolver. `renderMarkdown` is injected so the pure XML layer stays testable
 * without pulling the ESM React markdown pipeline into unit tests.
 */
export function toFeedEntry(
  item: Record<string, unknown>,
  renderMarkdown: (markdown: string) => string
): FlowFeedEntry {
  const content = normalizeFlowItem(item);
  const metadata = resolveFlowMetadataFromContent(content);
  const language = content.language;
  const label = typeLabelFor(content.contentType, language);
  const url = content.canonicalUrl;
  const bodyHtml = content.body ? renderMarkdown(content.body) : '';
  const publishedAt =
    toIsoDate(content.publishedAt) ??
    toIsoDate(content.updatedAt) ??
    new Date().toISOString();

  const html: string[] = [];

  for (const video of content.videos) {
    if (video.thumbnail) {
      html.push(
        `<p><a href="${escapeXml(video.url)}"><img src="${escapeXml(
          video.thumbnail
        )}" alt="${escapeXml(video.title ?? metadata.title)}" /></a></p>`
      );
    }

    html.push(
      `<p><a href="${escapeXml(video.url)}">${
        language === 'ru' ? 'Смотреть' : 'Watch'
      }${video.provider === 'youtube' ? ' on YouTube' : ''}</a></p>`
    );
  }

  for (const image of content.images) {
    const caption = image.caption ?? image.alt;

    html.push(
      `<figure><a href="${escapeXml(url)}"><img src="${escapeXml(
        image.url
      )}" alt="${escapeXml(caption ?? metadata.title)}" /></a>${
        caption ? `<figcaption>${escapeXml(caption)}</figcaption>` : ''
      }</figure>`
    );
  }

  for (const link of content.links) {
    // Do not repeat a URL that is already visible in the body.
    if (link.inBody) continue;

    const title = link.title ?? link.siteName ?? link.domain ?? link.url;
    const description = link.description;

    html.push(
      `<p><strong><a href="${escapeXml(link.url)}">${escapeXml(
        title
      )}</a></strong>${
        description ? `<br />${escapeXml(description)}` : ''
      }${
        link.siteName ? `<br /><em>${escapeXml(link.siteName)}</em>` : ''
      }</p>${
        link.image
          ? `<p><a href="${escapeXml(link.url)}"><img src="${escapeXml(
              link.image
            )}" alt="${escapeXml(title)}" /></a></p>`
          : ''
      }`
    );
  }

  if (bodyHtml) html.push(bodyHtml);

  html.push(
    `<p><a href="${escapeXml(url)}">${
      language === 'ru' ? 'Открыть в Flow' : 'Open in Flow'
    } →</a></p>`
  );

  const contentHtml = html.join('\n');
  const summary = truncate(metadata.description, 300);
  const image = feedImageFor(content, metadata.previewImage);

  return {
    id: content.id ?? url,
    title: metadata.title,
    url,
    summary,
    contentHtml,
    contentText: content.bodyText || summary,
    publishedAt,
    updatedAt: toIsoDate(content.updatedAt),
    language,
    type: content.contentType,
    typeLabel: label,
    image,
    tags: [
      label,
      language === 'ru' ? 'Русский' : 'English',
      ...(content.sourceName && content.sourceName !== 'Flow'
        ? [content.sourceName]
        : []),
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
