import { Bot, webhookCallback, InlineKeyboard, InputFile } from 'grammy';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { Buffer } from 'buffer';

// --- CONFIG ---
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const env = process.env as Record<string, string | undefined>;

const token = env['TELEGRAM_BOT_TOKEN'];
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);

// ENV & CONSTANTS
const MY_ID = Number(env['MY_TELEGRAM_ID']);
const CHANNEL_ID = env['CHANNEL_ID'];
const GOOGLE_KEY = env['GOOGLE_KEY'];
const MODEL_NAME = 'gemini-2.0-flash'; 
const RESEARCH_AGENT = 'deep-research-pro-preview-12-2025';

// --- MEMORY ---
const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `Ты — Второй Мозг Антона Меркурова. Критичный, стоический, аналитический. Отвечай сжато, по делу. Используй Markdown.`;

// --- MIDDLEWARE ---
bot.use(async (ctx: any, next: any) => {
    const userId = ctx.from?.id || ctx.callbackQuery?.from?.id;
    if (userId !== MY_ID) {
        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery("Unauthorized").catch(() => {});
        }
        return;
    }
    await next();
});

// ==========================================
// 1. HELPER & LOGIC FUNCTIONS
// ==========================================

async function sendResultAsFile(ctx: any, text: string, id: string) {
    try {
        await ctx.reply("📤 Packing Dossier...");
        const buffer = Buffer.from(text, 'utf-8');
        const safeId = id.replace(/[^a-zA-Z0-9]/g, '_').slice(-10); 
        await ctx.replyWithDocument(new InputFile(buffer, `Research_${safeId}.md`), {
            caption: "📂 <b>Research Complete.</b>", 
            parse_mode: 'HTML'
        });
    } catch (e) { 
        await ctx.reply("⚠️ Send Error (Size/Timeout)."); 
    }
}

async function checkStatus(ctx: any, interactionId: string, isCallback = false) {
    try {
        const supabase = getServerSupabaseClient({ useServiceRole: true });
        const resourcePath = interactionId.includes('interactions/') ? interactionId : `interactions/${interactionId}`;
        
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${resourcePath}`, {
            method: 'GET',
            headers: { 'x-goog-api-key': GOOGLE_KEY! }
        });
        
        const data = await res.json();

        if (data.error) {
            const { data: dbData } = await supabase.from('research_tasks').select('result').eq('id', interactionId).single();
            if (dbData?.result) {
                if (isCallback) await ctx.deleteMessage().catch(() => {});
                await ctx.reply("⚠️ Google Link Expired. Loading from DB...");
                return await sendResultAsFile(ctx, dbData.result, interactionId);
            }
            const msg = `❌ API Error: ${data.error.message}`;
            if (isCallback) await ctx.answerCallbackQuery("Error").catch(() => {});
            return ctx.reply(msg);
        }

        const status = data.status;
        
        if (status === "succeeded" || status === "completed") {
            const outputText = data.outputs?.[0]?.text || data.outputText || data.output_text || "Empty result.";
            if (isCallback) await ctx.deleteMessage().catch(() => {});

            // Save & Send
            await supabase.from('research_tasks').update({ status: 'completed', result: outputText }).eq('id', interactionId);
            await sendResultAsFile(ctx, outputText, interactionId);

        } else if (status === "failed") {
            if (isCallback) await ctx.answerCallbackQuery("Failed").catch(() => {});
            await ctx.reply(`❌ <b>FAILED</b>\n${JSON.stringify(data)}`, { parse_mode: 'HTML' });
        } else {
            const msg = `Status: ${status}... ⏳`;
            if (isCallback) await ctx.answerCallbackQuery(msg).catch(() => {});
            else await ctx.reply(msg);
        }
    } catch (e: any) {
        await ctx.reply(`System Error: ${e.message}`);
    }
}

async function handleResearch(ctx: any, text: string) {
    const topic = text.replace('/research', '').trim();
    if (!topic) return ctx.reply("⚠️ Syntax: `/research Topic`", { parse_mode: 'Markdown' });

    const statusMsg = await ctx.reply(`🔍 <b>Init Research:</b> ${topic}...`, { parse_mode: 'HTML' });

    try {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': GOOGLE_KEY!
            },
            body: JSON.stringify({ agent: RESEARCH_AGENT, input: topic, background: true })
        });
        
        const data = await res.json();
        
        if (data.error) return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ API Error: ${data.error.message}`);
        
        const interactionId = data.name || data.id;
        if (!interactionId) return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Error: No ID returned.`);

        // DB Save
        try {
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').upsert({
                id: interactionId,
                topic: topic,
                status: 'created',
                created_at: new Date().toISOString()
            });
        } catch (e) {}

        const callbackData = `check_res:${interactionId}`;
        const isIdTooLong = new TextEncoder().encode(callbackData).length > 64;

        if (isIdTooLong) {
             await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, 
                `✅ <b>Started</b>\nID:\n<code>${interactionId}</code>`, { parse_mode: 'HTML' });
        } else {
            const keyboard = new InlineKeyboard().text("📂 Check Status", callbackData);
            await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, 
                `✅ <b>Started</b>\nID: <code>${interactionId}</code>`, { parse_mode: 'HTML', reply_markup: keyboard });
        }
    } catch (e: any) {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Sys Error: ${e.message}`);
    }
}

