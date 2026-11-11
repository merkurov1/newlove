/**
 * Telegram delivery for Flow.
 *
 * Composition is handled by `telegramComposition.ts`. This module only sends
 * the deterministic plan, preserves delivery/resume state, and keeps the
 * existing bot/channel configuration.
 */

import type { FlowContent } from './content';
import {
  composeTelegramPublication,
  stripHtml,
  type TelegramComposition,
  type TelegramMedia,
  type TelegramMediaBatch,
} from './telegramComposition';

export {
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_MEDIA_GROUP_LIMIT,
  TELEGRAM_SAFE_CAPTION_LIMIT,
  TELEGRAM_SAFE_TEXT_LIMIT,
  TELEGRAM_TEXT_LIMIT,
  composeTelegramPublication,
  escapeHtml,
  escapeHtmlAttribute,
  formatTelegramMessage,
  markdownToTelegramHtml,
  splitTelegramHtml,
  stripHtml,
  takeTelegramHtmlHead,
  ensureTelegramLinks,
  FLOW_LINK_LABEL,
  telegramFlowLabel,
  telegramLanguage,
  telegramSourceLabel,
  telegramVideoLabel,
} from './telegramComposition';

export type {
  TelegramComposition,
  TelegramMedia,
  TelegramMediaBatch,
};

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
  result?: unknown;
  description?: string;
  errorCode?: number;
  uncertain?: boolean;
};

type TelegramApiResponse = {
  ok?: boolean;
  result?: unknown;
  description?: unknown;
  error_code?: unknown;
};

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

    const data = (await response.json().catch(() => null)) as TelegramApiResponse | null;

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

function collectMessages(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  return result ? [result] : [];
}

function messageIdsFrom(result: unknown): number[] {
  return collectMessages(result)
    .map((message) => {
      if (typeof message !== 'object' || message === null) return null;
      const id = (message as { message_id?: unknown }).message_id;
      return typeof id === 'number' ? id : null;
    })
    .filter((id): id is number => id !== null);
}

function chatIdFrom(result: unknown): string | undefined {
  const first = collectMessages(result)[0];
  if (typeof first !== 'object' || first === null) return undefined;
  const chat = (first as { chat?: { id?: unknown } }).chat;
  const id = chat?.id;
  return typeof id === 'number' || typeof id === 'string' ? String(id) : undefined;
}

function isParseError(outcome: SendOutcome): boolean {
  return (
    !outcome.ok &&
    typeof outcome.description === 'string' &&
    outcome.description.includes("can't parse entities")
  );
}

