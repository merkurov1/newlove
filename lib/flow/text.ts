/**
 * Shared textual content extraction for Flow records.
 *
 * Flow items store their meaning in different places depending on the type:
 * a note keeps it in `body_md`, a link in `link_previews`, a video in
 * `youtube`, a photo in `alt`/`caption`, and imported or future types may use
 * arbitrary metadata keys. Analysis must therefore read every text value in
 * the record instead of maintaining a per-type whitelist.
 *
 * Visual and technical values are deliberately excluded:
 * - image/video URLs, thumbnails, avatars, data URIs and binary payloads;
 * - identifiers, timestamps, dimensions, hashes and other bookkeeping;
 * - previously generated analyses and crosspost bookkeeping.
 *
 * Text fragments are normalised and deduplicated so the same title stored in
 * both `items.title` and `metadata.title` is sent to a model only once.
 */

const MAX_DEPTH = 16;
const MAX_FRAGMENT_CHARS = 40_000;

const IMAGE_OR_MEDIA_EXTENSION =
  /\.(?:apng|avif|bmp|gif|heic|heif|ico|jpe?g|jxl|png|svg|tiff?|webp|mp4|m4v|mov|webm|mkv|avi|mp3|m4a|wav|ogg|oga|pdf)(?:[?#].*)?$/i;

/**
 * Keys that never describe the item's textual content. The comparison uses a
 * normalised key (lowercase, no separators), so `thumbnail_url` and
 * `thumbnailUrl` are both rejected.
 */
const SKIPPED_KEYS = new Set(
  [
    'id',
    'uuid',
    'guid',
    'itemid',
    'documentid',
    'chunkid',
    'authorid',
    'channelid',
    'videoid',
    'youtubeid',
    'postid',
    'chatid',
    'messageid',
    'messageids',
    'threadsid',
    'threadspostid',
    'facebookpostid',
    'telegrammessageid',
    'blueskyuri',
    'externalid',
    'externaluri',
    'slug',
    'slugalias',
    'slugaliases',
    'hash',
    'contenthash',
    'checksum',
    'etag',
    'revision',
    'version',
    'schemaversion',
    'schema',
    'createdat',
    'updatedat',
    'publishedat',
    'postcreatedat',
    'observedat',
    'attemptedat',
    'startedat',
    'finishedat',
    'generatedat',
    'crosspostedat',
    'lastattemptedat',
    'timestamp',
    'time',
    'date',
    'url',
    'uri',
    'href',
    'src',
    'path',
    'permalink',
    'canonicalurl',
    'sourceurl',
    'publicurl',
    'publicurl',
    'imageurl',
    'imageuri',
    'thumbnailurl',
    'thumbnailuri',
    'ogimage',
    'previewimage',
    'favicon',
    'storagekey',
    'filename',
    'mime',
    'mimetype',
    'imagemime',
    'imagewidth',
    'imageheight',
    'thumbnailwidth',
    'thumbnailheight',
    'width',
    'height',
    'size',
    'bytes',
    'type',
    'status',
    'visibility',
    'lang',
    'language',
    'kind',
    'role',
    'sourceclass',
    'lifecyclestatus',
    'knowledgeclass',
    'ingestionversion',
    'order',
    'orderid',
    'index',
    'partindex',
    'count',
    'total',
    'attempts',
    'issueai',
    'crosspost',
    'rag',
    'retrieval',
    'diagnostics',
    'schema',
    'config',
    'settings',
    'options',
    'flags',
    'stats',
    'metrics',
    'isgeneratedcard',
    'generated',
    'generatedby',
    'imagewidth',
    'imageheight',
  ].map(normalizeKey)
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSkippedKey(key: string): boolean {
  const normalized = normalizeKey(key);

  if (!normalized) return false;
  if (SKIPPED_KEYS.has(normalized)) return true;

  // Catch naming variants without maintaining an exhaustive list.
  if (/(?:url|uri)$/.test(normalized)) return true;
  if (/(?:hash|checksum|etag)$/.test(normalized)) return true;
  if (/(?:width|height|mimetype)$/.test(normalized)) return true;
  if (/(?:base64|binary|blob|buffer)$/.test(normalized)) return true;
  if (/^(?:image|photo|picture|media|thumbnail|avatar)(?:data|binary|blob)$/.test(normalized)) {
    return true;
  }

  return false;
}

/**
 * True for a URL that points at an image/video/audio file or an inline visual
 * payload. Such values are never sent to a model, even when the surrounding
 * key is not recognised.
 */
export function isVisualMediaUrl(value: string): boolean {
  const text = value.trim();

  if (!text) return false;

  return (
    /^(?:data|blob):/i.test(text) ||
    /^data:image\//i.test(text) ||
    IMAGE_OR_MEDIA_EXTENSION.test(text)
  );
}

function stripVisualMarkup(value: string): string {
  return (
    value
      // Markdown images: keep the alt text, drop the image target.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // HTML images: keep alt text only.
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const alt = tag.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);

        return alt ? (alt[1] ?? alt[2] ?? alt[3] ?? '') : '';
      })
      // Media containers do not carry analysable text of their own.
      .replace(/<(?:source|track|video|audio|iframe|svg|canvas)\b[^>]*>/gi, '')
      .replace(/<\/(?:video|audio|iframe|svg|canvas)>/gi, '')
  );
}

