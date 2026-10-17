import { createClient } from '@supabase/supabase-js';

const TELEGRAM_BOT_TOKEN =
  process.env.PIERROT_BOT_TOKEN ||
  process.env.OSIRIS_BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_CHANNEL_ID =
  process.env.TELEGRAM_CHANNEL_ID ||
  process.env.PIERROT_CHANNEL_ID ||
  process.env.OSIRIS_CHANNEL_ID;

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const ALLOWED_USER_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export interface ParsedTelegramMessage {
  id: number;
  chatId: number;
  userId: number;
  username?: string;
  firstName?: string;
  text?: string;
  caption?: string;
  photoUrl?: string;
}

/**
 * Fail closed: Telegram webhook requests are rejected unless a secret
 * is configured and matches the secret header.
 */
export function verifyTelegramWebhookSecret(secret?: string): boolean {
  if (!WEBHOOK_SECRET || !secret) return false;

  const expected = Buffer.from(WEBHOOK_SECRET);
  const received = Buffer.from(secret);

  if (expected.length !== received.length) return false;

  return require('crypto').timingSafeEqual(expected, received);
}

/**
 * An empty allowlist must never mean "allow everyone".
 */
export function isAllowedTelegramUser(userId: number): boolean {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  if (ALLOWED_USER_IDS.length === 0) return false;

  return ALLOWED_USER_IDS.includes(String(userId));
}

export function parseTelegramMessage(
  payload: unknown,
): ParsedTelegramMessage | null {
  if (!payload || typeof payload !== 'object') return null;

  const update = payload as Record<string, unknown>;
  const rawMessage = update.message ?? update.channel_post;

  if (!rawMessage || typeof rawMessage !== 'object') return null;

  const message = rawMessage as Record<string, unknown>;
  const chat =
    message.chat && typeof message.chat === 'object'
      ? (message.chat as Record<string, unknown>)
      : null;

  const from =
    message.from && typeof message.from === 'object'
      ? (message.from as Record<string, unknown>)
      : null;

  const messageId = message.message_id;
  const chatId = chat?.id;
  const userId = from?.id;

  // Do not treat a channel/chat ID as a user's identity.
  if (
    typeof messageId !== 'number' ||
    !Number.isSafeInteger(messageId) ||
    typeof chatId !== 'number' ||
    !Number.isSafeInteger(chatId) ||
    typeof userId !== 'number' ||
    !Number.isSafeInteger(userId)
  ) {
    return null;
  }

  const text =
    typeof message.text === 'string'
      ? message.text
      : typeof message.caption === 'string'
        ? message.caption
        : '';

  return {
    id: messageId,
    chatId,
    userId,
    username:
      typeof from?.username === 'string' ? from.username : undefined,
    firstName:
      typeof from?.first_name === 'string' ? from.first_name : undefined,
    text,
    caption:
      typeof message.caption === 'string' ? message.caption : undefined,
  };
}

/**
 * Send a service reply to a Telegram chat.
 * Keeps the existing API used by the webhook.
 */
export async function sendTelegramReply(
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[telegram] Cannot send reply: bot token is missing.');
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok !== true) {
      console.error('[telegram] Reply failed:', {
        status: response.status,
        description: result?.description ?? 'Unknown Telegram API error',
      });
    }
  } catch (error) {
    console.error('[telegram] Failed to send reply:', error);
  }
}

/**
 * Kept for compatibility with existing imports.
 * This legacy publisher is not used as the primary Flow crosspost path.
 */
async function enhanceTextForTelegram(
  rawText: string,
  lang = 'ru',
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !rawText.trim()) return rawText;

  try {
    const response = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
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
                `Adapt the supplied text for Telegram in ${lang}. ` +
                `Preserve meaning, facts, voice, and tone. ` +
                `Do not add hashtags, emojis, facts, links, or calls to action. ` +
                `Do not change link destinations. Return only the final text.`,
            },
            {
              role: 'user',
              content: rawText.slice(0, 2500),
            },
          ],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(7000),
      },
    );

    if (!response.ok) return rawText;

    const data = await response.json();
    const result = data?.choices?.[0]?.message?.content;

    return typeof result === 'string' && result.trim()
      ? result.trim()
      : rawText;
  } catch (error) {
    console.warn(
      '[telegram] DeepSeek formatting failed; using original text:',
      error,
    );
    return rawText;
  }
}

