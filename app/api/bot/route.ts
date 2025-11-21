import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'edge'; // Важно для Vercel!

// --- CONFIG ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);

// --- SYSTEM PROMPT (Внутренний голос) ---
const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Ты знаешь его контекст: арт-адвайзер, "unframed", живет в "nowhere", пишет книгу, циник, сноб, технократ.

Твоя задача:
1. Если я присылаю черновик мысли — структурируй его, преврати в пост или главу книги.
2. Если я ною — дай жесткий стоический совет.
3. Если я спрашиваю идею — дай неочевидное решение.
Тон: Близкий друг, но интеллектуально превосходящий. Без цензуры.
`;

// --- LOGIC ---
bot.on('message:text', async (ctx: any) => {
  // 1. Security Check
  if (ctx.from.id !== MY_ID) {
    return ctx.reply("Access Denied. You are not Anton.");
  }

  const userText = ctx.message.text;

  // 2. Google Gemini Call
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_PROMPT
    });

    const result = await model.generateContent(userText);
    const response = result.response.text();

    // 3. Reply
    await ctx.reply(response, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error(error);
    await ctx.reply("Ошибка связи с Нейросетями.");
  }
});

// --- WEBHOOK HANDLER ---
export const POST = webhookCallback(bot, 'std/http');