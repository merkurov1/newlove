import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELS = [
  'anthropic/claude-3.5-sonnet',
  'meta-llama/llama-3.3-70b-instruct',
  'openai/gpt-4o-mini',
];

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

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    // Берем напрямую GOOGLE_API_KEY
    const apiKey = (process.env.GOOGLE_API_KEY || '').trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is missing in environment variables.' },
        { status: 500 }
      );
    }

    const { rawData, artist, title, link, specs } = await req.json();
    const userContent = JSON.stringify({ artist, title, link, specs, rawData }, null, 2);

    let resultJsonText: string | null = null;
    let lastError: string | null = null;

    for (const model of MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Extract and structure full curatorial details for this lot:\n\n${userContent}` },
            ],
            temperature: 0.2,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          lastError = `Status ${response.status}: ${errText}`;
          continue;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        if (content) {
          resultJsonText = content;
          break;
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    if (!resultJsonText) {
      throw new Error(lastError || 'All models failed to respond.');
    }

    const cleaned = resultJsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const structuredLot = JSON.parse(cleaned);

    return NextResponse.json({ lot: structuredLot });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Generation failed', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
