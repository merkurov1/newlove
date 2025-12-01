import { NextResponse } from 'next/server';

// Server route: accept new whisper events from client, create DB row, and notify admin bot
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { telegram_user_id, telegram_first_name, telegram_file_id, telegram_file_unique_id, storage_path } = body;

    // server helpers from repo
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });

    const insert = await supabase.from('whispers').insert({
      telegram_user_id: telegram_user_id || null,
      telegram_file_id: telegram_file_id || null,
      telegram_file_unique_id: telegram_file_unique_id || null,
      storage_path: storage_path || null,
      status: 'new'
    }).select('*').single();

    if (insert.error) throw insert.error;
    const whisper = insert.data;

    // Notify admin via bot (env vars BOT_TOKEN and ADMIN_CHAT_ID must be set)
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (BOT_TOKEN && ADMIN_CHAT_ID) {
      try {
        const sendUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`;
        // telegram can fetch public URLs; we assume storage path was uploaded to public bucket
        const voiceUrl = telegram_file_id; // our client sent public URL

        // compose inline keyboard for actions
        const keyboard = {
          inline_keyboard: [
            [
              { text: 'Транскрибировать', callback_data: `transcribe:${whisper.id}` },
              { text: 'Ответить', callback_data: `reply:${whisper.id}` }
            ]
          ]
        };

        // send voice to admin with caption
        await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, voice: voiceUrl, caption: `Новый шёпот в Храм от ${telegram_first_name || 'Pilgrim'}`, reply_markup: keyboard })
        });
      } catch (e) {
        console.error('notify admin error', e);
      }
    }

    return NextResponse.json({ ok: true, whisper });
  } catch (e) {
    console.error('whispers POST error', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
