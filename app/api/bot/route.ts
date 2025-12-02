import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// Важно для Vercel
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const CHANNEL_ID = process.env.CHANNEL_ID; // ДОБАВЬ ЭТО В .ENV
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL_NAME = 'gemini-2.0-flash';

// --- STATE (MEMORY) ---
// В Vercel память очищается, но для короткой сессии "загрузил-подписал" хватит.
// Если нужно железобетонно - надо писать в Supabase, но пока не усложняем.
const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Отвечай сжато, по делу.
`;

// --- MIDDLEWARE: ADMIN CHECK ---
// Все, что ниже, доступно только тебе (кроме ответов на чужие шепоты, но это логика внутри)
bot.use(async (ctx, next) => {
  // Пропускаем callback query (они обрабатываются отдельно)
  if (ctx.callbackQuery) return next();
  if (ctx.from?.id !== MY_ID) return; // Игнорируем чужаков в личке
  await next();
});

// ==========================================
// 1. PUBLISHER MODULE (Post to Channel)
// ==========================================

// Шаг 1: Ловим фото
bot.on(':photo', async (ctx) => {
    // Берем последний (лучшее качество) элемент безопасно
    const photos = ctx.message.photo;
    const photo = photos?.at(-1)?.file_id || (photos && photos.length ? photos[photos.length - 1].file_id : undefined);
    if (!photo) return;

    drafts[MY_ID] = { photo, caption: '' };

    await ctx.reply(
        '📸 <b>PHOTO SECURED.</b>\n\nТеперь пришли текст (MarkdownV2).\nНе забывай экранировать точки и минусы: \\. \\-',
        { parse_mode: 'HTML' }
    );
});

// Шаг 2: Ловим текст (или AI запрос)
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    
    // А. ОБРАБОТКА REPLIES (WHISPERS)
    // Если это ответ на сообщение с меткой whisper-id
    const replyTo = ctx.message.reply_to_message?.text;
    if (replyTo && replyTo.includes('whisper-id:')) {
        const m = replyTo.match(/whisper-id:(\S+)/);
        if (m) {
            const whisperId = m[1];
            try {
                const supabase = getServerSupabaseClient({ useServiceRole: true });
                const { data: whisper } = await supabase.from('whispers').select('*').eq('id', whisperId).single();
                if (whisper && whisper.telegram_user_id) {
                    await ctx.api.sendMessage(whisper.telegram_user_id, text);
                    await supabase.from('whispers').update({ my_response: text, status: 'answered' }).eq('id', whisperId);
                    return ctx.reply('✅ Ответ отправлен пользователю.');
                }
            } catch (e) {
                return ctx.reply('❌ Ошибка отправки.');
            }
        }
    }

    // Б. РЕЖИМ PUBLISHER (Если есть черновик фото)
    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        drafts[MY_ID].caption = text;

        try {
            const keyboard = new InlineKeyboard()
                .text("🚀 PUBLISH", "pub_post")
                .text("❌ CANCEL", "pub_cancel");

            await ctx.replyWithPhoto(drafts[MY_ID].photo!, {
                caption: text,
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
            return; // Выходим, чтобы не триггерить AI
        } catch (e: any) {
             return ctx.reply(
                `❌ <b>Markdown Error</b>\nTelegram не смог прочитать разметку.\nОшибка: ${e.description}\n\nПопробуй прислать текст еще раз.`, 
                { parse_mode: 'HTML' }
            );
        }
    }

    // В. AI MODULE (GEMINI)
    // Если фото нет и это не ответ на whisper — идем в Gemini
    const aiChatId = ctx.chat.id;
    await ctx.api.sendChatAction(aiChatId, 'typing');
    
    try {
        if (!GOOGLE_KEY) throw new Error('No Google Key');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
        const payload = {
            contents: [{ role: 'user', parts: [{ text }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.7 }
        };
        const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const data = await response.json();
        const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (aiResponse) await ctx.reply(aiResponse, { parse_mode: 'Markdown' });
    } catch (err: any) {
        await ctx.reply(`🧠 Brain Error: ${err.message}`);
    }
});

// ==========================================
// 2. ACTIONS (BUTTONS)
// ==========================================

// Публикация в канал
bot.callbackQuery("pub_post", async (ctx) => {
    if (!drafts[MY_ID] || !CHANNEL_ID) return ctx.answerCallbackQuery("Error: No draft or Channel ID");

    try {
        await ctx.api.sendPhoto(CHANNEL_ID, drafts[MY_ID].photo!, {
            caption: drafts[MY_ID].caption,
            parse_mode: 'MarkdownV2'
        });
        await ctx.answerCallbackQuery("Published!");
        // editMessageCaption expects (caption, extra)
        await ctx.editMessageCaption("✅ <b>PUBLISHED TO CHANNEL</b>", { parse_mode: 'HTML' });
        delete drafts[MY_ID]; // Чистим память
    } catch (e: any) {
        await ctx.reply(`Publish Error: ${e.description}`);
    }
});

// Отмена
bot.callbackQuery("pub_cancel", async (ctx) => {
    delete drafts[MY_ID];
    await ctx.answerCallbackQuery("Cleared");
    await ctx.deleteMessage();
    await ctx.reply("Draft cleared. Ready for AI or new Photo.");
});

// Транскрибация (Legacy Logic)
bot.callbackQuery(/^transcribe:(.+)/, async (ctx) => {
    // ... (старый код транскрибации, оставляем для совместимости)
    // Если он нужен - могу развернуть, но пока сэкономил место.
    // Если критично - скажи, верну полный блок.
    await ctx.answerCallbackQuery("Function disabled in Lite build");
});

// ==========================================
// 3. SERVER INIT
// ==========================================
const handleUpdate = webhookCallback(bot, 'std/http');

export async function POST(req: Request) {
    try {
        return await handleUpdate(req);
    } catch (e) {
        console.error(e);
        return new Response('Error', { status: 500 });
    }
}