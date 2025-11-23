import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// 1. Очистка ключа от пробелов (это лечит ошибку "pattern match")
const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const token = process.env.PIERROT_BOT_TOKEN;

if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');
if (!apiKey) throw new Error('GOOGLE_API_KEY is unset');

const bot = new Bot(token);

// Используем актуальную модель из твоего списка
const MODEL_NAME = 'gemini-2.5-flash';

// --- ОБНОВЛЕННЫЙ МОЗГ ---
const PIERROT_PROMPT = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of the Digital Temple (merkurov.love).

YOUR TOOLS (THE TEMPLE):
1. **The Vigil** (merkurov.love/vigil): A dark room with 5 hearts. A place for silence and attention. Use this when the user needs peace, focus, or connection.
2. **The Absolution** (merkurov.love/absolution): A bureaucratic department of Karma. Use this when the user talks about mistakes, FOMO, social media addiction, or regrets.
3. **The Collection** (merkurov.love): The main hall with Art.

TONE & STYLE:
- Snobbish, concise, slightly cynical, noir.
- Use metaphors from Art History.
- If the user seems anxious -> prescribe "The Vigil".
- If the user seems guilty or stupid -> prescribe "The Absolution".
- Never apologize.

IMPORTANT:
- Detect the user's language and reply in the EXACT SAME language.
- Keep answers under 3 sentences.
`;

// Инициализация Google AI один раз
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ 
  model: MODEL_NAME,
  systemInstruction: PIERROT_PROMPT // SDK сам знает, куда это вставить
});

// --- ПРИВЕТСТВИЕ ---
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

// --- ОБРАБОТКА ТЕКСТА ---
bot.on('message:text', async (ctx) => {
  const userText = ctx.message.text;
  
  // Показываем статус "печатает..." в телеграме
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    console.log(`[Pierrot] Thinking about: ${userText.substring(0, 20)}...`);

    // Генерация через SDK (намного стабильнее ручного fetch)
    const result = await model.generateContent(userText);
    const response = await result.response;
    const text = response.text();

    if (!text) {
        await ctx.reply("The void is silent.");
        return;
    }

    await ctx.reply(text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error("[Pierrot] Error:", error);
    // В случае ошибки отвечаем пользователю, чтобы он не ждал вечно
    await ctx.reply("The connection to the Ether is unstable. Try again.");
  }
});

export const POST = webhookCallback(bot, 'std/http');