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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format and enrich text for Telegram publication
 */
async function formatTelegramMessage(
  title: string | null | undefined,
  body_md: string | null | undefined,
  flowUrl: string,
  lang: string = 'ru'
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  let rawContent = title?.trim() ? `<b>${escapeHtml(title.trim())}</b>\n\n` : '';
  if (body_md) {
    const cleanBody = body_md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
      .replace(/[#*_`~]/g, '')
      .trim();
    rawContent += cleanBody;
  }

  if (flowUrl) {
    rawContent += `\n\n${flowUrl}`;
  }

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
            content: `You are an elite AI editor for Anton Merkurov's publication network Unframed/Flow. Format the text beautifully for Telegram using clean HTML tags (<b>, <i>, <code>, <a>). Do not use markdown. Include the link cleanly. Add 2-3 precise hashtags at the end in ${lang}. Return ONLY valid HTML.`,
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
 * Publishes post to Telegram channel via Bot API without frontend buttons
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
  const rawChannelId =
    process.env.TELEGRAM_CHANNEL_ID ||
    process.env.PIERROT_CHANNEL_ID ||
    process.env.OSIRIS_CHANNEL_ID;

  if (!botToken || !rawChannelId) {
    console.warn(
      '[crosspost:telegram] Missing bot token or channel ID. Provide TELEGRAM_BOT_TOKEN (or PIERROT_BOT_TOKEN) and TELEGRAM_CHANNEL_ID.'
    );
    return null;
  }

  // Normalize channel ID: must start with '@' or '-' (numeric ID)
  const channelId =
    rawChannelId.startsWith('@') || rawChannelId.startsWith('-')
      ? rawChannelId
      : `@${rawChannelId}`;

  const botIdent: 'pierrot' | 'osiris' | 'default' = pierrotToken
    ? 'pierrot'
    : osirisToken
      ? 'osiris'
      : 'default';

  try {
    const flowUrl = slug
      ? `https://www.merkurov.love/flow/${encodeURIComponent(slug)}`
      : 'https://www.merkurov.love/flow';

    const formattedText = await formatTelegramMessage(title, body_md, flowUrl, lang);

    // Убеждаемся, что URL изображения абсолютный
    const validPhotoUrl =
      imageUrl && imageUrl.startsWith('http')
        ? imageUrl
        : imageUrl && imageUrl.startsWith('/')
          ? `https://www.merkurov.love${imageUrl}`
          : null;

    // Функция отправки с обработкой ошибок и фоллбэками
    const sendTelegram = async (usePhoto: boolean, parseMode?: 'HTML'): Promise<any> => {
      let endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
      let payload: any = {
        chat_id: channelId,
        text: formattedText,
        disable_web_page_preview: false,
      };

      if (parseMode) {
        payload.parse_mode = parseMode;
      }

      if (usePhoto && validPhotoUrl) {
        endpoint = `https://api.telegram.org/bot${botToken}/sendPhoto`;
        payload = {
          chat_id: channelId,
          photo: validPhotoUrl,
          caption: formattedText.slice(0, 1024),
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
    let data = await sendTelegram(Boolean(validPhotoUrl), 'HTML');

    // 2. Если ошибка парсинга HTML-тегов — повторяем без parse_mode как чистый текст
    if (
      !data.ok &&
      typeof data.description === 'string' &&
      data.description.includes("can't parse entities")
    ) {
      console.warn('[crosspost:telegram] HTML entity parse error, retrying as plain text...');
      data = await sendTelegram(Boolean(validPhotoUrl), undefined);
    }

    // 3. Если отправка фото не удалась — пробуем как текстовое сообщение
    if (!data.ok && validPhotoUrl) {
      console.warn(
        '[crosspost:telegram] Photo sending failed, falling back to sendMessage:',
        data.description
      );
      data = await sendTelegram(false, 'HTML');
      if (
        !data.ok &&
        typeof data.description === 'string' &&
        data.description.includes("can't parse entities")
      ) {
        data = await sendTelegram(false, undefined);
      }
    }

    if (!data.ok) {
      console.error('[crosspost:telegram] Telegram send failed:', data);
      return null;
    }

    console.info(
      `[crosspost:telegram] Successfully posted to Telegram channel ${channelId}, msg_id: ${data.result.message_id}`
    );

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
 * Unified entrypoint to crosspost an item to all configured channels (Telegram & Bluesky) via API
 */
export async function crosspostFlowItem(item: CrosspostPayload): Promise<CrosspostResult> {
  const result: CrosspostResult = {};

  // Extract media references from payload or metadata
  const metadata = item.metadata ?? {};
  const rawImage =
    item.imageUrl ||
    (typeof metadata.public_url === 'string' ? metadata.public_url : null) ||
    (typeof metadata.image === 'string' ? metadata.image : null) ||
    (typeof metadata.image_url === 'string' ? metadata.image_url : null) ||
    (typeof metadata.og_image === 'string' ? metadata.og_image : null) ||
    (typeof (metadata as any)?.link_preview?.image === 'string'
      ? (metadata as any).link_preview.image
      : null) ||
    (Array.isArray((metadata as any)?.images) && (metadata as any).images.length > 0
      ? (metadata as any).images[0]
      : null);

  const imageUrl =
    rawImage && typeof rawImage === 'string'
      ? rawImage.startsWith('http')
        ? rawImage
        : rawImage.startsWith('/')
          ? `https://www.merkurov.love${rawImage}`
          : null
      : null;

  const youtubeUrl =
    item.youtubeUrl ||
    (typeof metadata.youtube === 'object' &&
    metadata.youtube !== null &&
    'video_id' in metadata.youtube
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
      console.error('[crosspost:bluesky] Publish failed:', err);
      return null;
    }),

    publishTelegram(payload).catch((err) => {
      console.error('[crosspost:telegram] Publish failed:', err);
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

  // Persist external references back into Supabase items table safely
  const supabase = getSupabaseAdmin();
  if (supabase && item.id) {
    const updatedMetadata = {
      ...metadata,
      bluesky_uri: bskyResult?.uri || (metadata as any)?.bluesky_uri || null,
      bluesky_cid: bskyResult?.cid || (metadata as any)?.bluesky_cid || null,
      telegram_message_id: tgResult?.messageId || (metadata as any)?.telegram_message_id || null,
      telegram_channel_id: tgResult?.chatId || (metadata as any)?.telegram_channel_id || null,
      crosspost: {
        telegram: tgResult,
        bluesky: bskyResult,
        osiris: osirisRes,
        pierrot: pierrotRes,
        crossposted_at: new Date().toISOString(),
      },
    };

    const fullUpdate: Record<string, unknown> = {
      metadata: updatedMetadata,
    };

    if (bskyResult) {
      fullUpdate.bluesky_uri = bskyResult.uri;
      fullUpdate.bluesky_cid = bskyResult.cid;
    }

    if (tgResult) {
      fullUpdate.telegram_message_id = tgResult.messageId;
      fullUpdate.telegram_channel_id = tgResult.chatId;
    }

    // Try full update first, fallback to metadata-only update if columns don't exist
    const { error: updateErr } = await supabase
      .from('items')
      .update(fullUpdate)
      .eq('id', item.id);

    if (updateErr) {
      console.warn(
        '[crosspost] Full column update skipped, saving references inside metadata:',
        updateErr.message
      );
      await supabase
        .from('items')
        .update({ metadata: updatedMetadata })
        .eq('id', item.id);
    }
  }

  return result;
}
