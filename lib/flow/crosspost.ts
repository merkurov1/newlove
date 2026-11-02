import { createHash } from 'node:crypto';

import { publishToBluesky } from '@/lib/bluesky';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  normalizeFlowItem,
  type FlowContent,
  type FlowItemInput,
} from './content';
import {
  FLOW_LINK_LABEL,
  ensureTelegramLinks,
  formatTelegramMessage,
  publishTelegramContent,
  type TelegramPublishResult,
  type TelegramPublisherDeps,
  type TelegramResumeState,
} from './telegram';

export {
  FLOW_LINK_LABEL,
  ensureTelegramLinks,
  formatTelegramMessage,
};

type UnknownRecord = Record<string, unknown>;

export type CrosspostChannel = 'telegram' | 'bluesky';

export type CrosspostChannelStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped';

export type CrosspostChannelState = {
  status: CrosspostChannelStatus;
  externalId: string | null;
  externalUri: string | null;
  messageIds: number[];
  chatId: string | null;
  attempts: number;
  lastError: string | null;
  uncertain: boolean;
  contentHash: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  textPartsSent: number;
  sentImageUrls: string[];
};

export type CrosspostState = {
  channels: Partial<Record<CrosspostChannel, CrosspostChannelState>>;
  attemptedAt: string | null;
  contentHash: string | null;
  imageCount: number;
};

export type CrosspostPayload = FlowItemInput & {
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  youtubeUrl?: string | null;
  description?: string | null;
};

export type CrosspostResult = {
  bluesky?: { uri: string; cid: string } | null;
  telegram?: {
    messageId: number;
    chatId: string;
    bot: 'pierrot' | 'osiris' | 'default';
    messageIds?: number[];
  } | null;
  osirisWebhook?: { ok: boolean; status?: number; error?: string } | null;
  pierrotWebhook?: { ok: boolean; status?: number; error?: string } | null;
  channels?: Partial<Record<CrosspostChannel, CrosspostChannelState>>;
  attemptedChannels?: CrosspostChannel[];
};

export type CrosspostOptions = {
  channels?: CrosspostChannel[];
  retryFailed?: boolean;
  force?: boolean;
  retryUncertain?: boolean;
  deps?: CrosspostDeps;
};

export type CrosspostDeps = {
  supabase?: SupabaseClient | null;
  fetch?: typeof fetch;
  publishTelegram?: (
    content: FlowContent,
    options: { resume?: TelegramResumeState; deps?: TelegramPublisherDeps }
  ) => Promise<TelegramPublishResult>;
  publishBluesky?: (payload: CrosspostPayload) => Promise<{ uri: string; cid: string } | null>;
  now?: () => Date;
};

const SITE_ORIGIN = 'https://www.merkurov.love';
const PUBLISHING_LOCK_MS = 15 * 60 * 1000;
const CHANNELS: CrosspostChannel[] = ['telegram', 'bluesky'];

function getSupabaseAdmin(): SupabaseClient | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  // Unit tests set placeholder credentials. Never let a test wait on a
  // non-existent Supabase host; tests that need persistence inject a fake
  // client through `deps.supabase`.
  if (
    process.env.NODE_ENV === 'test' &&
    /(?:^https?:\/\/)?test\.supabase\.co/i.test(url)
  ) {
    return null;
  }

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

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry))
    : [];
}

function messageIdArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is number =>
          typeof entry === 'number' && Number.isSafeInteger(entry) && entry > 0
      )
    : [];
}

function hashContent(content: FlowContent): string {
  const source = [
    content.canonicalUrl,
    content.title,
    content.body,
    content.sourceUrl ?? '',
    content.images.map((image) => image.url).join(','),
    content.videos.map((video) => video.url).join(','),
    content.links.map((link) => link.url).join(','),
  ].join('|');

  return createHash('sha256').update(source).digest('hex');
}

function emptyChannel(status: CrosspostChannelStatus): CrosspostChannelState {
  return {
    status,
    externalId: null,
    externalUri: null,
    messageIds: [],
    chatId: null,
    attempts: 0,
    lastError: null,
    uncertain: false,
    contentHash: null,
    startedAt: null,
    updatedAt: null,
    publishedAt: null,
    textPartsSent: 0,
    sentImageUrls: [],
  };
}

