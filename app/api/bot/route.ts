import { Bot, webhookCallback } from 'grammy';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// Важно для Vercel: отключаем кэширование
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Используем рабочую модель из твоего списка
const MODEL_NAME = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Твоя задача: помогать структурировать мысли, книгу и стратегию.
Без цензуры. Без лести.
Отвечай сжато, по делу.
`;

// Handle admin replies to bot prompts (reply flow) and regular AI messages
bot.on('message', async (ctx) => {
  const userId = ctx.from.id;

  // Only admin allowed
  if (userId !== MY_ID) return;

  // If admin replies to a bot prompt that contains whisper-id marker — treat as reply to whisper
  const replyTo = ctx.message?.reply_to_message?.text;
  if (replyTo && replyTo.includes('whisper-id:')) {
    const m = replyTo.match(/whisper-id:(\S+)/);
    if (m) {
      const whisperId = m[1];
      const messageText = ctx.message.text || '';
      try {
        const supabase = getServerSupabaseClient({ useServiceRole: true });
        const { data: whisper } = await supabase.from('whispers').select('*').eq('id', whisperId).single();
        if (!whisper) return ctx.reply('Whisper not found.');

        if (!whisper.telegram_user_id) return ctx.reply('No telegram user id stored.');

        // send message to original user
        await ctx.api.sendMessage(whisper.telegram_user_id, messageText);

        await supabase.from('whispers').update({ my_response: messageText, status: 'answered' }).eq('id', whisperId);
        return ctx.reply('Ответ отправлен.');
      } catch (e) {
        console.error('reply processing error', e);
        return ctx.reply('Ошибка при отправке ответа.');
      }
    }
  }

  // Otherwise treat as AI command (existing behavior)
  const userText = ctx.message.text || '';
  const aiChatId = ctx.chat?.id ?? ctx.from?.id;
  if (aiChatId) await ctx.api.sendChatAction(aiChatId, 'typing');
  try {
    if (!GOOGLE_KEY) throw new Error('GOOGLE_API_KEY is missing');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
    const payload = {
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
    };
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[PrivateBot] Google Error: ${response.status}`, errText);
      throw new Error(`Google Error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return ctx.reply('⚠️ Empty response from AI.');
    await ctx.reply(text, { parse_mode: 'Markdown' });
  } catch (err: any) {
    console.error('[PrivateBot] Critical:', err);
    await ctx.reply(`🚨 Error: ${err.message}`);
  }
});

// Callback: Transcribe whisper
bot.callbackQuery(/^transcribe:(.+)/, async (ctx) => {
  const id = ctx.callbackQuery.data.split(':')[1];
  await ctx.answerCallbackQuery({ text: 'Запускаю транскрипцию…' });
  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const { data: whisper } = await supabase.from('whispers').select('*').eq('id', id).single();
    if (!whisper) return ctx.reply('Whisper not found');

    let fileUrl = whisper.telegram_file_id;
    if (!fileUrl && whisper.storage_path) {
      const publicRes = await supabase.storage.from('whispers').getPublicUrl(whisper.storage_path);
      fileUrl = publicRes.data.publicUrl;
    }

    if (!fileUrl) return ctx.reply('No file URL available for this whisper.');

    if (!OPENAI_KEY) {
      await ctx.reply('OPENAI_API_KEY not configured — транскрипцию нужно делать вручную.');
      return;
    }

    // fetch audio and send to OpenAI Whisper
    const audioResp = await fetch(fileUrl);
    const audioBuf = await audioResp.arrayBuffer();
    const form = new FormData();
    form.append('file', new Blob([audioBuf]));
    form.append('model', 'whisper-1');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: form as any
    });
    const parsed = await r.json();
    const text = parsed.text || parsed.transcript || null;

    if (text) {
      await supabase.from('whispers').update({ transcribed_text: text, status: 'transcribed' }).eq('id', id);
      await ctx.reply(`Транскрипт:\n\n${text}`);
    } else {
      await ctx.reply('Не удалось получить транскрипт.');
    }
  } catch (e) {
    console.error('transcribe callback error', e);
    await ctx.reply('Ошибка при транскрипции.');
  }
});

// Callback: Reply flow — prompt admin to send reply (force reply)
bot.callbackQuery(/^reply:(.+)/, async (ctx) => {
  const id = ctx.callbackQuery.data.split(':')[1];
  await ctx.answerCallbackQuery({ text: 'Напишите ответ в этом чате, ответив на сообщение.' });
  // send a message with whisper-id marker and force reply
  const replyChatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id ?? ctx.from?.id;
  if (!replyChatId) {
    await ctx.answerCallbackQuery({ text: 'Не удалось определить чат для ответа.' });
    return;
  }
  await ctx.api.sendMessage(replyChatId, `Ответ для whisper-id:${id}\nReply to this message with your text.`, { reply_markup: { force_reply: true } as any });
});

// Надежный обработчик вебхука
const handleUpdate = webhookCallback(bot, 'std/http');

export async function POST(req: Request) {
    try {
        return await handleUpdate(req);
    } catch (e) {
        console.error('[PrivateBot] Webhook Error:', e);
        return new Response('Error', { status: 500 });
    }
}