/**
 * Deterministic Telegram editorial composition for Flow.
 *
 * This module is deliberately free of delivery code: it turns normalized Flow
 * content into the exact text, media order, captions and message plan that the
 * publisher will send. It never rewrites, summarizes or translates the author's
 * words and it makes no network requests.
 */

import {
  FLOW_SITE_URL,
  normalizeHttpUrl,
  truncateGraphemes,
  type FlowContent,
  type FlowImage,
  type FlowLink,
  type FlowVideo,
} from './content';

export const TELEGRAM_TEXT_LIMIT = 4096;
export const TELEGRAM_CAPTION_LIMIT = 1024;
export const TELEGRAM_MEDIA_GROUP_LIMIT = 10;
export const TELEGRAM_SAFE_TEXT_LIMIT = 3900;
export const TELEGRAM_SAFE_CAPTION_LIMIT = 950;

export type TelegramLanguage = 'ru' | 'en';

export type TelegramMediaKind = 'photo' | 'video' | 'video_thumbnail';

export type TelegramMedia = {
  /** Stable resume key. */
  url: string;
  /** URL actually sent to Telegram. */
  deliveryUrl: string;
  kind: TelegramMediaKind;
  alt: string | null;
  thumbnailUrl: string | null;
  sourceVideoUrl: string | null;
};

export type TelegramMediaBatch = {
  kind: 'photo' | 'video';
  items: TelegramMedia[];
};

export type TelegramMessagePart =
  | {
      kind: 'media';
      mediaType: 'photo' | 'album' | 'video';
      items: TelegramMedia[];
      caption?: string;
      showCaptionAboveMedia: boolean;
    }
  | {
      kind: 'text';
      html: string;
      allowPreview: boolean;
      previewUrl?: string;
    };

export type TelegramValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type TelegramComposition = {
  contentType: FlowContent['contentType'];
  language: TelegramLanguage;
  title: string;
  titleVisible: boolean;
  body: string;
  formattedBody: string;
  sourceUrl: string | null;
  flowUrl: string;
  sourceLabel: string;
  flowLabel: string;
  media: TelegramMedia[];
  mediaBatches: TelegramMediaBatch[];
  mediaType: 'none' | 'photo' | 'video' | 'mixed';
  mediaCaption: string | null;
  textContinuation: string[];
  textOnlyParts: string[];
  presentationMode: 'note' | 'article' | 'photo' | 'video' | 'link' | 'quote' | 'mixed';
  messageParts: TelegramMessagePart[];
  fullHtml: string;
  textPartCount: number;
  validation: TelegramValidation;
};

export function telegramLanguage(lang: string | null | undefined): TelegramLanguage {
  return typeof lang === 'string' && lang.trim().toLowerCase().startsWith('en')
    ? 'en'
    : 'ru';
}

export function telegramFlowLabel(lang: string | null | undefined): string {
  return telegramLanguage(lang) === 'en' ? 'Read on Flow' : 'Читать в Flow';
}

export function telegramSourceLabel(lang: string | null | undefined): string {
  return telegramLanguage(lang) === 'en' ? 'Source' : 'Источник';
}

export function telegramVideoLabel(lang: string | null | undefined): string {
  return telegramLanguage(lang) === 'en' ? 'Video' : 'Видео';
}

/** Kept for backwards compatibility; new code should use telegramFlowLabel(). */
export const FLOW_LINK_LABEL = telegramFlowLabel('ru');

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function unescapeHref(value: string): string {
  return value.replace(/&amp;/g, '&');
}

function hrefMatches(href: string, target: string): boolean {
  const normalized = normalizeHttpUrl(unescapeHref(href));
  const expected = normalizeHttpUrl(target);
  if (!normalized || !expected) return false;
  if (normalized === expected) return true;

  try {
    const left = new URL(normalized);
    const right = new URL(expected);
    const host = (value: string) => value.toLowerCase().replace(/^www\./, '');
    const path = (value: string) => value.replace(/\/+$/, '') || '/';

    return (
      host(left.hostname) === host(right.hostname) &&
      path(left.pathname) === path(right.pathname) &&
      left.search === right.search &&
      left.hash === right.hash
    );
  } catch {
    return false;
  }
}

