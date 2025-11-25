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

    // ALSO: fetch original HTML page to extract meta tags and additional images
    let html = ''
    try {
      const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }, cache: 'no-store' })
      if (htmlRes.ok) html = await htmlRes.text()
    } catch (e) {
      console.warn('[Parser] HTML fetch failed, continuing with Jina markdown only', e)
    }

    // Extract og:image, page title, and <img> srcs as image candidates
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]+name=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    const ogImage = ogMatch ? ogMatch[1] : null
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const pageTitle = titleMatch ? titleMatch[1].trim() : null
    const imgMatches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map(m => m[1])
    const imageCandidates = Array.from(new Set([...(ogImage ? [ogImage] : []), ...imgMatches].filter(Boolean))).slice(0, 20)

    // --- Helpers: heuristics extractor and image selection pipeline ---
    function extractHeuristics(markdownText: string, htmlText: string) {
      const heur: any = {}

      const estimateRe = /Estimate[s]?:?\s*([£$€]?\s?[\d,]+(?:\.\d+)?)(?:\s*(?:-|to)\s*([£$€]?\s?[\d,]+(?:\.\d+)?))?/i
      const estM = markdownText.match(estimateRe) || htmlText.match(estimateRe)
      if (estM) {
        const parseNum = (s: string) => Number(String(s || '').replace(/[^0-9\.]/g, '').replace(/,/g, '')) || null
        heur.estimate_low = parseNum(estM[1])
        heur.estimate_high = parseNum(estM[2])
        const currencyMatch = (estM[1] || '').match(/([£$€])/)
        heur.currency = currencyMatch ? currencyMatch[1] : heur.currency || null
      }

      const dimRe = /(Dimensions|Size)[:\s]*([0-9\.\sxX\,\-\"'cmin]+)/i
      const dimM = markdownText.match(dimRe) || htmlText.match(dimRe)
      if (dimM) heur.dimensions = (dimM[2] || '').trim()

      const mediumRe = /Medium[:\s]*([A-Za-z0-9 ,\-\/]+)/i
      const mM = markdownText.match(mediumRe) || htmlText.match(mediumRe)
      if (mM) heur.medium = (mM[1] || '').trim()

      const yearRe = /(?:Date|Year)[:\s]*([0-9]{4})/i
      const yM = markdownText.match(yearRe) || htmlText.match(yearRe)
      if (yM) heur.year = yM[1]

      const provRe = /Provenance[:\s]*([\s\S]{20,500})/i
      const pM = markdownText.match(provRe) || htmlText.match(provRe)
      if (pM) heur.provenance_summary = (pM[1] || '').trim()

      const topText = (markdownText || '').split('\n').slice(0, 20).join('\n') + '\n' + ((pageTitle && pageTitle) || '')
      const artistRe = /Artist[:\s]*([A-Za-z\-\.,' ]{2,80})/i
      const aM = topText.match(artistRe)
      if (aM) heur.artist = aM[1].trim()
      const titleRe = /Title[:\s]*([A-Za-z0-9\-\.,'"() ]{2,120})/i
      const tM = topText.match(titleRe)
      if (tM) heur.title = tM[1].trim()

      return heur
    }

    async function normalizeImageUrl(candidate: string) {
      try {
        const resolved = new URL(candidate, url).href
        return resolved
      } catch (e) {
        return null
      }
    }

    async function probeImage(urlToProbe: string) {
      try {
        const head = await fetch(urlToProbe, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
        if (!head.ok) return null
        const ct = head.headers.get('content-type') || ''
        const cl = head.headers.get('content-length')
        const size = cl ? parseInt(cl, 10) : null
        return { url: urlToProbe, contentType: ct, size }
      } catch (e) {
        try {
          const res = await fetch(urlToProbe, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
          if (!res.ok) return null
          const ct = res.headers.get('content-type') || ''
          const buffer = await res.arrayBuffer()
          return { url: urlToProbe, contentType: ct, size: buffer.byteLength }
        } catch (e2) {
          return null
        }
      }
    }

    async function chooseBestImage(candidates: string[]) {
      if (!candidates || candidates.length === 0) return null
      const norm: string[] = []
      for (const c of candidates) {
        const n = await normalizeImageUrl(c)
        if (n && !norm.includes(n)) norm.push(n)
      }

      if (ogImage) {
        const resolvedOg = await normalizeImageUrl(ogImage)
        if (resolvedOg) {
          const p = await probeImage(resolvedOg)
          if (p && p.contentType.startsWith('image/') && (p.size === null || p.size > 10240)) return resolvedOg
        }
      }

      const probes: Array<any> = []
      for (const n of norm) {
        const p = await probeImage(n)
        if (p && p.contentType && p.contentType.startsWith('image/')) probes.push(p)
      }
      if (probes.length === 0) return norm[0] || null
      probes.sort((a, b) => (b.size || 0) - (a.size || 0))
      return probes[0].url
    }

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
      
      INPUT TEXT (JINA MARKDOWN):
      ${markdown.substring(0, 100000)}

      INPUT TEXT (PAGE HTML):
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

    // Merge heuristics: prefer AI output, fall back to deterministic heuristics
    const heur = extractHeuristics(markdown, html)
    const merged: any = { ...(heur || {}), ...(jsonResponse || {}) }
    merged.source_url = url

    // If image_url missing, choose best candidate
    if (!merged.image_url) {
      try {
        const chosen = await chooseBestImage(imageCandidates)
        if (chosen) merged.image_url = chosen
      } catch (e) {
        console.warn('[Parser] Image selection failed', e)
      }
    }

    // Dev debug output when enabled
    const debugMode = String(process.env.PARSER_DEBUG || '').toLowerCase() === 'true'
    if (debugMode) {
      const debug = {
        page_title: pageTitle,
        og_image: ogImage,
        imageCandidates: imageCandidates,
        chosen_image: merged.image_url || null,
        heuristics: heur,
        markdown_snippet: markdown.substring(0, 2000),
        html_snippet: html.substring(0, 2000),
        raw_ai_text: String(rawText).substring(0, 4000)
      }
      return NextResponse.json({ ...merged, _debug: debug })
    }

    return NextResponse.json(merged);

  } catch (error) {
    console.error('[Parser Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}