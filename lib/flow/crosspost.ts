
import { publishToBluesky } from '@/lib/bluesky';
import { createClient } from '@supabase/supabase-js';

type UnknownRecord = Record<string, unknown>;

export type CrosspostPayload = {
  id: string;
  title?: string | null;
  type?: string | null;
  body_md?: string | null;
  source_url?: string | null;
  slug?: string | null;
  lang?: string;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  youtubeUrl?: string | null;
  metadata?: UnknownRecord | null;
  description?: string | null;
};

export type CrosspostResult = {
  bluesky?: { uri: string; cid: string } | null;
  telegram?: {
    messageId: number;
    chatId: string;
    bot: 'pierrot' | 'osiris' | 'default';
  } | null;
  osirisWebhook?: { ok: boolean; status?: number; error?: string } | null;
  pierrotWebhook?: { ok: boolean; status?: number; error?: string } | null;
};

const SITE_ORIGIN = 'https://www.merkurov.love';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Converts a site-relative or absolute HTTP(S) URL to an absolute URL.
 * Invalid protocols and malformed URLs are rejected.
 */
function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, SITE_ORIGIN);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Supports legacy single-image fields and arrays of image objects or URLs.
 * The first image remains the fallback for channels that accept only one photo.
 */
function collectImageUrls(
  item: CrosspostPayload,
  metadata: UnknownRecord
): string[] {
  const candidates: unknown[] = [];

  if (Array.isArray(item.imageUrls)) {
    candidates.push(...item.imageUrls);
  }

  if (item.imageUrl) {
    candidates.push(item.imageUrl);
  }

  const singleImageKeys = [
    'public_url',
    'publicUrl',
    'image',
    'image_url',
    'imageUrl',
    'og_image',
    'ogImage',
    'thumbnail_url',
    'thumbnailUrl',
  ];

  for (const key of singleImageKeys) {
    if (metadata[key]) candidates.push(metadata[key]);
  }

  const preview = metadata.link_preview ?? metadata.linkPreview;

  if (isRecord(preview)) {
    candidates.push(
      preview.image,
      preview.image_url,
      preview.imageUrl,
      preview.thumbnail,
      preview.thumbnail_url
    );
  }

  const images = metadata.images;

  if (Array.isArray(images)) {
    for (const image of images) {
      if (typeof image === 'string') {
        candidates.push(image);
        continue;
      }

      if (!isRecord(image)) continue;

      candidates.push(
        image.url,
        image.public_url,
        image.publicUrl,
        image.image_url,
        image.imageUrl,
        image.src,
        image.path
      );
    }
  }

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const url = normalizeUrl(candidate);
    if (!url || seen.has(url)) continue;

    seen.add(url);
    unique.push(url);
  }

  // Bluesky supports up to four images in a single image embed.
  return unique.slice(0, 4);
}

