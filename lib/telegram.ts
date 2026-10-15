import { createClient } from '@supabase/supabase-js';

// Support Pierrot, Osiris, or generic Telegram bot tokens & channels
const TELEGRAM_BOT_TOKEN =
  process.env.PIERROT_BOT_TOKEN ||
  process.env.OSIRIS_BOT_TOKEN ||
  process.env.TELEGRAM_BOT_TOKEN;

const TELEGRAM_CHANNEL_ID =
  process.env.TELEGRAM_CHANNEL_ID ||
  process.env.PIERROT_CHANNEL_ID ||
  process.env.OSIRIS_CHANNEL_ID;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALLOWED_USER_IDS = (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map((s) => s.trim());

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

export function verifyTelegramWebhookSecret(secret?: string): boolean {
  if (!WEBHOOK_SECRET) return true; // если секрет не задан, пропускаем (лучше задать)
  return secret === WEBHOOK_SECRET;
}

export function isAllowedTelegramUser(userId: number): boolean {
  if (ALLOWED_USER_IDS.length === 0 || ALLOWED_USER_IDS.includes('')) return true;
  return ALLOWED_USER_IDS.includes(String(userId));
}

export function parseTelegramMessage(payload: any): ParsedTelegramMessage | null {
  const message = payload?.message || payload?.channel_post;
  if (!message) return null;

  return {
    id: message.message_id,
    chatId: message.chat?.id,
    userId: message.from?.id || message.chat?.id,
    username: message.from?.username,
    firstName: message.from?.first_name,
    text: message.text || message.caption || '',
  };
}

/**
 * Отправка служебного ответа/клавиатуры от Пьеро в личные сообщения
 */
export async function sendTelegramReply(chatId: number, text: string, replyMarkup?: any) {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
  } catch (error) {
    console.error('[telegram] Failed to send reply:', error);
  }
}

/**
 * Обогащение текста для Telegram с помощью DeepSeek
 */
async function enhanceTextForTelegram(rawText: string, lang: string = 'ru'): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !rawText.trim()) return rawText;

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
            content: `You are an AI editor for Anton Merkurov's Telegram channel "Unframed". Format the text nicely for Telegram post (HTML formatting, bold headers, concise paragraphs). Add 2-3 relevant hashtags at the end in ${lang}. Return ONLY the final HTML string.`,
          },
          {
            role: 'user',
            content: rawText.slice(0, 1000),
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) return rawText;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || rawText;
  } catch (error) {
    console.warn('[telegram] DeepSeek formatting failed, using raw text:', error);
    return rawText;
  }
}

/**
 * Публикация поста во Flow в Telegram-канал Unframed
 */
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
    console.warn('[telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID');
    return null;
  }

  try {
    let rawContent = title ? `<b>${title}</b>\n\n` : '';
    if (body_md) {
      const cleanBody = body_md
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`~]/g, '');
      rawContent += cleanBody;
    }

    // Обработка текста через DeepSeek
    const formattedText = await enhanceTextForTelegram(rawContent, lang);

    // Ссылка на Flow
    const flowUrl = slug ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}` : source_url;

    // Инлайн-кнопки под постом (для каналов разрешены только URL-кнопки)
    const inlineKeyboard = flowUrl
      ? {
          inline_keyboard: [
            [{ text: 'Читать во Flow ↗', url: flowUrl }],
          ],
        }
      : undefined;

    let endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    let payload: any = {
      chat_id: TELEGRAM_CHANNEL_ID,
      text: formattedText,
      parse_mode: 'HTML',
      ...(inlineKeyboard ? { reply_markup: inlineKeyboard } : {}),
      disable_web_page_preview: false,
    };

    // Если есть картинка — отправляем через sendPhoto
    if (imageUrl) {
      endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
      payload = {
        chat_id: TELEGRAM_CHANNEL_ID,
        photo: imageUrl,
        caption: formattedText.slice(0, 1024), // Telegram caption limit
        parse_mode: 'HTML',
        ...(inlineKeyboard ? { reply_markup: inlineKeyboard } : {}),
      };
    }

    let res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = await res.json();

    // Фоллбэк: если ошибка парсинга HTML, пробуем без parse_mode как чистый текст
    if (!data.ok && typeof data.description === 'string' && data.description.includes("can't parse entities")) {
      delete payload.parse_mode;
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    }

    if (!data.ok) {
      console.error('[telegram] Post failed:', data);
      return null;
    }

    return {
      messageId: data.result.message_id,
      chatId: String(data.result.chat.id),
    };
  } catch (error) {
    console.error('[telegram] Failed to publish:', error);
    return null;
  }
}

/**
 * Каскадное удаление поста из Telegram-канала Unframed
 */
export async function deleteFromTelegramChannel(messageId: number | string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID || !messageId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHANNEL_ID,
        message_id: Number(messageId),
      }),
    });

    const data = await res.json();
    return data.ok === true;
  } catch (error) {
    console.error('[telegram] Delete failed:', error);
    return false;
  }
}
