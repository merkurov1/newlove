/**
 * Universal Flow content resolver.
 *
 * Every consumer (feed, item page, social metadata, Telegram, Bluesky, RSS)
 * must read a Flow item through this module instead of interpreting the JSONB
 * metadata on its own. The resolver understands the current composer shape and
 * the legacy shapes found in production (`link_preview`, `linkPreview`,
 * `public_url`, `image`, filename titles, etc.).
 *
 * The module is intentionally free of Node.js-only imports so it can also run
 * in the client bundle and in the edge Open Graph renderer.
 */

export const FLOW_SITE_URL = 'https://www.merkurov.love';
export const FLOW_HOME_PATH = '/flow';

export type FlowContentType =
  | 'note'
  | 'article'
  | 'link'
  | 'photo'
  | 'video'
  | 'quote'
  | 'mixed';

export type FlowTitleSource =
  | 'manual'
  | 'link'
  | 'youtube'
  | 'image'
  | 'body'
  | 'generated'
  | 'fallback';

export type FlowLanguage = 'ru' | 'en';

export type FlowItemInput = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  type?: string | null;
  lang?: string | null;
  status?: string | null;
  visibility?: string | null;
  metadata?: unknown;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  bluesky_uri?: string | null;
  telegram_message_id?: string | number | null;
};

export type FlowMediaInput = {
  storage_key?: string | null;
  url?: string | null;
  public_url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  mime?: string | null;
};

export type FlowImage = {
  url: string;
  alt: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
  source: 'metadata' | 'media' | 'legacy';
};

export type FlowVideo = {
  url: string;
  provider: 'youtube' | 'other';
  videoId: string | null;
  title: string | null;
  thumbnail: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  author: string | null;
  embedUrl: string | null;
};

export type FlowLink = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  domain: string | null;
  inBody: boolean;
};

export type FlowContent = {
  id: string | null;
  slug: string | null;
  rawType: string;
  contentType: FlowContentType;
  title: string;
  titleSource: FlowTitleSource;
  description: string;
  body: string;
  bodyText: string;
  bodyExcerpt: string;
  bodyTruncated: boolean;
  showTitle: boolean;
  titleIsRedundant: boolean;
  images: FlowImage[];
  videos: FlowVideo[];
  links: FlowLink[];
  media: FlowImage[];
  sourceUrl: string | null;
  sourceName: string;
  canonicalUrl: string;
  publishedAt: string | null;
  updatedAt: string | null;
  language: FlowLanguage;
  metadata: Record<string, unknown>;
  imageAlt: string;
  version: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }
  return null;
}

export function languageFor(value: unknown): FlowLanguage {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('en')
    ? 'en'
    : 'ru';
}

export function graphemes(value: string): string[] {
  if (!value) return [];
  const Segmenter = (Intl as unknown as { Segmenter?: new (...args: unknown[]) => any })
    .Segmenter;

  if (!Segmenter) return Array.from(value);

  try {
    return Array.from(
      new Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
      (part: { segment: string }) => part.segment
    );
  } catch {
    return Array.from(value);
  }
}

export function graphemeLength(value: string): number {
  return graphemes(value).length;
}

export function truncateGraphemes(
  value: string,
  max: number,
  ellipsis = '…'
): string {
  if (max <= 0) return '';
  const parts = graphemes(value);
  if (parts.length <= max) return value;

  const keep = Math.max(1, max - (ellipsis ? graphemeLength(ellipsis) : 0));
  return `${parts.slice(0, keep).join('').trimEnd()}${ellipsis}`;
}