function getYouTubeUrl(
  item: CrosspostPayload,
  metadata: UnknownRecord
): string | null {
  const direct = normalizeUrl(item.youtubeUrl);
  if (direct) return direct;

  const youtube = metadata.youtube;

  if (isRecord(youtube) && typeof youtube.video_id === 'string') {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(youtube.video_id)}`;
  }

  const candidates = [
    metadata.youtube_url,
    metadata.youtubeUrl,
    metadata.video_url,
    metadata.videoUrl,
    item.source_url,
  ];

  for (const candidate of candidates) {
    const url = normalizeUrl(candidate);
    if (!url) continue;

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      if (
        host === 'youtu.be' ||
        host.endsWith('.youtu.be') ||
        host === 'youtube.com' ||
        host.endsWith('.youtube.com')
      ) {
        return url;
      }
    } catch {
      // Continue checking other candidates.
    }
  }

  return null;
}

function getFlowUrl(slug?: string | null): string {
  return slug
    ? `${SITE_ORIGIN}/flow/${encodeURIComponent(slug)}`
    : `${SITE_ORIGIN}/flow`;
}

/**
 * Formats a Flow item for Telegram.
 * DeepSeek is optional: when unavailable, the original cleaned text is used.
 */
async function formatTelegramMessage(
  title: string | null | undefined,
  bodyMd: string | null | undefined,
  flowUrl: string,
  lang = 'ru'
): Promise<string> {
  const cleanTitle = (title || '').trim();
  const rawBody = (bodyMd || '').trim();
  const cleanBody = rawBody
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')
    .replace(/[#*_`~]/g, '')
    .trim();

  const isRedundantTitle =
    !cleanTitle ||
    cleanTitle.toLowerCase() === cleanBody.toLowerCase() ||
    cleanBody.toLowerCase().startsWith(cleanTitle.toLowerCase());

  let rawContent = (!isRedundantTitle && cleanTitle)
    ? `<b>${escapeHtml(cleanTitle)}</b>\n\n`
    : '';

  if (cleanBody) {
    rawContent += escapeHtml(cleanBody);
  }

  rawContent += `\n\n${escapeHtml(flowUrl)}`;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !rawContent.trim()) return rawContent;

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
              `Format the supplied publication for Telegram using only valid HTML ` +
              `tags <b>, <i>, <code>, and <a>. Preserve its meaning and URLs. ` +
              `Do not invent facts or links. Add at most 2 relevant hashtags in ${lang}. ` +
              `Return only the formatted message.`,
          },
          {
            role: 'user',
            content: rawContent.slice(0, 2500),
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(7000),
    });

    if (!response.ok) {
      console.warn('[crosspost:telegram] DeepSeek returned HTTP', response.status);
      return rawContent;
    }

    const data = await response.json();
    const formatted = data.choices?.[0]?.message?.content?.trim();

    // Do not replace the message with an empty or non-string response.
    return typeof formatted === 'string' && formatted ? formatted : rawContent;
  } catch (error) {
    console.warn('[crosspost:telegram] DeepSeek formatting fallback:', error);
    return rawContent;
  }
}

/**
 * Publishes a Flow item to Telegram.
 * Telegram sendPhoto accepts one image, so the first valid image is used.
 * Bluesky receives the full image array separately.
 */