function anchorPattern(): RegExp {
  return /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
}

export function countAnchorsTo(html: string, url: string): number {
  let count = 0;
  for (const match of html.matchAll(anchorPattern())) {
    const href = match[1] ?? match[2] ?? '';
    if (hrefMatches(href, url)) count += 1;
  }
  return count;
}

function htmlContainsHref(html: string, url: string): boolean {
  return countAnchorsTo(html, url) > 0;
}

function removeAnchorsTo(html: string, url: string): string {
  return html.replace(anchorPattern(), (match, doubleHref: string, singleHref: string) => {
    const href = doubleHref ?? singleHref ?? '';
    return hrefMatches(href, url) ? '' : match;
  });
}

function linkifyBareUrls(html: string): string {
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => {
      if (part.startsWith('<') && part.endsWith('>')) return part;

      return part.replace(/https?:\/\/[^\s<>"']+/gi, (rawUrl) => {
        const trailing = rawUrl.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
        const candidate = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
        const url = normalizeHttpUrl(candidate);
        if (!url) return rawUrl;

        let label = url;
        try {
          label = new URL(url).hostname.replace(/^www\./i, '');
        } catch {
          // Keep the URL as label.
        }

        return `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(label)}</a>${trailing}`;
      });
    })
    .join('');
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function isRedundantTitle(title: string, body: string): boolean {
  const a = normalizeComparable(title);
  const b = normalizeComparable(body);
  if (!a || !b) return false;
  if (a === b) return true;

  const firstLine = normalizeComparable(body.split(/\r?\n/).find((line) => line.trim()) ?? '');
  const firstSentence = normalizeComparable(body.split(/(?<=[.!?…])\s+/)[0] ?? '');

  return Boolean(
    (firstLine && (a === firstLine || a.startsWith(firstLine) || firstLine.startsWith(a))) ||
      (firstSentence &&
        (a === firstSentence || a.startsWith(firstSentence) || firstSentence.startsWith(a))) ||
      b.startsWith(a)
  );
}

function markdownImageToken(
  alt: string,
  rawUrl: string,
  tokens: string[]
): string {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) return escapeHtml(alt);

  const token = `FLOWMEDIATOKEN${tokens.length}END`;
  const label = alt.trim() || url;
  tokens.push(
    `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(label)}</a>`
  );
  return token;
}

/**
 * Convert Flow Markdown to the conservative Telegram HTML subset.
 *
 * User text is escaped before any tag is generated. Inline code, fenced code
 * and links are tokenized first so emphasis rules can never corrupt a URL or a
 * code sample. Unsupported constructs remain readable plain text.
 */
export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';

  const tokens: string[] = [];
  let text = markdown.replace(/\r\n?/g, '\n');

  // Fenced code blocks: preserve exactly, escape the contents.
  text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_match, code: string) => {
    const token = `FLOWCODETOKEN${tokens.length}END`;
    tokens.push(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`);
    return token;
  });

  // Images are handled by the media layer. Keep their readable label as a link.
  text = text.replace(
    /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g,
    (_match, alt: string, rawUrl: string) => markdownImageToken(alt, rawUrl, tokens)
  );

  // Inline code.
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `FLOWCODETOKEN${tokens.length}END`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  // Markdown links.
  text = text.replace(
    /\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g,
    (_match, label: string, rawUrl: string) => {
      const url = normalizeHttpUrl(rawUrl);
      if (!url) return label;
      const token = `FLOWLINKTOKEN${tokens.length}END`;
      tokens.push(
        `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(label)}</a>`
      );
      return token;
    }
  );

  // Autolinks.
  text = text.replace(/<(https?:\/\/[^>\s]+)>/gi, (_match, rawUrl: string) => {
    const url = normalizeHttpUrl(rawUrl);
    if (!url) return rawUrl;
    const token = `FLOWLINKTOKEN${tokens.length}END`;
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      // Keep URL.
    }
    tokens.push(`<a href="${escapeHtmlAttribute(url)}">${escapeHtml(label)}</a>`);
    return token;
  });

  text = escapeHtml(text);

  // Block-level structure.
  const out: string[] = [];
  let quote: string[] = [];

  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${quote.join('\n')}</blockquote>`);
      quote = [];
    }
  };

  for (const line of text.split('\n')) {
    if (/^\s*&gt;\s?/.test(line)) {
      quote.push(line.replace(/^\s*&gt;\s?/, ''));
      continue;
    }

    flushQuote();

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      out.push('');
      continue;
    }

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(`<b>${heading[1]}</b>`);
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      out.push(`${bullet[1]}• ${bullet[2]}`);
      continue;
    }

    out.push(line);
  }

  flushQuote();
  text = out.join('\n');

  // Inline emphasis. Tokens protect links and code. Italic runs before bold so
  // `**bold *italic***` nests correctly instead of crossing tags.
  text = text
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/___([^_\n]+)___/g, '<b><i>$1</i></b>')
    .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([\s\S]+?)__/g, '<b>$1</b>');

  // Bare URLs in plain prose only; tokens are still protected.
  text = linkifyBareUrls(text);

  tokens.forEach((token, index) => {
    text = text.replace(`FLOWCODETOKEN${index}END`, token);
    text = text.replace(`FLOWLINKTOKEN${index}END`, token);
    text = text.replace(`FLOWMEDIATOKEN${index}END`, token);
  });

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------------ */
/* HTML-safe split                                                     */
/* ------------------------------------------------------------------ */

