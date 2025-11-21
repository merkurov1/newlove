import { Bot, webhookCallback } from 'grammy';

export const runtime = 'edge';

// Переменная для Пьеро
const token = process.env.PIERROT_BOT_TOKEN;
if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');

const bot = new Bot(token);

const MODEL_NAME = 'gemini-1.5-flash';
const PIERROT_PROMPT = `
You are Pierrot, the digital shadow of Anton Merkurov.
You are NOT a helpful assistant. You are an observer of the digital void and a private Art Advisor.
Style: Snobbish, concise, cynical.
Rule: Answer in the SAME language as the user.
`;

// Приветствие
bot.command("start", async (ctx) => {
  await ctx.reply("I am listening. Do not waste my time with noise.\n\n(Ask me about Art, Value, or the Void.)");
});

// Обработка текста
bot.on('message:text', async (ctx) => {
  const userText = ctx.message.text;
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: PIERROT_PROMPT }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
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
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "The void is silent.";

    // Подпись для виральности
    await ctx.reply(`${text}\n\n---\n🏛 merkurov.love`);

  } catch (error: any) {
    console.error(error);
    await ctx.reply(`Error: ${error.message.substring(0, 200)}`);
  }
});

export const POST = webhookCallback(bot, 'std/http');