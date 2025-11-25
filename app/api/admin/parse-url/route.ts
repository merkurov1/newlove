import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; 
export const dynamic = 'force-dynamic'; 

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

function cleanJSON(text: string) {
  return text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url = body.url;

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Parser] Target: ${url}`);

    // 1. THE HARVESTER (Jina AI)
    const jinaUrl = `https://r.jina.ai/${url}`;
    const jinaResponse = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'X-Return-Format': 'markdown',
        'X-With-Images-Summary': 'true',
        'Accept': 'application/json' 
      },
      cache: 'no-store',
    });

    if (!jinaResponse.ok) {
        return NextResponse.json({ error: `Scraper failed: ${jinaResponse.status}` }, { status: 500 });
    }

    const markdown = await jinaResponse.text();

    // Проверки на мусор
    if (!markdown || markdown.length < 200 || markdown.includes("Cloudflare")) {
         return NextResponse.json({ error: 'Content blocked by firewall' }, { status: 422 });
    }

    // 2. THE BRAIN (Gemini)
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.0 // Ноль креативности. Только факты.
        } 
    });

    const prompt = `
      ROLE: Art Market Data Extractor.
      TASK: Extract structured data from the auction lot description.
      
      STRICT RULES:
      1. Output MUST be valid JSON.
      2. EXTRACT NUMBERS for estimates. If "5,000 - 7,000 USD", low=5000, high=7000, currency='USD'.
      3. DATE: Convert auction date to ISO 8601 format (YYYY-MM-DD) if possible.
      4. "auction_house": Infer from the text or URL (e.g., Sotheby's, Bonhams).
      
      INPUT TEXT:
      ${markdown.substring(0, 30000)}

      REQUIRED JSON SCHEMA:
      {
        "artist": "string (Name ONLY)",
        "title": "string",
        "image_url": "string | null",
        "medium": "string | null",
        "dimensions": "string | null",
        "year": "string | null",
        "auction_house": "string | null",
        "auction_date": "string (ISO 8601) | null",
        "estimate_low": "number | null",
        "estimate_high": "number | null",
        "currency": "string (USD/EUR/GBP) | null",
        "price_realized": "number | null (Sold price ONLY, ignore estimates here)",
        "provenance_summary": "string | null",
        "status": "string (upcoming/sold/unsold)"
      }
    `;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const rawText = response.text();

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanJSON(rawText));
        // Добавляем исходный URL в ответ, чтобы фронтенд мог его сохранить
        jsonResponse.source_url = url; 
    } catch (e) {
        console.error('[Parser] JSON Parse Failed:', rawText);
        return NextResponse.json({ error: 'AI produced invalid JSON' }, { status: 500 });
    }

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}