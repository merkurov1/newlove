/**
 * Telegram adapter for Flow.
 *
 * Telegram has two hard limits that matter here: 4096 characters for a text
 * message and 1024 for a media caption. Text is split into valid, balanced
 * HTML chunks instead of being cut mechanically. Albums are limited to ten
 * items and are split into logical batches; failed albums fall back to
 * individual photos so one broken URL does not hide the rest of the material.
 */

import {
  FLOW_SITE_URL,
  normalizeHttpUrl,
  type FlowContent,
} from './content';

export const TELEGRAM_TEXT_LIMIT = 4096;
export const TELEGRAM_CAPTION_LIMIT = 1024;
export const TELEGRAM_MEDIA_GROUP_LIMIT = 10;

const SAFE_TEXT_LIMIT = 3900;
const SAFE_CAPTION_LIMIT = 950;
const SEND_TIMEOUT_MS = 15_000;

export type TelegramBotName = 'pierrot' | 'osiris' | 'default';

export type TelegramPublishResult = {
  ok: boolean;
  skipped?: boolean;
  messageId?: number;
  messageIds: number[];
  chatId?: string;
  bot?: TelegramBotName;
  error?: string;
  uncertain?: boolean;
  textPartsSent: number;
  sentImageUrls: string[];
  failedImages: number;
};

export type TelegramResumeState = {
  textParts?: number;
  imageUrls?: string[];
};

