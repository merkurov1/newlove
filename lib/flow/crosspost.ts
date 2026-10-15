import { publishToBluesky } from '@/lib/bluesky';
import { createClient } from '@supabase/supabase-js';

export type CrosspostPayload = {
  id: string;
  title?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  slug?: string | null;
  lang?: string;
  imageUrl?: string | null;
  youtubeUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CrosspostResult = {
  bluesky?: { uri: string; cid: string } | null;
  telegram?: { messageId: number; chatId: string; bot: 'pierrot' | 'osiris' | 'default' } | null;
  osirisWebhook?: { ok: boolean; status?: number; error?: string } | null;
  pierrotWebhook?: { ok: boolean; status?: number; error?: string } | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Format and enrich text for Telegram publication
 */
async function formatTelegramMessage(rawContent: string, lang: string = 'ru'): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !rawContent.trim()) {
    return rawContent;
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
            content: `You are Pierrot, an elite AI editor for Anton Merkurov's publication network. Format the text beautifully for Telegram using clean HTML tags (<b>, <i>, <code>, <a>). Do not use unsupported markdown. Add 2-3 precise hashtags at the end in ${lang}. Return ONLY valid HTML.`,
          },
          {
            role: 'user',
            content: rawContent.slice(0, 1200),
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) return rawContent;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || rawContent;
  } catch (err) {
    console.warn('[crosspost] DeepSeek formatting fallback:', err);
    return rawContent;
  }
}

/**
 * Publishes post to Telegram channel using Pierrot, Osiris, or default bot token
 */
async function publishTelegram({
  title,
  body_md,
  source_url,
  slug,
  lang = 'ru',
  imageUrl,
  youtubeUrl,
}: CrosspostPayload): Promise<CrosspostResult['telegram']> {
  // Support Pierrot, Osiris, and fallback Telegram Bot tokens
  const osirisToken = process.env.OSIRIS_BOT_TOKEN;
  const pierrotToken = process.env.PIERROT_BOT_TOKEN;
  const defaultToken = process.env.TELEGRAM_BOT_TOKEN;

  const botToken = pierrotToken || osirisToken || defaultToken;
  const channelId =
    process.env.TELEGRAM_CHANNEL_ID ||
    process.env.PIERROT_CHANNEL_ID ||
    process.env.OSIRIS_CHANNEL_ID;

  if (!botToken || !channelId) {
    console.warn('[crosspost:telegram] Missing bot token or channel ID. Provide TELEGRAM_BOT_TOKEN (or PIERROT_BOT_TOKEN) and TELEGRAM_CHANNEL_ID.');
    return null;
  }

  const botIdent: 'pierrot' | 'osiris' | 'default' = pierrotToken
    ? 'pierrot'
    : osirisToken
      ? 'osiris'
      : 'default';

  try {
    let rawContent = title ? `<b>${title}</b>\n\n` : '';
    if (body_md) {
      const cleanBody = body_md
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`~]/g, '');
      rawContent += cleanBody;
    }

    const formattedText = await formatTelegramMessage(rawContent, lang);
    const flowUrl = slug
      ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}`
      : 'https://www.merkurov.love/flow';

    // В каналах Telegram поддерживаются ТОЛЬКО URL-кнопки (кнопки с 'web_app' вызывают ошибку BUTTON_TYPE_INVALID)
    const inlineButtons: Array<Array<{ text: string; url: string }>> = [];

    // Главная строка: Читать во Flow
    inlineButtons.push([
      { text: 'Читать во Flow ↗', url: flowUrl },
    ]);

    // Дополнительная строка: YouTube или первоисточник
    const extraRow: Array<{ text: string; url: string }> = [];
    if (youtubeUrl) {
      extraRow.push({ text: 'YouTube ▶️', url: youtubeUrl });
    }
    if (source_url && source_url !== flowUrl && source_url !== youtubeUrl) {
      extraRow.push({ text: 'Первоисточник ↗', url: source_url });
    }
    if (extraRow.length > 0) {
      inlineButtons.push(extraRow);
    }

    const replyMarkup = { inline_keyboard: inlineButtons };

    // Функция отправки с обработкой ошибок и фоллбэками
    const sendTelegram = async (usePhoto: boolean, parseMode?: 'HTML'): Promise<any> => {
      let endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
      let payload: any = {
        chat_id: channelId,
        text: formattedText,
        disable_web_page_preview: false,
        reply_markup: replyMarkup,
      };

      if (parseMode) {
        payload.parse_mode = parseMode;
      }

      if (usePhoto && imageUrl) {
        endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        payload = {
          chat_id: channelId,
          photo: imageUrl,
          caption: formattedText.slice(0, 1024),
          reply_markup: replyMarkup,
        };
        if (parseMode) {
          payload.parse_mode = parseMode;
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return await res.json();
    };

    // 1. Первая попытка: с фото (если есть) и разметкой HTML
    let data = await sendTelegram(Boolean(imageUrl), 'HTML');

    // 2. Если ошибка парсинга HTML-тегов от DeepSeek — повторяем без parse_mode как чистый текст
    if (!data.ok && typeof data.description === 'string' && data.description.includes("can't parse entities")) {
      console.warn('[crosspost:telegram] HTML entity parse error, retrying without parse_mode...');
      data = await sendTelegram(Boolean(imageUrl), undefined);
    }

    // 3. Если отправка фото не удалась (например, Telegram не смог скачать URL) — пробуем как текстовое сообщение
    if (!data.ok && imageUrl) {
      console.warn('[crosspost:telegram] Photo sending failed, falling back to sendMessage:', data.description);
      data = await sendTelegram(false, 'HTML');
      if (!data.ok && typeof data.description === 'string' && data.description.includes("can't parse entities")) {
        data = await sendTelegram(false, undefined);
      }
    }

    if (!data.ok) {
      console.error('[crosspost:telegram] Telegram send failed:', data);
      return null;
    }

    return {
      messageId: data.result.message_id,
      chatId: String(data.result.chat.id),
      bot: botIdent,
    };
  } catch (error) {
    console.error('[crosspost:telegram] Exception:', error);
    return null;
  }
}

/**
 * Dispatches publication event to external Osiris or Pierrot webhook if configured
 */
async function dispatchWebhook(
  webhookUrl: string | undefined,
  apiKey: string | undefined,
  payload: CrosspostPayload
): Promise<{ ok: boolean; status?: number; error?: string } | null> {
  if (!webhookUrl) return null;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        event: 'flow.item.published',
        timestamp: new Date().toISOString(),
        item: payload,
      }),
      signal: AbortSignal.timeout(7000),
    });

    return {
      ok: res.ok,
      status: res.status,
    };
  } catch (error: any) {
    console.warn(`[crosspost:webhook] Dispatch to ${webhookUrl} failed:`, error?.message);
    return {
      ok: false,
      error: error?.message || 'Network error',
    };
  }
}