/** Absolute http(s) URL, or null for anything that is not safe to render. */
export function normalizeHttpUrl(
  value: unknown,
  base: string = FLOW_SITE_URL
): string | null {
  const raw = readString(value);
  if (!raw) return null;

  try {
    const withProtocol = raw.startsWith('//') ? `https:${raw}` : raw;
    const url = new URL(withProtocol, base);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function domainFor(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isYouTubeUrl(value: string | null | undefined): boolean {
  const domain = domainFor(value ?? null);
  if (!domain) return false;
  return (
    domain === 'youtu.be' ||
    domain === 'youtube.com' ||
    domain.endsWith('.youtube.com')
  );
}

export function getYouTubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const queryId = url.searchParams.get('v');
      if (queryId && /^[A-Za-z0-9_-]{6,}$/.test(queryId)) return queryId;

      const match = url.pathname.match(
        /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,})/
      );
      return match?.[1] ?? null;
    }
  } catch {
    // Ignore malformed URLs.
  }

  return null;
}

export function youtubeCanonicalUrl(videoId: string | null): string | null {
  return videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    : null;
}

export function youtubeThumbnail(videoId: string | null): string | null {
  return videoId
    ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`
    : null;
}

export function youtubeEmbedUrl(videoId: string | null): string | null {
  return videoId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
    : null;
}

/** Markdown → readable plain text that preserves paragraph breaks. */
export function markdownToDisplayText(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*\|?[\s:|\-]*-[\s:|\-]*$/gm, ' ')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/[*_~`]+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Markdown → single-line plain text for summaries and feed text. */
export function markdownToPlainText(value: string | null | undefined): string {
  return markdownToDisplayText(value).replace(/\s+/g, ' ').trim();
}

/**
 * Truncate normalized plain text at a word/sentence boundary. This is used by
 * the 400-character Flow excerpt, so it must never cut a URL or a word in half.
 */
export function truncatePlainText(
  value: string,
  max = 400
): { text: string; truncated: boolean } {
  const clean = value.trim();
  if (!clean) return { text: '', truncated: false };

  const parts = graphemes(clean);
  if (parts.length <= max) return { text: clean, truncated: false };

  const slice = parts.slice(0, max).join('');
  const minimum = Math.floor(max * 0.6);

  const sentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('… '),
    slice.lastIndexOf('\n')
  );

  if (sentence >= minimum) {
    return {
      text: `${slice.slice(0, sentence + 1).trimEnd()}…`,
      truncated: true,
    };
  }

  const space = slice.lastIndexOf(' ');
  if (space >= minimum) {
    return { text: `${slice.slice(0, space).trimEnd()}…`, truncated: true };
  }

  return {
    text: `${parts.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`,
    truncated: true,
  };
}

const GENERIC_TITLES = new Set([
  'flow',
  'untitled',
  'draft',
  'post',
  'note',
  'article',
  'photo',
  'image',
  'video',
  'link',
  'quote',
  'anton merkurov',
  'flow | anton merkurov',
  'flow — anton merkurov',
  'anton merkurov | art x love x money',
]);

const DATE_ONLY =
  /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})$/;

export function isTechnicalText(value: string | null | undefined): boolean {
  const text = readString(value);
  if (!text) return true;

  const lower = text.toLowerCase();

  if (GENERIC_TITLES.has(lower)) return true;
  if (DATE_ONLY.test(text)) return true;
  if (/^(?:https?:)?\/\//i.test(text) || /^www\./i.test(text)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return true;
  if (
    /\.(?:jpe?g|png|gif|webp|avif|svg|heic|mov|mp4|m4v|pdf|zip|docx?|xlsx?)$/i.test(
      text
    )
  ) {
    return true;
  }
  if (/^(?:img|dsc|pxl|photo|image|screenshot)[\s_-]*\d+$/i.test(text)) {
    return true;
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text)) return true;
  if (/^[0-9a-f]{16,}$/i.test(text)) return true;
  if (/^draft-[0-9a-f-]{8,}$/i.test(text)) return true;

  return false;
}

function meaningfulText(value: unknown, max = 220): string | null {
  const text = readString(value);
  if (!text || isTechnicalText(text)) return null;
  return truncateGraphemes(text.replace(/\s+/g, ' '), max);
}

