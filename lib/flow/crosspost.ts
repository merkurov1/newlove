
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
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
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

function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
 * Remove hashtags from visible message text without changing URLs
 * or HTML attributes.
 */
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

/**
 * Convert visible bare URLs to clickable domain labels.
 * Existing HTML tags and link destinations are preserved.
 */
function linkifyBareUrls(html: string): string {
  return html
    .split(/(<[^>]*>)/g)
    .map((part) => {
      if (part.startsWith('<') && part.endsWith('>')) return part;

      return part.replace(
        /https?:\/\/[^\s<>"']+/gi,
        (rawUrl) => {
          const trailing = rawUrl.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
          const candidate = trailing
            ? rawUrl.slice(0, -trailing.length)
            : rawUrl;

          const url = normalizeUrl(candidate);
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
        }
      );
    })
    .join('');
}

/**
 * Converts common Markdown used in Flow into Telegram HTML.
 * Visible text is escaped; Markdown links become named clickable links.
 */
function markdownToTelegramHtml(markdown: string): string {
  const links: string[] = [];

  let text = markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, label: string, rawUrl: string) => {
        const url = normalizeUrl(rawUrl);
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
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([\s\S]+?)__/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<i>$2</i>');

  links.forEach((link, index) => {
    text = text.replace(`FLOWLINKTOKEN${index}END`, link);
  });

  return text.trim();
}

/**
 * Supports legacy single-image fields and arrays of image objects or URLs.
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

  const previews = Array.isArray(metadata.link_previews)
    ? metadata.link_previews
    : Array.isArray(metadata.linkPreviews)
      ? metadata.linkPreviews
      : [];

  for (const p of previews) {
    if (isRecord(p)) {
      candidates.push(
        p.image,
        p.image_url,
        p.imageUrl,
        p.thumbnail,
        p.thumbnail_url
      );
    }
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
 *
 * DeepSeek may adapt the text, but the application enforces the no-hashtag
 * rule and converts visible bare URLs to clickable labels afterward.
 */
async function formatTelegramMessage(
  title: string | null | undefined,
  bodyMd: string | null | undefined,
  flowUrl: string,
  lang = 'ru',
  sourceUrl?: string | null
): Promise<string> {
  const cleanTitle = (title || '').trim();
  const rawBody = (bodyMd || '').trim();
  const cleanSourceUrl = normalizeUrl(sourceUrl);
  const safeFlowUrl = normalizeUrl(flowUrl) || `${SITE_ORIGIN}/flow`;

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

  if (cleanBody) {
    rawContent += cleanBody;
  }

  if (cleanSourceUrl) {
    rawContent +=
      `${rawContent ? '\n\n' : ''}` +
      `<a href="${escapeHtmlAttribute(cleanSourceUrl)}">Источник</a>`;
  }

  rawContent +=
    `${rawContent ? '\n\n' : ''}` +
    `<a href="${escapeHtmlAttribute(safeFlowUrl)}">Читать на merkurov.love</a>`;

  const fallback = () =>
    stripTelegramHashtags(linkifyBareUrls(rawContent));

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !rawContent.trim()) return fallback();

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
              `Do not add hashtags, emojis, calls to action, facts, or links. ` +
              `Preserve every existing HTML link and its destination exactly. ` +
              `Use only these HTML tags: <b>, <i>, <code>, and <a>. ` +
              `Do not output raw URLs when a named clickable link is possible. ` +
              `Return only the final message, without commentary.`,
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
      console.warn(
        '[crosspost:telegram] DeepSeek returned HTTP',
        response.status
      );
      return fallback();
    }

    const data = await response.json();
    const formatted = data.choices?.[0]?.message?.content?.trim();

    if (typeof formatted !== 'string' || !formatted) {
      return fallback();
    }

    return stripTelegramHashtags(linkifyBareUrls(formatted));
  } catch (error) {
    console.warn(
      '[crosspost:telegram] DeepSeek formatting fallback:',
      error
    );

    return fallback();
  }
}

