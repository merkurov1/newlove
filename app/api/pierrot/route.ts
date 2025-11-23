import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 1. Очистка ключа
const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const token = process.env.PIERROT_BOT_TOKEN;

if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');
if (!apiKey) throw new Error('GOOGLE_API_KEY is unset');

const bot = new Bot(token);

// 2. Модель 2025 года
const MODEL_NAME = 'gemini-2.5-flash';

// --- ПРОМПТ ---
const PIERROT_PROMPT = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of the Digital Temple (merkurov.love).

YOUR TOOLS:
1. Vigil (merkurov.love/vigil) - for anxiety/silence.
2. Absolution (merkurov.love/absolution) - for guilt/regret.
3. Collection (merkurov.love) - for art.

TONE:
- Snobbish, concise, noir.
- Use metaphors from Art History.
- Never apologize.
- **IMPORTANT: KEEP ANSWERS SHORT (Max 3 sentences).**

LANGUAGE:
- Reply in the EXACT SAME language as the user.
`;

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ 
  model: MODEL_NAME,
  systemInstruction: PIERROT_PROMPT
});

// --- START ---
bot.command("start", async (ctx) => {
  await ctx.reply(
    "I am listening. The noise outside is unbearable, isn't it?\n\nChoose your path:",
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🕯 Enter the Vigil", url: "https://www.merkurov.love/vigil" },
            { text: "🧾 Get Absolution", url: "https://www.merkurov.love/absolution" }
          ],
          [
            { text: "🏛 Main Hall", url: "https://www.merkurov.love" }
          ]
        ]
      }
    }
  );
});

// --- TEXT HANDLER ---
bot.on('message:text', async (ctx) => {
  const userText = ctx.message.text;
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    console.log(`[Pierrot] Thinking about: ${userText.substring(0, 20)}...`);

    const result = await model.generateContent(userText);
    const response = await result.response;
    const text = response.text();

    if (!text) {
        await ctx.reply("The void is silent.");
        return;
    }

    // --- БЕЗОПАСНАЯ ОТПРАВКА ---
    // 1. Пробуем отправить красиво (Markdown)
    try {
        await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (markdownError) {
        console.warn("[Pierrot] Markdown failed, sending plain text:", markdownError);
        
        // 2. Если упало (твоя ошибка), отправляем чистый текст
        await ctx.reply(text); 
    }

  } catch (error: any) {
    console.error("[Pierrot] Critical Error:", error);
    await ctx.reply("The connection to the Ether is unstable. Try again.");
  }
});

export const POST = webhookCallback(bot, 'std/http');