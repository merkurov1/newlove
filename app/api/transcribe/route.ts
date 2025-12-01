import { NextResponse } from 'next/server';

// Transcription endpoint: given whisper id and public URL, perform transcription.
// This implementation will use OpenAI Speech-to-Text if OPENAI_API_KEY is set.
// You can replace this with whisper.cpp or another local whisper runtime.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { whisperId, url } = body;
    if (!whisperId || !url) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 });

    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    // Prefer OpenAI if configured
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    let text = null;

    if (OPENAI_KEY) {
      // call OpenAI Whisper API (example)
      const form = new FormData();
      const audioResp = await fetch(url);
      const audioBuf = await audioResp.arrayBuffer();
      form.append('file', new Blob([audioBuf]));
      form.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: form as any
      });
      const parsed = await r.json();
      text = parsed.text || parsed.transcript || null;
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
