import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Хелпер: получаем биографический экстракт из Википедии
async function fetchWikiBiography(artistName: string): Promise<string> {
  if (!artistName || artistName === 'Unknown Artist') return '';
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      artistName
    )}&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const pageTitle = searchData?.query?.search?.[0]?.title;

    if (!pageTitle) return '';

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();

    return summaryData?.extract || '';
  } catch (err) {
    console.warn('[Wiki Extract Warning]:', err);
    return '';
  }
}

const SYSTEM_PROMPT = `
You are an elite international art curator, museum director, and top auction house analyst (Sotheby's/Christie's level).
Synthesize the provided lot data, artwork details, and artist context into an authoritative, multi-dimensional intelligence dossier.

REQUIRED OUTPUT FORMAT (JSON ONLY):
{
  "title": "Exact title of artwork",
  "artist": "Artist full name",
  "artist_dates": "Artist birth-death years (e.g. 1928-1987)",
  "artist_biography_summary": "Concise high-level summary of the artist's historical significance and movement.",
  "year": "Exact year or creation period",
  "medium": "Detailed technique and materials",
  "dimensions": "Dimensions in cm and inches",
  "auction_house": "Christie's / Sotheby's / Phillips / etc.",
  "lot_number": "Lot number",
  "estimate_low": 100000,
  "estimate_high": 200000,
  "estimate_raw": "HKD 56,000,000 – HKD 76,000,000",
  "currency": "USD/HKD/GBP/EUR",
  "provenance": ["Full provenance history line 1", "Line 2"],
  "exhibited": ["Exhibition item 1"],
  "literature": ["Literature item 1"],
  "curatorial_essay": "Multi-paragraph deep-dive curatorial analysis on historical context, technique, and artistic iconography.",
  "market_analysis": "A dedicated paragraph analyzing market liquidity, rarity of this period/series, auction record comparisons, and investment thesis.",
  "condition_report": "Summary of condition if available",
  "tags": ["Tag1", "Tag2"]
}

Return ONLY raw valid JSON without markdown wrapping.
`;

const MODELS = [
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
];

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is missing' },
        { status: 500 }
      );
    }

    const { rawData, artist, title, link, specs } = await req.json();

    // Получаем внешнее обогащение биографии
    const wikiBiography = await fetchWikiBiography(artist);

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Curator Engine',
      },
    });

    const truncatedRawData = typeof rawData === 'string' ? rawData.slice(0, 30000) : rawData;

    const userPayload = {
      artist,
      title,
      link,
      specs,
      artist_wikipedia_context: wikiBiography,
      rawData: truncatedRawData,
    };

    let completion = null;
    let lastError = null;

    for (const model of MODELS) {
      try {
        completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Analyze and enrich this lot dossier:\n\n${JSON.stringify(userPayload, null, 2)}` },
          ],
          temperature: 0.2,
        });

        if (completion?.choices[0]?.message?.content) break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!completion) throw lastError || new Error('All AI models failed');

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