function normalizeChannelState(value: unknown): CrosspostChannelState | null {
  if (!isRecord(value)) return null;

  const status = readString(value.status);
  if (
    status !== 'pending' &&
    status !== 'publishing' &&
    status !== 'published' &&
    status !== 'failed' &&
    status !== 'skipped'
  ) {
    return null;
  }

  return {
    status,
    externalId: readString(value.externalId ?? value.external_id),
    externalUri: readString(value.externalUri ?? value.external_uri ?? value.uri),
    messageIds: messageIdArray(value.messageIds ?? value.message_ids),
    chatId: readString(value.chatId ?? value.chat_id),
    attempts: readNumber(value.attempts),
    lastError: readString(value.lastError ?? value.last_error),
    uncertain: value.uncertain === true,
    contentHash: readString(value.contentHash ?? value.content_hash),
    startedAt: readString(value.startedAt ?? value.started_at),
    updatedAt: readString(value.updatedAt ?? value.updated_at),
    publishedAt: readString(value.publishedAt ?? value.published_at),
    textPartsSent: readNumber(value.textPartsSent ?? value.text_parts_sent),
    sentImageUrls: stringArray(value.sentImageUrls ?? value.sent_image_urls),
  };
}

/**
 * Reads both the new `crosspost.channels` shape and the legacy production
 * shape (`crosspost.telegram`, `crosspost.bluesky`, top-level IDs).
 */
export function readCrosspostState(
  item: CrosspostPayload,
  now = new Date()
): CrosspostState {
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  const legacy = isRecord(metadata.crosspost) ? metadata.crosspost : {};
  const rawChannels = isRecord(legacy.channels) ? legacy.channels : {};

  const channels: CrosspostState['channels'] = {};

  const telegramState = normalizeChannelState(rawChannels.telegram);
  const blueskyState = normalizeChannelState(rawChannels.bluesky);

  if (telegramState) {
    channels.telegram = telegramState;
  } else {
    const legacyTelegram = isRecord(legacy.telegram) ? legacy.telegram : null;
    const id =
      legacyTelegram?.messageId ??
      legacyTelegram?.message_id ??
      metadata.telegram_message_id ??
      item.telegram_message_id;

    if (id !== null && id !== undefined && String(id).trim()) {
      channels.telegram = {
        ...emptyChannel('published'),
        externalId: String(id),
        messageIds: [Number(id)].filter((value) => Number.isSafeInteger(value)),
        chatId: readString(
          legacyTelegram?.chatId ??
            legacyTelegram?.chat_id ??
            metadata.telegram_channel_id
        ),
        publishedAt:
          readString(legacy.attempted_at) ??
          readString(legacy.crossposted_at) ??
          now.toISOString(),
        updatedAt:
          readString(legacy.attempted_at) ??
          readString(legacy.crossposted_at) ??
          now.toISOString(),
      };
    }
  }

  if (blueskyState) {
    channels.bluesky = blueskyState;
  } else {
    const legacyBluesky = isRecord(legacy.bluesky) ? legacy.bluesky : null;
    const uri =
      readString(legacyBluesky?.uri) ??
      readString(metadata.bluesky_uri) ??
      readString(item.bluesky_uri);

    if (uri) {
      channels.bluesky = {
        ...emptyChannel('published'),
        externalId: readString(legacyBluesky?.cid) ?? readString(metadata.bluesky_cid),
        externalUri: uri,
        publishedAt:
          readString(legacy.attempted_at) ??
          readString(legacy.crossposted_at) ??
          now.toISOString(),
        updatedAt:
          readString(legacy.attempted_at) ??
          readString(legacy.crossposted_at) ??
          now.toISOString(),
      };
    }
  }

  return {
    channels,
    attemptedAt: readString(legacy.attempted_at ?? legacy.crossposted_at),
    contentHash: readString(legacy.content_hash),
    imageCount: readNumber(legacy.image_count),
  };
}

function isFreshPublishing(
  state: CrosspostChannelState | undefined,
  now: Date
): boolean {
  if (!state || state.status !== 'publishing') return false;
  const started = state.startedAt ?? state.updatedAt;
  if (!started) return true;

  const timestamp = Date.parse(started);
  if (!Number.isFinite(timestamp)) return true;

  return now.getTime() - timestamp < PUBLISHING_LOCK_MS;
}

export function selectChannels(
  state: CrosspostState,
  options: CrosspostOptions = {},
  now = new Date()
): CrosspostChannel[] {
  const requested =
    Array.isArray(options.channels) && options.channels.length > 0
      ? CHANNELS.filter((channel) => options.channels?.includes(channel))
      : CHANNELS;

  if (options.retryFailed) {
    return requested.filter((channel) => {
      const channelState = state.channels[channel];
      if (channelState?.status !== 'failed') return false;
      if (channelState.uncertain && !options.retryUncertain && !options.force) {
        return false;
      }
      return true;
    });
  }

  return requested.filter((channel) => {
    const channelState = state.channels[channel];

    if (!channelState) return true;
    if (options.force) return true;
    if (channelState.status === 'published') return false;
    if (isFreshPublishing(channelState, now)) return false;
    if (channelState.uncertain && !options.retryUncertain) return false;

    return true;
  });
}

