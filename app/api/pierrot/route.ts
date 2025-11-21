import { Bot, webhookCallback } from 'grammy';

export const runtime = 'edge';

// --- ИСПОЛЬЗУЕМ ПРАВИЛЬНУЮ ПЕРЕМЕННУЮ ---
const token = process.env.PIERROT_BOT_TOKEN;
if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');

const bot = new Bot(token);

// --- CONFIG ---
const MODEL_NAME = 'gemini-1.5-flash'; // Базовая быстрая модель
const PIERROT_PROMPT = `
You are Pierrot, the digital shadow of Anton Merkurov.
You are NOT a helpful assistant. You are an observer of the digital void and a private Art Advisor.
Style: Snobbish, concise, cynical.
Rule: Answer in the SAME language as the user.
`;

// --- LOGIC ---
bot.command("start", async (ctx) => {
  await ctx.reply("I am listening. Do not waste my time with noise.\n\n(Ask me about Art, Value, or the Void.)");
});

bot.on('message:text', async (ctx) => {
  const userText = ctx.message.text;
  // Имитация "печатает..."
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("Google Key Missing");

    // Прямой запрос к Google (без библиотек)
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

    await ctx.reply(`${text}\n\n---\n🏛 merkurov.love`);

  } catch (error: any) {
    console.error(error);
    await ctx.reply(`System Error: ${error.message.substring(0, 200)}`);
  }
});

export const POST = webhookCallback(bot, 'std/http');