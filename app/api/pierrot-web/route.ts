import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Чистим ключ от пробелов
const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

const MODEL_NAME = 'gemini-2.5-flash';

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
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
    }

    const body = await req.json();
    const { message, history } = body; // history можно будет подключить позже, пока берем message

    if (!message) {
      return NextResponse.json({ error: 'Silence is golden, but I need text.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      systemInstruction: PIERROT_PROMPT
    });

    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });

  } catch (error) {
    console.error('[Pierrot Web] Error:', error);
    return NextResponse.json(
      { error: 'The ether is disrupted.', details: String(error) }, 
      { status: 500 }
    );
  }
}