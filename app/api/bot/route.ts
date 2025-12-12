import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
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

// --- MEMORY ---
const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Отвечай сжато, по делу.
`;

// --- MIDDLEWARE ---
bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) return next();
    if (ctx.from?.id !== MY_ID) return;
    await next();
});

// ==========================================
// 1. DEEP RESEARCH (PRODUCTION)
// ==========================================

// A. INIT
bot.command("research", async (ctx) => {
    const topic = ctx.match;
    if (!topic) return ctx.reply("⚠️ Syntax: `/research Topic`", { parse_mode: 'Markdown' });

    const statusMsg = await ctx.reply(`🕵️‍♂️ <b>Init Research:</b> ${topic}...`, { parse_mode: 'HTML' });

    try {
        const url = "https://generativelanguage.googleapis.com/v1beta/interactions";
        
        const payload = {
            agent: RESEARCH_AGENT,
            input: topic,
            background: true
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': GOOGLE_KEY! 
            },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();

        if (data.error) {
            return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ API Error: ${data.error.message}`);
        }

        // Google returns 'name' (resource path) OR 'id'
        const interactionId = data.name || data.id;

        if (!interactionId) {
             return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Error: No ID returned.`);
        }

        // Save to DB
        try {
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').insert({
                id: interactionId,
                topic: topic,
                status: 'created'
            });
        } catch {}

        // UI Logic
        const callbackData = `check_res:${interactionId}`;
        const isIdTooLong = new TextEncoder().encode(callbackData).length > 64;

        if (isIdTooLong) {
             await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Started</b>\n\nID is long. Use command:\n<code>/check ${interactionId}</code>`,
                { parse_mode: 'HTML' }
            );
        } else {
            const keyboard = new InlineKeyboard().text("🔄 Check Status", callbackData);
            await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Started</b>\nID: <code>${interactionId}</code>`,
                { parse_mode: 'HTML', reply_markup: keyboard }
            );
        }

    } catch (e: any) {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Sys Error: ${e.message}`);
    }
});

// B. MANUAL CHECK (/check <ID>)
bot.command("check", async (ctx) => {
    const idInput = ctx.match;
    if (!idInput) return ctx.reply("Syntax: `/check <ID>`");
    await checkStatus(ctx, idInput.trim(), false);
});

// C. BUTTON CHECK
bot.callbackQuery(/^check_res:(.+)/, async (ctx) => {
    const interactionId = ctx.match[1];
    await checkStatus(ctx, interactionId, true);
});

// D. CORE LOGIC (SAFE SEND)
async function checkStatus(ctx: any, interactionId: string, isCallback = false) {
    try {
        if (!isCallback) await ctx.reply("🛰 Connecting...");

        const resourcePath = interactionId.includes('interactions/') ? interactionId : `interactions/${interactionId}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${resourcePath}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'x-goog-api-key': GOOGLE_KEY! }
        });
        
        const data = await res.json();
        
        // Handle API Errors
        if (data.error) {
            const msg = `❌ API Error: ${data.error.message}`;
            if (isCallback) await ctx.answerCallbackQuery("Error");
            return ctx.reply(msg);
        }

        const status = data.status; // "completed", "succeeded", "in_progress"
        
        if (status === "succeeded" || status === "completed") {
            const outputText = data.outputs?.[0]?.text || "Empty result.";
            
            if (isCallback) await ctx.deleteMessage();
            else await ctx.reply("✅ <b>DOWNLOADED</b>", { parse_mode: 'HTML' });
            
            // --- SAFE SENDING LOOP ---
            const chunks = outputText.match(/.{1,3800}/g) || [outputText]; // Margin for safety

            for (const chunk of chunks) {
                try {
                    // 1. Try Markdown (Prettiest)
                    await ctx.reply(chunk, { parse_mode: 'Markdown' });
                } catch (mdError) {
                    try {
                         // 2. If fails, try HTML (Google sometimes sends HTML?)
                         await ctx.reply(chunk, { parse_mode: 'HTML' });
                    } catch (htmlError) {
                         // 3. Fallback: PLAIN TEXT (Guaranteed delivery)
                         await ctx.reply(chunk); 
                    }
                }
                // Anti-spam delay
                await new Promise(r => setTimeout(r, 500));
            }
            
            await ctx.reply("🏁 <b>End of Report.</b>", { parse_mode: 'HTML' });

            // Close DB Ticket
            try {
                const supabase = getServerSupabaseClient({ useServiceRole: true });
                await supabase.from('research_tasks').update({ status: 'completed' }).eq('id', interactionId);
            } catch {}

        } else if (status === "failed") {
            if (isCallback) await ctx.answerCallbackQuery("Failed");
            await ctx.reply(`❌ <b>FAILED</b>\n${JSON.stringify(data)}`, { parse_mode: 'HTML' });
        } else {
            // Still running
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
// 2. STANDARD MODULES
// ==========================================

bot.on(':photo', async (ctx) => {
    const photos = ctx.message?.photo;
    const photo = photos?.at?.(-1)?.file_id;
    if (!photo) return;
    drafts[MY_ID] = { photo, caption: '' };
    await ctx.reply('📸 Photo secured. Send text.');
});

bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text || '';

    // PUBLISHER
    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        drafts[MY_ID].caption = text;
        const keyboard = new InlineKeyboard().text("🚀 PUBLISH", "pub_post").text("❌ CANCEL", "pub_cancel");
        try {
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, parse_mode: 'MarkdownV2', reply_markup: keyboard });
        } catch {
            await ctx.reply("⚠️ Markdown Error. Preview (Plain):");
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, reply_markup: keyboard });
        }
        return;
    }

    // AI CHAT
    const aiChatId = ctx.chat?.id;
    if (aiChatId) await ctx.api.sendChatAction(aiChatId, 'typing');
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
        const payload = {
            contents: [{ role: 'user', parts: [{ text }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
        };
        const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (aiResponse) await ctx.reply(aiResponse, { parse_mode: 'Markdown' });
    } catch (err: any) {
        await ctx.reply(`Error: ${err.message}`);
    }
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

// SERVER
const handleUpdate = webhookCallback(bot, 'std/http');
export async function POST(req: Request) {
    try { return await handleUpdate(req); }
    catch (e) { return new Response('Error', { status: 500 }); }
}