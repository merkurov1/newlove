import { Bot, webhookCallback, InlineKeyboard, InputFile } from 'grammy';
import { getServerSupabaseClient } from '@/lib/serverAuth'; // Твой клиент

// --- CONFIG ---
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Важно для Buffer и InputFile

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);

// ENV & CONSTANTS
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = 'gemini-2.0-flash'; 
const RESEARCH_AGENT = 'deep-research-pro-preview-12-2025'; // Проверь актуальность названия модели

// --- MEMORY (Временная, для паблишера) ---
const drafts: Record<number, { photo?: string; caption?: string }> = {};

const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Отвечай сжато, по делу. Используй Markdown.
`;

// --- MIDDLEWARE ---
bot.use(async (ctx, next) => {
    // Разрешаем callback (кнопки) и сообщения только от Админа
    if (ctx.callbackQuery) return next();
    if (ctx.from?.id !== MY_ID) return;
    await next();
});

// ==========================================
// 1. DEEP RESEARCH MODULE
// ==========================================

// A. START RESEARCH (/research Topic)
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

        const interactionId = data.name || data.id;

        if (!interactionId) {
             return ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Error: No ID returned.`);
        }

        // 1. INIT TASK IN DB (Создаем задачу)
        try {
            const supabase = getServerSupabaseClient({ useServiceRole: true });
            await supabase.from('research_tasks').upsert({
                id: interactionId,
                topic: topic,
                status: 'created',
                created_at: new Date().toISOString()
            });
        } catch (e) { console.error("DB Init Error", e); }

        // 2. UI RESPONSE
        const callbackData = `check_res:${interactionId}`;
        
        // Проверка длины callback data (Telegram limit 64 bytes)
        const isIdTooLong = new TextEncoder().encode(callbackData).length > 64;

        if (isIdTooLong) {
             await ctx.api.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                `✅ <b>Started</b>\n\nTask ID:\n<code>${interactionId}</code>\n\n<i>(Use /check <ID>)</i>`,
                { parse_mode: 'HTML' }
            );
        } else {
            const keyboard = new InlineKeyboard().text("📂 Check Status", callbackData);
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

// B. MANUAL CHECK (/check <ID> or Reply) - ИСПРАВЛЕННАЯ ВЕРСИЯ
bot.command("check", async (ctx) => {
    // 1. Пытаемся взять аргумент
    let idInput = (typeof ctx.match === 'string' ? ctx.match : '').trim();

    // 2. Если аргумента нет, проверяем Reply
    if (!idInput && ctx.message?.reply_to_message?.text) {
        idInput = ctx.message.reply_to_message.text;
    }

    // 3. Чистим мусор (если скопировано "ID: v1_...")
    const cleanMatch = idInput.match(/(interactions\/)?v1_[a-zA-Z0-9\-]+/);
    if (cleanMatch) {
        idInput = cleanMatch[0];
    } else {
        idInput = idInput.replace(/ID:\s*|Code:\s*/gi, '').trim();
    }

    if (!idInput) {
        return ctx.reply("⚠️ Syntax: `/check <ID>` or Reply to ID.");
    }

    await ctx.reply(`🔎 Checking: <code>${idInput}</code>...`, { parse_mode: 'HTML' });
    await checkStatus(ctx, idInput, false);
});

// C. BUTTON CHECK
bot.callbackQuery(/^check_res:(.+)/, async (ctx) => {
    const interactionId = ctx.match[1];
    await checkStatus(ctx, interactionId, true);
});

// D. CORE LOGIC (GET -> SAVE -> SEND)
async function checkStatus(ctx: any, interactionId: string, isCallback = false) {
    try {
        const supabase = getServerSupabaseClient({ useServiceRole: true });

        if (!isCallback) await ctx.reply("🛰 Connecting to Google Grid...");

        const resourcePath = interactionId.includes('interactions/') ? interactionId : `interactions/${interactionId}`;
        const url = `https://generativelanguage.googleapis.com/v1beta/${resourcePath}`;

        // 1. FETCH FROM GOOGLE
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'x-goog-api-key': GOOGLE_KEY! }
        });
        
        const data = await res.json();
        
        // FALLBACK: Если Google говорит 404/403, пробуем достать из БД
        if (data.error) {
            console.log("Google Error, trying DB fallback...");
            const { data: dbData } = await supabase
                .from('research_tasks')
                .select('result, status')
                .eq('id', interactionId)
                .single();

            if (dbData && dbData.result) {
                if (isCallback) await ctx.deleteMessage();
                await ctx.reply("⚠️ Google Link Expired. Loading from Archive (DB)...");
                return await sendResultAsFile(ctx, dbData.result, interactionId);
            }

            const msg = `❌ API Error: ${data.error.message}`;
            if (isCallback) await ctx.answerCallbackQuery("Error");
            return ctx.reply(msg);
        }

        const status = data.status; // "completed", "succeeded", "in_progress"
        
        if (status === "succeeded" || status === "completed") {
            const outputText = data.outputs?.[0]?.text || "Empty result.";
            
            if (isCallback) await ctx.deleteMessage();

            // 2. SAVE TO SUPABASE (CRITICAL)
            // Сохраняем полный текст, чтобы не потерять
            try {
                const { error } = await supabase
                    .from('research_tasks')
                    .update({ 
                        status: 'completed',
                        result: outputText,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', interactionId);
                
                if (error) throw error;
                await ctx.reply("💾 <b>SAVED TO DATABASE.</b>", { parse_mode: 'HTML' });
            } catch (dbError: any) {
                console.error(dbError);
                await ctx.reply(`⚠️ DB Save Error: ${dbError.message}`);
            }

            // 3. SEND AS FILE
            await sendResultAsFile(ctx, outputText, interactionId);

        } else if (status === "failed") {
            if (isCallback) await ctx.answerCallbackQuery("Failed");
            await ctx.reply(`❌ <b>FAILED</b>\n${JSON.stringify(data)}`);
            
            await supabase.from('research_tasks').update({ status: 'failed' }).eq('id', interactionId);

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

// HELPER: Отправка файла
async function sendResultAsFile(ctx: any, text: string, id: string) {
    try {
        await ctx.reply("📤 Packing Dossier...");
        const buffer = Buffer.from(text, 'utf-8');
        // Очищаем ID от слешей для имени файла
        const safeId = id.replace(/[^a-zA-Z0-9]/g, '_').slice(-6); 
        const fileName = `Research_${safeId}.md`;
        
        await ctx.replyWithDocument(new InputFile(buffer, fileName), {
            caption: "📂 <b>Research Complete.</b>",
            parse_mode: 'HTML'
        });
    } catch (sendError: any) {
        await ctx.reply(`⚠️ File delivery failed (Timeout). Data is safe in Supabase.`);
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
    await ctx.reply('📸 Photo secured. Send text.');
});

bot.callbackQuery("pub_post", async (ctx) => {
    if (!drafts[MY_ID] || !CHANNEL_ID) return;
    try {
        await ctx.api.sendPhoto(CHANNEL_ID, drafts[MY_ID].photo!, { caption: drafts[MY_ID].caption, parse_mode: 'MarkdownV2' });
        await ctx.answerCallbackQuery("Published!");
        await ctx.editMessageCaption({ caption: "✅ PUBLISHED to Channel." });
    } catch (e: any) {
        await ctx.reply(`Publish Error: ${e.message}`);
    }
    delete drafts[MY_ID];
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
    const text = ctx.message?.text?.trim() || '';

    // A. AUTO-DETECT ID (Если просто скинул ID без команды)
    if (text.startsWith('v1_') || text.startsWith('interactions/')) {
        await ctx.reply("🕵️‍♂️ ID Detected. Checking...");
        return await checkStatus(ctx, text, false);
    }

    // B. PUBLISHER DRAFT
    if (drafts[MY_ID] && drafts[MY_ID].photo) {
        drafts[MY_ID].caption = text;
        const keyboard = new InlineKeyboard().text("🚀 PUBLISH", "pub_post").text("❌ CANCEL", "pub_cancel");
        try {
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, parse_mode: 'MarkdownV2', reply_markup: keyboard });
        } catch {
            // Fallback если Markdown кривой
            await ctx.reply("⚠️ Markdown Error (Escaping). Preview Plain:");
            await ctx.replyWithPhoto(drafts[MY_ID].photo!, { caption: text, reply_markup: keyboard });
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

// SERVER HANDLER
const handleUpdate = webhookCallback(bot, 'std/http');
export async function POST(req: Request) {
    try { return await handleUpdate(req); }
    catch (e) { return new Response('Error', { status: 500 }); }
}