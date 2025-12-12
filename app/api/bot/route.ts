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

// --- MIDDLEWARE: SECURITY ---
bot.use(async (ctx, next) => {
    if (ctx.callbackQuery) return next();
    if (ctx.from?.id !== MY_ID) return; 
    await next();
});

// ==========================================
// 1. DEEP RESEARCH MODULE (FULL FIX)
// ==========================================

// A. INIT RESEARCH
bot.command("research", async (ctx) => {
    const topic = ctx.match;
    if (!topic) return ctx.reply("⚠️ Syntax: `/research Topic`", { parse_mode: 'Markdown' });

    const statusMsg = await ctx.reply(`🕵️‍♂️ <b>Deep Research Init:</b> ${topic}...`, { parse_mode: 'HTML' });

    try {
        // 1. Request (v1beta, Header Auth)
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
                'x-goog-api-key': GOOGLE_KEY! // AUTH HERE
            },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();

        // 2. Error Check
        if (data.error) {
            console.error("API Error:", data.error);
            return ctx.api.editMessageText(
                ctx.chat.id, 
                statusMsg.message_id, 
                `❌ <b>API Error</b>\nCode: ${data.error.code}\nMessage: ${data.error.message}`,
                { parse_mode: 'HTML' }
            );
        }

        // 3. Get ID (Fallback to 'id' if 'name' is missing)
        const interactionId = data.name || data.id;

        if (!interactionId) {
             return ctx.api.editMessageText(
                ctx.chat.id, 
                statusMsg.message_id, 
                `❌ <b>Unknown Response</b>\n${JSON.stringify(data).substring(0, 500)}`
            );
        }

        // 4. Save to DB
        try {
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').insert({
                id: interactionId,
                topic: topic,
                status: data.status || 'created'
            });
        } catch (e) { console.error("DB Error:", e); }

        // 5. Create UI
        const callbackData = `check_res:${interactionId}`;
        const isIdTooLong = new TextEncoder().encode(callbackData).length > 64;

        if (isIdTooLong) {
             // FALLBACK FOR LONG IDs: Ask user to use /check command
             await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Task Created</b>\n\nID is too long for buttons.\nCopy and use command:\n\n<code>/check ${interactionId}</code>`,
                { parse_mode: 'HTML' }
            );
        } else {
            // Standard Button
            const keyboard = new InlineKeyboard().text("🔄 Check Status", callbackData);
            await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Task Created</b>\nID: <code>${interactionId}</code>\nWait 2-5 min.`,
                { parse_mode: 'HTML', reply_markup: keyboard }
            );
        }

    } catch (e: any) {
        await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ System Error: ${e.message}`);
    }
});

// B. MANUAL CHECK (For Long IDs)
bot.command("check", async (ctx) => {
    const interactionId = ctx.match; // /check <ID>
    if (!interactionId) return ctx.reply("⚠️ Syntax: `/check <LONG_ID>`");

    await ctx.reply(`🕵️‍♂️ Checking...`, { parse_mode: 'HTML' });
    await checkStatus(ctx, interactionId.trim());
});

// C. BUTTON CHECK (For Short IDs)
bot.callbackQuery(/^check_res:(.+)/, async (ctx) => {
    const interactionId = ctx.match[1];
    await checkStatus(ctx, interactionId, true); // true = isCallback
});

// D. UNIVERSAL CHECKER FUNCTION
async function checkStatus(ctx: any, interactionId: string, isCallback = false) {
    try {
        // Fix URL: ensure "interactions/" prefix exists or not based on ID format
        // Google might return just "v1_..." or "interactions/v1_..."
        const resourcePath = interactionId.includes('interactions/') ? interactionId : `interactions/${interactionId}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${resourcePath}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: { 'x-goog-api-key': GOOGLE_KEY! }
        });
        
        const data = await res.json();

        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

        const status = data.status; // "in_progress", "succeeded", "failed"
        
        if (status === "succeeded" || status === "completed") {
            const outputText = data.outputs?.[0]?.text || "Empty result.";
            const chunks = outputText.match(/.{1,4000}/g) || [outputText];
            
            if (isCallback) await ctx.deleteMessage();
            else await ctx.reply("✅ <b>DONE</b>", { parse_mode: 'HTML' });

            await ctx.reply(`📚 <b>REPORT:</b>`, { parse_mode: 'HTML' });
            
            for (const chunk of chunks) {
                try { await ctx.reply(chunk, { parse_mode: 'Markdown' }); } 
                catch { await ctx.reply(chunk); } // Fallback
            }
            
            // Close Ticket
            try {
                const supabase = getServerSupabaseClient({ useServiceRole: true });
                await supabase.from('research_tasks').update({ status: 'completed' }).eq('id', interactionId);
            } catch {}

        } else if (status === "failed") {
            if (isCallback) await ctx.answerCallbackQuery("FAILED ❌");
            await ctx.reply(`❌ <b>FAILED:</b>\n${JSON.stringify(data.error || data)}`, { parse_mode: 'HTML' });
        } else {
            const msg = `Status: ${status}... ⏳`;
            if (isCallback) await ctx.answerCallbackQuery(msg);
            else await ctx.reply(msg);
        }

    } catch (e: any) {
        if (isCallback) await ctx.answerCallbackQuery("Error");
        await ctx.reply(`Check Error: ${e.message}`);
    }
}