function looksLikeNonText(value: string): boolean {
  const text = value.trim();

  if (!text) return true;
  if (/^(?:data|blob|javascript|mailto):/i.test(text)) return true;
  if (isVisualMediaUrl(text)) return true;

  // A bare URL or path is metadata, not prose.
  if (/^(?:https?:)?\/\/\S+$/i.test(text)) return true;
  if (/^\/\S+$/.test(text) && !/\s/.test(text)) return true;

  // Long unbroken token: base64, a hash or a storage path.
  if (text.length >= 128 && !/\s/.test(text) && /^[A-Za-z0-9+/=_-]+$/.test(text)) {
    return true;
  }

  return false;
}

function cleanFragment(value: string): string {
  const stripped = stripVisualMarkup(value)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!stripped) return '';

  const text = stripped
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text || looksLikeNonText(text)) return '';

  return text.slice(0, MAX_FRAGMENT_CHARS).trim();
}

function dedupeKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function dedupeTextFragments(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = cleanFragment(value);
    if (!text) continue;

    const key = dedupeKey(text);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(text);
  }

  return result;
}

/**
 * Return every unique text fragment in a record, in storage order.
 *
 * Works for `FlowItem`, `IssueEntry`, raw `metadata` objects and any future
 * record shape: only non-text keys and visual/technical values are skipped.
 */
export function extractTextFragments(source: unknown): string[] {
  const fragments: string[] = [];
  const seen = new Set<string>();
  const visited = new WeakSet<object>();

  const add = (value: string) => {
    const text = cleanFragment(value);
    if (!text) return;

    const key = dedupeKey(text);
    if (!key || seen.has(key)) return;

    seen.add(key);
    fragments.push(text);
  };

  const visit = (value: unknown, depth: number) => {
    if (value === null || value === undefined || depth > MAX_DEPTH) return;

    if (typeof value === 'string') {
      add(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }

    if (typeof value !== 'object') return;

    const record = value as Record<string, unknown>;

    if (visited.has(record)) return;
    visited.add(record);

    for (const [key, entry] of Object.entries(record)) {
      if (isSkippedKey(key)) continue;
      visit(entry, depth + 1);
    }
  };

  visit(source, 0);

  return fragments;
}

export function joinTextFragments(
  values: readonly string[],
  maxChars = Number.POSITIVE_INFINITY
): string {
  const unique = dedupeTextFragments(values);
  let result = '';

  for (const fragment of unique) {
    const separator = result ? '\n\n' : '';
    const remaining = maxChars - result.length - separator.length;

    if (remaining <= 0) break;

    if (fragment.length <= remaining) {
      result += `${separator}${fragment}`;
      continue;
    }

    result += `${separator}${fragment.slice(0, remaining).trimEnd()}`;
    break;
  }

  return result.trim();
}

export type ExtractedTextParts = {
  /** Explicit title when available, otherwise the first text fragment. */
  title: string;
  /** Fragments excluding the title, joined in storage order. */
  body: string;
  bodyFragments: string[];
  /** All unique fragments including the title. */
  fragments: string[];
};

export function extractTextParts(
  source: unknown,
  preferredTitle?: unknown,
  maxChars = Number.POSITIVE_INFINITY
): ExtractedTextParts {
  const fragments = extractTextFragments(source);
  const explicitTitle = typeof preferredTitle === 'string' ? cleanFragment(preferredTitle) : '';
  const title = explicitTitle || fragments[0] || '';
  const titleKey = title ? dedupeKey(title) : '';
  const bodyFragments = titleKey
    ? fragments.filter((fragment) => dedupeKey(fragment) !== titleKey)
    : [...fragments];

  return {
    title,
    body: joinTextFragments(bodyFragments, maxChars),
    bodyFragments,
    fragments,
  };
}

export function hasTextContent(source: unknown): boolean {
  return extractTextFragments(source).length > 0;
}
