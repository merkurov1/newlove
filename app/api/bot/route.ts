import { Bot, webhookCallback } from 'grammy';

// Важно для Vercel: отключаем кэширование
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is unset');

const bot = new Bot(token);
const MY_ID = Number(process.env.MY_TELEGRAM_ID);
const GOOGLE_KEY = process.env.GOOGLE_API_KEY;

// Используем рабочую модель из твоего списка
const MODEL_NAME = 'gemini-2.0-flash';

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

  console.log(`[PrivateBot] Msg from: ${userId}`);

  // 1. Жесткая проверка ID (только ты)
  if (userId !== MY_ID) {
    console.log(`[PrivateBot] Denied. ID: ${userId} != ${MY_ID}`);
    return ctx.reply("⛔ Access Denied. Private System.");
  }

  // 2. Статус "печатает..."
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    if (!GOOGLE_KEY) throw new Error('GOOGLE_API_KEY is missing');

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
      console.error(`[PrivateBot] Google Error: ${response.status}`, errText);
      throw new Error(`Google Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[PrivateBot] Empty AI response');
      return ctx.reply("⚠️ Empty response from AI.");
    }

    // Отвечаем (Markdown)
    await ctx.reply(text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[PrivateBot] Critical:', error);
    await ctx.reply(`🚨 Error: ${error.message}`);
  }
});

// Надежный обработчик вебхука
const handleUpdate = webhookCallback(bot, 'std/http');

export async function POST(req: Request) {
    try {
        return await handleUpdate(req);
    } catch (e) {
        console.error('[PrivateBot] Webhook Error:', e);
        return new Response('Error', { status: 500 });
    }
}