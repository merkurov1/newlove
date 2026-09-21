import Groq from 'groq-sdk';
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

export async function POST(req: Request) {
  try {
    const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing.' }, { status: 500 });
    }

    const groq = new Groq({ apiKey });

    // Динамически получаем список и выбираем подходящую текстовую модель
    const modelsResponse = await groq.models.list();
    const ids = modelsResponse.data?.map(m => m.id) || [];
    
    // Ищем модель для чата (исключаем аудио/служебные вроде whisper или compound)
    const validModel = ids.find(id => 
      !id.includes('whisper') && 
      !id.includes('compound') && 
      (id.includes('llama') || id.includes('gemma') || id.includes('mixtral') || id.includes('gpt'))
    ) || ids[0] || 'llama-3.3-70b-versatile';

    const body = await req.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'Silence is golden, but I need text.' }, { status: 400 });
    }

    const messages: any[] = [
      { role: 'system', content: PIERROT_PROMPT }
    ];

    if (Array.isArray(history)) {
      for (const h of history) {
        const role = h.role === 'model' ? 'assistant' : 'user';
        const text = h.parts?.[0]?.text || h.content || '';
        if (text) messages.push({ role, content: text });
      }
    }

    messages.push({ role: 'user', content: message });

    const completion = await groq.chat.completions.create({
      model: validModel,
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
