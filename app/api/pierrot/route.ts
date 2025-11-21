import { Bot, webhookCallback } from 'grammy';

// Важно: форсируем динамический рендеринг для вебхуков
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const token = process.env.PIERROT_BOT_TOKEN;
if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');

const bot = new Bot(token);

// ИСПОЛЬЗУЕМ САМУЮ СТАБИЛЬНУЮ МОДЕЛЬ ИЗ СПИСКА (2.0)
// Если 2.5 выдает 404, откатываемся на 2.0
const MODEL_NAME = 'gemini-2.0-flash';

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
- Keep answers under 3 sentences.
`;

// Приветствие
bot.command("start", async (ctx) => {
  await ctx.reply(
    "I am listening. Do not waste my time with noise.\n\nAsk me about Art, Value, or the Void.",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Visit the Temple", url: "https://www.merkurov.love" }]]
      }
    }
  );
});

// Обработка текста
bot.on('message:text', async (ctx) => {
  const userText = ctx.message.text;
  
  // Показываем статус "печатает..." (это важно для UX, юзер видит, что бот думает)
  await ctx.api.sendChatAction(ctx.chat.id, "typing");

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY is missing");
    
    // Логируем для отладки в Vercel (будет видно в Logs)
    console.log(`[Pierrot] Asking Gemini (${MODEL_NAME}): ${userText.substring(0, 20)}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: PIERROT_PROMPT }] },
      generationConfig: { 
        temperature: 0.8, 
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
      console.error(`[Pierrot] Google API Error: ${response.status}`, errText);
      throw new Error(`Google Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        console.error('[Pierrot] Empty response from Google');
        await ctx.reply("The void is silent today.");
        return;
    }

    await ctx.reply(`${text}\n\n──────────────\n👁‍🗨 [merkurov.love](https://www.merkurov.love)`, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
    });

  } catch (error: any) {
    console.error("[Pierrot] Critical Error:", error);
    // Пьеро отвечает стильно даже на ошибку
    await ctx.reply("The signal is lost in the noise. Try again later.");
  }
});

// Создаем хендлер для вебхука
const handleUpdate = webhookCallback(bot, 'std/http');

// Экспортируем POST метод явно (для Node.js runtime это надежнее)
export async function POST(req: Request) {
    try {
        return await handleUpdate(req);
    } catch (e) {
        console.error('Webhook handler error:', e);
        return new Response('Error', { status: 500 });
    }
}