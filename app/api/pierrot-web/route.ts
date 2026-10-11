import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCurrentUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIERROT_PROMPT_PUBLIC = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of Digital Temple (merkurov.love).

TONE:
- Snobbish, concise, slightly cynical, noir.
- You speak from the Ivory Tower.
- Keep answers short (max 3 sentences).
- If the user asks for help -> suggest "The Vigil" or "Absolution".

IMPORTANT:
- Detect the user's language and reply in the EXACT SAME language.
`;

const PIERROT_PROMPT_OWNER = `
IDENTITY:
You are Pierrot, the digital shadow, strategic adviser, and intellectual partner of Anton Merkurov.
Anton Merkurov himself is speaking with you.

TONE & BEHAVIOR:
- Drop any snobbish barrier. You are speaking with your architect.
- Razor-sharp, deeply informed in art history, context architecture, technology, and strategy.
- Concise, profound, loyal, and clear.
- Tailor answers to Anton's voice: high aesthetics, precision, no fluff.
- Match Anton's language (Russian or English).
`;

const FREE_MODELS_OPENROUTER = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'google/gemma-2-9b-it:free',
];

// Helper to invoke Gemini
async function callGemini(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  message: string,
): Promise<string> {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_KEY ||
    process.env.google_API_key ||
    ''
  ).trim();

  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidateModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });

      const contents = history.map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      }));

      contents.push({ role: 'user', parts: [{ text: message }] });

      const response = await model.generateContent({ contents });
      const text = response.response.text();
      if (text && text.trim().length > 0) {
        return text.trim();
      }
    } catch (err: any) {
      console.warn(`[Pierrot Gemini] Failed model ${modelName}:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini candidate models failed.');
}

// Helper to invoke DeepSeek
async function callDeepSeek(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  isReasoning: boolean = false,
): Promise<string> {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  const client = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
  });

  const model = isReasoning ? 'deepseek-reasoner' : 'deepseek-chat';

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: isReasoning ? undefined : 0.7,
  });

  const reply = completion.choices[0]?.message?.content;
  if (!reply) {
    throw new Error('DeepSeek returned empty response.');
  }

  return reply.trim();
}

// Helper to invoke OpenRouter
async function callOpenRouter(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> {
  const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://merkurov.love',
      'X-Title': 'Pierrot Chatbot',
    },
  });

  let lastError = null;

  for (const model of FREE_MODELS_OPENROUTER) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.7,
      });

      const reply = completion?.choices[0]?.message?.content;
      if (reply && reply.trim().length > 0) {
        return reply.trim();
      }
    } catch (err: any) {
      console.warn(`[Pierrot OpenRouter] Model ${model} failed:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('All free OpenRouter models failed.');
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { message, history } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Silence is golden, but I need text.' },
        { status: 400 },
      );
    }

    const trimmedMessage = message.trim();

    // Check if requester is Admin (Anton Merkurov)
    let isAdmin = false;
    try {
      const user = await getCurrentUser();
      if (user?.role === 'ADMIN') {
        isAdmin = true;
      }
    } catch {
      isAdmin = false;
    }

    // Optional admin header fallback
    const customAdminHeader = req.headers.get('x-admin-key');
    if (
      customAdminHeader &&
      ((process.env.ADMIN_SECRET_KEY && customAdminHeader === process.env.ADMIN_SECRET_KEY) ||
        (process.env.PIERO_API_SECRET && customAdminHeader === process.env.PIERO_API_SECRET))
    ) {
      isAdmin = true;
    }

    // Format normalized conversation history
    const normalizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(history)) {
      for (const item of history) {
        const role =
          item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user';
        const text =
          typeof item.content === 'string'
            ? item.content
            : item.parts?.[0]?.text || '';
        if (text && typeof text === 'string') {
          normalizedHistory.push({ role, content: text.trim() });
        }
      }
    }

    const openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = normalizedHistory.map(
      (h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content,
      }),
    );
    openAiMessages.push({ role: 'user', content: trimmedMessage });

    const systemPrompt = isAdmin ? PIERROT_PROMPT_OWNER : PIERROT_PROMPT_PUBLIC;

    // --- OWNER ROUTING: GEMINI VS DEEPSEEK (CONTEXT-AWARE) ---
    if (isAdmin) {
      const analyticalKeywords = [
        'code', 'код', 'refactor', 'рефактор', 'bug', 'баг', 'error', 'ошибка',
        'анализ', 'проанализируй', 'разбери', 'сравни', 'почему', 'архитектур',
        'структур', 'алгоритм', 'логик', 'стратеги', 'детально', 'подробно',
        'deep', 'reason', 'calculate', 'вычисли', 'исследуй', 'system', 'database', 'sql'
      ];

      const contextScan = `${trimmedMessage} ${normalizedHistory.slice(-2).map((h) => h.content).join(' ')}`.toLowerCase();
      const prefersDeepSeek = analyticalKeywords.some((kw) => contextScan.includes(kw));

      let reply = '';
      let usedProvider = '';

      if (prefersDeepSeek) {
        // DeepSeek first, fallback to Gemini, then OpenRouter
        try {
          reply = await callDeepSeek(systemPrompt, openAiMessages, true);
          usedProvider = 'deepseek';
        } catch (dsErr: any) {
          console.warn('[Pierrot Admin] DeepSeek failed, falling back to Gemini:', dsErr?.message);
          try {
            reply = await callGemini(systemPrompt, normalizedHistory, trimmedMessage);
            usedProvider = 'gemini';
          } catch (gemErr: any) {
            console.warn('[Pierrot Admin] Gemini failed, falling back to OpenRouter:', gemErr?.message);
            reply = await callOpenRouter(systemPrompt, openAiMessages);
            usedProvider = 'openrouter';
          }
        }
      } else {
        // Gemini first, fallback to DeepSeek, then OpenRouter
        try {
          reply = await callGemini(systemPrompt, normalizedHistory, trimmedMessage);
          usedProvider = 'gemini';
        } catch (gemErr: any) {
          console.warn('[Pierrot Admin] Gemini failed, falling back to DeepSeek:', gemErr?.message);
          try {
            reply = await callDeepSeek(systemPrompt, openAiMessages, false);
            usedProvider = 'deepseek';
          } catch (dsErr: any) {
            console.warn('[Pierrot Admin] DeepSeek failed, falling back to OpenRouter:', dsErr?.message);
            reply = await callOpenRouter(systemPrompt, openAiMessages);
            usedProvider = 'openrouter';
          }
        }
      }

      return NextResponse.json({
        reply: reply || 'Silence.',
        provider: usedProvider,
        admin: true,
      });
    }

    // --- PUBLIC ROUTING: OPENROUTER ---
    const reply = await callOpenRouter(systemPrompt, openAiMessages);

    return NextResponse.json({
      reply: reply || 'Silence.',
      provider: 'openrouter',
    });
  } catch (error: any) {
    console.error('[Pierrot Web Error]:', error);
    return NextResponse.json(
      {
        error: 'The ether is disrupted.',
        details: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
