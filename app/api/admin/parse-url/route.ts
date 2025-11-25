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
    // Use encodeURIComponent for the path segment and request Markdown explicitly
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const jinaResponse = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'X-Return-Format': 'markdown',
        // Маскируемся под обычный браузер
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

    // 2. THE BRAIN (Gemini) - try a few candidate models (env override via GOOGLE_GEMINI_MODEL)
    const MODEL_CANDIDATES = [
      (process.env.GOOGLE_GEMINI_MODEL || '').trim(),
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-1.0',
      'gemini-2.1'
    ].filter(Boolean);

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

    // Attempt generation using candidate models until one succeeds
    let result: any = null;
    let lastErr: any = null;
    MODEL_LOOP: for (const candidate of MODEL_CANDIDATES) {
      // Try both the plain candidate and the full resource name (models/...) since API lists use full names
      const variants = candidate.startsWith('models/') ? [candidate] : [candidate, `models/${candidate}`];
      for (const name of variants) {
        try {
          console.log(`[Parser] Trying model: ${name}`);
          const model = genAI.getGenerativeModel({ model: name, generationConfig: { responseMimeType: "application/json", temperature: 0.0 } });
          result = await model.generateContent(prompt);
          break MODEL_LOOP;
        } catch (err: any) {
          lastErr = err;
          console.warn(`[Parser] Model ${name} failed:`, err?.message || err);
        }
      }
    }

    if (!result) {
      console.error('[Parser] All model candidates failed:', lastErr);
      return NextResponse.json({ error: 'No available AI models', detail: String(lastErr?.message || lastErr) }, { status: 502 });
    }

    // result.response.text() may be async; await it to get the full string
    const rawText = result?.response ? await result.response.text() : '';

    let jsonResponse;
    const cleaned = cleanJSON(rawText);
    try {
      jsonResponse = JSON.parse(cleaned);
      jsonResponse.source_url = url; 
    } catch (e) {
      // Try a resilient extraction: find the first {...} block in the output and parse that
      const maybe = String(rawText).match(/({[\s\S]*})/);
      if (maybe && maybe[1]) {
        try {
          jsonResponse = JSON.parse(maybe[1]);
          jsonResponse.source_url = url;
        } catch (e2) {
          console.error('[Parser] Fallback JSON Parse Failed:', e2, '\nSnippet:', (maybe[1] || '').substring(0, 1000));
          return NextResponse.json({ error: 'AI produced invalid JSON' }, { status: 500 });
        }
      } else {
        console.error('[Parser] JSON Parse Failed (no object found):', cleaned.substring(0, 1000));
        return NextResponse.json({ error: 'AI produced invalid JSON' }, { status: 500 });
      }
    }

    return NextResponse.json(jsonResponse);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}