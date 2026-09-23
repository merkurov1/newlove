import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PIERROT_PROMPT = `
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

// Список рабочих и бесплатных моделей (fallback по очереди)
const FREE_MODELS = [
  'openrouter/free',                      // Умный роутер OpenRouter по всем доступным free-моделям
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'google/gemma-2-9b-it:free'
];

export async function POST(req: Request) {
  try {
    const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing.' }, { status: 500 });
    }

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Pierrot Chatbot',
      },
    });

    const body = await req.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'Silence is golden, but I need text.' }, { status: 400 });
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: PIERROT_PROMPT }
    ];

    if (Array.isArray(history)) {
      for (const h of history) {
        const role = (h.role === 'model' || h.role === 'assistant') ? 'assistant' : 'user';
        const text = h.parts?.[0]?.text || h.content || '';
        if (text) {
          messages.push({ role, content: text });
        }
      }
    }

    messages.push({ role: 'user', content: message });

    let completion = null;
    let lastError = null;

    // Перебираем модели, пока одна из них не ответит
    for (const model of FREE_MODELS) {
      try {
        completion = await openai.chat.completions.create({
          model: model,
          messages: messages,
          temperature: 0.7,
        });
        if (completion?.choices[0]?.message?.content) {
          break; // Успешно получили ответ
        }
      } catch (err: any) {
        console.warn(`[Pierrot] Model ${model} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error('All free models are currently unavailable.');
    }

    const reply = completion.choices[0]?.message?.content || '...';

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('[Pierrot Web Error]:', error);
    return NextResponse.json(
      { error: 'The ether is disrupted.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
