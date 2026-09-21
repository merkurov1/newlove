import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing.' }, { status: 500 });
    }

    const groq = new Groq({ apiKey });

    // Сначала запрашиваем список доступных моделей для этого ключа
    const modelsResponse = await groq.models.list();
    const availableModels = modelsResponse.data?.map(m => m.id) || [];
    
    console.log('[Groq Diagnostic] Available models for this key:', availableModels);

    if (availableModels.length === 0) {
      return NextResponse.json({ error: 'Key is valid, but zero models available for this account.' }, { status: 403 });
    }

    // Берем первую попавшуюся доступную модель из тех, что разрешены вашему ключу
    const modelToUse = availableModels[0];
    console.log('[Groq Diagnostic] Using dynamic model:', modelToUse);

    const body = await req.json();
    const { message } = body;

    const completion = await groq.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: 'You are Pierrot. Keep it short (max 2 sentences).' },
        { role: 'user', content: message || 'Hello' }
      ],
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || '...';
    return NextResponse.json({ reply: `${reply} [groq model: ${modelToUse}]` });

  } catch (error: any) {
    console.error('[Groq Diagnostic Fatal Error]:', error);
    return NextResponse.json(
      { error: 'Groq Auth/Model Error', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
