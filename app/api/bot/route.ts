import { Bot, webhookCallback, InlineKeyboard, InputFile } from 'grammy'; // <--- InputFile IMPORTANT
import { getServerSupabaseClient } from '@/lib/serverAuth';

// --- CONFIG ---
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);

// ENV & CONSTANTS
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = 'gemini-2.0-flash';
const RESEARCH_AGENT = 'deep-research-pro-preview-12-2025';

const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Отвечай сжато, по делу.
`;

bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) return next();
    if (ctx.from?.id !== MY_ID) return;
    await next();
});

// ==========================================
// 1. DEEP RESEARCH (FILE MODE)
// ==========================================

bot.command("research", async (ctx) => {
    const topic = ctx.match;
    if (!topic) return ctx.reply("⚠️ Syntax: `/research Topic`");

    const statusMsg = await ctx.reply(`🕵️‍♂️ <b>Init:</b> ${topic}...`, { parse_mode: 'HTML' });

    try {
        const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_KEY! },
            body: JSON.stringify({ agent: RESEARCH_AGENT, input: topic, background: true })
        });
        const data = await res.json();

        if (data.error) return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ API Error: ${data.error.message}`);
        
        const interactionId = data.name || data.id;
        if (!interactionId) return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ No ID returned.`);

        // Save DB
        try {
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').insert({ id: interactionId, topic: topic, status: 'created' });
        } catch {}

        // UI
        const callbackData = `check_res:${interactionId}`;
        const isIdTooLong = new TextEncoder().encode(callbackData).length > 64;

        if (isIdTooLong) {
            await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, 
                `✅ <b>Started.</b>\nID: <code>${interactionId}</code>`, { parse_mode: 'HTML' });
        } else {
            const keyboard = new InlineKeyboard().text("📂 Get Report (File)", callbackData);
            await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, 
                `✅ <b>Started.</b>\nID: <code>${interactionId}</code>`, { parse_mode: 'HTML', reply_markup: keyboard });
        }
    } catch (e: any) {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Error: ${e.message}`);
    }
});

// AUTO-DETECT ID in Chat
bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text?.trim() || '';

    // Если это ID - запускаем проверку
    if (text.startsWith('v1_') || text.startsWith('interactions/')) {
        return await checkStatus(ctx, text, false);
    }

    // Иначе обычная логика (Publisher / AI)
    await handleStandardMessage(ctx, text);
});

bot.callbackQuery(/^check_res:(.+)/, async (ctx) => {
    await checkStatus(ctx, ctx.match[1], true);
});


// === CORE LOGIC: SEND AS FILE ===
async function checkStatus(ctx: any, interactionId: string, isCallback = false) {
    try {
        if (!isCallback) await ctx.reply("🛰 Connecting...");

        const resourcePath = interactionId.includes('interactions/') ? interactionId : `interactions/${interactionId}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${resourcePath}`;

        const res = await fetch(url, { method: 'GET', headers: { 'x-goog-api-key': GOOGLE_KEY! } });
        const data = await res.json();

        if (data.error) {
            if (isCallback) await ctx.answerCallbackQuery("Error");
            return ctx.reply(`❌ API Error: ${data.error.message}`);
        }

        const status = data.status; // "succeeded", "completed", "in_progress"

        if (status === "succeeded" || status === "completed") {
            const outputText = data.outputs?.[0]?.text || "Empty result.";
            
            if (isCallback) await ctx.deleteMessage(); // Удаляем кнопку "Проверить"
            
            // 1. ПИШЕМ ОТЧЕТ О ЗАГРУЗКЕ (Чтобы видеть, что процесс идет)
            await ctx.reply(`✅ <b>DOWNLOADED (${outputText.length} chars).</b>\nPackaging file...`, { parse_mode: 'HTML' });

            // 2. СОЗДАЕМ ФАЙЛ В ПАМЯТИ И ОТПРАВЛЯЕМ
            try {
                // Создаем буфер из строки
                const buffer = Buffer.from(outputText, 'utf-8');
                // Отправляем как документ
                await ctx.replyWithDocument(new InputFile(buffer, `DeepResearch_${interactionId.substring(0, 10)}.md`), {
                    caption: "📂 <b>Dossier Secured.</b>",
                    parse_mode: "HTML"
                });
                
                // Close DB
                const supabase = getServerSupabaseClient({ useServiceRole: true });
                await supabase.from('research_tasks').update({ status: 'completed' }).eq('id', interactionId);

            } catch (sendError: any) {
                await ctx.reply(`❌ Send Error: ${sendError.message}`);
            }

        } else if (status === "failed") {
            if (isCallback) await ctx.answerCallbackQuery("Failed");
            await ctx.reply(`❌ <b>FAILED:</b>\n${JSON.stringify(data)}`, { parse_mode: 'HTML' });
        } else {
            const msg = `Status: ${status}... ⏳`;
            if (isCallback) await ctx.answerCallbackQuery(msg);
            else await ctx.reply(msg);
        }
    } catch (e: any) {
        if (isCallback) await ctx.answerCallbackQuery("Error");
        await ctx.reply(`System Error: ${e.message}`);
    }
}

// ==========================================
// 2. STANDARD MODULES (Publisher + AI)
// ==========================================

async function handleStandardMessage(ctx: any, text: string) {
    // PUBLISHER
    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        drafts[MY_ID].caption = text;
        const keyboard = new InlineKeyboard().text("🚀 PUBLISH", "pub_post").text("❌ CANCEL", "pub_cancel");
        try {
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, parse_mode: 'MarkdownV2', reply_markup: keyboard });
        } catch {
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, reply_markup: keyboard });
        }
        return;
    }

    // AI CHAT
    const aiChatId = ctx.chat?.id;
    if (aiChatId) await ctx.api.sendChatAction(aiChatId, 'typing');
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
        const res = await fetch(url, { 
            method: 'POST', 
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text }] }],
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
            }) 
        });
        const data = await res.json();
        const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiResponse) await ctx.reply(aiResponse, { parse_mode: 'Markdown' });
    } catch (err: any) {
        await ctx.reply(`Brain Error: ${err.message}`);
    }
}

bot.on(':photo', async (ctx) => {
    const photos = ctx.message?.photo;
    const photo = photos?.at?.(-1)?.file_id;
    if (!photo) return;
    drafts[MY_ID] = { photo, caption: '' };
    await ctx.reply('📸 Photo secured.');
});

bot.callbackQuery("pub_post", async (ctx) => {
    if (!drafts[MY_ID] || !CHANNEL_ID) return;
    await ctx.api.sendPhoto(CHANNEL_ID, drafts[MY_ID].photo!, { caption: drafts[MY_ID].caption, parse_mode: 'MarkdownV2' });
    await ctx.answerCallbackQuery("Done");
    delete drafts[MY_ID];
});

bot.callbackQuery("pub_cancel", async (ctx) => {
    delete drafts[MY_ID];
    await ctx.answerCallbackQuery("Cleared");
    await ctx.deleteMessage();
});

const handleUpdate = webhookCallback(bot, 'std/http');
export async function POST(req: Request) {
    try { return await handleUpdate(req); }
    catch (e) { return new Response('Error', { status: 500 }); }
}