async function publishTelegram(
  item: CrosspostPayload,
  imageUrls: string[]
): Promise<CrosspostResult['telegram']> {
  const pierrotToken = process.env.PIERROT_BOT_TOKEN;
  const osirisToken = process.env.OSIRIS_BOT_TOKEN;
  const defaultToken = process.env.TELEGRAM_BOT_TOKEN;

  const botToken = pierrotToken || osirisToken || defaultToken;
  const rawChannelId =
    process.env.TELEGRAM_CHANNEL_ID ||
    process.env.PIERROT_CHANNEL_ID ||
    process.env.OSIRIS_CHANNEL_ID;

  if (!botToken || !rawChannelId) {
    console.info(
      '[crosspost:telegram] Skipped: bot token or channel ID is not configured.'
    );
    return null;
  }

  const channelId =
    rawChannelId.startsWith('@') || rawChannelId.startsWith('-')
      ? rawChannelId
      : `@${rawChannelId}`;

  const bot: 'pierrot' | 'osiris' | 'default' = pierrotToken
    ? 'pierrot'
    : osirisToken
      ? 'osiris'
      : 'default';

  const flowUrl = getFlowUrl(item.slug);
  const formattedText = await formatTelegramMessage(
    item.title,
    item.body_md,
    flowUrl,
    item.lang || 'ru'
  );

  const photoUrl = imageUrls[0] ?? null;

  async function sendMessage(
    withPhoto: boolean,
    parseMode: 'HTML' | undefined
  ): Promise<any> {
    const endpoint = withPhoto && photoUrl ? 'sendPhoto' : 'sendMessage';
    const payload: Record<string, unknown> = {
      chat_id: channelId,
      ...(withPhoto && photoUrl
        ? {
            photo: photoUrl,
            caption: formattedText.slice(0, 1024),
          }
        : {
            text: formattedText.slice(0, 4096),
            disable_web_page_preview: false,
          }),
      ...(parseMode ? { parse_mode: parseMode } : {}),
    };

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/${endpoint}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      }
    );

    return response.json();
  }

  // If multiple images are provided, send a native Telegram media album
  if (imageUrls.length > 1) {
    const media = imageUrls.slice(0, 10).map((url, i) => ({
      type: 'photo',
      media: url,
      ...(i === 0
        ? {
            caption: formattedText.slice(0, 1024),
            parse_mode: 'HTML',
          }
        : {}),
    }));

    try {
      const groupRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: channelId, media }),
          signal: AbortSignal.timeout(15000),
        }
      );
      const groupData = await groupRes.json();
      if (
        groupData.ok &&
        Array.isArray(groupData.result) &&
        groupData.result.length > 0
      ) {
        console.info('[crosspost:telegram] Published media group album:', {
          channelId,
          messageId: groupData.result[0].message_id,
          photoCount: media.length,
        });
        return {
          messageId: groupData.result[0].message_id,
          chatId: String(groupData.result[0].chat.id),
          bot,
        };
      } else {
        console.warn(
          '[crosspost:telegram] sendMediaGroup returned non-ok, falling back to single photo/message:',
          groupData.description
        );
      }
    } catch (groupError) {
      console.warn(
        '[crosspost:telegram] sendMediaGroup exception, falling back:',
        groupError
      );
    }
  }

  try {
    let data = await sendMessage(Boolean(photoUrl), 'HTML');

    if (
      !data.ok &&
      typeof data.description === 'string' &&
      data.description.includes("can't parse entities")
    ) {
      console.warn('[crosspost:telegram] HTML parsing failed; retrying as plain text.');
      data = await sendMessage(Boolean(photoUrl), undefined);
    }

    if (!data.ok && photoUrl) {
      console.warn(
        '[crosspost:telegram] Photo send failed; falling back to text:',
        data.description
      );

      data = await sendMessage(false, 'HTML');

      if (
        !data.ok &&
        typeof data.description === 'string' &&
        data.description.includes("can't parse entities")
      ) {
        data = await sendMessage(false, undefined);
      }
    }

    if (!data.ok || !data.result) {
      console.error('[crosspost:telegram] Send failed:', {
        status: data.error_code,
        description: data.description,
      });
      return null;
    }

    console.info('[crosspost:telegram] Published:', {
      channelId,
      messageId: data.result.message_id,
      usedPhoto: Boolean(photoUrl && data.result.photo),
    });

    return {
      messageId: data.result.message_id,
      chatId: String(data.result.chat.id),
      bot,
    };
  } catch (error) {
    console.error('[crosspost:telegram] Exception:', error);
    return null;
  }
}

/**
 * Sends the publication event to a configured external webhook.
 */
