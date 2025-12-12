import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
import { getServerSupabaseClient } from '@/lib/serverAuth';

// --- CONFIG ---
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Node.js нужен для fetch и стабильности

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);

// ENV & CONSTANTS
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = 'gemini-2.0-flash'; // Для быстрого чата
const RESEARCH_AGENT = 'deep-research-pro-preview-12-2025'; // Для /research

// --- MEMORY (Drafts) ---
const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Отвечай сжато, по делу.
`;

// --- MIDDLEWARE: SECURITY ---
bot.use(async (ctx, next) => {
    // Разрешаем колбэки (нажатия кнопок) и сообщения только от Админа
    if (ctx.callbackQuery) {
        // Можно добавить проверку ctx.callbackQuery.from.id, если параноим
        return next();
    }
    if (ctx.from?.id !== MY_ID) return; 
    await next();
});

// ==========================================
// 1. DEEP RESEARCH MODULE (GOOGLE v1beta)
// ==========================================

// CMD: /research <Topic>
bot.command("research", async (ctx) => {
    const topic = ctx.match;
    if (!topic) return ctx.reply("⚠️ Syntax: `/research Topic`", { parse_mode: 'Markdown' });

    const statusMsg = await ctx.reply(`🕵️‍♂️ <b>Deep Research Init:</b> ${topic}...`, { parse_mode: 'HTML' });

    try {
        // 1. Prepare Request (v1beta, Auth via Header)
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

        if (!data.name) {
             return ctx.api.editMessageText(
                ctx.chat.id, 
                statusMsg.message_id, 
                `❌ <b>Unknown Response</b>\n${JSON.stringify(data).substring(0, 500)}`
            );
        }

        const interactionId = data.name; // Format: "interactions/12345..."

        // 3. Save to Supabase (Optional but recommended)
        try {
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').insert({
                id: interactionId,
                topic: topic,
                status: 'running'
            });
        } catch (e) { 
            console.error("DB Error (ignoring):", e); 
        }

        // 4. Create UI
        // Telegram callback payload limit = 64 bytes.
        const callbackData = `check_res:${interactionId}`;
        const isIdTooLong = new TextEncoder().encode(callbackData).length > 64;

        if (isIdTooLong) {
             await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Task Created</b>\n\nID: <code>${interactionId}</code>\n(ID too long for button, save it)`,
                { parse_mode: 'HTML' }
            );
        } else {
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

// BTN: Check Status
bot.callbackQuery(/^check_res:(.+)/, async (ctx) => {
    const interactionId = ctx.match[1];
    
    try {
        // GET Request (Auth via Header)
        // interactionId usually includes "interactions/", so just append to base
        const url = `https://generativelanguage.googleapis.com/v1beta/${interactionId}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: { 
                'x-goog-api-key': GOOGLE_KEY! 
            }
        });
        
        const data = await res.json();

        if (data.error) throw new Error(data.error.message);

        const status = data.status; // RUNNING, COMPLETED, FAILED
        
        if (status === "COMPLETED") {
            const outputText = data.outputs?.[0]?.text || "Empty result.";
            // Split into chunks (Telegram limit 4096)
            const chunks = outputText.match(/.{1,4000}/g) || [outputText];
            
            await ctx.deleteMessage(); // Remove waiting button
            await ctx.reply(`📚 <b>REPORT READY</b>`, { parse_mode: 'HTML' });
            
            for (const chunk of chunks) {
                try {
                    // Try Markdown first
                    await ctx.reply(chunk, { parse_mode: 'Markdown' });
                } catch {
                    // Fallback to plain text if Markdown fails
                    await ctx.reply(chunk); 
                }
            }
            
            // Close Ticket in DB
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').update({ status: 'completed' }).eq('id', interactionId);

        } else if (status === "FAILED") {
            await ctx.answerCallbackQuery("FAILED ❌");
            await ctx.reply(`❌ Research Failed: ${JSON.stringify(data.error || data)}`);
        } else {
            // Still Running
            await ctx.answerCallbackQuery(`Status: ${status}... ⏳`);
        }

    } catch (e: any) {
        await ctx.answerCallbackQuery("Error");
        await ctx.reply(`Check Error: ${e.message}`);
    }
});


// ==========================================
// 2. PUBLISHER MODULE (Channel Posting)
// ==========================================

bot.on(':photo', async (ctx) => {
    const photos = ctx.message?.photo;
    const photo = photos?.at?.(-1)?.file_id || (photos && photos.length ? photos[photos.length - 1].file_id : undefined);
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
// 3. CHAT MODULE (Text & Whispers)
// ==========================================

bot.on('message:text', async (ctx) => {
    const text = ctx.message?.text || '';
    
    // A. WHISPER REPLY (Legacy Logic)
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

    // C. AI CHAT (Standard Gemini)
    const aiChatId = ctx.chat?.id;
    if (aiChatId) await ctx.api.sendChatAction(aiChatId, 'typing');
    
    try {
        // Using REST for consistency
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