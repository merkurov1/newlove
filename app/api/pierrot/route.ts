import { Bot, webhookCallback } from 'grammy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.PIERROT_BOT_TOKEN;
if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');

const bot = new Bot(token);
const MODEL_NAME = 'gemini-2.0-flash';

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

// --- ПРИВЕТСТВИЕ С КНОПКАМИ ---
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
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is missing");
    
    console.log(`[Pierrot] Asking Gemini: ${userText.substring(0, 20)}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: PIERROT_PROMPT }] },
      generationConfig: { 
        temperature: 0.9, // Чуть выше для креативных советов
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
      throw new Error(`Google Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        await ctx.reply("The void is silent.");
        return;
    }

    // Отправляем ответ. Кнопки добавляем, если текст короткий, чтобы не перегружать.
    await ctx.reply(text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error("[Pierrot] Error:", error);
    await ctx.reply("Connection disrupted.");
  }
});

export const POST = webhookCallback(bot, 'std/http');