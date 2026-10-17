import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseTelegramMessage,
  verifyTelegramWebhookSecret,
  isAllowedTelegramUser,
  sendTelegramReply,
} from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

export async function POST(req: NextRequest) {
  try {
    // 1. Reject requests without the configured Telegram webhook secret.
    const secret = req.headers.get(
      'x-telegram-bot-api-secret-token',
    );

    if (!verifyTelegramWebhookSecret(secret ?? undefined)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // 2. Parse the update and ignore unsupported update types.
    const payload = await req.json();
    const message = parseTelegramMessage(payload);

    if (!message) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 3. Only explicitly allowed Telegram users may create drafts.
    if (!isAllowedTelegramUser(message.userId)) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: 'user_not_allowed',
      });
    }

    const text = (message.text ?? '').trim();

    if (!text) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: 'empty_text',
      });
    }

    const supabase = createClient({ useServiceRole: true });

    // Telegram can redeliver the same update. The unique database
    // constraint on ingest_log.idempotency_key is the concurrency guard.
    const idempotencyKey =
      `telegram:${message.chatId}:${message.id}`;

    const { error: claimError } = await supabase
      .from('ingest_log')
      .insert({
        idempotency_key: idempotencyKey,
        source: 'telegram',
        item_id: null,
      });

    if (claimError) {
      if (!isUniqueViolation(claimError)) {
        console.error(
          '[telegram-webhook] Failed to claim update:',
          claimError,
        );

        throw new Error('Could not register Telegram update.');
      }

      // Another request already claimed this update.
      const { data: existing, error: lookupError } = await supabase
        .from('ingest_log')
        .select('item_id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (lookupError) {
        console.error(
          '[telegram-webhook] Failed to inspect duplicate:',
          lookupError,
        );

        throw new Error('Could not verify duplicate Telegram update.');
      }

      if (existing?.item_id) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          itemId: existing.item_id,
        });
      }

      // A previous request may have claimed the update but failed
      // before completing it. Do not create another draft blindly.
      console.error(
        '[telegram-webhook] Update claim exists without item_id:',
        idempotencyKey,
      );

      return NextResponse.json(
        {
          ok: false,
          error: 'Update is already being processed.',
        },
        { status: 503 },
      );
    }

    const title = text.slice(0, 80).trim() || 'Telegram note';

    const slugBase =
      title
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'telegram-note';

    // A unique suffix avoids collisions between different messages
    // that happen to have the same title.
    const slug = `${slugBase}-${message.chatId}-${message.id}`;

    // 4. Create a private Flow draft. Do not publish automatically.
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        type: 'note',
        status: 'draft',
        visibility: 'private',
        lang: 'ru',
        slug,
        title,
        body_md: text,
        source_url: null,
        ai_allowed: true,
        metadata: {
          source: 'telegram',
          telegram_user_id: message.userId,
          telegram_username: message.username ?? null,
          first_name: message.firstName ?? null,
          telegram_chat_id: message.chatId,
          telegram_message_id: message.id,
        },
      })
      .select('id, title')
      .single();

    if (itemError || !item) {
      console.error(
        '[telegram-webhook] Failed to create draft:',
        itemError,
      );

      // Release the claim so Telegram can retry after a failed insert.
      const { error: cleanupError } = await supabase
        .from('ingest_log')
        .delete()
        .eq('idempotency_key', idempotencyKey)
        .is('item_id', null);

      if (cleanupError) {
        console.error(
          '[telegram-webhook] Failed to release update claim:',
          cleanupError,
        );
      }

      throw new Error('Failed to save Flow draft.');
    }

    // 5. Attach the created draft to the idempotency record.
    const { data: linkedRows, error: linkError } = await supabase
      .from('ingest_log')
      .update({ item_id: item.id })
      .eq('idempotency_key', idempotencyKey)
      .is('item_id', null)
      .select('id');

    if (linkError || !linkedRows?.length) {
      console.error(
        '[telegram-webhook] Failed to link draft to update:',
        linkError,
      );

      // Best-effort cleanup. Do not silently leave a duplicate-prone
      // unlinked claim if the linking operation fails.
      const { error: itemCleanupError } = await supabase
        .from('items')
        .delete()
        .eq('id', item.id);

      if (itemCleanupError) {
        console.error(
          '[telegram-webhook] Failed to clean up orphan draft:',
          itemCleanupError,
        );
      }

      const { error: claimCleanupError } = await supabase
        .from('ingest_log')
        .delete()
        .eq('idempotency_key', idempotencyKey)
        .is('item_id', null);

      if (claimCleanupError) {
        console.error(
          '[telegram-webhook] Failed to clean up update claim:',
          claimCleanupError,
        );
      }

      throw new Error('Failed to register saved Flow draft.');
    }

    // 6. Preserve the existing Mini App button and reply behavior.
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '📱 Открыть управление во Flow (Mini App)',
            web_app: {
              url: 'https://www.merkurov.love/flow',
            },
          },
        ],
      ],
    };

    const safeTitle = escapeHtml(item.title || title);
    const safeId = escapeHtml(item.id);

    await sendTelegramReply(
      message.chatId,
      [
        '<b>Заметка сохранена во Flow как черновик!</b>',
        '',
        `<b>Заголовок:</b> ${safeTitle}`,
        `<b>ID:</b> <code>${safeId}</code>`,
      ].join('\n'),
      replyMarkup,
    );

    return NextResponse.json({
      ok: true,
      itemId: item.id,
      duplicate: false,
    });
  } catch (error) {
    console.error('[telegram-webhook]', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to process Telegram update.',
      },
      { status: 500 },
    );
  }
}