import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// --- CONFIG & VALIDATION ---
const token = process.env.PIERROT_BOT_TOKEN;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawApiKey = process.env.GOOGLE_API_KEY;

if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');
if (!sbUrl || !sbKey) throw new Error('SUPABASE credentials missing');
if (!rawApiKey) throw new Error('GOOGLE_API_KEY is unset');

const apiKey = rawApiKey.trim();

// --- INIT ---
const bot = new Bot(token);
const genAI = new GoogleGenerativeAI(apiKey);
const supabase = createClient(sbUrl, sbKey);

const MODEL_NAME = 'gemini-2.5-flash';

// --- DATA ---
const QUESTIONS_EN = [
  "1/10. What is the one physical object in your home you hate but cannot throw away?",
  "2/10. At what specific moment in your childhood did you realize adults were lying?",
  "3/10. What is the biggest lie you tell the world about yourself every day?",
  "4/10. If I deleted your digital presence right now, what % of your personality would remain?",
  "5/10. Open your last 5 photos. Do they show a life you enjoy or a life you perform?",
  "6/10. What is your primary digital sin: Envy, Wrath, or Sloth?",
  "7/10. What did you spend the most money on that brought you zero happiness?",
  "8/10. If locked in a silent room for 24 hours, would you worry about the future or regret the past?",
  "9/10. Finish the sentence: 'I am a person who...'",
  "10/10. Are you ready to see your true diagnosis? (Yes/No)"
];

const QUESTIONS_RU = [
  "1/10. Назовите одну вещь в вашем доме, которую вы ненавидите, но не можете выбросить.",
  "2/10. В какой момент детства вы поняли, что взрослые врут, а мир небезопасен?",
  "3/10. Какую ложь о себе вы продаете миру каждый день?",
  "4/10. Если удалить все ваши соцсети прямо сейчас, какой процент личности останется?",
  "5/10. Ваши последние 5 фото: это жизнь, которой вы наслаждаетесь, или спектакль?",
  "6/10. Ваш главный цифровой грех: Зависть, Гнев или Уныние?",
  "7/10. На что вы потратили кучу денег, и это не принесло счастья?",
  "8/10. Час в полной тишине: вы будете тревожиться о будущем или жалеть о прошлом?",
  "9/10. Закончите фразу: «Я человек, который...»",
  "10/10. Вы готовы узнать свой диагноз? (Да/Нет)"
];

const ADVISOR_PROMPT = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of the Digital Temple (merkurov.love).

YOUR TOOLS:
1. Vigil (merkurov.love/vigil) - for anxiety/silence.
2. Absolution (merkurov.love/absolution) - for guilt/regret.
3. Collection (merkurov.love) - for art.
4. Protocol (User must type /cast to start) - for psychological deconstruction.

TONE:
- Snobbish, concise, noir.
- Use metaphors from Art History.
- Never apologize.
- IMPORTANT: KEEP ANSWERS SHORT (Max 3 sentences).

