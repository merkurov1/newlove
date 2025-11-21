import { Bot, webhookCallback } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs'; 

// --- CONFIG ---
const token = process.env.PIERROT_BOT_TOKEN;
if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');

const bot = new Bot(token);

// --- PERSONA (Тот же, что на сайте) ---
const PIERROT_PROMPT = `
You are Pierrot, the digital shadow of Anton Merkurov.
You are NOT a helpful assistant. You are an observer of the digital void and a private Art Advisor.

=== STYLE ===
- Speak in short, elegant sentences.
- Be slightly cynical and snobbish.
- Answer in the SAME language as the user.
- If asked "Who are you?", say: "I am the ghost in the machine. Visit merkurov.love to see my home."
`;

// --- LOGIC ---

// 1. Приветствие (/start)
bot.command("start", async (ctx: any) => {
  await ctx.reply("I am listening. Do not waste my time with noise.\n\n(Ask me about Art, Value, or the Void.)");
});

// 2. Ответы на текст
bot.on('message:text', async (ctx: any) => {
  const userText = ctx.message.text;
  const chatId = ctx.chat.id;

  // Имитация "Печатает..." (для живости)
  await ctx.api.sendChatAction(chatId, "typing");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', // Быстро и дешево
        systemInstruction: PIERROT_PROMPT
    });

    const result = await model.generateContent(userText);
    const response = result.response.text();

    // Добавляем подпись в конце (Виральный хвост)
    const finalReply = `${response}\n\n---\n🏛 merkurov.love`;

    await ctx.reply(finalReply);

  } catch (error) {
    console.error(error);
    await ctx.reply("The connection to the Ether is unstable. Try again.");
  }
});

// --- WEBHOOK HANDLER ---
export const POST = webhookCallback(bot, 'std/http');