async function dispatchWebhook(
  webhookUrl: string | undefined,
  apiKey: string | undefined,
  payload: CrosspostPayload
): Promise<{ ok: boolean; status?: number; error?: string } | null> {
  if (!webhookUrl) return null;

  try {
    const response = await fetch(webhookUrl, {
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

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      console.warn('[crosspost:webhook] Non-success response:', {
        url: webhookUrl,
        status: response.status,
        body: responseText.slice(0, 500),
      });
    }

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';

    console.warn('[crosspost:webhook] Dispatch failed:', {
      url: webhookUrl,
      error: message,
    });

    return {
      ok: false,
      error: message,
    };
  }
}

/**
 * Crossposts a published Flow item to Bluesky, Telegram, and configured webhooks.
 * Each channel runs independently so a failure on one channel does not block others.
 */
export async function crosspostFlowItem(
  item: CrosspostPayload
): Promise<CrosspostResult> {
  const metadata: UnknownRecord = isRecord(item.metadata) ? item.metadata : {};
  const imageUrls = collectImageUrls(item, metadata);
  const youtubeUrl = getYouTubeUrl(item, metadata);

  const payload: CrosspostPayload = {
    ...item,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    youtubeUrl,
    metadata,
    description:
      item.description ||
      (typeof metadata.description === 'string' ? metadata.description : null),
  };

  console.info('[crosspost] Starting publication:', {
    itemId: item.id,
    type: item.type || 'unknown',
    imageCount: imageUrls.length,
    hasYouTube: Boolean(youtubeUrl),
    hasSourceUrl: Boolean(item.source_url),
  });

  const [blueskyResult, telegramResult, osirisResult, pierrotResult] =
    await Promise.all([
      publishToBluesky({
        title: payload.title,
        type: payload.type,
        body_md: payload.body_md,
        source_url: payload.source_url,
        slug: payload.slug,
        lang: payload.lang,
        imageUrl: payload.imageUrl,
        imageUrls,
        youtubeUrl,
        metadata,
        description: payload.description,
      }).catch((error) => {
        console.error('[crosspost:bluesky] Publish failed:', error);
        return null;
      }),

      publishTelegram(payload, imageUrls).catch((error) => {
        console.error('[crosspost:telegram] Publish failed:', error);
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

  const result: CrosspostResult = {
    bluesky: blueskyResult,
    telegram: telegramResult,
    osirisWebhook: osirisResult,
    pierrotWebhook: pierrotResult,
  };

  // Persist results for visibility and later diagnostics.
  const supabase = getSupabaseAdmin();

  if (supabase && item.id) {
    const previousCrosspost = isRecord(metadata.crosspost)
      ? metadata.crosspost
      : {};

    const updatedMetadata: UnknownRecord = {
      ...metadata,
      bluesky_uri:
        blueskyResult?.uri ??
        (typeof metadata.bluesky_uri === 'string' ? metadata.bluesky_uri : null),
      bluesky_cid:
        blueskyResult?.cid ??
        (typeof metadata.bluesky_cid === 'string' ? metadata.bluesky_cid : null),
      telegram_message_id:
        telegramResult?.messageId ??
        metadata.telegram_message_id ??
        null,
      telegram_channel_id:
        telegramResult?.chatId ??
        metadata.telegram_channel_id ??
        null,
      crosspost: {
        ...previousCrosspost,
        telegram: telegramResult,
        bluesky: blueskyResult,
        osiris: osirisResult,
        pierrot: pierrotResult,
        image_count: imageUrls.length,
        attempted_at: new Date().toISOString(),
      },
    };

    const fullUpdate: Record<string, unknown> = {
      metadata: updatedMetadata,
    };

    if (blueskyResult) {
      fullUpdate.bluesky_uri = blueskyResult.uri;
      fullUpdate.bluesky_cid = blueskyResult.cid;
    }

    if (telegramResult) {
      fullUpdate.telegram_message_id = telegramResult.messageId;
      fullUpdate.telegram_channel_id = telegramResult.chatId;
    }

    const { error: updateError } = await supabase
      .from('items')
      .update(fullUpdate)
      .eq('id', item.id);

    if (updateError) {
      console.warn(
        '[crosspost] Could not update all columns; retrying metadata only:',
        updateError.message
      );

      const { error: metadataError } = await supabase
        .from('items')
        .update({ metadata: updatedMetadata })
        .eq('id', item.id);

      if (metadataError) {
        console.error(
          '[crosspost] Failed to persist crosspost metadata:',
          metadataError.message
        );
      }
    }
  } else {
    console.info(
      '[crosspost] Supabase persistence skipped: admin credentials or item ID missing.'
    );
  }

  console.info('[crosspost] Finished:', {
    itemId: item.id,
    bluesky: Boolean(blueskyResult),
    telegram: Boolean(telegramResult),
    osirisWebhook: osirisResult?.ok ?? null,
    pierrotWebhook: pierrotResult?.ok ?? null,
  });

  return result;
}
