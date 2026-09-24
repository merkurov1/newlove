import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Используем список моделей OpenRouter (fallback по очереди)
const MODELS = [
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-r1',
  'qwen/qwen-2.5-72b-instruct',
  'openrouter/free'
];

const SYSTEM_PROMPT = `
You are an expert art curator and archivist.
Analyze the provided raw lot data and generate a structured JSON object for an art catalog.

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "title": "Title of the artwork",
  "artist": "Artist name",
  "year": "Year or period of creation",
  "medium": "Technique and materials (e.g. Oil on canvas)",
  "dimensions": "Dimensions",
  "estimate": "Price range or estimate",
  "description": "Comprehensive curatorial description, provenance, and historical significance",
  "tags": ["tag1", "tag2"]
}

Return ONLY valid JSON without markdown formatting.
`;

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY missing in environment variables.' },
        { status: 500 }
      );
    }

    const { rawData, lot } = await req.json();
    if (!rawData && !lot) {
      return NextResponse.json({ error: 'No lot data provided' }, { status: 400 });
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

    let completion = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Extract and structure details for this lot:\n\n${userContent}` },
          ],
          temperature: 0.2,
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
      throw lastError || new Error('All OpenRouter models failed to respond.');
    }

    const rawResponse = completion.choices[0]?.message?.content || '{}';
    const cleaned = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const structuredLot = JSON.parse(cleaned);

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