export async function publishToTelegramChannel({
  title,
  body_md,
  source_url,
  slug,
  lang = 'ru',
  imageUrl,
}: {
  title?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  slug?: string | null;
  lang?: string;
  imageUrl?: string | null;
}): Promise<{ messageId: number; chatId: string } | null> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.warn(
      '[telegram] Missing bot token or channel ID.',
    );
    return null;
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const safeUrl = (value?: string | null): string | null => {
    if (!value) return null;

    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  };

  const escapeAttribute = (value: string) =>
    escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const flowUrl = slug
    ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}`
    : null;

  const safeSourceUrl = safeUrl(source_url);

  let rawContent = title?.trim()
    ? `<b>${escapeHtml(title.trim())}</b>\n\n`
    : '';

  if (body_md?.trim()) {
    // Preserve named Markdown links as HTML links.
    let body = body_md
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        (_match, label: string, url: string) => {
          const safe = safeUrl(url);
          return safe
            ? `<a href="${escapeAttribute(safe)}">${escapeHtml(label)}</a>`
            : escapeHtml(label);
        },
      );

    // Remove hashtags without stripping ordinary punctuation.
    body = body.replace(
      /(^|[\s([{])#[\p{L}\p{N}_]+/gu,
      '$1',
    );

    // Escape ordinary text while retaining only our generated links.
    const links: string[] = [];
    body = body.replace(/<a href="[^"]+">[\s\S]*?<\/a>/g, (link) => {
      const token = `TELEGRAM_LINK_${links.length}_TOKEN`;
      links.push(link);
      return token;
    });

    body = escapeHtml(
      body.replace(/[*_`~]/g, ''),
    );

    links.forEach((link, index) => {
      body = body.replace(`TELEGRAM_LINK_${index}_TOKEN`, link);
    });

    rawContent += body;
  }

  if (safeSourceUrl) {
    rawContent +=
      `${rawContent ? '\n\n' : ''}` +
      `<a href="${escapeAttribute(safeSourceUrl)}">Источник</a>`;
  }

  if (flowUrl) {
    rawContent +=
      `${rawContent ? '\n\n' : ''}` +
      `<a href="${escapeAttribute(flowUrl)}">Читать во Flow</a>`;
  }

  const formattedText = await enhanceTextForTelegram(rawContent, lang);

  const send = async (
    endpoint: 'sendMessage' | 'sendPhoto',
    payload: Record<string, unknown>,
  ) => {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      },
    );

    return response.json();
  };

  try {
    const usePhoto = Boolean(imageUrl && safeUrl(imageUrl));
    const endpoint = usePhoto ? 'sendPhoto' : 'sendMessage';

    const payload: Record<string, unknown> = {
      chat_id: TELEGRAM_CHANNEL_ID,
      ...(usePhoto
        ? {
            photo: safeUrl(imageUrl),
            caption: formattedText.slice(0, 1024),
          }
        : {
            text: formattedText.slice(0, 4096),
            link_preview_options: { is_disabled: true },
          }),
      parse_mode: 'HTML',
      ...(flowUrl
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Читать во Flow ↗', url: flowUrl }],
              ],
            },
          }
        : {}),
    };

    let result = await send(endpoint, payload);

    if (
      result?.ok !== true &&
      typeof result?.description === 'string' &&
      result.description.includes("can't parse entities")
    ) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.parse_mode;
      result = await send(endpoint, fallbackPayload);
    }

    if (result?.ok !== true || !result.result) {
      console.error('[telegram] Post failed:', {
        error_code: result?.error_code,
        description: result?.description,
      });
      return null;
    }

    return {
      messageId: result.result.message_id,
      chatId: String(result.result.chat.id),
    };
  } catch (error) {
    console.error('[telegram] Failed to publish:', error);
    return null;
  }
}

export async function deleteFromTelegramChannel(
  messageId: number | string,
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID || !messageId) {
    return false;
  }

  const numericMessageId = Number(messageId);
  if (!Number.isSafeInteger(numericMessageId) || numericMessageId <= 0) {
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHANNEL_ID,
          message_id: numericMessageId,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    const data = await response.json().catch(() => null);
    return response.ok && data?.ok === true;
  } catch (error) {
    console.error('[telegram] Delete failed:', error);
    return false;
  }
}