type SendOutcome = {
  ok: boolean;
  result?: any;
  description?: string;
  errorCode?: number;
  uncertain?: boolean;
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Remove hashtags from visible text without touching tags/attributes. */
function stripTelegramHashtags(html: string): string {
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => {
      if (part.startsWith('<') && part.endsWith('>')) return part;

      return part
        .replace(/(^|[\s([{])#[\p{L}\p{N}_]+/gu, '$1')
        .replace(/[ \t]{2,}/g, ' ');
    })
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert visible bare URLs to clickable domain labels. */
function linkifyBareUrls(html: string): string {
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => {
      if (part.startsWith('<') && part.endsWith('>')) return part;

      return part.replace(/https?:\/\/[^\s<>"']+/gi, (rawUrl) => {
        const trailing = rawUrl.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
        const candidate = trailing
          ? rawUrl.slice(0, -trailing.length)
          : rawUrl;
        const url = normalizeHttpUrl(candidate);

        if (!url) return rawUrl;

        let label = 'Открыть ссылку';

        try {
          label = new URL(url).hostname.replace(/^www\./i, '');
        } catch {
          // Keep the generic label if URL parsing fails.
        }

        return (
          `<a href="${escapeHtmlAttribute(url)}">` +
          `${escapeHtml(label)}</a>${trailing}`
        );
      });
    })
    .join('');
}

/** Convert common Flow Markdown to the subset of Telegram HTML we allow. */
export function markdownToTelegramHtml(markdown: string): string {
  const links: string[] = [];

  let text = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label: string, rawUrl: string) => {
        const url = normalizeHttpUrl(rawUrl);
        if (!url) return label;

        const token = `FLOWLINKTOKEN${links.length}END`;
        links.push(
          `<a href="${escapeHtmlAttribute(url)}">${escapeHtml(label)}</a>`
        );
        return token;
      }
    );

  text = escapeHtml(text);

  text = text
    .replace(/^```[\w-]*\n?([\s\S]*?)```$/gm, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([\s\S]+?)__/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');

  links.forEach((link, index) => {
    text = text.replace(`FLOWLINKTOKEN${index}END`, link);
  });

  return text.trim();
}

export const FLOW_LINK_LABEL = '&gt;&gt;&gt;';

function flowLinkHtml(flowUrl: string): string {
  return `<a href="${escapeHtmlAttribute(flowUrl)}">${FLOW_LINK_LABEL}</a>`;
}

function sourceLinkHtml(sourceUrl: string): string {
  return `<a href="${escapeHtmlAttribute(sourceUrl)}">Источник</a>`;
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

/**
 * Deterministically restores the canonical Flow link and the publication
 * source link after optional AI editing.
 */
export function ensureTelegramLinks(
  html: string,
  flowUrl: string,
  sourceUrl?: string | null
): string {
  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>[\s\S]*?<\/a>/gi;
  const canonicalFlow = flowLinkHtml(flowUrl);
  let flowFound = false;

  let result = html.replace(
    anchorPattern,
    (match, doubleHref: string, singleHref: string) => {
      const href = doubleHref ?? singleHref ?? '';
      if (!hrefMatches(href, flowUrl)) return match;

      if (flowFound) return '';
      flowFound = true;
      return canonicalFlow;
    }
  );

  if (!flowFound) {
    result += `${result.trim() ? '\n\n' : ''}${canonicalFlow}`;
  }

  if (!sourceUrl) return result.replace(/\n{3,}/g, '\n\n').trim();

  const canonicalSource = sourceLinkHtml(sourceUrl);
  const sourceAnchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let sourceFound = false;

  result = result.replace(
    sourceAnchorPattern,
    (match, doubleHref: string, singleHref: string, inner: string) => {
      const href = doubleHref ?? singleHref ?? '';
      if (!hrefMatches(href, sourceUrl)) return match;

      const visible = stripHtml(inner).replace(/\s+/g, ' ').trim().toLowerCase();
      if (visible !== 'источник' && visible !== 'source') return match;

      if (sourceFound) return '';
      sourceFound = true;
      return canonicalSource;
    }
  );

  if (!sourceFound) {
    if (result.includes(canonicalFlow)) {
      result = result.replace(
        canonicalFlow,
        `${canonicalSource}\n\n${canonicalFlow}`
      );
    } else {
      result += `${result.trim() ? '\n\n' : ''}${canonicalSource}`;
    }
  }

  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Formats a Flow item for Telegram. DeepSeek is only used for short material;
 * long content always bypasses the model so nothing can be dropped.
 */
export async function formatTelegramMessage(
  title: string | null | undefined,
  bodyMd: string | null | undefined,
  flowUrl: string,
  lang = 'ru',
  sourceUrl?: string | null
): Promise<string> {
  const cleanTitle = (title || '').trim();
  const rawBody = (bodyMd || '').trim();
  const cleanSourceUrl = normalizeHttpUrl(sourceUrl);
  const safeFlowUrl = normalizeHttpUrl(flowUrl) || `${FLOW_SITE_URL}/flow`;

  const cleanBody = markdownToTelegramHtml(rawBody);

  const isRedundantTitle =
    !cleanTitle ||
    cleanTitle.toLowerCase() === rawBody.toLowerCase() ||
    rawBody.toLowerCase().startsWith(cleanTitle.toLowerCase());

  let rawContent = '';

  if (!isRedundantTitle && cleanTitle) {
    if (cleanSourceUrl) {
      rawContent +=
        `<b><a href="${escapeHtmlAttribute(cleanSourceUrl)}">` +
        `${escapeHtml(cleanTitle)}</a></b>\n\n`;
    } else {
      rawContent += `<b>${escapeHtml(cleanTitle)}</b>\n\n`;
    }
  }

  if (cleanBody) rawContent += cleanBody;

  if (cleanSourceUrl) {
    rawContent +=
      `${rawContent ? '\n\n' : ''}` +
      `<a href="${escapeHtmlAttribute(cleanSourceUrl)}">Источник</a>`;
  }

  rawContent +=
    `${rawContent ? '\n\n' : ''}` +
    flowLinkHtml(safeFlowUrl);

  const finalize = (value: string) =>
    ensureTelegramLinks(
      stripTelegramHashtags(linkifyBareUrls(value)),
      safeFlowUrl,
      cleanSourceUrl
    );

  const fallback = () => finalize(rawContent);

  const apiKey = process.env.DEEPSEEK_API_KEY;

  // Never let the model receive only the first 2500 characters of a long
  // publication. Short texts may be lightly edited; long texts are sent as-is.
  if (!apiKey || !rawContent.trim() || rawContent.length > 2500) {
    return fallback();
  }

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              `Adapt the supplied publication for Telegram in ${lang}. ` +
              `Preserve the author's voice, meaning, facts, and tone. ` +
              `Make only editorial changes needed for readability. ` +
              `Do not add hashtags, emojis, calls to action, facts, or new links. ` +
              `Preserve every existing HTML link and its destination exactly; do not rewrite or remove the final Flow link or the publication source link. ` +
              `Use only these HTML tags: <b>, <i>, <s>, <code>, <pre>, and <a>. ` +
              `Do not output raw URLs when a named clickable link is possible. ` +
              `Return only the final message, without commentary.`,
          },
          {
            role: 'user',
            content: rawContent,
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      console.warn('[flow/telegram] DeepSeek returned HTTP', response.status);
      return fallback();
    }

    const data = await response.json();
    const formatted = data.choices?.[0]?.message?.content?.trim();

    if (typeof formatted !== 'string' || !formatted) return fallback();

    return finalize(formatted);
  } catch (error) {
    console.warn('[flow/telegram] DeepSeek formatting fallback:', error);
    return fallback();
  }
}

/* ------------------------------------------------------------------ */
/* HTML-safe chunking                                                  */
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

function splitTextAtBoundary(
  text: string,
  available: number
): [head: string, tail: string] {
  if (text.length <= available) return [text, ''];

  let cut = Math.max(1, available);

  // Unicode surrogate pair: never split an emoji in half.
  const lastCode = text.charCodeAt(cut - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1;

  // HTML entity: move before `&` or after `;`.
  const amp = text.lastIndexOf('&', cut);
  if (amp >= 0) {
    const semi = text.indexOf(';', amp);
    if (semi >= cut) {
      if (semi + 1 <= available + 10) cut = semi + 1;
      else cut = amp;
    }
  }

  const minimum = Math.max(1, Math.floor(available * 0.5));
  let boundary = -1;

  for (let index = cut; index >= minimum; index -= 1) {
    if (/\s/.test(text[index - 1])) {
      boundary = index;
      break;
    }
  }

  if (boundary > 0) {
    return [text.slice(0, boundary).trimEnd(), text.slice(boundary).trimStart()];
  }

  return [text.slice(0, Math.max(1, cut)), text.slice(Math.max(1, cut))];
}

/**
 * Split Telegram HTML into chunks that stay under the API limit. Inline tags
 * are closed at the end of a chunk and reopened at the start of the next one;
 * anchors are never split unless their label alone exceeds the limit.
 */
export function splitTelegramHtml(
  html: string,
  limit = SAFE_TEXT_LIMIT
): string[] {
  if (!html.trim()) return [];
  if (html.length <= limit) return [html.trim()];

  const chunks: string[] = [];
  const stack: Array<{ raw: string; name: string }> = [];
  let current = '';

  const closingTags = () =>
    stack
      .slice()
      .reverse()
      .map((tag) => `</${tag.name}>`)
      .join('');

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

        if (stack.at(-1)?.name === segment.name) {
          stack.pop();
        }
        continue;
      }

      if (
        !segment.selfClosing &&
        current.length + segment.value.length + closingTags().length + 1 >
          limit
      ) {
        flush();
      }

      current += segment.value;
      if (!segment.selfClosing) {
        stack.push({ raw: segment.value, name: segment.name });
      }
      continue;
    }

    if (segment.kind === 'anchor') {
      if (
        current.length + segment.value.length + closingTags().length <=
        limit
      ) {
        current += segment.value;
        continue;
      }

      if (segment.value.length + reopeningTags().length + closingTags().length <= limit) {
        flush();
        current += segment.value;
        continue;
      }

      // A single anchor longer than a message: keep the destination intact and
      // split only its visible label.
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
      const available =
        limit - current.length - closingTags().length;

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

/* ------------------------------------------------------------------ */
/* Publisher                                                           */
/* ------------------------------------------------------------------ */

function telegramConfig() {
  const pierrotToken = process.env.PIERROT_BOT_TOKEN;
  const osirisToken = process.env.OSIRIS_BOT_TOKEN;
  const defaultToken = process.env.TELEGRAM_BOT_TOKEN;
  const botToken = pierrotToken || osirisToken || defaultToken;

  const rawChannelId =
    process.env.TELEGRAM_CHANNEL_ID ||
    process.env.PIERROT_CHANNEL_ID ||
    process.env.OSIRIS_CHANNEL_ID;

  const bot: TelegramBotName = pierrotToken
    ? 'pierrot'
    : osirisToken
      ? 'osiris'
      : 'default';

  const channelId = rawChannelId
    ? rawChannelId.startsWith('@') || rawChannelId.startsWith('-')
      ? rawChannelId
      : `@${rawChannelId}`
    : null;

  return { botToken, channelId, bot };
}

function isTimeoutError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string }).name;
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /timeout|aborted/i.test(message)
  );
}

