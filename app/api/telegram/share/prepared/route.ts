import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getCachedFlowItem } from '@/lib/flow/items-cash';
import { normalizeFlowItem } from '@/lib/flow/content';
import { resolveFlowMetadataFromContent } from '@/lib/flow/metadata';
import { readTelegramBotToken } from '@/lib/telegram/botToken';
import { verifyTelegramInitData } from '@/lib/telegram/initData';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://www.merkurov.love';

function fail(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Creates a Telegram prepared inline message for one published Flow item.
 *
 * `shareMessage` on the client only accepts an id created by the Bot API
 * `savePreparedInlineMessage` method. We never invent an id. When the bot
 * token or the method is unavailable the route fails closed and the client
 * falls back to a deep link / native share / copy.
 */
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'telegram-share-prepared',
  });

  if (limited) return limited;

  const botToken = readTelegramBotToken();

  if (!botToken) {
    return fail(
      'Telegram prepared messages require PIERROT_BOT_TOKEN and a Bot API 8.0+ bot.',
      503
    );
  }

  const initData = req.headers.get('x-telegram-init-data') || '';
  const verified = verifyTelegramInitData(initData, botToken);

  if (!verified.ok) {
    return fail('Telegram launch data could not be verified.', 401);
  }

  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';

  if (!slug || slug.length > 200 || !/^[\p{L}\p{N}][\p{L}\p{N}-]{0,199}$/u.test(slug)) {
    return fail('A valid published Flow slug is required.', 400);
  }

  let metadata;

  try {
    const bundle = await getCachedFlowItem(slug);

    if (!bundle) return fail('Only published Flow posts can be shared.', 404);

    const content = normalizeFlowItem(bundle.item as never, {
      media: bundle.media as never,
    });

    metadata = resolveFlowMetadataFromContent(content);
  } catch {
    return fail('The publication could not be prepared for sharing.', 503);
  }

  const canonicalUrl = metadata.canonicalUrl || `${SITE_URL}/flow/${encodeURIComponent(slug)}`;
  const title = (metadata.title || 'Flow').slice(0, 140);
  const description = (metadata.description || '').slice(0, 200);
  const resultId = createHash('sha256')
    .update(`${canonicalUrl}:${verified.user.id}`)
    .digest('hex')
    .slice(0, 32);

  const inlineResult = {
    type: 'article',
    id: resultId,
    title,
    description,
    input_message_content: {
      message_text: `${title}\n\n${canonicalUrl}`,
      link_preview_options: {
        url: canonicalUrl,
        prefer_large_media: true,
        show_above_text: false,
      },
    },
  };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/savePreparedInlineMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: Number(verified.user.id),
          result: inlineResult,
          allow_user_chats: true,
          allow_group_chats: true,
          allow_bot_chats: false,
          allow_channel_chats: false,
        }),
        cache: 'no-store',
      }
    );

    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { id?: unknown }; description?: unknown }
      | null;

    const preparedId =
      response.ok && json?.ok && typeof json.result?.id === 'string' ? json.result.id : '';

    if (!preparedId) {
      console.warn(
        '[telegram-share] savePreparedInlineMessage unavailable:',
        typeof json?.description === 'string' ? json.description : response.status
      );

      return fail(
        'This bot cannot create prepared messages. Falling back to a share link.',
        503
      );
    }

    return NextResponse.json(
      { ok: true, preparedMessageId: preparedId, url: canonicalUrl },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.warn(
      '[telegram-share] prepared message request failed:',
      error instanceof Error ? error.message : 'unknown error'
    );

    return fail('Telegram prepared messages are unavailable.', 503);
  }
}
