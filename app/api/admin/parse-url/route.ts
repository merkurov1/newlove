import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; 
export const dynamic = 'force-dynamic'; // ОТКЛЮЧАЕМ КЭШ СТРАНИЦЫ ГЛОБАЛЬНО

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

// Функция очистки (на случай если Gemini решит добавить ```json)
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
    // Jina лучше всего работает, если URL просто приклеен.
    // Но если там есть query params, лучше их не ломать. 
    // encodeURIComponent кодирует слеши, Jina это не любит в начале пути.
    // Используем простую логику, но добавляем таймстамп для обхода кэша Jina (если он есть)
    const jinaUrl = `https://r.jina.ai/${url}`;

    const jinaResponse = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'X-Return-Format': 'markdown',
        'X-With-Images-Summary': 'true',
        // Убираем User-Agent, Jina сама знает кто она. Лишний спуфинг иногда вредит.
        'Accept': 'application/json' 
      },
      cache: 'no-store', // ВАЖНО: Запрещаем Next.js кэшировать этот запрос
    });

    if (!jinaResponse.ok) {
        const errText = await jinaResponse.text();
        console.error(`[Parser] Jina failed: ${jinaResponse.status}`, errText);
        return NextResponse.json({ error: `Scraper failed: ${jinaResponse.status}` }, { status: 500 });
    }

    const markdown = await jinaResponse.text();

    // Проверка на "Soft 404" или капчу, которую Jina пропустила как текст
    if (!markdown || markdown.length < 200 || markdown.includes("Cloudflare") || markdown.includes("Access Denied")) {
         console.warn('[Parser] Content suspicion (Cloudflare or Empty)');
         return NextResponse.json({ error: 'Content blocked by firewall' }, { status: 422 });
    }

    // 2. THE BRAIN (Gemini)
    if (!apiKey) {
      return NextResponse.json({ error: 'Server misconfigured: No API Key' }, { status: 500 })
    }

    // Используем более современную модель если доступна, иначе flash
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.1 // Снижаем креативность для точности данных
        } 
    });

    const prompt = `
      ROLE: Art Market Data Extractor.
      TASK: Extract structured data from the auction lot description below.
      
      STRICT RULES:
      1. Output MUST be valid JSON.
      2. If a field is missing, use null.
      3. "image_url": Find the highest resolution image link provided in the text/markdown links.
      4. "medium": Be precise (e.g., "Oil on canvas", "Lithograph").
      5. "estimate": Keep the currency symbol if present.
      6. "price_realized": Look for "Sold for", "Hammer price", or "Realized price". If auction is upcoming, set to null.

      INPUT TEXT:
      ${markdown.substring(0, 30000)}

      REQUIRED JSON SCHEMA:
      {
        "artist": "string",
        "title": "string",
        "image_url": "string | null",
        "medium": "string | null",
        "dimensions": "string | null",
        "date_of_artwork": "string | null",
        "auction_date": "string | null",
        "estimate": "string | null",
        "price_realized": "string | null",
        "provenance_summary": "string | null",
        "currency": "string (USD/EUR/GBP) | null"
      }
    `;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const rawText = response.text();

    console.log('[Parser] Gemini extracted data.');

    let jsonResponse;
    try {
        jsonResponse = JSON.parse(cleanJSON(rawText));
    } catch (e) {
        console.error('[Parser] JSON Parse Failed:', rawText);
        return NextResponse.json({ error: 'AI produced invalid JSON' }, { status: 500 });
    }

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}