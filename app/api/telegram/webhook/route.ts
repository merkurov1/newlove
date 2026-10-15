import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseTelegramMessage,
  verifyTelegramWebhookSecret,
  isAllowedTelegramUser,
  sendTelegramReply,
} from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-telegram-bot-api-secret-token');
    if (!verifyTelegramWebhookSecret(secret ?? undefined)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const payload = await req.json();
    const message = parseTelegramMessage(payload);

    if (!message) {
      return NextResponse.json({ ok: true, ignored: true });
    }

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
    const idempotencyKey = `telegram:${message.chatId}:${message.id}`;

    const { data: existing } = await supabase
      .from('ingest_log')
      .select('item_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing?.item_id) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        itemId: existing.item_id,
      });
    }

    const title = text.slice(0, 80).trim() || 'Telegram note';
    const slug =
      title
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .slice(0, 80) || `note-${Date.now()}`;

    // Сохраняем черновик во Flow
    const { data: item, error: insertError } = await supabase
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
          telegram_username: message.username,
          first_name: message.firstName,
        },
      })
      .select()
      .single();

    if (insertError || !item) {
      throw insertError || new Error('Failed to insert item');
    }

    await supabase.from('ingest_log').insert({
      idempotency_key: idempotencyKey,
      source: 'telegram',
      item_id: item.id,
    });

    // Отправляем ответ Пьеро с кнопками управления и Mini App!
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '📱 Открыть управление во Flow (Mini App)',
            web_app: { url: `https://www.merkurov.love/flow` },
          },
        ],
      ],
    };

    await sendTelegramReply(
      message.chatId,
      `<b>Заметка сохранена во Flow как черновик!</b>\n\n<b>Заголовок:</b> ${item.title}\n<b>ID:</b> <code>${item.id}</code>`,
      replyMarkup
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
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
