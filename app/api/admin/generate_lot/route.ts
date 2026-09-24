import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `
You are an elite international art curator, auction house expert, and archivist.
Analyze the provided raw lot data and generate an extensive, highly detailed JSON object for an art catalog & vault.

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "title": "Exact title of artwork",
  "artist": "Artist full name",
  "artist_dates": "Artist birth-death years (e.g. 1960-1988)",
  "year": "Exact year or creation period",
  "medium": "Detailed technique and materials",
  "dimensions": "Dimensions in cm and inches if available",
  "auction_house": "Christie's / Sotheby's / Phillips / etc.",
  "lot_number": "Lot number or ID",
  "estimate_low": 100000,
  "estimate_high": 200000,
  "estimate_raw": "HKD 56,000,000 – HKD 76,000,000",
  "currency": "USD/HKD/GBP/EUR",
  "provenance": ["Full provenance history line 1", "Line 2"],
  "exhibited": ["Exhibition history item 1", "Item 2"],
  "literature": ["Literature/publication item 1"],
  "curatorial_essay": "Comprehensive multi-paragraph deep-dive essay discussing the artwork's historical context, technical mastery, symbolic meaning, relevance in the artist's career, and market significance.",
  "condition_report": "Summary of condition if mentioned",
  "tags": ["Artist", "Period", "Movement", "Medium", "Theme"]
}

Return ONLY valid raw JSON without markdown codeblocks or quotes.
`;

const MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
  'anthropic/claude-3.5-sonnet',
];

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is missing in environment variables.' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Curator Engine',
      },
    });

    const { rawData, artist, title, link, specs } = await req.json();

    const truncatedRawData = typeof rawData === 'string' ? rawData.slice(0, 30000) : rawData;

    const userContent = JSON.stringify(
      { artist, title, link, specs, rawData: truncatedRawData },
      null,
      2
    );

    let completion = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        console.log(`[generate_lot] Trying model: ${model}`);
        completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Extract and structure full curatorial details for this lot:\n\n${userContent}` },
          ],
          temperature: 0.2,
        });

        if (completion?.choices[0]?.message?.content) {
          console.log(`[generate_lot] Success with model: ${model}`);
          break;
        }
      } catch (err: any) {
        console.warn(`[generate_lot] Model ${model} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error('All AI models failed to respond.');
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
