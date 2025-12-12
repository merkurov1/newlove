import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// Важно для Vercel
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
// MODEL_NAME для чата, для Research используем хардкод агента
const MODEL_NAME = 'gemini-2.0-flash';
const RESEARCH_AGENT = 'deep-research-pro-preview-12-2025';

// --- STATE (MEMORY) ---
const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Отвечай сжато, по делу.
`;

// --- MIDDLEWARE: ADMIN CHECK ---
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) return next();
  if (ctx.from?.id !== MY_ID) return;
  await next();
});

// ==========================================
// 0. RESEARCH MODULE (NEW)
// ==========================================

// Команда /research <тема>
bot.command("research", async (ctx) => {
    const topic = ctx.match; // Получаем текст после команды
    if (!topic) return ctx.reply("⚠️ Используй: `/research Тема исследования`", { parse_mode: 'Markdown' });

    await ctx.reply(`🕵️‍♂️ <b>Deep Research Started:</b> ${topic}\n\nInitiating connection to Google Grid...`, { parse_mode: 'HTML' });

    try {
        // 1. Прямой вызов REST API (Create Interaction)
        const url = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${GOOGLE_KEY}`;
        const payload = {
            agent: RESEARCH_AGENT,
            input: topic,
            background: true // Важно!
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (data.error) throw new Error(data.error.message);
        
        const interactionId = data.name; // Google возвращает resource name, например "interactions/12345..."

        // 2. Сохраняем в Supabase (чтобы не потерять ID при перезапуске Vercel)
        const supabase = getServerSupabaseClient({ useServiceRole: true });
        // Создай таблицу 'research_tasks' c полями: id (text), topic (text), status (text)
        await supabase.from('research_tasks').insert({
            id: interactionId,
            topic: topic,
            status: 'running'
        });

        // 3. Даем кнопку для проверки
        const keyboard = new InlineKeyboard()
            .text("🔄 Check Status", `check_res:${interactionId}`); // ID может быть длинным, лучше хранить короткий UUID, но пробуем так

        await ctx.reply(`✅ <b>Task Created.</b>\nID: <code>${interactionId}</code>\n\nDeep Research takes time (2-10 mins). Press button to poll.`, {
            parse_mode: 'HTML',
            reply_markup: keyboard
        });

    } catch (e: any) {
        await ctx.reply(`❌ Research Init Error: ${e.message}`);
    }
});

// Кнопка проверки статуса
bot.callbackQuery(/^check_res:(.+)/, async (ctx) => {
    const interactionId = ctx.match[1];
    
    try {
        // 1. GET запрос к Google (Get Interaction)
        // URL может отличаться в зависимости от того, вернул Google полный путь или ID.
        // Обычно data.name это "interactions/xyz", поэтому подставляем напрямую.
        const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        // Если interactionId уже содержит 'interactions/', не дублируем
        const resourcePath = interactionId.startsWith('interactions/') ? interactionId : `interactions/${interactionId}`;
        const url = `${baseUrl}/${resourcePath}?key=${GOOGLE_KEY}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.error) throw new Error(data.error.message);

        const status = data.status; // "RUNNING", "COMPLETED", "FAILED"
        
        if (status === "COMPLETED") {
            // Забираем результат
            // Структура ответа может варьироваться, ищем outputs
            const outputText = data.outputs?.[0]?.text || "No text output found.";
            
            // Разбиваем сообщение (Telegram лимит 4096)
            const chunks = outputText.match(/.{1,4000}/g) || [outputText];
            
            await ctx.deleteMessage(); // Убираем кнопку ожидания
            await ctx.reply(`📚 <b>RESEARCH COMPLETE</b>\n\n`, { parse_mode: 'HTML' });
            
            for (const chunk of chunks) {
                await ctx.reply(chunk, { parse_mode: 'Markdown' }); // Или HTML, если уверен в разметке Google
            }
            
            // Обновляем базу
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').update({ status: 'completed' }).eq('id', interactionId);

        } else if (status === "FAILED") {
            await ctx.answerCallbackQuery("Task Failed.");
            await ctx.reply(`❌ Task Failed: ${data.error?.message || 'Unknown error'}`);
        } else {
            // RUNNING
            await ctx.answerCallbackQuery("Still working... ⏳");
        }

    } catch (e: any) {
        console.error(e);
        await ctx.answerCallbackQuery("Error checking status");
        // await ctx.reply(`Debug Error: ${e.message}`); 
    }
});


// ==========================================
// 1. PUBLISHER MODULE (Post to Channel)
// ==========================================

// Шаг 1: Ловим фото
bot.on(':photo', async (ctx) => {
    // ... ТВОЙ СТАРЫЙ КОД БЕЗ ИЗМЕНЕНИЙ ...
    const photos = ctx.message?.photo;
    const photo = photos?.at?.(-1)?.file_id || (photos && photos.length ? photos[photos.length - 1].file_id : undefined);
    if (!photo) return;

    drafts[MY_ID] = { photo, caption: '' };

    await ctx.reply(
        '📸 <b>PHOTO SECURED.</b>\n\nТеперь пришли текст (MarkdownV2).\nНе забывай экранировать точки и минусы: \\. \\-',
        { parse_mode: 'HTML' }
    );
});

// Шаг 2: Ловим текст (или AI запрос)
bot.on('message:text', async (ctx) => {
    // ... ТВОЙ СТАРЫЙ КОД ...
    const text = ctx.message?.text || '';
    
    // А. WHISPERS
    const replyTo = ctx.message?.reply_to_message?.text;
    if (replyTo && replyTo.includes('whisper-id:')) {
         // ... ТВОЙ КОД ...
         const m = replyTo.match(/whisper-id:(\S+)/);
         if (m) {
             // ... логика whisper ...
             return;
         }
    }

    // Б. PUBLISHER
    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        // ... ТВОЙ КОД ...
        drafts[MY_ID].caption = text;
        const keyboard = new InlineKeyboard().text("🚀 PUBLISH", "pub_post").text("❌ CANCEL", "pub_cancel");
        await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, parse_mode: 'MarkdownV2', reply_markup: keyboard });
        return;
    }

    // В. AI MODULE (DEFAULT GEMINI)
    // Если это не команда /research (она обрабатывается выше через command), то идем сюда
    const aiChatId = ctx.chat?.id;
    if (aiChatId) await ctx.api.sendChatAction(aiChatId, 'typing');
    
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

// ... ТВОИ CALLBACKS (pub_post, pub_cancel) ОСТАЮТСЯ ...
bot.callbackQuery("pub_post", async (ctx) => {
    // ... код ...
    if (!drafts[MY_ID] || !CHANNEL_ID) return;
    await ctx.api.sendPhoto(CHANNEL_ID, drafts[MY_ID].photo!, { caption: drafts[MY_ID].caption, parse_mode: 'MarkdownV2' });
    await ctx.answerCallbackQuery("Published!");
    delete drafts[MY_ID];
});

bot.callbackQuery("pub_cancel", async (ctx) => {
    delete drafts[MY_ID];
    await ctx.answerCallbackQuery("Cleared");
    await ctx.deleteMessage();
});

// ==========================================
// SERVER INIT
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