function typeLabel(type: FlowContentType, language: FlowLanguage): string {
  const labels: Record<FlowContentType, { ru: string; en: string }> = {
    note: { ru: 'Заметка', en: 'Note' },
    article: { ru: 'Статья', en: 'Article' },
    link: { ru: 'Ссылка', en: 'Link' },
    photo: { ru: 'Фото', en: 'Photo' },
    video: { ru: 'Видео', en: 'Video' },
    quote: { ru: 'Цитата', en: 'Quote' },
    mixed: { ru: 'Запись', en: 'Post' },
  };

  return labels[type][language];
}

type PreviewCandidate = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  domain: string | null;
};

function getPreviewRecords(metadata: UnknownRecord): UnknownRecord[] {
  const arrays = [metadata.link_previews, metadata.linkPreviews].find(
    (value): value is unknown[] => Array.isArray(value) && value.length > 0
  );

  const raw = arrays
    ? arrays
    : metadata.link_preview
      ? [metadata.link_preview]
      : metadata.linkPreview
        ? [metadata.linkPreview]
        : [];

  return raw.filter(isRecord);
}

function getLinkPreviews(metadata: UnknownRecord): PreviewCandidate[] {
  const candidates: PreviewCandidate[] = [];
  const pushPreview = (record: UnknownRecord) => {
    const url = normalizeHttpUrl(record.url);
    if (!url) return;

    const domain = domainFor(url);
    candidates.push({
      url,
      title: meaningfulText(record.title, 300),
      description: meaningfulText(record.description, 600),
      image: normalizeHttpUrl(record.image ?? record.image_url ?? record.imageUrl),
      siteName: meaningfulText(record.site_name ?? record.siteName, 160) ?? domain,
      domain,
    });
  };

  for (const preview of getPreviewRecords(metadata)) pushPreview(preview);

  const extraLinks = Array.isArray(metadata.links) ? metadata.links : [];
  for (const entry of extraLinks) {
    if (typeof entry === 'string') {
      const url = normalizeHttpUrl(entry);
      if (url) {
        candidates.push({
          url,
          title: null,
          description: null,
          image: null,
          siteName: domainFor(url),
          domain: domainFor(url),
        });
      }
    } else if (isRecord(entry)) {
      pushPreview(entry);
    }
  }

  const seen = new Set<string>();
  return candidates.filter((preview) => {
    if (seen.has(preview.url)) return false;
    seen.add(preview.url);
    return true;
  });
}

function collectVideoRecords(
  metadata: UnknownRecord,
  sourceUrl: string | null
): UnknownRecord[] {
  const records: UnknownRecord[] = [];

  if (isRecord(metadata.youtube)) records.push(metadata.youtube);

  const arrays = [
    metadata.videos,
    metadata.youtube_videos,
    metadata.youtubeVideos,
  ].find((value): value is unknown[] => Array.isArray(value) && value.length > 0);

  if (arrays) {
    for (const entry of arrays) {
      if (isRecord(entry)) records.push(entry);
      else if (typeof entry === 'string') records.push({ url: entry });
    }
  }

  for (const key of [
    'youtube_url',
    'youtubeUrl',
    'video_url',
    'videoUrl',
    'video',
  ]) {
    const value = metadata[key];
    if (typeof value === 'string') records.push({ url: value });
    else if (isRecord(value)) records.push(value);
  }

  if (sourceUrl && isYouTubeUrl(sourceUrl)) records.push({ url: sourceUrl });

  return records;
}

