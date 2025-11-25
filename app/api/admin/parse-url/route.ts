import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
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
        // Маскируемся под обычный браузер
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json' 
      },
      cache: 'no-store',
    });

    if (!jinaResponse.ok) {
        return NextResponse.json({ error: `Scraper failed: ${jinaResponse.status}` }, { status: 500 });
    }

    const markdown = await jinaResponse.text();

    // === SAFETY CHECK: ПРОВЕРКА НА БЛОКИРОВКУ ===
    // Если сайт отдал заглушку вместо контента, нет смысла тратить токены Gemini.
    const lowerMd = markdown.toLowerCase();
    if (
        lowerMd.includes("cloudflare") || 
        lowerMd.includes("verify you are human") || 
        lowerMd.includes("access denied") ||
        lowerMd.includes("enable javascript") ||
        markdown.length < 300
    ) {
        console.warn('[Parser] BLOCKED by Anti-Bot Defense.');
        console.warn(`[Parser] Debug Snippet: ${markdown.substring(0, 200)}...`);
        return NextResponse.json({ 
            error: 'Content blocked by firewall',
            // Возвращаем пустую структуру, чтобы фронтенд не упал с undefined
            artist: "Unknown (Blocked)",
            title: "Access Denied",
            medium: null,
            estimate_low: 0,
            currency: 'USD'
        }, { status: 422 });
    }

    console.log(`[Parser] Content retrieved (${markdown.length} chars). Sending to Gemini.`);

    // 2. THE BRAIN (Gemini)
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.0 
        } 
    });

    const prompt = `
      ROLE: Art Market Data Extractor.
      TASK: Extract structured data from the auction lot text.
      
      STRICT RULES:
      1. Output MUST be valid JSON.
      2. If a field is missing, use null (do NOT use undefined).
      3. EXTRACT NUMBERS for estimates.
      
      INPUT TEXT:
      ${markdown.substring(0, 25000)}

      REQUIRED JSON SCHEMA:
      {
        "artist": "string | null",
        "title": "string | null",
        "image_url": "string | null",
        "medium": "string | null",
        "dimensions": "string | null",
        "year": "string | null",
        "auction_house": "string | null",
        "auction_date": "string | null",
        "estimate_low": "number | null",
        "estimate_high": "number | null",
        "currency": "string | null",
        "provenance_summary": "string | null"
      }
    `;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanJSON(rawText));
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