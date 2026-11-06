import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60 * 60;
const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'],
  ['audio/mp4', 'mp4'],
  ['audio/mpeg', 'mp3'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
]);

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Admin-only capture endpoint for private whisper storage. */
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'whispers-upload',
  });
  if (limited) return limited;

  try {
    await requireAdminFromRequest(req);
  } catch {
    return errorResponse('Unauthorized', 401);
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) {
    return errorResponse('Audio file is too large.', 413);
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return errorResponse('Audio file is required.', 400);
    if (file.size < 1 || file.size > MAX_AUDIO_BYTES) {
      return errorResponse('Audio file is too large.', 413);
    }

    const extension = AUDIO_TYPES.get(file.type.toLowerCase());
    if (!extension) return errorResponse('Unsupported audio type.', 415);

    const storagePath = `whispers/${randomUUID()}.${extension}`;
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const upload = await supabase.storage
      .from('whispers')
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (upload.error) {
      console.error('[whispers] private upload failed:', upload.error.message);
      return errorResponse('Audio upload failed.', 502);
    }

    const telegramUserId = String(form.get('telegram_user_id') || '').trim();
    const telegramFirstName = String(form.get('telegram_first_name') || '').trim();
    const insert = await supabase
      .from('whispers')
      .insert({
        telegram_user_id: telegramUserId || null,
        telegram_file_id: null,
        telegram_file_unique_id: null,
        storage_path: storagePath,
        status: 'new',
      })
      .select('id,telegram_user_id,storage_path,status,created_at')
      .single();

    if (insert.error || !insert.data) {
      await supabase.storage
        .from('whispers')
        .remove([storagePath])
        .catch(() => undefined);
      console.error('[whispers] row insert failed:', insert.error?.message || 'unknown');
      return errorResponse('Whisper could not be saved.', 500);
    }

    const signed = await supabase.storage
      .from('whispers')
      .createSignedUrl(storagePath, SIGNED_URL_SECONDS);
    const audioUrl = signed.data?.signedUrl || null;

    await notifyOwner({
      audioUrl,
      telegramUserId,
      telegramFirstName,
      whisperId: String(insert.data.id),
    });

    return NextResponse.json(
      { ok: true, whisper: { ...insert.data, audio_url: audioUrl } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[whispers] upload failed:', error instanceof Error ? error.message : 'unknown');
    return errorResponse('Whisper upload failed.', 500);
  }
}

async function notifyOwner(input: {
  audioUrl: string | null;
  telegramUserId: string;
  telegramFirstName: string;
  whisperId: string;
}) {
  const botToken = process.env.PIERROT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.PIERROT_ADMIN_CHAT_ID;
  if (!botToken || !adminChatId || !input.audioUrl) return;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        chat_id: adminChatId,
        voice: input.audioUrl,
        caption: `Новый шёпот в Храм от ${input.telegramFirstName || 'Pilgrim'}`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Транскрибировать', callback_data: `transcribe:${input.whisperId}` },
              { text: 'Ответить', callback_data: `reply:${input.whisperId}` },
            ],
          ],
        },
      }),
    });
    if (!response.ok) console.error('[whispers] Telegram notification failed:', response.status);
  } catch (error) {
    console.error(
      '[whispers] Telegram notification failed:',
      error instanceof Error ? error.message : 'unknown'
    );
  }
}