function clamp(value: unknown, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function mediaGroupCaption(composition: TelegramComposition): string | null {
  if (!composition.media.length) return null;
  return composition.mediaCaption;
}

/**
 * Publish normalized Flow content to Telegram.
 *
 * The same composition object is used for validation, preview and delivery.
 * Existing per-channel resume state is honoured: already-sent media URLs are
 * skipped and text parts continue from the confirmed index.
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

  const composition = composeTelegramPublication(content);

  if (!composition.validation.ok) {
    return {
      ok: false,
      messageIds: [],
      textPartsSent: 0,
      sentImageUrls: [],
      failedImages: 0,
      error: `Telegram composition validation failed: ${composition.validation.errors.join(' ')}`,
      uncertain: false,
    };
  }

  const deps = options.deps ?? {};
  const resume = options.resume ?? {};
  const resumeTextParts = clamp(resume.textParts, 0, composition.textPartCount);
  const alreadySentMedia = new Set(
    (resume.imageUrls ?? []).filter((url): url is string => typeof url === 'string')
  );

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

  const sendTextPart = async (
    html: string,
    allowPreview = false,
    previewUrl?: string
  ): Promise<boolean> => {
    const previewOptions =
      allowPreview && previewUrl
        ? { url: previewUrl, prefer_large_media: true }
        : { is_disabled: true };

    let outcome = await callTelegram(
      botToken,
      'sendMessage',
      {
        chat_id: channelId,
        text: html,
        parse_mode: 'HTML',
        link_preview_options: previewOptions,
      },
      deps
    );

    if (isParseError(outcome)) {
      outcome = await callTelegram(
        botToken,
        'sendMessage',
        {
          chat_id: channelId,
          text: stripHtml(html),
          link_preview_options: previewOptions,
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
    item: TelegramMedia,
    photoUrl: string,
    caption?: string,
    showCaptionAboveMedia = false
  ): Promise<boolean> => {
    const basePayload: Record<string, unknown> = {
      chat_id: channelId,
      photo: photoUrl,
    };

    if (caption) {
      basePayload.caption = caption;
      basePayload.parse_mode = 'HTML';
      if (showCaptionAboveMedia) basePayload.show_caption_above_media = true;
    }

    let outcome = await callTelegram(botToken, 'sendPhoto', basePayload, deps);

    if (isParseError(outcome) && caption) {
      outcome = await callTelegram(
        botToken,
        'sendPhoto',
        {
          chat_id: channelId,
          photo: photoUrl,
          caption: stripHtml(caption),
          ...(showCaptionAboveMedia ? { show_caption_above_media: true } : {}),
        },
        deps
      );
    }

    if (!outcome.ok) {
      firstError = firstError ?? outcome.description ?? 'Telegram photo failed.';
      uncertain = uncertain || Boolean(outcome.uncertain);
      failedImages += 1;
      return false;
    }

    sentImageUrls.push(item.url);
    remember(outcome.result);
    return true;
  };

  const sendVideo = async (
    item: TelegramMedia,
    caption?: string
  ): Promise<boolean> => {
    const payload: Record<string, unknown> = {
      chat_id: channelId,
      video: item.deliveryUrl,
      supports_streaming: true,
    };

    if (item.thumbnailUrl) payload.thumbnail = item.thumbnailUrl;
    if (caption) {
      payload.caption = caption;
      payload.parse_mode = 'HTML';
    }

    let outcome = await callTelegram(botToken, 'sendVideo', payload, deps);

    if (isParseError(outcome) && caption) {
      outcome = await callTelegram(
        botToken,
        'sendVideo',
        {
          chat_id: channelId,
          video: item.deliveryUrl,
          supports_streaming: true,
          ...(item.thumbnailUrl ? { thumbnail: item.thumbnailUrl } : {}),
          caption: stripHtml(caption),
        },
        deps
      );
    }

    if (!outcome.ok) {
      firstError = firstError ?? outcome.description ?? 'Telegram video failed.';
      uncertain = uncertain || Boolean(outcome.uncertain);

      // An honest fallback: a clearly linked thumbnail, never a fake video.
      if (item.thumbnailUrl) {
        return sendPhoto(item, item.thumbnailUrl, caption);
      }

      failedImages += 1;
      return false;
    }

    sentImageUrls.push(item.url);
    remember(outcome.result);
    return true;
  };

  const sendAlbum = async (
    items: TelegramMedia[],
    caption?: string
  ): Promise<boolean> => {
    const media = items.map((item, index) => ({
      type: 'photo',
      media: item.deliveryUrl,
      ...(index === 0 && caption
        ? { caption, parse_mode: 'HTML' }
        : {}),
    }));

    let outcome = await callTelegram(
      botToken,
      'sendMediaGroup',
      { chat_id: channelId, media },
      deps
    );

    if (isParseError(outcome) && caption) {
      outcome = await callTelegram(
        botToken,
        'sendMediaGroup',
        {
          chat_id: channelId,
          media: media.map((entry, index) => ({
            ...entry,
            ...(index === 0 ? { caption: stripHtml(caption), parse_mode: undefined } : {}),
          })),
        },
        deps
      );
    }

    if (outcome.ok) {
      sentImageUrls.push(...items.map((item) => item.url));
      remember(outcome.result);
      return true;
    }

    firstError = firstError ?? outcome.description ?? 'Telegram album failed.';
    uncertain = uncertain || Boolean(outcome.uncertain);

    // One bad URL must not hide the healthy images in the group.
    let anySent = false;
    for (const item of items) {
      const ok = await sendPhoto(
        item,
        item.deliveryUrl,
        !anySent ? caption : undefined
      );
      anySent = anySent || ok;
    }
    return anySent;
  };

  const sendBatch = async (
    batch: TelegramMediaBatch,
    caption: string | undefined,
    showCaptionAboveMedia: boolean
  ): Promise<boolean> => {
    const pending = batch.items.filter((item) => !alreadySentMedia.has(item.url));
    if (!pending.length) return false;

    if (batch.kind === 'video') {
      const ok = await sendVideo(pending[0], caption);
      if (ok) alreadySentMedia.add(pending[0].url);
      return ok;
    }

    if (pending.length === 1) {
      const ok = await sendPhoto(
        pending[0],
        pending[0].deliveryUrl,
        caption,
        showCaptionAboveMedia
      );
      if (ok) alreadySentMedia.add(pending[0].url);
      return ok;
    }

    const ok = await sendAlbum(pending, caption);
    if (ok) {
      const sent = new Set(sentImageUrls);
      pending.forEach((item) => {
        if (sent.has(item.url)) alreadySentMedia.add(item.url);
      });
    }
    return ok;
  };

  let captionConsumed =
    Boolean(mediaGroupCaption(composition)) && resumeTextParts >= 1;

  for (const batch of composition.mediaBatches) {
    const caption = captionConsumed ? undefined : mediaGroupCaption(composition) ?? undefined;
    const firstBatchHasCaption = Boolean(caption);
    const ok = await sendBatch(
      batch,
      caption,
      batch.items.length === 1 && composition.presentationMode === 'photo'
    );

    if (ok && firstBatchHasCaption) {
      captionConsumed = true;
      textPartsSent = Math.max(textPartsSent, 1);
    }
  }

  // If media was already delivered on a previous attempt but the caption was
  // not, deliver the caption as a normal message rather than losing it.
  if (
    composition.media.length > 0 &&
    composition.mediaCaption &&
    !captionConsumed
  ) {
    const ok = await sendTextPart(composition.mediaCaption, false);
    if (ok) {
      captionConsumed = true;
      textPartsSent = Math.max(textPartsSent, 1);
    }
  }

  const captionPartCount = composition.media.length && composition.mediaCaption ? 1 : 0;

  if (
    composition.media.length > 0 &&
    composition.mediaCaption &&
    !captionConsumed
  ) {
    // The caption is the editorial opening of a media publication. If it could
    // not be delivered, do not continue with the body out of order.
    return {
      ok: false,
      messageId: messageIds[0],
      messageIds,
      chatId,
      bot,
      error: firstError ?? 'Telegram media caption could not be delivered.',
      uncertain,
      textPartsSent,
      sentImageUrls,
      failedImages,
    };
  }

  if (composition.media.length) {
    const start = clamp(
      textPartsSent - captionPartCount,
      0,
      composition.textContinuation.length
    );

    for (let index = start; index < composition.textContinuation.length; index += 1) {
      const ok = await sendTextPart(composition.textContinuation[index], false);
      if (!ok) break;
      textPartsSent += 1;
    }
  } else {
    const start = clamp(textPartsSent, 0, composition.textOnlyParts.length);
    const allowPreview =
      composition.presentationMode === 'link' && Boolean(composition.sourceUrl);

    for (let index = start; index < composition.textOnlyParts.length; index += 1) {
      const ok = await sendTextPart(
        composition.textOnlyParts[index],
        allowPreview && index === 0,
        composition.sourceUrl ?? undefined
      );
      if (!ok) break;
      textPartsSent += 1;
    }
  }

  const textComplete = textPartsSent >= composition.textPartCount;

  return {
    ok: textComplete && failedImages === 0,
    messageId: messageIds[0],
    messageIds,
    chatId,
    bot,
    error:
      failedImages > 0
        ? firstError ?? 'Some Telegram media could not be delivered.'
        : textComplete
          ? undefined
          : firstError ?? 'Telegram text delivery failed.',
    uncertain,
    textPartsSent,
    sentImageUrls,
    failedImages,
  };
}