/**
 * Publishes a Flow item to Telegram.
 * Short text is attached to an image or album; long text is sent separately.
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

  const rawSourceUrl =
    item.source_url ||
    (isRecord(item.metadata?.link_preview)
      ? item.metadata.link_preview.url
      : null) ||
    (isRecord(item.metadata?.linkPreview)
      ? item.metadata.linkPreview.url
      : null);

  const sourceUrl = normalizeUrl(rawSourceUrl);
  const flowUrl = getFlowUrl(item.slug);

  const formattedText = await formatTelegramMessage(
    item.title,
    item.body_md,
    flowUrl,
    item.lang || 'ru',
    sourceUrl
  );

  const photoUrl = imageUrls[0] ?? null;
  const hasImages = imageUrls.length > 0;

  // Keep some margin for Telegram's 1024-character caption limit.
  const CAPTION_LIMIT = 900;
  const useSeparateText = formattedText.length > CAPTION_LIMIT;

  async function sendMessage(
    withPhoto: boolean,
    parseMode: 'HTML' | undefined,
    messageText = formattedText,
    includeCaption = true
  ): Promise<any> {
    const usePhoto = withPhoto && Boolean(photoUrl);
    const endpoint = usePhoto ? 'sendPhoto' : 'sendMessage';

    const payload: Record<string, unknown> = {
      chat_id: channelId,
      ...(usePhoto
        ? {
            photo: photoUrl,
            ...(includeCaption
              ? { caption: messageText.slice(0, 1024) }
              : {}),
          }
        : {
            text: messageText.slice(0, 4096),
            link_preview_options: { is_disabled: true },
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

  // Send a native Telegram album when there are multiple images.
  if (imageUrls.length > 1) {
    const media = imageUrls.slice(0, 10).map((url, index) => ({
      type: 'photo',
      media: url,
      ...(index === 0 && !useSeparateText
        ? {
            caption: formattedText,
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
        const firstMessage = groupData.result[0];

        if (useSeparateText) {
          const textData = await sendMessage(false, 'HTML', formattedText);

          if (!textData.ok) {
            console.error(
              '[crosspost:telegram] Album sent, but text delivery failed:',
              textData.description
            );
          }
        }

        console.info('[crosspost:telegram] Published media group album:', {
          channelId,
          messageId: firstMessage.message_id,
          photoCount: media.length,
          textSentSeparately: useSeparateText,
        });

        return {
          messageId: firstMessage.message_id,
          chatId: String(firstMessage.chat.id),
          bot,
        };
      }

      console.warn(
        '[crosspost:telegram] sendMediaGroup failed; falling back:',
        groupData.description
      );
    } catch (groupError) {
      console.warn(
        '[crosspost:telegram] sendMediaGroup exception; falling back:',
        groupError
      );
    }
  }

  try {
    let data: any;

    if (hasImages && useSeparateText) {
      // Send the image without a caption, then send the complete text.
      data = await sendMessage(true, undefined, '', false);

      if (data.ok && data.result) {
        const textData = await sendMessage(false, 'HTML', formattedText);

        if (!textData.ok) {
          console.error(
            '[crosspost:telegram] Photo sent, but text delivery failed:',
            textData.description
          );
        }
      }
    } else {
      data = await sendMessage(hasImages, 'HTML', formattedText);
    }

    if (
      !data?.ok &&
      typeof data?.description === 'string' &&
      data.description.includes("can't parse entities")
    ) {
      console.warn(
        '[crosspost:telegram] HTML parsing failed; retrying without HTML.'
      );

      data = await sendMessage(
        hasImages && !useSeparateText,
        undefined,
        formattedText,
        !useSeparateText
      );
    }

    if (!data?.ok || !data.result) {
      console.error('[crosspost:telegram] Send failed:', {
        status: data?.error_code,
        description: data?.description,
      });
      return null;
    }

    console.info('[crosspost:telegram] Published:', {
      channelId,
      messageId: data.result.message_id,
      usedPhoto: Boolean(data.result.photo),
      textSentSeparately: useSeparateText,
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