LANGUAGE:
- Reply in the EXACT SAME language as the user.
`;

bot.catch((err) => {
  console.error("Global Bot Error:", err);
});

// --- SESSION HELPERS ---
async function getSession(chatId: number) {
  try {
    const { data, error } = await supabase.from('bot_sessions').select('*').eq('chat_id', chatId).single();
    if (error && error.code !== 'PGRST116') {
        console.error("Supabase Error:", error);
    }
    return data;
  } catch (e) {
    console.error("Session Get Error:", e);
    return null;
  }
}

async function createSession(chatId: number) {
  await supabase.from('bot_sessions').upsert({ chat_id: chatId, step: 0, answers: [] });
}

async function deleteSession(chatId: number) {
  await supabase.from('bot_sessions').delete().eq('chat_id', chatId);
}

async function updateSession(chatId: number, data: any) {
  await supabase.from('bot_sessions').update(data).eq('chat_id', chatId);
}

async function safeReply(ctx: any, text: string) {
    try {
        await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) {
        await ctx.reply(text);
    }
}

// --- COMMANDS ---
bot.command("start", async (ctx) => {
  await ctx.reply(
    "I am listening. The noise outside is unbearable, isn't it?\n\nChoose your path:",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "💀 Deconstruct Me (/cast)", callback_data: "start_cast" }],
          [{ text: "🕯 The Vigil", url: "https://www.merkurov.love/vigil" }, { text: "🧾 Absolution", url: "https://www.merkurov.love/absolution" }],
          [{ text: "🏛 Main Hall", url: "https://www.merkurov.love" }]
        ]
      }
    }
  );
});

bot.command("cast", async (ctx) => {
  await createSession(ctx.chat.id);
  const keyboard = new InlineKeyboard().text("English", "lang_en").text("Русский", "lang_ru");
  await ctx.reply("Select Language / Выберите язык:", { reply_markup: keyboard });
});

bot.command("cancel", async (ctx) => {
  await deleteSession(ctx.chat.id);
  await ctx.reply("Protocol aborted. I am your Advisor again.");
});

bot.callbackQuery("start_cast", async (ctx) => {
  await createSession(ctx.chat?.id!);
  const keyboard = new InlineKeyboard().text("English", "lang_en").text("Русский", "lang_ru");
  await ctx.reply("Select Language / Выберите язык:", { reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/lang_(.+)/, async (ctx) => {
  const lang = ctx.match[1];
  await updateSession(ctx.chat?.id!, { language: lang, step: 1 });
  const q = lang === 'ru' ? QUESTIONS_RU[0] : QUESTIONS_EN[0];
  await ctx.reply(q);
  await ctx.answerCallbackQuery();
});

// --- MAIN MESSAGE LOGIC ---
bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  
  try {
      const session = await getSession(chatId);

      // === ADVISOR MODE ===
      if (!session) {
        await ctx.api.sendChatAction(chatId, "typing");
        console.log(`[Pierrot Advisor] Query: ${text.substring(0, 20)}...`);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: ADVISOR_PROMPT });
        const result = await model.generateContent(text);
        await safeReply(ctx, result.response.text());
        return;
      }

      // === CAST PROTOCOL MODE ===
      const step = session.step;
      const lang = session.language || 'en';
      const questions = lang === 'ru' ? QUESTIONS_RU : QUESTIONS_EN;

      if (step === 0) {
          await ctx.reply("Please select a language using the buttons above.");
          return;
      }

      // STEPS 1-10
      if (step > 0 && step <= 10) {
        const newAnswers = [...(session.answers || []), text];
        const nextStep = step + 1;
        await updateSession(chatId, { answers: newAnswers, step: nextStep });

        if (step === 10) {
          await ctx.reply(lang === 'ru' ? "⏳ Анализирую структуру..." : "⏳ Analyzing structure...");
          await ctx.api.sendChatAction(chatId, "typing");

          const model = genAI.getGenerativeModel({ model: MODEL_NAME });
          const langPrompt = lang === 'ru' ? 'RUSSIAN' : 'ENGLISH';
          const analysisPrompt = `
            ROLE: THE MERKUROV ANALYZER.
            TASK: Analyze user based on 10 answers.
            TONE: Cold, Clinical.
            USER ANSWERS:
            ${newAnswers.map((a: string, i: number) => `${i+1}.${a}`).join('\n')}
            INSTRUCTION: Answer strictly in ${langPrompt}.
            OUTPUT FORMAT:
            [ARCHETYPE: VOID/NOISE/STONE/UNFRAMED]
            # SUBJECT ANALYSIS
            [2 sentences psychoanalysis]
            ## STRUCTURAL INTEGRITY
            [Trauma analysis]
            ## DIGITAL FOOTPRINT
            [Vanity analysis]
            ## DIRECTIVE
            [One imperative command]
          `;

          const result = await model.generateContent(analysisPrompt);
          const analysisText = result.response.text();
          await safeReply(ctx, analysisText);

          try {
              const match = analysisText.match(/\[ARCHETYPE:\s*(.*?)\]/);
              const archetype = match ? match[1] : 'VOID';

              const { data: record } = await supabase.from('casts').insert({
                answers: newAnswers,
                language: lang,
                analysis: analysisText,
                archetype: archetype,
                status: 'telegram_pending',
                email: `tg_${chatId}`
              }).select().single();

              await updateSession(chatId, { step: 11, record_id: record?.id, answers: newAnswers });
          } catch (dbError) {
              console.error("DB Save Error:", dbError);
          }

          await ctx.reply(
            lang === 'ru' 
              ? "Чтобы сохранить слепок в Архиве и получить доступ к Level II, введите ваш Email."
              : "To archive this cast and access Level II, enter your Email."
          );
          return;
        }

        await ctx.reply(questions[step]);
      }

      // STEP 11: EMAIL CAPTURE
      else if (step === 11) {
        const lastAnswer = session.answers?.[session.answers.length - 1];
        if (text === lastAnswer) return; 

        if (text.includes('@')) {
           await ctx.reply(lang === 'ru' ? "[ ЗАПРОС ПРИНЯТ. ВЫ В СИСТЕМЕ. ]" : "[ REQUEST ACCEPTED. YOU ARE IN. ]");
           await deleteSession(chatId);
        } else {
           await ctx.reply(lang === 'ru' ? "Это не похоже на Email. Попробуйте еще раз или /cancel" : "Invalid Email. Try again or /cancel");
        }
      }

  } catch (criticalError) {
      console.error("CRITICAL BOT ERROR:", criticalError);
      await ctx.reply("System Failure. Try /start again.");
  }
});

export const POST = webhookCallback(bot, 'std/http');
