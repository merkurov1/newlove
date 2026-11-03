import { randomUUID } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_BYTES = 25 * 1024 * 1024;

function botToken(): string | null {
  return (
    process.env.PIERROT_BOT_TOKEN ||
    process.env.OSIRIS_BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    null
  );
}

type TelegramFile = {
  file_id: string;
  file_size?: number;
};

async function getTelegramFilePath(
  fileId: string
): Promise<{ filePath: string; fileSize: number | null } | null> {
  const token = botToken();
  if (!token || !fileId) return null;

  try {
    const response = await fetch(
      `${TELEGRAM_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { file_path?: string; file_size?: number };
    } | null;

    if (!response.ok || !payload?.ok || !payload.result?.file_path) {
      return null;
    }

    return {
      filePath: payload.result.file_path,
      fileSize: typeof payload.result.file_size === 'number' ? payload.result.file_size : null,
    };
  } catch {
    return null;
  }
}

async function downloadTelegramFile(
  fileId: string,
  maxBytes: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const token = botToken();
  const file = await getTelegramFilePath(fileId);

  if (!token || !file) return null;
  if (file.fileSize && file.fileSize > maxBytes) return null;

  try {
    const response = await fetch(`${TELEGRAM_API}/file/bot${token}/${file.filePath}`, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > maxBytes) return null;

    return {
      buffer,
      contentType:
        response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/**
 * Download a Telegram photo and store it in the existing public media bucket.
 * The public URL is required by the Flow image and crosspost adapters.
 */
export async function uploadTelegramPhoto(
  store: SupabaseClient,
  input: {
    fileId: string;
    chatId: number;
    mime?: string | null;
  }
): Promise<string | null> {
  const file = await downloadTelegramFile(input.fileId, MAX_PHOTO_BYTES);

  if (!file) return null;

  const mime =
    input.mime && input.mime.startsWith('image/')
      ? input.mime
      : file.contentType.startsWith('image/')
        ? file.contentType
        : 'image/jpeg';

  if (!mime.startsWith('image/')) return null;

  const extension = mime.includes('png') ? 'png' : 'jpg';
  const path = `flow/telegram/${input.chatId}/${randomUUID()}.${extension}`;
  const { error } = await store.storage.from('media').upload(path, file.buffer, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) return null;

  const { data } = store.storage.from('media').getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * Transcribe a Telegram voice/audio message with the existing OpenAI
 * transcription provider. No new provider or paid service is introduced.
 */
export async function transcribeTelegramVoice(input: {
  fileId: string;
  mime?: string | null;
}): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !input.fileId) return null;

  const file = await downloadTelegramFile(input.fileId, MAX_VOICE_BYTES);
  if (!file) return null;

  const mime = input.mime || file.contentType || 'audio/ogg';
  const extension = mime.includes('mp4')
    ? 'm4a'
    : mime.includes('mpeg')
      ? 'mp3'
      : mime.includes('webm')
        ? 'webm'
        : 'ogg';

  try {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: mime }),
      `voice.${extension}`
    );
    form.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) return null;

    const payload = (await response.json().catch(() => null)) as { text?: string } | null;
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';

    return text || null;
  } catch {
    return null;
  }
}

export type TelegramPhotoCandidate = {
  file_id?: string;
  file_size?: number;
};

/** Pick the largest supported photo size without trusting client metadata. */
export function largestTelegramPhoto(
  sizes: TelegramPhotoCandidate[] | undefined
): TelegramFile | null {
  if (!Array.isArray(sizes) || sizes.length === 0) return null;

  let best: TelegramFile | null = null;

  for (const size of sizes) {
    if (typeof size?.file_id !== 'string' || !size.file_id) continue;
    const fileSize = typeof size.file_size === 'number' ? size.file_size : 0;

    if (fileSize > MAX_PHOTO_BYTES) continue;
    if (!best || fileSize > (best.file_size ?? 0)) {
      best = { file_id: size.file_id, file_size: fileSize || undefined };
    }
  }

  return best;
}