function videoFromRecord(record: UnknownRecord): FlowVideo | null {
  const videoId =
    readString(record.video_id ?? record.videoId ?? record.id) ??
    getYouTubeVideoId(readString(record.url));
  const rawUrl =
    normalizeHttpUrl(record.url) ??
    normalizeHttpUrl(record.webpage_url) ??
    youtubeCanonicalUrl(videoId);

  if (!rawUrl) return null;

  const provider: 'youtube' | 'other' = isYouTubeUrl(rawUrl) || videoId
    ? 'youtube'
    : 'other';

  const canonical =
    provider === 'youtube'
      ? youtubeCanonicalUrl(videoId) ?? rawUrl
      : rawUrl;

  const suppliedThumbnail = normalizeHttpUrl(
    record.thumbnail_url ?? record.thumbnailUrl ?? record.thumbnail
  );

  return {
    url: canonical,
    provider,
    videoId,
    title: meaningfulText(record.title, 300),
    thumbnail:
      suppliedThumbnail ??
      (provider === 'youtube' ? youtubeThumbnail(videoId) : null),
    thumbnailWidth: readNumber(
      record.thumbnail_width ?? record.thumbnailWidth
    ),
    thumbnailHeight: readNumber(
      record.thumbnail_height ?? record.thumbnailHeight
    ),
    author: meaningfulText(record.author_name ?? record.authorName, 200),
    embedUrl:
      provider === 'youtube' ? youtubeEmbedUrl(videoId) : null,
  };
}