type HtmlSegment =
  | { kind: 'text'; value: string }
  | {
      kind: 'tag';
      value: string;
      name: string;
      closing: boolean;
      selfClosing: boolean;
    }
  | { kind: 'anchor'; value: string; open: string; close: string; text: string };

function tokenizeHtml(html: string): HtmlSegment[] {
  const segments: HtmlSegment[] = [];
  let index = 0;

  while (index < html.length) {
    const isAnchorOpen =
      html.startsWith('<a', index) &&
      /^<a(?:\s|>)/i.test(html.slice(index, index + 3)) &&
      !html.startsWith('</a', index);

    if (isAnchorOpen) {
      const openEnd = html.indexOf('>', index);
      const closeStart = openEnd >= 0 ? html.indexOf('</a>', openEnd) : -1;

      if (openEnd >= 0 && closeStart >= 0) {
        segments.push({
          kind: 'anchor',
          value: html.slice(index, closeStart + 4),
          open: html.slice(index, openEnd + 1),
          close: '</a>',
          text: html.slice(openEnd + 1, closeStart),
        });
        index = closeStart + 4;
        continue;
      }
    }

    if (html[index] === '<') {
      const end = html.indexOf('>', index);
      if (end >= 0) {
        const raw = html.slice(index, end + 1);
        const match = raw.match(/^<\/?([a-zA-Z][\w:-]*)/);
        const name = match?.[1]?.toLowerCase() ?? '';
        const closing = raw.startsWith('</');
        const selfClosing = /\/>$/.test(raw) || name === 'br' || name === 'hr';

        segments.push({ kind: 'tag', value: raw, name, closing, selfClosing });
        index = end + 1;
        continue;
      }
    }

    const next = html.indexOf('<', index);
    const end = next === -1 ? html.length : next;
    segments.push({ kind: 'text', value: html.slice(index, end) });
    index = end;
  }

  return segments;
}

function safeTextCut(text: string, available: number): number {
  let cut = Math.max(1, Math.min(available, text.length));
  const lastCode = text.charCodeAt(cut - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1;

  // Do not cut a combining mark or ZWJ sequence.
  while (cut > 0) {
    const code = text.codePointAt(cut);
    const combining =
      code !== undefined &&
      ((code >= 0x0300 && code <= 0x036f) || code === 0x200d || code === 0xfe0f);
    if (!combining) break;
    cut -= 1;
  }

  return Math.max(1, cut);
}

function splitTextAtBoundary(text: string, available: number): [string, string] {
  if (text.length <= available) return [text, ''];

  let cut = safeTextCut(text, available);

  const amp = text.lastIndexOf('&', cut);
  if (amp >= 0) {
    const semi = text.indexOf(';', amp);
    if (semi >= cut) {
      cut = semi + 1 <= available + 10 ? semi + 1 : amp;
    }
  }

  const minimum = Math.max(1, Math.floor(available * 0.55));
  const window = text.slice(0, cut);

  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph >= minimum) {
    return [text.slice(0, paragraph).trimEnd(), text.slice(paragraph).trimStart()];
  }

  const sentenceMatches = [...window.matchAll(/[.!?…](?=\s)/g)];
  const sentence = sentenceMatches.at(-1)?.index ?? -1;
  if (sentence >= minimum) {
    return [text.slice(0, sentence + 1).trimEnd(), text.slice(sentence + 1).trimStart()];
  }

  const whitespace = window.lastIndexOf(' ');
  if (whitespace >= minimum) {
    return [text.slice(0, whitespace).trimEnd(), text.slice(whitespace).trimStart()];
  }

  return [text.slice(0, cut), text.slice(cut)];
}

