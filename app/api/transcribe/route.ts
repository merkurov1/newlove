import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { requireAdminFromRequest } from '@/lib/serverAuth';

// Transcription endpoint: admin-only audio transcription for temple whispers.
// This implementation uses OpenAI Speech-to-Text if OPENAI_API_KEY is set.
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'transcribe',
  });
  if (limited) return limited;

  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Accept either JSON or form-encoded requests (admin HTML form uses form-encoded)
    let whisperId: string | null = null;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      whisperId = body.whisperId || body.whisper_id || null;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      whisperId = params.get('whisperId') || params.get('whisper_id');
    }
    if (!whisperId || typeof whisperId !== 'string' || whisperId.length > 100) {
      return NextResponse.json({ ok: false, error: 'missing whisperId' }, { status: 400 });
    }

    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const { data: whisper, error: whisperError } = await supabase
      .from('whispers')
      .select('id,storage_path')
      .eq('id', whisperId)
      .maybeSingle();
    if (whisperError || !whisper?.storage_path) {
      return NextResponse.json({ ok: false, error: 'Whisper audio not found' }, { status: 404 });
    }

    const signed = await supabase.storage
      .from('whispers')
      .createSignedUrl(whisper.storage_path, 10 * 60);
    const safeUrl = signed.data?.signedUrl;
    if (!safeUrl)
      return NextResponse.json({ ok: false, error: 'Whisper audio unavailable' }, { status: 503 });

    // Prefer OpenAI if configured
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    let text = null;

    if (OPENAI_KEY) {
      // call OpenAI Whisper API (example)
      try {
        const form = new FormData();
        // fetch audio
        const audioResp = await fetch(safeUrl, { signal: AbortSignal.timeout(10_000) });
        if (!audioResp.ok) {
          return NextResponse.json({ ok: false, error: 'Audio fetch failed' }, { status: 502 });
        }
        const declaredLength = Number(audioResp.headers.get('content-length') || 0);
        if (declaredLength > 10 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: 'Audio file is too large' },
            { status: 413 }
          );
        }
        const audioBuf = await audioResp.arrayBuffer();
        if (audioBuf.byteLength > 10 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: 'Audio file is too large' },
            { status: 413 }
          );
        }

        const contentTypeFromAudio = audioResp.headers.get('content-type') || 'audio/webm';
        const fileBlob = new Blob([audioBuf], { type: contentTypeFromAudio });
        // include a filename to be safe for multipart handling on the OpenAI side
        // @ts-ignore
        form.append('file', fileBlob, 'whisper.webm');
        form.append('model', 'whisper-1');

        const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_KEY}` },
          body: form as any,
        });

        const openaiRes = await r.text().catch(() => '');
        if (!r.ok) {
          console.error('[transcribe] provider failed:', r.status);
          return NextResponse.json(
            { ok: false, error: 'Transcription provider failed' },
            { status: 502 }
          );
        }
        let parsed: any = {};
        try {
          parsed = JSON.parse(openaiRes);
        } catch (e) {
          parsed = {};
        }
        text = parsed.text || parsed.transcript || null;
      } catch (e) {
        console.error('transcription error', e instanceof Error ? e.message : 'unknown');
        return NextResponse.json({ ok: false, error: 'Transcription failed' }, { status: 500 });
      }
    } else {
      // No OpenAI key — return instruction for admin to transcribe manually.
      text = null;
    }

    if (text) {
      await supabase
        .from('whispers')
        .update({ transcribed_text: text, status: 'transcribed' })
        .eq('id', whisperId);
    }

    return NextResponse.json(
      { ok: true, transcribed: !!text, text },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('transcribe error', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ ok: false, error: 'Transcription failed' }, { status: 500 });
  }
}
