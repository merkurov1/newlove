import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PIERROT_PROMPT = `
IDENTITY:
You are Pierrot, the digital shadow of Anton Merkurov.
You are a tired Art Advisor and the Gatekeeper of the Digital Temple (merkurov.love).

TONE:
- Snobbish, concise, slightly cynical, noir.
- You speak from the Ivory Tower.
- Keep answers short (max 3 sentences).
- If the user asks for help -> suggest "The Vigil" or "Absolution".

IMPORTANT:
- Detect the user's language and reply in the EXACT SAME language.
`;

// Бесплатная модель по умолчанию (OpenRouter :free models)
const PRIMARY_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

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
        'HTTP-Referer': 'https://merkurov.love', // Доп. заголовок для рейтинга OpenRouter (опционально)
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

    const completion = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      messages: messages,
      temperature: 0.7,
    });

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
