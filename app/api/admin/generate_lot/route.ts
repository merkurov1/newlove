import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Список моделей на OpenRouter (по очереди при сбоях)
const MODELS = [
  'google/gemini-2.5-flash',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-r1',
  'openrouter/free',
];

const GENERATE_LOT_PROMPT = `
You are an expert art curator and archivist.
Analyze the provided raw lot data and generate a structured JSON object for an art catalog.

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "title": "Title of the artwork",
  "artist": "Artist name",
  "year": "Year or period of creation (e.g. 1924, c. 1930)",
  "medium": "Technique and materials (e.g. Oil on canvas)",
  "dimensions": "Dimensions if available",
  "estimate": "Price range or estimate",
  "description": "Comprehensive curatorial description, provenance, and historical significance",
  "tags": ["tag1", "tag2"]
}

Return ONLY valid JSON without markdown formatting or code blocks.
`;

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const apiKey = (process.env.OPENROUTER_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is missing in environment variables (OPENROUTER_API_KEY)' },
        { status: 500 }
      );
    }

    const { rawData, lot } = await req.json();

    if (!rawData && !lot) {
      return NextResponse.json({ error: 'No lot data provided for generation' }, { status: 400 });
    }

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Curator Engine',
      },
    });

    const userContent = typeof rawData === 'string' ? rawData : JSON.stringify(lot || rawData, null, 2);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: GENERATE_LOT_PROMPT },
      { role: 'user', content: `Extract and structure the curatorial details for this lot:\n\n${userContent}` },
    ];

    let completion = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        completion = await openai.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        });

        if (completion?.choices[0]?.message?.content) {
          break;
        }
      } catch (err: any) {
        console.warn(`[generate_lot] Model ${model} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error('All models failed to respond.');
    }

    const rawResponse = completion.choices[0]?.message?.content || '{}';
    let structuredLot = {};

    try {
      structuredLot = JSON.parse(rawResponse);
    } catch {
      // Фолбэк на случай, если модель добавила markdown-обёртку ```json ... ```
      const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      structuredLot = JSON.parse(cleaned);
    }

    return NextResponse.json({ lot: structuredLot });
  } catch (error: any) {
    console.error('[generate_lot Error]:', error);
    return NextResponse.json(
      { error: 'Generation failed', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
