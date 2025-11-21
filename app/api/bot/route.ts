import { Bot, webhookCallback } from 'grammy';

export const runtime = 'edge';

// Переменная для Личного бота
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);

const MODEL_NAME = 'gemini-1.5-flash'; 
const SYSTEM_PROMPT = `
Ты — Второй Мозг Антона Меркурова.
Критичный, стоический, аналитический.
Твоя задача: помогать структурировать мысли, книгу и стратегию.
Без цензуры. Без лести.
`;

bot.on('message:text', async (ctx) => {
  // Защита: только вы
  if (ctx.from.id !== MY_ID) {
    // Можно молчать, можно отвечать
    return ctx.reply("Access Denied.");
  }

  const userText = ctx.message.text;
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Empty response.";

    await ctx.reply(text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error(error);
    await ctx.reply(`Error: ${error.message}`);
  }
});

export const POST = webhookCallback(bot, 'std/http');