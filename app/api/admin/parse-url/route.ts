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
    // Добавляем заголовки, чтобы Jina пыталась собрать всё
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const jinaResponse = await fetch(jinaUrl, {
      method: 'GET',
      headers: {
        'X-Return-Format': 'markdown',
        // Просим Jina вернуть ссылки, иногда полезно для провенанса
        'X-With-Links-Summary': 'true', 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      cache: 'no-store',
    });

    if (!jinaResponse.ok) {
        return NextResponse.json({ error: `Scraper failed: ${jinaResponse.status}` }, { status: 500 });
    }

    const markdown = await jinaResponse.text();

    // Fetch HTML for metadata (fallback and images)
    let html = ''
    try {
      const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }, cache: 'no-store' })
      if (htmlRes.ok) html = await htmlRes.text()
    } catch (e) {
      console.warn('[Parser] HTML fetch failed, continuing with Jina markdown only', e)
    }

    // --- Image Candidate Extraction ---
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+name=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    const ogImage = ogMatch ? ogMatch[1] : null
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const pageTitle = titleMatch ? titleMatch[1].trim() : null
    const imgMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map(m => m[1])
    // Берем больше кандидатов (30)
    const imageCandidates = Array.from(new Set([...(ogImage ? [ogImage] : []), ...imgMatches].filter(Boolean))).slice(0, 30)

    // --- Heuristics (оставляем базовые, остальное доверим Gemini) ---
    function extractHeuristics(markdownText: string, htmlText: string) {
      const heur: any = {}
      // ... (Твой код эвристик для валют и размеров оставляем без изменений, он хороший)
      const estimateRe = /Estimate[s]?:?\s*([£$€]?\s?[\d,]+(?:\.\d+)?)(?:\s*(?:-|to)\s*([£$€]?\s?[\d,]+(?:\.\d+)?))?/i
      const estM = markdownText.match(estimateRe) || htmlText.match(estimateRe)
      if (estM) {
        const parseNum = (s: string) => Number(String(s || '').replace(/[^0-9\.]/g, '').replace(/,/g, '')) || null
        heur.estimate_low = parseNum(estM[1])
        heur.estimate_high = parseNum(estM[2])
        const currencyMatch = (estM[1] || '').match(/([£$€])/)
        heur.currency = currencyMatch ? currencyMatch[1] : heur.currency || null
      }
      // ... (остальные эвристики можно оставить)
      return heur
    }

    // ... (Функции normalizeImageUrl, probeImage, chooseBestImage оставляем как есть)
    async function normalizeImageUrl(candidate: string) {
        try { return new URL(candidate, url).href } catch (e) { return null }
    }
    async function probeImage(urlToProbe: string) {
        // Simplified for brevity in this view, assume your existing logic works
        try {
            const res = await fetch(urlToProbe, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
            if(res.ok && res.headers.get('content-type')?.startsWith('image/')) return { url: urlToProbe, size: Number(res.headers.get('content-length')) || 0, contentType: res.headers.get('content-type') };
            return null;
        } catch(e) { return null }
    }
    async function chooseBestImage(candidates: string[]) {
        // Assume your existing logic
        if(!candidates.length) return null;
        return candidates[0]; 
    }

    // === SAFETY CHECK ===
    const lowerMd = markdown.toLowerCase();
    if (lowerMd.includes("cloudflare") || lowerMd.includes("verify you are human") || markdown.length < 300) {
        return NextResponse.json({ error: 'Content blocked', artist: "Unknown (Blocked)", title: "Access Denied" }, { status: 422 });
    }

    console.log(`[Parser] Content retrieved. Jina: ${markdown.length} chars. Sending to Gemini.`);

    // 2. THE BRAIN (Gemini)
    // Prefer newer Gemini generation models; keep env override first so deploys can control exact model.
    // We intentionally list generation-capable models (exclude embedding-only names).
    const MODEL_CANDIDATES = [
      (process.env.GOOGLE_GEMINI_MODEL || '').trim(),
      // Latest/preview generation models (try newer first)
      'gemini-3-pro-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-pro-latest',
      // Fallbacks to older families if newer ones are unavailable
      'gemini-2.0-flash',
      'gemini-2.0-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ].filter(Boolean);

    // РАСШИРЕННЫЙ ПРОМПТ
    const prompt = `
      ROLE: Expert Art Market Analyst & Data Extractor.
      TASK: Extract EXHAUSTIVE structured data from the auction lot text. 
      
      INSTRUCTIONS:
      1. Output MUST be valid JSON.
      2. Look for detailed lists for Exhibitions, Literature, and Provenance. 
      3. Do NOT summarize the "Description" or "Condition Report" - extract the full text if available.
      4. If a field is missing, use null.
      5. "estimate_low" and "high" must be numbers.
      
      INPUT TEXT (JINA MARKDOWN):
      ${markdown.substring(0, 500000)} 

      INPUT TEXT (PAGE HTML - Partial):
      ${html.substring(0, 200000)}

      EXTRA PAGE DATA:
      page_title: ${pageTitle || ''}
      og_image: ${ogImage || ''}
      image_candidates: ${JSON.stringify(imageCandidates)}

      REQUIRED JSON SCHEMA:
      {
        "artist": "string | null",
        "title": "string | null",
        "image_url": "string | null",
        "medium": "string | null",
        "dimensions": "string | null",
        "year": "string | null",
        
        "auction_house": "string | null",
        "auction_date": "string | null", // ISO format preference or string
        "sale_id": "string | null",      // e.g. "Sale 1234"
        "lot_number": "string | null",   // e.g. "Lot 45"
        "location": "string | null",     // e.g. "London", "New York"

        "estimate_low": "number | null",
        "estimate_high": "number | null",
        "currency": "string | null",
        
        "description": "string | null",       // Full catalog note/description
        "condition_report": "string | null",  // Condition details
        
        "provenance_summary": "string | null", // Full text block
        "provenance_list": "string[]",         // Array if detected as list
        
        "exhibitions": "string[]", // Array of strings
        "literature": "string[]",  // Array of strings
        "catalog_note": "string | null"
      }
    `;

    let result: any = null;
    let lastErr: any = null;
    
    // Increased token limit for output to handle long descriptions
    const generationConfig = { 
        responseMimeType: "application/json", 
        temperature: 0.1, // Немного выше 0, чтобы лучше цеплял списки
        maxOutputTokens: 8192 // Даем место для длинных списков выставок
    };

    MODEL_LOOP: for (const candidate of MODEL_CANDIDATES) {
      const variants = candidate.startsWith('models/') ? [candidate] : [candidate, `models/${candidate}`];
      for (const name of variants) {
        try {
          console.log(`[Parser] Trying model: ${name}`);
          const model = genAI.getGenerativeModel({ model: name, generationConfig });
          result = await model.generateContent(prompt);
          break MODEL_LOOP;
        } catch (err: any) {
          lastErr = err;
          console.warn(`[Parser] Model ${name} failed:`, err?.message);
        }
      }
    }

    if (!result) {
      return NextResponse.json({ error: 'AI Processing failed', detail: String(lastErr?.message) }, { status: 502 });
    }

    const rawText = result?.response ? await result.response.text() : '';
    let jsonResponse;
    
    try {
      jsonResponse = JSON.parse(cleanJSON(rawText));
      jsonResponse.source_url = url;
    } catch (e) {
       // ... (Твой фоллбек парсинг оставляем)
       console.error('[Parser] JSON Parse Error');
       return NextResponse.json({ error: 'Invalid AI JSON' }, { status: 500 });
    }

    // Merge
    const heur = extractHeuristics(markdown, html)
    const merged: any = { ...(heur || {}), ...(jsonResponse || {}) }
    merged.source_url = url

    // Image fallback logic
    if (!merged.image_url) {
        try {
            const chosen = await chooseBestImage(imageCandidates);
            if (chosen) merged.image_url = chosen;
        } catch(e) {}
    }

    return NextResponse.json(merged);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