export function splitTelegramHtml(
  html: string,
  limit = TELEGRAM_SAFE_TEXT_LIMIT
): string[] {
  if (!html.trim()) return [];
  if (html.length <= limit) return [html.trim()];

  const chunks: string[] = [];
  const stack: Array<{ raw: string; name: string }> = [];
  let current = '';

  const closingTags = () => stack.slice().reverse().map((tag) => `</${tag.name}>`).join('');
  const reopeningTags = () => stack.map((tag) => tag.raw).join('');
  const hasVisibleContent = (value: string) =>
    stripHtml(value).trim().length > 0 || /<a\b/i.test(value);

  const flush = () => {
    const content = `${current}${closingTags()}`.trim();
    if (hasVisibleContent(content)) chunks.push(content);
    current = reopeningTags();
  };

  for (const segment of tokenizeHtml(html)) {
    if (segment.kind === 'tag') {
      if (segment.closing) {
        current += segment.value;
        if (stack.at(-1)?.name === segment.name) stack.pop();
        continue;
      }

      if (
        !segment.selfClosing &&
        current.length + segment.value.length + closingTags().length + 1 > limit
      ) {
        flush();
      }

      current += segment.value;
      if (!segment.selfClosing) stack.push({ raw: segment.value, name: segment.name });
      continue;
    }

    if (segment.kind === 'anchor') {
      if (current.length + segment.value.length + closingTags().length <= limit) {
        current += segment.value;
        continue;
      }

      if (segment.value.length + reopeningTags().length + closingTags().length <= limit) {
        flush();
        current += segment.value;
        continue;
      }

      flush();
      const open = reopeningTags();
      const close = closingTags();
      const available = Math.max(
        80,
        limit - open.length - close.length - segment.open.length - segment.close.length
      );
      let rest = segment.text;

      while (rest) {
        const [head, tail] = splitTextAtBoundary(rest, available);
        current = `${open}${segment.open}${head}${segment.close}`;
        if (!tail) break;
        const content = `${current}${close}`.trim();
        if (hasVisibleContent(content)) chunks.push(content);
        current = reopeningTags();
        rest = tail;
      }
      continue;
    }

    let rest = segment.value;
    while (rest) {
      const available = limit - current.length - closingTags().length;
      if (available <= 0) {
        flush();
        continue;
      }

      if (rest.length <= available) {
        current += rest;
        rest = '';
        continue;
      }

      const [head, tail] = splitTextAtBoundary(rest, available);
      current += head;
      flush();
      rest = tail;
    }
  }

  flush();
  return chunks.filter((chunk) => chunk.trim());
}