// ==========================================
// 2. PUBLISHER MODULE
// ==========================================

bot.on(':photo', async (ctx) => {
    const photos = ctx.message?.photo;
    const photo = photos?.at?.(-1)?.file_id;
    if (!photo) return;

    drafts[MY_ID] = { photo, caption: '' };

    await ctx.reply(
        '📸 <b>PHOTO SECURED.</b>\nSend caption (MarkdownV2).',
        { parse_mode: 'HTML' }
    );
});

bot.callbackQuery("pub_post", async (ctx) => {
    if (!drafts[MY_ID] || !CHANNEL_ID) return ctx.answerCallbackQuery("No draft");
    try {
        await ctx.api.sendPhoto(CHANNEL_ID, drafts[MY_ID].photo!, {
            caption: drafts[MY_ID].caption,
            parse_mode: 'MarkdownV2'
        });
        await ctx.answerCallbackQuery("Published!");
        await ctx.reply("✅ Published.");
        delete drafts[MY_ID];
    } catch (e: any) {
        await ctx.reply(`Publish Error: ${e.description}`);
    }
});

bot.callbackQuery("pub_cancel", async (ctx) => {
    delete drafts[MY_ID];
    await ctx.answerCallbackQuery("Cleared");
    await ctx.deleteMessage();
});

// ==========================================
// 3. CHAT MODULE
// ==========================================

bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text || '';
    
    // A. WHISPERS
    const replyTo = ctx.message?.reply_to_message?.text;
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
                    return ctx.reply('✅ Reply sent.');
                }
            } catch (e) { return ctx.reply('❌ DB Error.'); }
        }
    }

    // B. PUBLISHER DRAFT
    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        drafts[MY_ID].caption = text;
        const keyboard = new InlineKeyboard()
            .text("🚀 PUBLISH", "pub_post")
            .text("❌ CANCEL", "pub_cancel");

        try {
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, {
                caption: text,
                parse_mode: 'MarkdownV2',
                reply_markup: keyboard
            });
        } catch (e: any) {
            await ctx.reply(`❌ Markdown Error: ${e.description}`);
        }
        return;
    }

    // C. AI CHAT
    const aiChatId = ctx.chat?.id;
    if (aiChatId) await ctx.api.sendChatAction(aiChatId, 'typing');
    
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
        const payload = {
            contents: [{ role: 'user', parts: [{ text }] }],
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.7 }
        };
        const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        const data = await res.json();
        const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (aiResponse) await ctx.reply(aiResponse, { parse_mode: 'Markdown' });
    } catch (err: any) {
        await ctx.reply(`🧠 Error: ${err.message}`);
    }
});

// ==========================================
// SERVER HANDLER
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