export type TelegramPublisherDeps = {
  fetch?: typeof fetch;
};

async function callTelegram(
  botToken: string,
  endpoint: string,
  payload: Record<string, unknown>,
  deps: TelegramPublisherDeps
): Promise<SendOutcome> {
  const fetcher = deps.fetch ?? fetch;

  try {
    const response = await fetcher(
      `https://api.telegram.org/bot${botToken}/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }
    );

    const data = await response.json().catch(() => null);

    if (response.ok && data?.ok === true && data.result) {
      return { ok: true, result: data.result };
    }

    return {
      ok: false,
      result: data?.result,
      description:
        typeof data?.description === 'string'
          ? data.description
          : `Telegram HTTP ${response.status}`,
      errorCode: typeof data?.error_code === 'number' ? data.error_code : undefined,
      uncertain: response.status >= 500,
    };
  } catch (error) {
    return {
      ok: false,
      description: isTimeoutError(error)
        ? 'Telegram request timed out.'
        : error instanceof Error
          ? error.message.slice(0, 300)
          : 'Telegram network error.',
      uncertain: true,
    };
  }
}

function collectMessages(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return result ? [result] : [];
}

function messageIdsFrom(result: unknown): number[] {
  return collectMessages(result)
    .map((message) =>
      typeof message?.message_id === 'number' ? message.message_id : null
    )
    .filter((id): id is number => id !== null);
}

function chatIdFrom(result: unknown): string | undefined {
  const first = collectMessages(result)[0];
  const id = first?.chat?.id;
  return typeof id === 'number' || typeof id === 'string' ? String(id) : undefined;
}

/**
 * Publish normalized Flow content to Telegram. Each call is bounded: no
 * background loop, no unbounded retries, no mechanical truncation.
 */
export async function publishTelegramContent(
  content: FlowContent,
  options: { resume?: TelegramResumeState; deps?: TelegramPublisherDeps } = {}
): Promise<TelegramPublishResult> {
  const { botToken, channelId, bot } = telegramConfig();

  if (!botToken || !channelId) {
    return {
      ok: false,
      skipped: true,
      messageIds: [],
      textPartsSent: 0,
      sentImageUrls: [],
      failedImages: 0,
      error: 'Telegram is not configured.',
    };
  }

  const deps = options.deps ?? {};
  const resume = options.resume ?? {};
  const flowUrl = content.canonicalUrl;
  const primaryLink = content.links[0] ?? null;
  const sourceUrl =
    primaryLink && !primaryLink.inBody
      ? primaryLink.url
      : primaryLink
        ? null
        : content.sourceUrl;

  // Keep the full body. When the body is empty but a link preview exists, use
  // its description rather than dropping the source context. Extra links are
  // appended as named Markdown links so an item with several links keeps all
  // of them.
  const extraLinks = content.links
    .slice(1)
    .filter((link) => !link.inBody)
    .map((link) => `[${link.title ?? link.siteName ?? link.url}](${link.url})`)
    .join('\n');

  const telegramBody =
    content.body ||
    (!primaryLink || primaryLink.inBody ? '' : primaryLink.description ?? '');

  const bodyWithLinks = [telegramBody, extraLinks]
    .filter(Boolean)
    .join('\n\n');

  const formattedText = await formatTelegramMessage(
    content.showTitle ? content.title : null,
    bodyWithLinks,
    flowUrl,
    content.language,
    sourceUrl
  );

  const textChunks = splitTelegramHtml(formattedText, SAFE_TEXT_LIMIT);
  const resumeTextParts = Math.max(
    0,
    Math.min(Number(resume.textParts) || 0, textChunks.length)
  );

  const imageUrls = Array.from(
    new Set(
      content.images
        .map((image) => image.url)
        .filter((url): url is string => Boolean(url))
    )
  );
  const alreadySentImages = new Set(
    (resume.imageUrls ?? []).filter((url): url is string => typeof url === 'string')
  );
  const pendingImages = imageUrls.filter((url) => !alreadySentImages.has(url));

  const useSeparateText = formattedText.length > SAFE_CAPTION_LIMIT;

  const messageIds: number[] = [];
  const sentImageUrls: string[] = [];
  let textPartsSent = resumeTextParts;
  let failedImages = 0;
  let firstError: string | undefined;
  let uncertain = false;
  let chatId: string | undefined;

  const remember = (result: unknown) => {
    messageIds.push(...messageIdsFrom(result));
    chatId = chatId ?? chatIdFrom(result);
  };

  const sendTextPart = async (html: string): Promise<boolean> => {
    let outcome = await callTelegram(
      botToken,
      'sendMessage',
      {
        chat_id: channelId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
      deps
    );

    if (
      !outcome.ok &&
      typeof outcome.description === 'string' &&
      outcome.description.includes("can't parse entities")
    ) {
      outcome = await callTelegram(
        botToken,
        'sendMessage',
        {
          chat_id: channelId,
          text: stripHtml(html),
          link_preview_options: { is_disabled: true },
        },
        deps
      );
    }

    if (!outcome.ok) {
      firstError = firstError ?? outcome.description ?? 'Telegram send failed.';
      uncertain = uncertain || Boolean(outcome.uncertain);
      return false;
    }

    remember(outcome.result);
    return true;
  };

  const sendPhoto = async (
    url: string,
    caption?: string
  ): Promise<boolean> => {
    const basePayload: Record<string, unknown> = {
      chat_id: channelId,
      photo: url,
    };

    if (caption) {
      basePayload.caption = caption;
      basePayload.parse_mode = 'HTML';
    }

    let outcome = await callTelegram(botToken, 'sendPhoto', basePayload, deps);

    if (
      !outcome.ok &&
      caption &&
      typeof outcome.description === 'string' &&
      outcome.description.includes("can't parse entities")
    ) {
      outcome = await callTelegram(
        botToken,
        'sendPhoto',
        { chat_id: channelId, photo: url, caption: stripHtml(caption) },
        deps
      );
    }

    if (!outcome.ok) {
      firstError = firstError ?? outcome.description ?? 'Telegram photo failed.';
      uncertain = uncertain || Boolean(outcome.uncertain);
      failedImages += 1;
      return false;
    }

    sentImageUrls.push(url);
    remember(outcome.result);
    return true;
  };

  const captionForFirstImage =
    !useSeparateText && resumeTextParts === 0
      ? textChunks.join('\n\n')
      : undefined;

  let captionDelivered = false;

  for (let offset = 0; offset < pendingImages.length; offset += TELEGRAM_MEDIA_GROUP_LIMIT) {
    const batch = pendingImages.slice(
      offset,
      offset + TELEGRAM_MEDIA_GROUP_LIMIT
    );

    const canUseCaption =
      !useSeparateText &&
      !captionDelivered &&
      batch.length > 0 &&
      captionForFirstImage;

    if (batch.length === 1) {
      const ok = await sendPhoto(
        batch[0],
        canUseCaption ? captionForFirstImage : undefined
      );
      if (ok && canUseCaption) captionDelivered = true;
      continue;
    }

    const media = batch.map((url, index) => ({
      type: 'photo',
      media: url,
      ...(index === 0 && canUseCaption
        ? { caption: captionForFirstImage, parse_mode: 'HTML' }
        : {}),
    }));

    let outcome = await callTelegram(
      botToken,
      'sendMediaGroup',
      { chat_id: channelId, media },
      deps
    );

    if (
      !outcome.ok &&
      canUseCaption &&
      typeof outcome.description === 'string' &&
      outcome.description.includes("can't parse entities")
    ) {
      const plainMedia = media.map((entry, index) => ({
        ...entry,
        ...(index === 0 && canUseCaption
          ? { caption: stripHtml(captionForFirstImage ?? ''), parse_mode: undefined }
          : {}),
      }));

      outcome = await callTelegram(
        botToken,
        'sendMediaGroup',
        { chat_id: channelId, media: plainMedia },
        deps
      );
    }

    if (outcome.ok) {
      sentImageUrls.push(...batch);
      if (canUseCaption) captionDelivered = true;
      remember(outcome.result);
      continue;
    }

    firstError = firstError ?? outcome.description ?? 'Telegram album failed.';
    uncertain = uncertain || Boolean(outcome.uncertain);

    // One invalid image fails the whole album. Retry individually so healthy
    // images are still delivered and only the broken URL is counted as failed.
    for (const url of batch) {
      const ok = await sendPhoto(
        url,
        !captionDelivered && canUseCaption ? captionForFirstImage : undefined
      );
      if (ok && canUseCaption) captionDelivered = true;
    }
  }

  const needsTextMessage = useSeparateText || !captionDelivered;

  if (needsTextMessage) {
    const remaining = textChunks.slice(textPartsSent);

    for (const chunk of remaining) {
      const ok = await sendTextPart(chunk);
      if (!ok) break;
      textPartsSent += 1;
    }

    // A caption counts as one delivered text part.
    if (!useSeparateText && captionDelivered) {
      textPartsSent = textChunks.length;
    }
  } else {
    textPartsSent = textChunks.length;
  }

  const textComplete = textPartsSent >= textChunks.length;

  return {
    ok: textComplete && failedImages === 0,
    messageId: messageIds[0],
    messageIds,
    chatId,
    bot,
    error:
      failedImages > 0
        ? firstError ?? 'Some Telegram images could not be delivered.'
        : textComplete
          ? undefined
          : firstError ?? 'Telegram text delivery failed.',
    uncertain,
    textPartsSent,
    sentImageUrls,
    failedImages,
  };
}
