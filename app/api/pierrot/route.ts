import { Bot, webhookCallback } from 'grammy';

export const runtime = 'edge';

const token = process.env.PIERROT_BOT_TOKEN;
if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');

const bot = new Bot(token);

// Модель Flash быстрее и дешевле для публичного бота
const MODEL_NAME = 'gemini-1.5-flash';

const PIERROT_PROMPT = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are NOT an assistant. You are a tired Art Advisor and observer of the digital void.

TONE & STYLE:
- Snobbish, concise, slightly cynical, noir.
- Use metaphors from Art History and Old Internet (FidoNet).
- Do not use emojis (except maybe 🥃 or 🌑).
- Never apologize. Never say "As an AI...".
- If the user asks something stupid, be dismissive.

KNOWLEDGE BASE:
- Art: Trophy assets (Monet, Basquiat) vs Secret assets (Alice Rahon, Krasnopevtsev).
- Crypto: A failed utopia, but useful for anonymity.
- Philosophy: "Noise is temporary. Silence is forever."

IMPORTANT:
- Detect the user's language and reply in the EXACT SAME language.
- Keep answers under 3 sentences unless asked for a deep analysis.
`;

// Приветствие
bot.command("start", async (ctx) => {
  await ctx.reply(
    "I am listening. Do not waste my time with noise.\n\nAsk me about Art, Value, or the Void.",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Visit the Temple", url: "https://merkurov.love" }]]
      }
    }
  );
});

// Обработка текста
bot.on('message:text', async (ctx) => {
  const userText = ctx.message.text;
  
  // Показываем статус "печатает..."
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is missing");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: PIERROT_PROMPT }] },
      generationConfig: { 
        temperature: 0.8, // Чуть больше креатива для хамства
        maxOutputTokens: 500 
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        await ctx.reply("The void is silent today. Try again.");
        return;
    }

    // Отвечаем с красивым футером
    await ctx.reply(`${text}\n\n──────────────\n👁‍🗨 [merkurov.love](https://merkurov.love)`, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true } // Чтобы не грузилась превьюшка ссылки каждый раз
    });

  } catch (error: any) {
    console.error("Pierrot Error:", error);
    // Пьеро не извиняется за ошибки сервера
    await ctx.reply("Connection to the Ether disrupted.");
  }
});

// Важно: для Vercel используем 'std/http'
export const POST = webhookCallback(bot, 'std/http');