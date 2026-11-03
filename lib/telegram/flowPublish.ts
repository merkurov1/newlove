import type { SupabaseClient } from '@supabase/supabase-js';

import type { CrosspostResult } from '@/lib/flow/crosspost';
import { createFlowItem, type FlowPublicationResult } from '@/lib/flow/publish';
import { detectPierrotLanguage } from '@/lib/pierrot/conversation';

import type { TelegramFlowMode } from './flowState';

const FALLBACK_SITE_URL = 'https://www.merkurov.love';

export type TelegramFlowPublishResult =
  | {
      ok: true;
      item: Record<string, unknown>;
      url: string;
      duplicate: boolean;
      crosspost: CrosspostResult | null;
    }
  | { ok: false; error: string };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    FALLBACK_SITE_URL
  ).replace(/\/+$/, '');
}

function firstHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;

  try {
    const url = new URL(match[0].replace(/[.,!?;:)\]]+$/, ''));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function telegramFlowSlug(chatId: number, messageId: number): string {
  return `tg-${chatId}-${messageId}`;
}

export function telegramFlowType(mode: TelegramFlowMode): 'note' | 'link' | 'article' | 'photo' {
  if (mode === 'media') return 'photo';
  if (mode === 'link') return 'link';
  if (mode === 'article') return 'article';
  return 'note';
}

/**
 * Validate and publish one Telegram message directly to Flow.
 *
 * There is deliberately no draft step. The deterministic slug makes a
 * redelivered Telegram update resolve to the same item instead of creating a
 * second publication.
 */
export async function publishTelegramFlowItem(input: {
  store: SupabaseClient;
  userId: number;
  chatId: number;
  messageId: number;
  mode: TelegramFlowMode;
  text?: string | null;
  imageUrl?: string | null;
  username?: string | null;
  firstName?: string | null;
}): Promise<TelegramFlowPublishResult> {
  const text = (input.text ?? '').trim();
  const imageUrl = (input.imageUrl ?? '').trim() || null;

  if (input.mode === 'media') {
    if (!imageUrl) {
      return { ok: false, error: 'Send a photo for the Media mode.' };
    }
  } else if (!text) {
    return { ok: false, error: 'Send text to publish this Flow mode.' };
  }

  if (input.mode === 'link' && !firstHttpUrl(text)) {
    return {
      ok: false,
      error: 'Link mode needs a valid http(s) URL in the message.',
    };
  }

  const sourceUrl = firstHttpUrl(text);
  const type = telegramFlowType(input.mode);
  const metadata: Record<string, unknown> = {
    source: 'telegram',
    telegram_user_id: input.userId,
    telegram_username: input.username ?? null,
    first_name: input.firstName ?? null,
    telegram_chat_id: input.chatId,
    telegram_message_id: input.messageId,
    telegram_flow_mode: input.mode,
  };

  if (imageUrl) metadata.images = [imageUrl];

  const publication: FlowPublicationResult = await createFlowItem(input.store, {
    title: null,
    body_md: text || null,
    source_url: sourceUrl,
    type,
    lang: detectPierrotLanguage(text) === 'en' ? 'en' : 'ru',
    status: 'published',
    visibility: 'public',
    metadata,
    slug: telegramFlowSlug(input.chatId, input.messageId),
    idempotencyKey: telegramFlowSlug(input.chatId, input.messageId),
  });

  if (!publication.ok) {
    return { ok: false, error: publication.error };
  }

  const slug = typeof publication.item.slug === 'string' ? publication.item.slug : '';

  return {
    ok: true,
    item: publication.item,
    url: slug ? `${siteUrl()}/flow/${encodeURIComponent(slug)}` : `${siteUrl()}/flow`,
    duplicate: publication.duplicate,
    crosspost: publication.crosspost,
  };
}

export function crosspostSummary(result: CrosspostResult | null): string | null {
  if (!result?.channels) return null;

  const labels: Array<[string, string]> = [
    ['telegram', 'Telegram'],
    ['bluesky', 'Bluesky'],
    ['facebook', 'Facebook'],
    ['threads', 'Threads'],
  ];
  const parts: string[] = [];

  for (const [key, label] of labels) {
    const state = result.channels[key as keyof typeof result.channels];

    if (!state) continue;
    if (state.status === 'published') parts.push(`${label}: published`);
    else if (state.status === 'failed') {
      parts.push(`${label}: failed${state.uncertain ? ' (unconfirmed)' : ''}`);
    } else if (state.status === 'skipped') parts.push(`${label}: skipped`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
