import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiKey = (process.env.GOOGLE_API_KEY || "").trim();
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { artist } = await req.json();
    
    if (!artist) return NextResponse.json({ error: 'Artist name required' }, { status: 400 });

    console.log(`[Monitor] Scouting via BING for: ${artist}`);

    // ТАКТИКА: BING SEARCH (broadened query to increase recall)
    // Search Invaluable for the artist, allow 'lot' / 'auction' variants to match more results
    const query = `site:invaluable.com "${artist}" ("auction-lot" OR "auction" OR "lot" OR "lot details")`;
    // Use global Bing (no localization)
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-us`;

    // Encode the full URL when calling r.jina.ai
    const jinaUrl = `https://r.jina.ai/${encodeURI(bingUrl)}`;

    const jinaResponse = await fetch(jinaUrl, {
      headers: { 
          'X-Return-Format': 'markdown',
          // Use an ordinary browser UA to reduce bot blocking
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      cache: 'no-store'
    });

    if (!jinaResponse.ok) {
        return NextResponse.json({ error: 'Scout failed to connect' }, { status: 500 });
    }

    const markdown = await jinaResponse.text();
    
    // Проверка, вернул ли Bing хоть что-то
    if (markdown.length < 500 || markdown.includes("There are no results")) {
         console.warn("[Monitor] Bing returned empty or blocked result.");
         return NextResponse.json({ found: 0, links: [], warning: "Search blocked or empty" });
    }

    // 3. Gemini фильтрует — try model candidates (env override via GOOGLE_GEMINI_MODEL)
    const MODEL_CANDIDATES = [
      (process.env.GOOGLE_GEMINI_MODEL || '').trim(),
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-1.0',
    ].filter(Boolean);

    const prompt = `
      ROLE: Data Scout.
      TASK: Extract URLs from Bing search results.
      CONTEXT: We are looking for auction lots for "${artist}".
      
      RULES:
      1. Return JSON: { "links": [] }.
      2. TARGET: Links starting with "https://www.invaluable.com/auction-lot/" 
      3. IGNORE: Search related links, ads, microsoft links.
      
      INPUT TEXT:
      ${markdown.substring(0, 50000)}
    `;

    // Attempt generation using candidate models until one succeeds
    let result: any = null;
    let lastErr: any = null;
    MODEL_LOOP: for (const candidate of MODEL_CANDIDATES) {
      const variants = candidate.startsWith('models/') ? [candidate] : [candidate, `models/${candidate}`];
      for (const name of variants) {
        try {
          console.log(`[Monitor] Trying model: ${name}`);
          const model = genAI.getGenerativeModel({ model: name, generationConfig: { responseMimeType: "application/json", temperature: 0.0 } });
          result = await model.generateContent(prompt);
          break MODEL_LOOP;
        } catch (err: any) {
          lastErr = err;
          console.warn(`[Monitor] Model ${name} failed:`, err?.message || err);
        }
      }
    }

    if (!result) {
      console.error('[Monitor] All model candidates failed:', lastErr);
      return NextResponse.json({ found: 0, links: [], warning: 'No available AI models', detail: String(lastErr?.message || lastErr) });
    }

    const raw = result?.response ? await result.response.text() : '';
    const cleaned = String(raw).replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: try to extract a JSON object substring from the noisy output
      const maybe = String(raw).match(/({[\s\S]*})/);
      if (maybe && maybe[1]) {
        try {
          data = JSON.parse(maybe[1]);
        } catch (e2) {
          console.warn('[Monitor] Fallback JSON parse failed', e2, (maybe[1] || '').substring(0, 1000));
          return NextResponse.json({ found: 0, links: [], warning: 'AI returned invalid JSON' });
        }
      } else {
        console.warn('[Monitor] AI did not return valid JSON', cleaned.substring(0, 1000));
        return NextResponse.json({ found: 0, links: [], warning: 'AI returned invalid JSON' });
      }
    }

    // Ensure we have an array of links
    const links = Array.isArray(data?.links) ? data.links : [];
    // Filter only Invaluable lot URLs and normalize
    const re = /^https?:\/\/(?:www\.)?invaluable\.com\/auction-lot\//i;
    const filtered = links.map((l: string) => String(l).trim()).filter((l: string) => re.test(l));
    const uniqueLinks = Array.from(new Set(filtered));

    console.log(`[Monitor] Targets acquired via Gemini: ${uniqueLinks.length}`);

    if (uniqueLinks.length > 0) {
      return NextResponse.json({ found: uniqueLinks.length, links: uniqueLinks, method: 'gemini' });
    }

    // Fallback: if Gemini found nothing, fetch the Bing HTML directly and extract hrefs
    try {
      console.log('[Monitor] No lots found via Jina/Gemini. Falling back to direct Bing HTML parsing.');
      const bingHtmlRes = await fetch(bingUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        cache: 'no-store'
      });

      if (bingHtmlRes.ok) {
        const html = await bingHtmlRes.text();
        // Find direct invaluable auction-lot links in href attributes
        const hrefRe = /href=["'](https?:\/\/(?:www\.)?invaluable\.com\/auction-lot[^"']+)["']/gi;
        const matches = Array.from(html.matchAll(hrefRe)).map(m => m[1]);
        const dedup = Array.from(new Set(matches.map((s: string) => s.split('?')[0])));
        if (dedup.length > 0) {
          console.log(`[Monitor] Found ${dedup.length} links via Bing HTML parse.`);
          return NextResponse.json({ found: dedup.length, links: dedup, method: 'bing-html' });
        }
      } else {
        console.warn('[Monitor] Direct Bing HTML fetch failed:', bingHtmlRes.status);
      }
    } catch (e) {
      console.warn('[Monitor] Bing HTML fallback failed:', e);
    }

    console.log('[Monitor] No lots found via Jina/Gemini.');
    return NextResponse.json({ found: 0, links: [], warning: 'No lots found via Jina/Gemini.' });

  } catch (error) {
    console.error('[Monitor Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}