function stateForPublishing(
  previous: CrosspostChannelState | undefined,
  contentHash: string,
  now: Date
): CrosspostChannelState {
  const timestamp = now.toISOString();

  return {
    ...(previous ?? emptyChannel('pending')),
    status: 'publishing',
    attempts: (previous?.attempts ?? 0) + 1,
    lastError: null,
    uncertain: false,
    contentHash,
    startedAt: timestamp,
    updatedAt: timestamp,
    // Keep confirmed deliveries from a previous partial run, so a retry only
    // sends the missing text parts / images.
    textPartsSent: previous?.textPartsSent ?? 0,
    sentImageUrls: previous?.sentImageUrls ?? [],
  };
}

function stateForTelegram(
  previous: CrosspostChannelState | undefined,
  result: TelegramPublishResult,
  contentHash: string,
  now: Date
): CrosspostChannelState {
  const timestamp = now.toISOString();
  const previousMessageIds = previous?.messageIds ?? [];
  const messageIds = Array.from(
    new Set([...previousMessageIds, ...result.messageIds])
  );
  const sentImages = Array.from(
    new Set([...(previous?.sentImageUrls ?? []), ...result.sentImageUrls])
  );

  const status: CrosspostChannelStatus = result.skipped
    ? 'skipped'
    : result.ok
      ? 'published'
      : 'failed';

  return {
    status,
    externalId:
      messageIds.length > 0
        ? String(messageIds[0])
        : previous?.externalId ?? null,
    externalUri: previous?.externalUri ?? null,
    messageIds,
    chatId: result.chatId ?? previous?.chatId ?? null,
    attempts: previous?.attempts ?? 1,
    lastError: result.ok ? null : result.error ?? 'Telegram publish failed.',
    uncertain: !result.ok && Boolean(result.uncertain),
    contentHash,
    startedAt: previous?.startedAt ?? timestamp,
    updatedAt: timestamp,
    publishedAt:
      status === 'published'
        ? previous?.publishedAt ?? timestamp
        : previous?.publishedAt ?? null,
    textPartsSent: result.textPartsSent,
    sentImageUrls: sentImages,
  };
}