function mediaPublicUrl(row: FlowMediaInput): string | null {
  const direct = normalizeHttpUrl(row.public_url ?? row.url);
  if (direct) return direct;

  const key = readString(row.storage_key);
  if (!key) return null;

  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  if (!base) return null;

  const encoded = key
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/media/${encoded}`;
}

function imageFromRecord(
  record: UnknownRecord,
  source: FlowImage['source']
): FlowImage | null {
  const url = normalizeHttpUrl(
    record.url ??
      record.public_url ??
      record.publicUrl ??
      record.image_url ??
      record.imageUrl ??
      record.src ??
      record.path
  );

  if (!url) return null;

  const alt = meaningfulText(record.alt ?? record.alt_text ?? record.altText, 300);
  const caption = meaningfulText(
    record.caption ?? record.description ?? record.name,
    300
  );

  return {
    url,
    alt,
    caption,
    width: readNumber(record.width),
    height: readNumber(record.height),
    mime: readString(record.mime ?? record.mime_type ?? record.mimeType),
    source,
  };
}

function collectImages(
  metadata: UnknownRecord,
  mediaRows: FlowMediaInput[],
  previews: PreviewCandidate[],
  videos: FlowVideo[],
  rawType: string
): { images: FlowImage[]; media: FlowImage[] } {
  const images: FlowImage[] = [];
  const media: FlowImage[] = [];
  const previewUrls = new Set(previews.map((preview) => preview.image).filter(Boolean));
  const videoThumbs = new Set(
    videos.map((video) => video.thumbnail).filter(Boolean)
  );

  if (Array.isArray(metadata.images)) {
    for (const entry of metadata.images) {
      if (typeof entry === 'string') {
        const url = normalizeHttpUrl(entry);
        if (url) {
          images.push({
            url,
            alt: null,
            caption: null,
            width: null,
            height: null,
            mime: null,
            source: 'metadata',
          });
        }
      } else if (isRecord(entry)) {
        const image = imageFromRecord(entry, 'metadata');
        if (image) images.push(image);
      }
    }
  }

  for (const row of mediaRows) {
    const url = mediaPublicUrl(row);
    if (!url) continue;

    media.push({
      url,
      alt: meaningfulText(row.alt, 300),
      caption: null,
      width: readNumber(row.width),
      height: readNumber(row.height),
      mime: readString(row.mime),
      source: 'media',
    });
  }

  images.push(...media);

  const legacyKeys = [
    'public_url',
    'image',
    'image_url',
    'imageUrl',
    'og_image',
    'ogImage',
    'thumbnail_url',
    'thumbnailUrl',
  ];

  for (const key of legacyKeys) {
    const url = normalizeHttpUrl(metadata[key]);
    if (!url) continue;

    // A link preview image is not a separately attached photo. Keeping it out
    // of the image gallery avoids rendering the same picture twice.
    if (previewUrls.has(url) && images.length === 0 && rawType !== 'photo') {
      continue;
    }

    images.push({
      url,
      alt: null,
      caption: null,
      width: null,
      height: null,
      mime: null,
      source: 'legacy',
    });
  }

  const globalAlt = meaningfulText(metadata.alt, 300);
  const globalCaption = meaningfulText(metadata.caption, 300);

  const seen = new Set<string>();
  const unique = images.filter((image) => {
    if (seen.has(image.url)) return false;
    if (videoThumbs.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });

  if (unique.length > 0 && (globalAlt || globalCaption)) {
    unique[0] = {
      ...unique[0],
      alt: unique[0].alt ?? globalAlt ?? globalCaption,
      caption: unique[0].caption ?? globalCaption ?? globalAlt,
    };
  }

  return {
    images: unique,
    media: unique.filter((image) => image.source === 'media'),
  };
}

function firstMeaningfulLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const clean = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim();

    if (!clean) continue;
    if (isTechnicalText(clean)) continue;
    return clean;
  }

  return null;
}

function firstSentence(text: string, max = 120): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const match = clean.match(/^(.{12,}?[.!?…])(?:\s|$)/);
  return truncateGraphemes(match?.[1] ?? clean, max);
}

function fallbackTitle(
  type: FlowContentType,
  language: FlowLanguage,
  links: FlowLink[],
  videos: FlowVideo[]
): string {
  const label = typeLabel(type, language);
  const site = links[0]?.siteName;

  if (type === 'link' && site && !isTechnicalText(site)) {
    return language === 'ru' ? `${label} — ${site}` : `${label} — ${site}`;
  }

  if (type === 'video' && videos[0]?.author && !isTechnicalText(videos[0].author)) {
    return language === 'ru'
      ? `${label} — ${videos[0].author}`
      : `${label} — ${videos[0].author}`;
  }

  return label;
}

function resolveType(
  rawType: string,
  bodyText: string,
  images: FlowImage[],
  videos: FlowVideo[],
  links: FlowLink[]
): FlowContentType {
  const kinds = new Set<FlowContentType>();

  if (videos.length > 0) kinds.add('video');
  if (images.length > 0) kinds.add('photo');
  if (links.length > 0) kinds.add('link');

  if (bodyText) {
    if (rawType === 'article' || bodyText.length > 350) kinds.add('article');
    else if (rawType === 'quote') kinds.add('quote');
    else kinds.add('note');
  }

  if (kinds.size === 0) {
    const fallback = rawType as FlowContentType;
    return ['note', 'article', 'link', 'photo', 'video', 'quote'].includes(fallback)
      ? fallback
      : 'note';
  }

  if (kinds.size === 1) return [...kinds][0];

  // Text accompanied by one media family keeps the text's identity. "mixed"
  // is reserved for genuinely different media families in the same item.
  if (kinds.has('article')) {
    if (kinds.has('video') && !kinds.has('photo') && !kinds.has('link')) {
      return 'video';
    }
    if (kinds.has('photo') && !kinds.has('video') && !kinds.has('link')) {
      return 'article';
    }
    return kinds.size > 2 ? 'mixed' : 'article';
  }

  if (kinds.size === 2 && kinds.has('photo') && kinds.has('note')) {
    return 'photo';
  }
  if (kinds.size === 2 && kinds.has('video') && kinds.has('note')) {
    return 'video';
  }
  if (kinds.size === 2 && kinds.has('link') && kinds.has('note')) {
    return 'link';
  }

  return 'mixed';
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function titleIsRedundant(title: string, bodyText: string): boolean {
  const a = normalizeForComparison(title);
  const b = normalizeForComparison(bodyText);
  if (!a || !b) return false;
  if (a === b) return true;

  const firstLine = firstMeaningfulLine(bodyText);
  const c = normalizeForComparison(firstLine ?? '');

  return Boolean(
    (c && (a === c || b.startsWith(a) || a.startsWith(c))) ||
      b.startsWith(a) ||
      a.startsWith(b)
  );
}

function bodyContainsUrl(body: string, url: string): boolean {
  if (!body || !url) return false;

  const normalized = url.replace(/\/+$/, '');
  if (body.includes(url) || body.includes(normalized)) return true;

  try {
    const parsed = new URL(url);
    const variants = new Set([
      `${parsed.hostname}${parsed.pathname}`,
      `${parsed.hostname.replace(/^www\./i, '')}${parsed.pathname}`,
    ]);

    return [...variants].some(
      (variant) => variant.length > 8 && body.includes(variant)
    );
  } catch {
    return false;
  }
}

function contentVersion(input: {
  updatedAt: string | null;
  title: string;
  description: string;
  image: string | null;
  contentType: FlowContentType;
}): string {
  const source = [
    input.updatedAt ?? '',
    input.title,
    input.description,
    input.image ?? '',
    input.contentType,
  ].join('|');

  // FNV-1a: stable, dependency-free and safe in the edge runtime.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

/**
 * Normalize any Flow row (current or legacy) into one internal structure.
 */
export function normalizeFlowItem(
  item: FlowItemInput,
  options: { media?: FlowMediaInput[]; siteUrl?: string } = {}
): FlowContent {
  const metadata = asRecord(item.metadata) ?? {};
  const language = languageFor(item.lang);
  const rawType = readString(item.type)?.toLowerCase() ?? 'note';

  const body = readString(item.body_md) ?? '';
  const bodyText = markdownToDisplayText(body);
  const descriptionCandidate =
    meaningfulText(metadata.description, 600) ??
    meaningfulText(metadata.excerpt, 600) ??
    meaningfulText(metadata.summary, 600);

  const previews = getLinkPreviews(metadata);
  const sourceUrl =
    normalizeHttpUrl(item.source_url) ??
    normalizeHttpUrl(metadata.canonical_url) ??
    normalizeHttpUrl(metadata.url) ??
    previews[0]?.url ??
    null;

  const links: FlowLink[] = previews.map((preview) => ({
    ...preview,
    inBody: false,
  }));

  if (sourceUrl && !isYouTubeUrl(sourceUrl)) {
    const alreadyPresent = links.some((link) => link.url === sourceUrl);
    if (!alreadyPresent) {
      const domain = domainFor(sourceUrl);
      links.push({
        url: sourceUrl,
        title: meaningfulText(metadata.title, 300),
        description: descriptionCandidate,
        image: normalizeHttpUrl(metadata.og_image ?? metadata.image),
        siteName: meaningfulText(metadata.site_name, 160) ?? domain,
        domain,
        inBody: false,
      });
    }
  }

  const videos: FlowVideo[] = [];
  const videoSeen = new Set<string>();
  for (const record of collectVideoRecords(metadata, sourceUrl)) {
    const video = videoFromRecord(record);
    if (!video || videoSeen.has(video.url)) continue;
    videoSeen.add(video.url);
    videos.push(video);
  }

  const { images, media } = collectImages(
    metadata,
    options.media ?? [],
    previews,
    videos,
    rawType
  );

  // A YouTube URL is a video, not a duplicate link card. Likewise, a URL that
  // already appears in the visible body is not rendered again as a card.
  const visibleLinks = links
    .filter((link) => !videoSeen.has(link.url))
    .map((link) => ({
      ...link,
      inBody: bodyContainsUrl(body, link.url),
    }));

  const sourceName =
    previews[0]?.siteName ??
    meaningfulText(metadata.site_name, 160) ??
    domainFor(sourceUrl) ??
    'Flow';

  const contentType = resolveType(
    rawType,
    bodyText,
    images,
    videos,
    visibleLinks
  );

  const candidateTitle =
    meaningfulText(item.title, 300) ??
    visibleLinks.find((link) => link.title)?.title ??
    videos.find((video) => video.title)?.title ??
    images.find((image) => image.alt || image.caption)?.alt ??
    images.find((image) => image.caption)?.caption ??
    meaningfulText(metadata.alt ?? metadata.caption, 300) ??
    firstMeaningfulLine(bodyText) ??
    firstSentence(bodyText) ??
    null;

  let title = candidateTitle;
  let titleSource: FlowTitleSource;

  if (meaningfulText(item.title, 300)) titleSource = 'manual';
  else if (visibleLinks.find((link) => link.title)) titleSource = 'link';
  else if (videos.find((video) => video.title)) titleSource = 'youtube';
  else if (
    images.find((image) => image.alt || image.caption) ||
    meaningfulText(metadata.alt ?? metadata.caption, 300)
  ) {
    titleSource = 'image';
  } else if (firstMeaningfulLine(bodyText)) titleSource = 'body';
  else if (firstSentence(bodyText)) titleSource = 'generated';
  else titleSource = 'fallback';

  if (!title) {
    title = fallbackTitle(contentType, language, visibleLinks, videos);
    titleSource = 'fallback';
  }

  title = truncateGraphemes(title.replace(/\s+/g, ' '), 160).trim();

  const description =
    descriptionCandidate ??
    visibleLinks.find((link) => link.description)?.description ??
    images.find((image) => image.caption)?.caption ??
    images.find((image) => image.alt)?.alt ??
    (bodyText
      ? truncateGraphemes(bodyText.replace(/\s+/g, ' '), 200)
      : fallbackDescription(contentType, language));

  const excerpt = truncatePlainText(bodyText, 400);
  const redundant = titleIsRedundant(title, bodyText);
  const showTitle =
    !redundant &&
    titleSource !== 'body' &&
    titleSource !== 'generated' &&
    titleSource !== 'fallback';

  const siteUrl = (options.siteUrl ?? FLOW_SITE_URL).replace(/\/+$/, '');
  const slug = readString(item.slug);
  const canonicalUrl = slug
    ? `${siteUrl}${FLOW_HOME_PATH}/${encodeURIComponent(slug)}`
    : `${siteUrl}${FLOW_HOME_PATH}`;
  const updatedAt =
    readString(item.updated_at) ??
    readString(item.published_at) ??
    readString(item.created_at) ??
    null;
  const imageAlt =
    images[0]?.alt ??
    images[0]?.caption ??
    videos[0]?.title ??
    title;

  return {
    id: readString(item.id),
    slug,
    rawType,
    contentType,
    title,
    titleSource,
    description: truncateGraphemes(description, 300).trim(),
    body,
    bodyText,
    bodyExcerpt: excerpt.text,
    bodyTruncated: excerpt.truncated,
    showTitle,
    titleIsRedundant: redundant,
    images,
    videos,
    links: visibleLinks,
    media,
    sourceUrl,
    sourceName,
    canonicalUrl,
    publishedAt: readString(item.published_at),
    updatedAt,
    language,
    metadata,
    imageAlt,
    version: contentVersion({
      updatedAt,
      title,
      description,
      image: images[0]?.url ?? videos[0]?.thumbnail ?? visibleLinks[0]?.image ?? null,
      contentType,
    }),
  };
}

function fallbackDescription(
  type: FlowContentType,
  language: FlowLanguage
): string {
  const descriptions: Record<FlowContentType, { ru: string; en: string }> = {
    note: {
      ru: 'Заметка Антона Меркурова в Flow.',
      en: 'A note by Anton Merkurov on Flow.',
    },
    article: {
      ru: 'Публикация Антона Меркурова в Flow.',
      en: 'A publication by Anton Merkurov on Flow.',
    },
    link: {
      ru: 'Ссылка, отобранная Антоном Меркуровым.',
      en: 'A link selected by Anton Merkurov.',
    },
    photo: {
      ru: 'Фотография Антона Меркурова в Flow.',
      en: 'A photograph by Anton Merkurov on Flow.',
    },
    video: {
      ru: 'Видео в Flow Антона Меркурова.',
      en: 'A video on Anton Merkurov’s Flow.',
    },
    quote: {
      ru: 'Цитата в Flow Антона Меркурова.',
      en: 'A quote on Anton Merkurov’s Flow.',
    },
    mixed: {
      ru: 'Публикация Антона Меркурова в Flow.',
      en: 'A publication by Anton Merkurov on Flow.',
    },
  };

  return descriptions[type][language];
}