/** Split once for a caption: balanced head plus the exact remaining HTML. */
export function takeTelegramHtmlHead(
  html: string,
  limit = TELEGRAM_SAFE_CAPTION_LIMIT
): { head: string; rest: string } {
  if (!html.trim()) return { head: '', rest: '' };
  if (html.length <= limit) return { head: html.trim(), rest: '' };

  const chunks = splitTelegramHtml(html, limit);
  if (chunks.length <= 1) return { head: chunks[0] ?? html, rest: '' };

  return {
    head: chunks[0],
    rest: chunks.slice(1).join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Link protocol                                                       */
/* ------------------------------------------------------------------ */

function flowLinkHtml(flowUrl: string, lang: TelegramLanguage): string {
  return `<a href="${escapeHtmlAttribute(flowUrl)}">${escapeHtml(telegramFlowLabel(lang))}</a>`;
}

function sourceLinkHtml(sourceUrl: string, lang: TelegramLanguage, label?: string): string {
  return `<a href="${escapeHtmlAttribute(sourceUrl)}">${escapeHtml(
    label ?? telegramSourceLabel(lang)
  )}</a>`;
}

function labelForLink(link: FlowLink): string {
  return (
    truncateGraphemes(link.title || link.siteName || link.domain || link.url, 90).trim() ||
    link.url
  );
}

/**
 * Enforce one canonical Flow link and at most one appended source label.
 * This is kept for callers that format text outside the composition layer.
 */
export function ensureTelegramLinks(
  html: string,
  flowUrl: string,
  sourceUrl?: string | null,
  lang: string | null | undefined = 'ru'
): string {
  const language = telegramLanguage(lang);
  const canonicalFlow = flowLinkHtml(flowUrl, language);
  let result = removeAnchorsTo(html, flowUrl).trim();
  result += `${result ? '\n\n' : ''}${canonicalFlow}`;

  const cleanSource = normalizeHttpUrl(sourceUrl);
  if (cleanSource && !htmlContainsHref(html, cleanSource)) {
    const canonicalSource = sourceLinkHtml(cleanSource, language);
    result = result.replace(canonicalFlow, `${canonicalSource}\n\n${canonicalFlow}`);
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

function isVideoFileUrl(url: string): boolean {
  try {
    return /\.(?:mp4|mov|m4v|webm|mkv)$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function mediaFromImage(image: FlowImage): TelegramMedia | null {
  const url = normalizeHttpUrl(image.url);
  if (!url) return null;

  return {
    url,
    deliveryUrl: url,
    kind: 'photo',
    alt: image.alt ?? image.caption ?? null,
    thumbnailUrl: null,
    sourceVideoUrl: null,
  };
}

function mediaFromVideo(video: FlowVideo): TelegramMedia | null {
  const url = normalizeHttpUrl(video.url);
  if (!url) return null;

  const thumbnail = normalizeHttpUrl(video.thumbnail);
  const uploadable = video.provider === 'other' && isVideoFileUrl(url);

  if (uploadable) {
    return {
      url,
      deliveryUrl: url,
      kind: 'video',
      alt: video.title ?? video.author ?? null,
      thumbnailUrl: thumbnail,
      sourceVideoUrl: null,
    };
  }

  if (thumbnail) {
    return {
      url,
      deliveryUrl: thumbnail,
      kind: 'video_thumbnail',
      alt: video.title ?? video.author ?? null,
      thumbnailUrl: thumbnail,
      sourceVideoUrl: url,
    };
  }

  return null;
}

function batchMedia(media: TelegramMedia[]): TelegramMediaBatch[] {
  const batches: TelegramMediaBatch[] = [];
  let photos: TelegramMedia[] = [];

  const flushPhotos = () => {
    for (let index = 0; index < photos.length; index += TELEGRAM_MEDIA_GROUP_LIMIT) {
      batches.push({
        kind: 'photo',
        items: photos.slice(index, index + TELEGRAM_MEDIA_GROUP_LIMIT),
      });
    }
    photos = [];
  };

  for (const item of media) {
    if (item.kind === 'video') {
      flushPhotos();
      batches.push({ kind: 'video', items: [item] });
    } else {
      photos.push(item);
    }
  }

  flushPhotos();
  return batches;
}

function presentationModeFor(
  content: FlowContent,
  media: TelegramMedia[]
): TelegramComposition['presentationMode'] {
  if (content.contentType === 'video') return 'video';
  if (content.contentType === 'photo') return 'photo';
  if (content.contentType === 'quote') return 'quote';
  if (content.contentType === 'article') return 'article';

  // A source link does not turn a note, article or quote into a link post.
  // The author's raw type wins for text-only publications; this also keeps
  // automatic link previews off ordinary notes.
  if (!media.length) {
    if (content.rawType === 'note') return 'note';
    if (content.rawType === 'article') return 'article';
    if (content.rawType === 'quote') return 'quote';
    if (content.rawType === 'link') return 'link';
  }

  if (content.contentType === 'link') return 'link';
  if (content.contentType === 'note') return 'note';

  if (media.some((item) => item.kind === 'video' || item.kind === 'video_thumbnail')) {
    return 'video';
  }
  if (media.length) return 'photo';
  return content.links.length ? 'link' : 'note';
}

function pickSource(
  content: FlowContent,
  flowUrl: string
): { url: string | null; link: FlowLink | null } {
  const firstLink = content.links[0] ?? null;
  const candidate =
    (firstLink && !firstLink.inBody ? firstLink.url : null) ??
    content.sourceUrl ??
    null;
  const normalized = normalizeHttpUrl(candidate);

  if (!normalized || hrefMatches(normalized, flowUrl)) {
    return { url: null, link: firstLink };
  }

  return { url: normalized, link: firstLink };
}

function buildHtmlSections(input: {
  content: FlowContent;
  language: TelegramLanguage;
  flowUrl: string;
  sourceUrl: string | null;
  sourceLabel: string;
  titleLinksSource: boolean;
  titleVisible: boolean;
  bodyHtml: string;
  sourceIncluded: boolean;
}): { html: string; sourceIncluded: boolean } {
  const sections: string[] = [];
  let sourceIncluded = input.sourceIncluded;
  const title = input.content.title.trim();

  if (input.titleVisible && title) {
    const titleHtml = input.titleLinksSource
      ? `<b><a href="${escapeHtmlAttribute(input.sourceUrl!)}">${escapeHtml(title)}</a></b>`
      : `<b>${escapeHtml(title)}</b>`;
    sections.push(titleHtml);
    if (input.titleLinksSource) sourceIncluded = true;
  }

  if (input.bodyHtml) sections.push(input.bodyHtml);

  const extraLinks = input.content.links
    .slice(1)
    .filter((link) => !link.inBody)
    .filter((link) => !hrefMatches(link.url, input.flowUrl))
    .filter((link) => !input.sourceUrl || !hrefMatches(link.url, input.sourceUrl))
    .map((link) => `<a href="${escapeHtmlAttribute(link.url)}">${escapeHtml(labelForLink(link))}</a>`);

  if (extraLinks.length) sections.push(extraLinks.join('\n'));

  const videoLinks = input.content.videos
    .filter((video) => !input.sourceUrl || !hrefMatches(video.url, input.sourceUrl))
    .filter((video) => !htmlContainsHref(input.bodyHtml, video.url))
    .map(
      (video) =>
        `<a href="${escapeHtmlAttribute(video.url)}">${escapeHtml(
          telegramVideoLabel(input.language)
        )}</a>`
    );

  if (videoLinks.length) sections.push(videoLinks.join('\n'));

  if (input.sourceUrl && !sourceIncluded) {
    sections.push(sourceLinkHtml(input.sourceUrl, input.language, input.sourceLabel));
    sourceIncluded = true;
  }

  sections.push(flowLinkHtml(input.flowUrl, input.language));

  return {
    html: sections
      .filter(Boolean)
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    sourceIncluded,
  };
}

function validateHtmlBalance(html: string): string[] {
  const allowed = new Set(['b', 'i', 's', 'code', 'pre', 'a', 'blockquote', 'br']);
  const stack: string[] = [];
  const errors: string[] = [];

  for (const segment of tokenizeHtml(html)) {
    if (segment.kind !== 'tag') continue;
    if (!allowed.has(segment.name)) {
      errors.push(`Unsupported tag <${segment.name}>.`);
      continue;
    }
    if (segment.selfClosing) continue;

    if (segment.closing) {
      const last = stack.pop();
      if (last !== segment.name) {
        errors.push(`Unbalanced closing tag </${segment.name}>.`);
      }
    } else {
      stack.push(segment.name);
    }
  }

  if (stack.length) errors.push(`Unclosed tag <${stack.at(-1)}>.`);
  return errors;
}

function validateComposition(input: {
  html: string;
  flowUrl: string;
  sourceUrl: string | null;
  titleVisible: boolean;
  title: string;
  body: string;
  media: TelegramMedia[];
  mediaCaption: string | null;
  language: TelegramLanguage;
  sourceLabel: string;
}): TelegramValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!stripHtml(input.html).trim() && !/<a\b/i.test(input.html)) {
    errors.push('The Telegram message is empty.');
  }

  const flowLinks = countAnchorsTo(input.html, input.flowUrl);
  if (flowLinks !== 1) {
    errors.push(`Expected exactly one Flow link, found ${flowLinks}.`);
  }

  if (input.sourceUrl) {
    const sourceLinks = countAnchorsTo(input.html, input.sourceUrl);
    if (sourceLinks > 1) {
      errors.push(`The source link appears ${sourceLinks} times.`);
    }
  }

  if (input.media.length && !input.mediaCaption) {
    errors.push('Media has no caption.');
  }

  if (input.titleVisible && input.title && isRedundantTitle(input.title, input.body)) {
    errors.push('The title repeats the opening of the text.');
  }

  errors.push(...validateHtmlBalance(input.html));

  if (/FLOW(?:CODE|LINK|MEDIA)TOKEN\d+END/.test(input.html)) {
    errors.push('A technical formatting placeholder leaked into the message.');
  }

  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~/.test(input.html)) {
    warnings.push('Possible literal Markdown emphasis remains in the text.');
  }

  if (/\[[^\]]+\]\([^)]+\)/.test(input.html)) {
    warnings.push('Possible literal Markdown link syntax remains in the text.');
  }

  if (!input.titleVisible) warnings.push('The publication is published without a separate title.');

  const expectedSourceLabel = telegramSourceLabel(input.language);
  if (
    input.sourceLabel !== expectedSourceLabel &&
    input.sourceLabel !== telegramVideoLabel(input.language)
  ) {
    warnings.push('The source label language does not match the publication language.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function composeTelegramPublication(content: FlowContent): TelegramComposition {
  const language = telegramLanguage(content.language);
  const flowUrl = normalizeHttpUrl(content.canonicalUrl) ?? `${FLOW_SITE_URL}/flow`;
  const { url: sourceUrl } = pickSource(content, flowUrl);

  let bodyHtml = markdownToTelegramHtml(content.body);
  if (bodyHtml) bodyHtml = removeAnchorsTo(bodyHtml, flowUrl).trim();

  const bodyText = content.bodyText || stripHtml(bodyHtml);
  const title = truncateGraphemes((content.title || '').trim(), 160).trim();
  const titleVisible = Boolean(
    content.showTitle && title && !isRedundantTitle(title, bodyText)
  );

  const bodyHasSource = Boolean(
    sourceUrl &&
      (content.links[0]?.inBody ||
        htmlContainsHref(bodyHtml, sourceUrl) ||
        bodyText.includes(sourceUrl))
  );

  const titleLinksSource = Boolean(
    titleVisible &&
      sourceUrl &&
      content.titleSource === 'link' &&
      !bodyHasSource
  );

  const sourceLabel =
    content.contentType === 'video' &&
    content.videos.some((video) => hrefMatches(video.url, sourceUrl ?? ''))
      ? telegramVideoLabel(language)
      : telegramSourceLabel(language);

  const { html: fullHtml } = buildHtmlSections({
    content,
    language,
    flowUrl,
    sourceUrl,
    sourceLabel,
    titleLinksSource,
    titleVisible,
    bodyHtml,
    sourceIncluded: bodyHasSource,
  });

  const imageMedia = content.images
    .map(mediaFromImage)
    .filter((item): item is TelegramMedia => Boolean(item));
  const videoMedia = content.videos
    .map(mediaFromVideo)
    .filter((item): item is TelegramMedia => Boolean(item));

  const seenMedia = new Set<string>();
  const media = (
    content.contentType === 'video'
      ? [...videoMedia, ...imageMedia]
      : [...imageMedia, ...videoMedia]
  ).filter((item) => {
    if (seenMedia.has(item.url)) return false;
    seenMedia.add(item.url);
    return true;
  });

  const mediaBatches = batchMedia(media);
  const mode = presentationModeFor(content, media);

  let mediaCaption: string | null = null;
  let textContinuation: string[] = [];
  let textOnlyParts: string[] = [];

  if (media.length) {
    if (fullHtml.length <= TELEGRAM_SAFE_CAPTION_LIMIT) {
      mediaCaption = fullHtml;
    } else {
      const { head, rest } = takeTelegramHtmlHead(fullHtml, TELEGRAM_SAFE_CAPTION_LIMIT);
      mediaCaption = head || null;
      textContinuation = rest ? splitTelegramHtml(rest, TELEGRAM_SAFE_TEXT_LIMIT) : [];
    }
  } else {
    textOnlyParts = splitTelegramHtml(fullHtml, TELEGRAM_SAFE_TEXT_LIMIT);
  }

  const messageParts: TelegramMessagePart[] = [];
  if (mediaBatches.length) {
    mediaBatches.forEach((batch, index) => {
      const isFirst = index === 0;
      messageParts.push({
        kind: 'media',
        mediaType:
          batch.kind === 'video'
            ? 'video'
            : batch.items.length > 1
              ? 'album'
              : 'photo',
        items: batch.items,
        caption: isFirst ? mediaCaption ?? undefined : undefined,
        showCaptionAboveMedia:
          isFirst &&
          mode === 'photo' &&
          batch.kind === 'photo' &&
          batch.items.length === 1,
      });
    });

    textContinuation.forEach((html) => {
      messageParts.push({
        kind: 'text',
        html,
        allowPreview: false,
      });
    });
  } else {
    textOnlyParts.forEach((html, index) => {
      messageParts.push({
        kind: 'text',
        html,
        allowPreview:
          index === 0 && mode === 'link' && Boolean(sourceUrl) && !media.length,
        previewUrl: index === 0 ? sourceUrl ?? undefined : undefined,
      });
    });
  }

  const textPartCount = media.length
    ? (mediaCaption ? 1 : 0) + textContinuation.length
    : textOnlyParts.length;

  const validation = validateComposition({
    html: fullHtml,
    flowUrl,
    sourceUrl,
    titleVisible,
    title,
    body: bodyText,
    media,
    mediaCaption,
    language,
    sourceLabel,
  });

  return {
    contentType: content.contentType,
    language,
    title,
    titleVisible,
    body: content.body,
    formattedBody: bodyHtml,
    sourceUrl,
    flowUrl,
    sourceLabel,
    flowLabel: telegramFlowLabel(language),
    media,
    mediaBatches,
    mediaType:
      media.length === 0
        ? 'none'
        : media.some((item) => item.kind === 'video' || item.kind === 'video_thumbnail') &&
            media.some((item) => item.kind === 'photo')
          ? 'mixed'
          : media.some((item) => item.kind === 'video' || item.kind === 'video_thumbnail')
            ? 'video'
            : 'photo',
    mediaCaption,
    textContinuation,
    textOnlyParts,
    presentationMode: mode,
    messageParts,
    fullHtml,
    textPartCount,
    validation,
  };
}

/**
 * Backwards-compatible text-only formatter. It is deterministic and never
 * calls a model.
 */
export async function formatTelegramMessage(
  title: string | null | undefined,
  bodyMd: string | null | undefined,
  flowUrl: string,
  lang = 'ru',
  sourceUrl?: string | null
): Promise<string> {
  const content = {
    id: null,
    slug: null,
    rawType: 'note',
    contentType: 'note',
    title: title ?? '',
    titleSource: 'manual',
    description: '',
    body: bodyMd ?? '',
    bodyText: stripHtml(markdownToTelegramHtml(bodyMd ?? '')),
    bodyExcerpt: '',
    bodyTruncated: false,
    showTitle: Boolean(title),
    titleIsRedundant: false,
    images: [],
    videos: [],
    links: [],
    media: [],
    sourceUrl: normalizeHttpUrl(sourceUrl) ?? null,
    sourceName: 'Flow',
    canonicalUrl: flowUrl,
    publishedAt: null,
    updatedAt: null,
    language: telegramLanguage(lang),
    metadata: {},
    imageAlt: title ?? '',
    version: 'preview',
  } as FlowContent;

  return composeTelegramPublication(content).fullHtml;
}
