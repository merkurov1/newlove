import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { assertSafePublicUrl } from '@/lib/flow/parseUrl';

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
    let url: string | null = null;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      whisperId = body.whisperId || body.whisper_id || null;
      url = body.url || null;
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      whisperId = params.get('whisperId') || params.get('whisper_id');
      url = params.get('url');
    }
    if (!whisperId || !url) return NextResponse.json({ ok: false, error: 'missing', debug: { note: 'missing whisperId or url', provided: { whisperId, url } } }, { status: 400 });

    let safeUrl: string;

    try {
      safeUrl = assertSafePublicUrl(url).toString();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid audio URL' }, { status: 400 });
    }

    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    // Prefer OpenAI if configured
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    let text = null;

    // Prepare debug info to return to the client for easier troubleshooting
    // (debug removed in production; keep local only)
    let debug: Record<string, any> | null = null;

    if (OPENAI_KEY) {
      // call OpenAI Whisper API (example)
      try {
        const form = new FormData();
        // fetch audio
        const audioResp = await fetch(safeUrl);
        if (!audioResp.ok) {
          const bodyText = await audioResp.text().catch(() => 'no body');
          return NextResponse.json({ ok: false, error: `failed to fetch audio from url: ${audioResp.status}: ${bodyText}` }, { status: 502 });
        }
        const audioBuf = await audioResp.arrayBuffer();

        const contentTypeFromAudio = audioResp.headers.get('content-type') || 'audio/webm';
        const fileBlob = new Blob([audioBuf], { type: contentTypeFromAudio });
        // include a filename to be safe for multipart handling on the OpenAI side
        // @ts-ignore
        form.append('file', fileBlob, 'whisper.webm');
        form.append('model', 'whisper-1');

        const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
          body: form as any
        });

        const openaiRes = await r.text().catch(() => '');
        if (!r.ok) {
          return NextResponse.json({ ok: false, error: `openai transcribe failed: ${r.status}: ${openaiRes}` }, { status: 502 });
        }
        let parsed: any = {};
        try { parsed = JSON.parse(openaiRes); } catch (e) { parsed = {}; }
        text = parsed.text || parsed.transcript || null;
      } catch (e) {
        console.error('transcription error', e);
        return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
      }
    } else {
      // No OpenAI key — return instruction for admin to transcribe manually.
      text = null;
    }

    if (text) {
      await supabase.from('whispers').update({ transcribed_text: text, status: 'transcribed' }).eq('id', whisperId);
    }

    return NextResponse.json({ ok: true, transcribed: !!text, text });
  } catch (e) {
    console.error('transcribe error', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
