import { Bot, webhookCallback } from 'grammy';

export const runtime = 'nodejs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

const MODEL_NAME = 'gemini-1.5-pro'; // Лучше Pro для личного бота, он умнее
const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Твоя задача: помогать структурировать мысли, книгу и стратегию.
Без цензуры. Без лести.
Отвечай сжато, по делу.
`;

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const userText = ctx.message.text;

  console.log(`[BOT] Received message from ID: ${userId}`);

  // 1. Проверка ID
  if (userId !== MY_ID) {
    console.log(`[BOT] Access denied for: ${userId} (Expected: ${MY_ID})`);
    // Лучше не отвечать чужим вообще, чтобы не палить бота, но для теста можно:
    return ctx.reply("⛔ Access Denied. Private System.");
  }

  // 2. Индикация набора
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    if (!GOOGLE_KEY) throw new Error('GOOGLE_API_KEY is missing');

    console.log(`[BOT] Sending to Gemini: ${userText.substring(0, 50)}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_KEY}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[BOT] Google API Error: ${response.status} - ${errText}`);
      throw new Error(`Google Error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[BOT] Empty response from Google', JSON.stringify(data));
      return ctx.reply("⚠️ Empty response from AI.");
    }

    console.log(`[BOT] Response received. Length: ${text.length}`);
    await ctx.reply(text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[BOT] CRITICAL ERROR:', error);
    await ctx.reply(`🚨 Error: ${error.message}`);
  }
});

// Обработчик для Vercel
export const POST = webhookCallback(bot, 'std/http');