/**
 * Unified entrypoint to crosspost an item to all configured channels (Telegram/Pierrot/Osiris & Bluesky)
 */
export async function crosspostFlowItem(item: CrosspostPayload): Promise<CrosspostResult> {
  const result: CrosspostResult = {};

  // Extract media references
  const metadata = item.metadata ?? {};
  const imageUrl =
    item.imageUrl ||
    (typeof metadata.public_url === 'string' ? metadata.public_url : null) ||
    (typeof metadata.image === 'string' ? metadata.image : null);

  const youtubeUrl =
    item.youtubeUrl ||
    (typeof metadata.youtube === 'object' && metadata.youtube !== null && 'video_id' in metadata.youtube
      ? `https://www.youtube.com/watch?v=${(metadata.youtube as any).video_id}`
      : null);

  const payload: CrosspostPayload = {
    ...item,
    imageUrl,
    youtubeUrl,
  };

  // Run crossposts in parallel
  const [bskyResult, tgResult, osirisRes, pierrotRes] = await Promise.all([
    publishToBluesky({
      title: payload.title,
      body_md: payload.body_md,
      source_url: payload.source_url,
      slug: payload.slug,
      lang: payload.lang,
      imageUrl: payload.imageUrl,
      description: typeof metadata.description === 'string' ? metadata.description : null,
    }).catch((err) => {
      console.error('[crosspost] Bluesky publish failed:', err);
      return null;
    }),

    publishTelegram(payload).catch((err) => {
      console.error('[crosspost] Telegram publish failed:', err);
      return null;
    }),

    dispatchWebhook(
      process.env.OSIRIS_WEBHOOK_URL || process.env.OSIRIS_API_URL,
      process.env.OSIRIS_API_KEY,
      payload
    ),

    dispatchWebhook(
      process.env.PIERROT_WEBHOOK_URL,
      process.env.PIERROT_API_KEY,
      payload
    ),
  ]);

  result.bluesky = bskyResult;
  result.telegram = tgResult;
  result.osirisWebhook = osirisRes;
  result.pierrotWebhook = pierrotRes;

  // Persist external references back into Supabase items table
  const supabase = getSupabaseAdmin();
  if (supabase && item.id) {
    const updateData: Record<string, unknown> = {
      metadata: {
        ...metadata,
        crosspost: {
          telegram: tgResult,
          bluesky: bskyResult,
          osiris: osirisRes,
          pierrot: pierrotRes,
          crossposted_at: new Date().toISOString(),
        },
      },
    };

    if (bskyResult) {
      updateData.bluesky_uri = bskyResult.uri;
      updateData.bluesky_cid = bskyResult.cid;
    }

    if (tgResult) {
      updateData.telegram_message_id = tgResult.messageId;
      updateData.telegram_channel_id = tgResult.chatId;
    }

    await supabase.from('items').update(updateData).eq('id', item.id);
  }

  return result;
}