function stateForBluesky(
  previous: CrosspostChannelState | undefined,
  result: { uri: string; cid: string } | null,
  contentHash: string,
  now: Date
): CrosspostChannelState {
  const timestamp = now.toISOString();

  if (!result) {
    return {
      ...(previous ?? emptyChannel('failed')),
      status: 'failed',
      attempts: previous?.attempts ?? 1,
      lastError: previous?.lastError ?? 'Bluesky publish failed.',
      uncertain: false,
      contentHash,
      startedAt: previous?.startedAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  return {
    status: 'published',
    externalId: result.cid,
    externalUri: result.uri,
    messageIds: [],
    chatId: null,
    attempts: previous?.attempts ?? 1,
    lastError: null,
    uncertain: false,
    contentHash,
    startedAt: previous?.startedAt ?? timestamp,
    updatedAt: timestamp,
    publishedAt: previous?.publishedAt ?? timestamp,
    textPartsSent: 0,
    sentImageUrls: [],
  };
}

async function persistState(
  supabase: SupabaseClient | null,
  itemId: string | null,
  fallbackMetadata: UnknownRecord,
  state: CrosspostState,
  content: FlowContent
): Promise<void> {
  if (!supabase || !itemId) return;

  let metadata = fallbackMetadata;

  try {
    const { data } = await supabase
      .from('items')
      .select('metadata,bluesky_uri,telegram_message_id')
      .eq('id', itemId)
      .maybeSingle();

    if (isRecord(data?.metadata)) metadata = data.metadata;
  } catch {
    // Use the payload metadata if the fresh read is unavailable.
  }

  const previousCrosspost = isRecord(metadata.crosspost)
    ? metadata.crosspost
    : {};
  const telegram = state.channels.telegram;
  const bluesky = state.channels.bluesky;

  const updatedMetadata: UnknownRecord = {
    ...metadata,
    crosspost: {
      ...previousCrosspost,
      ...state,
      channels: state.channels,
      telegram:
        telegram?.status === 'published'
          ? {
              messageId: telegram.messageIds[0] ?? Number(telegram.externalId),
              messageIds: telegram.messageIds,
              chatId: telegram.chatId,
              bot: previousCrosspost.telegram && isRecord(previousCrosspost.telegram)
                ? previousCrosspost.telegram.bot
                : undefined,
            }
          : previousCrosspost.telegram ?? null,
      bluesky:
        bluesky?.status === 'published'
          ? {
              uri: bluesky.externalUri,
              cid: bluesky.externalId,
            }
          : previousCrosspost.bluesky ?? null,
    },
  };

  const fullUpdate: Record<string, unknown> = {
    metadata: updatedMetadata,
  };

  if (bluesky?.status === 'published' && bluesky.externalUri) {
    updatedMetadata.bluesky_uri = bluesky.externalUri;
    updatedMetadata.bluesky_cid = bluesky.externalId;
    fullUpdate.bluesky_uri = bluesky.externalUri;
    fullUpdate.bluesky_cid = bluesky.externalId;
  }

  if (telegram?.status === 'published' && telegram.messageIds.length > 0) {
    updatedMetadata.telegram_message_id = telegram.messageIds[0];
    updatedMetadata.telegram_channel_id = telegram.chatId;
    fullUpdate.telegram_message_id = telegram.messageIds[0];
    if (telegram.chatId) fullUpdate.telegram_channel_id = telegram.chatId;
  }

  const { error } = await supabase
    .from('items')
    .update(fullUpdate)
    .eq('id', itemId);

  if (error) {
    console.warn(
      '[crosspost] Could not update all columns; retrying metadata only:',
      error.message
    );

    const { error: metadataError } = await supabase
      .from('items')
      .update({ metadata: updatedMetadata })
      .eq('id', itemId);

    if (metadataError) {
      console.error(
        '[crosspost] Failed to persist crosspost metadata:',
        metadataError.message
      );
    }
  }
}

/**
 * The existing distributions table has `pending/posted/failed` statuses, while
 * the public state uses `publishing/published`. Mirror the durable fields into
 * it when available, but keep metadata as the canonical state that supports
 * the in-progress phase without a schema migration.
 */
async function mirrorDistributions(
  supabase: SupabaseClient | null,
  itemId: string | null,
  state: CrosspostState
): Promise<void> {
  if (!supabase || !itemId) return;

  for (const channel of CHANNELS) {
    const channelState = state.channels[channel];
    if (!channelState) continue;

    const status =
      channelState.status === 'published'
        ? 'posted'
        : channelState.status === 'failed'
          ? 'failed'
          : channelState.status === 'skipped'
            ? null
            : 'pending';

    if (!status) continue;

    const { error } = await supabase.from('distributions').upsert(
      {
        item_id: itemId,
        channel,
        status,
        external_id: channelState.externalUri ?? channelState.externalId,
        payload_hash: channelState.contentHash,
        attempts: channelState.attempts,
        last_error: channelState.lastError,
        posted_at: channelState.publishedAt,
      },
      { onConflict: 'item_id,channel' }
    );

    if (error) {
      console.warn(
        '[crosspost] distributions mirror skipped:',
        channel,
        error.message
      );
    }
  }
}

async function dispatchWebhook(
  webhookUrl: string | undefined,
  apiKey: string | undefined,
  payload: CrosspostPayload,
  deps: CrosspostDeps
): Promise<{ ok: boolean; status?: number; error?: string } | null> {
  if (!webhookUrl) return null;

  const fetcher = deps.fetch ?? fetch;

  try {
    const response = await fetcher(webhookUrl, {
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
        status: response.status,
        body: responseText.slice(0, 500),
      });
    }

    return { ok: response.ok, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';

    console.warn('[crosspost:webhook] Dispatch failed:', message);

    return { ok: false, error: message };
  }
}

/**
 * Crosspost a Flow item to Telegram and Bluesky independently.
 *
 * - A failure in one channel never blocks the other.
 * - Already-published channels are not reposted.
 * - Retries send only the failed channel and resume partially delivered text
 *   parts/images.
 * - Timeout results are marked `uncertain` and are not retried automatically;
 *   an explicit `force` retry is required to avoid a duplicate.
 */
export async function crosspostFlowItem(
  item: CrosspostPayload,
  options: CrosspostOptions = {}
): Promise<CrosspostResult> {
  const deps = options.deps ?? {};
  const supabase =
    deps.supabase === undefined ? getSupabaseAdmin() : deps.supabase;
  const now = deps.now ?? (() => new Date());
  const startedAt = now();

  let content: FlowContent;

  try {
    content = normalizeFlowItem(item);
  } catch (error) {
    console.error('[crosspost] Content normalization failed:', error);
    return {
      channels: {},
      attemptedChannels: [],
    };
  }

  const contentHash = hashContent(content);
  const previousState = readCrosspostState(item, startedAt);
  const channelsToAttempt = selectChannels(previousState, options, startedAt);

  if (channelsToAttempt.length === 0) {
    return {
      bluesky: null,
      telegram: null,
      channels: previousState.channels,
      attemptedChannels: [],
    };
  }

  const state: CrosspostState = {
    channels: { ...previousState.channels },
    attemptedAt: startedAt.toISOString(),
    contentHash,
    imageCount: content.images.length,
  };

  for (const channel of channelsToAttempt) {
    state.channels[channel] = stateForPublishing(
      previousState.channels[channel],
      contentHash,
      startedAt
    );
  }

  // Persist the in-progress phase first: a second request or a crash cannot
  // silently start another publication for the same channel.
  await persistState(
    supabase,
    content.id,
    content.metadata,
    state,
    content
  );

  const [telegramResult, blueskyResult, osirisResult, pierrotResult] =
    await Promise.all([
      channelsToAttempt.includes('telegram')
        ? (deps.publishTelegram ?? publishTelegramContent)(content, {
            resume: {
              textParts: previousState.channels.telegram?.textPartsSent ?? 0,
              imageUrls: previousState.channels.telegram?.sentImageUrls ?? [],
            },
          }).catch((error): TelegramPublishResult => ({
            ok: false,
            messageIds: [],
            textPartsSent: previousState.channels.telegram?.textPartsSent ?? 0,
            sentImageUrls: previousState.channels.telegram?.sentImageUrls ?? [],
            failedImages: 0,
            error:
              error instanceof Error
                ? error.message.slice(0, 300)
                : 'Telegram publish failed.',
            uncertain: true,
          }))
        : Promise.resolve(null),

      channelsToAttempt.includes('bluesky')
        ? (deps.publishBluesky ?? publishToBluesky)({
            ...item,
            metadata: content.metadata,
            title: content.title,
            body_md: content.body,
            source_url: content.sourceUrl,
            type: content.rawType,
            lang: content.language,
            imageUrls: content.images.map((image) => image.url),
          }).catch((error) => {
            console.error('[crosspost:bluesky] Publish failed:', error);
            return null;
          })
        : Promise.resolve(null),

      options.retryFailed
        ? Promise.resolve(null)
        : dispatchWebhook(
            process.env.OSIRIS_WEBHOOK_URL || process.env.OSIRIS_API_URL,
            process.env.OSIRIS_API_KEY,
            { ...item, metadata: content.metadata },
            deps
          ),

      options.retryFailed
        ? Promise.resolve(null)
        : dispatchWebhook(
            process.env.PIERROT_WEBHOOK_URL,
            process.env.PIERROT_API_KEY,
            { ...item, metadata: content.metadata },
            deps
          ),
    ]);

  const finishedAt = now();

  if (telegramResult) {
    state.channels.telegram = stateForTelegram(
      state.channels.telegram,
      telegramResult,
      contentHash,
      finishedAt
    );
  }

  if (channelsToAttempt.includes('bluesky')) {
    state.channels.bluesky = stateForBluesky(
      state.channels.bluesky,
      blueskyResult,
      contentHash,
      finishedAt
    );
  }

  await persistState(
    supabase,
    content.id,
    content.metadata,
    state,
    content
  );
  await mirrorDistributions(supabase, content.id, state);

  const result: CrosspostResult = {
    bluesky:
      state.channels.bluesky?.status === 'published'
        ? {
            uri: state.channels.bluesky.externalUri ?? '',
            cid: state.channels.bluesky.externalId ?? '',
          }
        : null,
    telegram:
      state.channels.telegram?.status === 'published' &&
      state.channels.telegram.messageIds.length > 0
        ? {
            messageId: state.channels.telegram.messageIds[0],
            chatId: state.channels.telegram.chatId ?? '',
            bot: telegramResult?.bot ?? 'default',
            messageIds: state.channels.telegram.messageIds,
          }
        : null,
    osirisWebhook: osirisResult,
    pierrotWebhook: pierrotResult,
    channels: state.channels,
    attemptedChannels: channelsToAttempt,
  };

  console.info('[crosspost] Finished:', {
    itemId: content.id,
    attemptedChannels: channelsToAttempt,
    telegram: state.channels.telegram?.status ?? 'not_attempted',
    bluesky: state.channels.bluesky?.status ?? 'not_attempted',
  });

  return result;
}