async function handleCheck(ctx: any, input: string) {
    let idInput = input.replace('/check', '').trim();
    
    if (!idInput && ctx.message?.reply_to_message?.text) {
        idInput = ctx.message.reply_to_message.text;
    }

    const cleanMatch = idInput.match(/(interactions\/)?v1_[^\s\n]+/);
    if (cleanMatch) idInput = cleanMatch[0];
    else idInput = idInput.replace(/ID:\s*|Code:\s*/gi, '').trim();

    if (!idInput) return ctx.reply("⚠️ Syntax: `/check <ID>`");

    await ctx.reply(`⚙ <b>SYSTEM CHECK:</b>\nID: <code>${idInput}</code>`, { parse_mode: 'HTML' });
    await checkStatus(ctx, idInput, false);
}

// ==========================================
// 2. MAIN ROUTER
// ==========================================

bot.callbackQuery(/^check_res:(.+)/, async (ctx: any) => {
    const interactionId = ctx.match?.[1];
    if (interactionId) {
        await checkStatus(ctx, interactionId, true);
    }
});

bot.callbackQuery("pub_post", async (ctx: any) => {
    if (drafts[MY_ID]?.photo && CHANNEL_ID) {
        await ctx.api.sendPhoto(CHANNEL_ID, drafts[MY_ID].photo!, { caption: drafts[MY_ID].caption });
        delete drafts[MY_ID];
        await ctx.answerCallbackQuery("Done").catch(() => {});
    }
});

bot.on('message:text', async (ctx: any) => {
    const text = ctx.message.text.trim();

    if (text.startsWith('/research')) {
        return await handleResearch(ctx, text);
    }
    
    if (text.startsWith('/check') || text.includes('v1_')) {
        return await handleCheck(ctx, text);
    }

    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        drafts[MY_ID].caption = text;
        const keyboard = new InlineKeyboard().text("🚀 PUBLISH", "pub_post");
        return await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, reply_markup: keyboard });
    }

    const aiChatId = ctx.chat.id;
    await ctx.api.sendChatAction(aiChatId, 'typing').catch(() => {});
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
        const res = await fetch(url, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text }] }],
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
            }) 
        });
        const data = await res.json();
        const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiResponse) await ctx.reply(aiResponse, { parse_mode: 'Markdown' });
    } catch (err: any) { await ctx.reply(`AI Error: ${err.message}`); }
});

bot.on(':photo', async (ctx: any) => {
    if (!ctx.message || !ctx.message.photo) {
        await ctx.reply('⚠️ No photo found in the message.');
        return;
    }
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    drafts[MY_ID] = { photo: bestPhoto?.file_id, caption: '' };
    await ctx.reply('📸 Photo secured. Send text.');
});

// SERVER ENTRY
const handleUpdate = webhookCallback(bot, 'std/http');
export async function POST(req: Request) {
    try { return await handleUpdate(req); }
    catch (e) { return new Response('Error', { status: 500 }); }
}
