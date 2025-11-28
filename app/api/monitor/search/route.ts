import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiKey = (process.env.GOOGLE_API_KEY || '').trim();
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

function buildSiteFilter(source: string | undefined) {
  if (!source || source === 'invaluable') return 'site:invaluable.com';
  if (source === 'all') return '(site:invaluable.com OR site:sothebys.com OR site:christies.com OR site:bonhams.com OR site:phillips.com)';
  return source.includes('.') ? `site:${source}` : `site:${source}.com`;
}

function defaultUrlPattern(source: string | undefined) {
  if (source === 'all') {
    return /^https?:\/\/(?:www\.)?(?:invaluable\.com\/auction-lot|sothebys\.com\/en\/auctions|christies\.com\/lot|bonhams\.com\/auction|phillips\.com\/detail)/i;
  }
  return /^https?:\/\/(?:www\.)?invaluable\.com\/auction-lot\//i;
}

export async function POST(req: Request) {
  const debug: string[] = [];
  try {
    const { artist, source } = await req.json();
    if (!artist) return NextResponse.json({ error: 'Artist name required' }, { status: 400 });

    // Fast-path: if caller specifically asked for Invaluable only, query Invaluable directly.
    if (source === 'invaluable') {
      try {
        const invUrl = `https://www.invaluable.com/search?query=${encodeURIComponent(artist)}&keyword=${encodeURIComponent(artist)}`;
        debug.push(`Fetching Invaluable search: ${invUrl}`);
        const invRes = await fetch(invUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
        if (invRes.ok) {
          const html = await invRes.text();
          debug.push(`Invaluable HTML length: ${html.length}`);
          // Find likely lot URLs (common path segments: auction-lot, /lot/ etc.)
          const invPattern = /href=["'](https?:\/\/(?:www\.)?invaluable\.com\/[^"]*?(?:auction-lot|lot)[^"']*)["']/gi;
          const matches = Array.from(html.matchAll(invPattern)).map(m => m[1]);
          const unique = Array.from(new Set(matches.map(s => s.split('?')[0])));
          debug.push(`Invaluable extracted ${unique.length} links: ${JSON.stringify(unique.slice(0, 30))}`);
          if (unique.length > 0) return NextResponse.json({ found: unique.length, links: unique, method: 'invaluable', _debug: debug });
        } else {
          debug.push(`Invaluable search responded: ${invRes.status}`);
        }
      } catch (e: any) {
        debug.push(`Invaluable fetch failed: ${String(e?.message || e)}`);
      }
      // If invaluable fast-path found nothing, continue to general pipeline as fallback
    }

    debug.push(`Scouting for: ${artist} (source=${source || 'invaluable'})`);
    const siteFilter = buildSiteFilter(source);
    const query = `${siteFilter} "${artist}" ("auction-lot" OR "auction" OR "lot" OR "lot details")`;
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-us`;

    // Try Jina.ai markdown harvest first (best-effort)
    try {
      const jinaUrl = `https://r.jina.ai/${encodeURI(bingUrl)}`;
      debug.push(`Fetching Jina: ${jinaUrl}`);
      const jinaRes = await fetch(jinaUrl, { headers: { 'X-Return-Format': 'markdown', 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
      if (jinaRes.ok) {
        const markdown = await jinaRes.text();
        debug.push(`Jina length: ${markdown.length}`);
        // include a small snippet of the markdown for debugging
        const jinaSnippet = markdown.substring(0, 2000);
        if (markdown.length > 0) debug.push(`Jina snippet: ${jinaSnippet.substring(0, 500).replace(/\n/g, ' ')}...`);
        if (markdown.length > 400) {
          const hrefRegex = /https?:\/\/(?:www\.)?[a-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
          const rawMatches = Array.from(new Set((markdown.match(hrefRegex) || [])));
          const cleanUrl = (s: string) => {
            try {
              let t = s.trim();
              t = t.replace(/^\(+/, '').replace(/\)+$/, '');
              t = t.replace(/[\]\)"'`<>]+$/g, '');
              t = t.replace(/^\[+/, '').replace(/\]+$/, '');
              t = t.replace(/&amp;/g, '&');
              // ensure URL constructor can parse it
              new URL(t);
              return t.split('?')[0];
            } catch (e) {
              return null;
            }
          };
          const matches = rawMatches.map(cleanUrl).filter(Boolean) as string[];
          // push matches into debug for inspection
          debug.push(`Jina extracted raw links (${matches.length}): ${JSON.stringify(matches.slice(0, 30))}`);
          const pattern = defaultUrlPattern(source);
          const filtered = matches.filter(m => pattern.test(m));
          if (filtered.length > 0) return NextResponse.json({ found: filtered.length, links: filtered, method: 'jina', _debug: debug });
        }
      } else {
        debug.push(`Jina responded: ${jinaRes.status}`);
      }
    } catch (e: any) {
      debug.push(`Jina failed: ${String(e?.message || e)}`);
    }

    // Prefer direct HTML parsing fallback (Bing -> links)
    try {
      debug.push(`Fetching Bing HTML: ${bingUrl}`);
      const bingHtmlRes = await fetch(bingUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
      if (bingHtmlRes.ok) {
        const html = await bingHtmlRes.text();
        // include a small snippet of bing html
        debug.push(`Bing HTML length: ${html.length}`);
        const bingSnippet = html.substring(0, 2000).replace(/\n/g, ' ');
        debug.push(`Bing HTML snippet: ${bingSnippet.substring(0, 500)}...`);
        const hrefPattern = /href=["'](https?:\/\/(?:www\.)?(?:invaluable\.com\/auction-lot|sothebys\.com\/en\/auctions|christies\.com\/lot|bonhams\.com\/auction|phillips\.com\/detail)[^"']+)["']/gi;
        let matches = Array.from(html.matchAll(hrefPattern)).map(m => m[1]);
        // Fallback: more permissive capture of any URL containing target domains
        if (matches.length === 0) {
          const anyUrlPattern = /https?:\/\/(?:www\.)?[^"'>\s]*?(?:invaluable\.com|sothebys\.com|christies\.com|bonhams\.com|phillips\.com)[^"'>\s]*/gi;
          matches = Array.from(html.matchAll(anyUrlPattern)).map(m => m[0]);
        }
        const cleanUrl = (s: string) => {
          try {
            let t = s.trim();
            t = t.replace(/^\(+/, '').replace(/\)+$/, '');
            t = t.replace(/[\]\)"'`<>]+$/g, '');
            t = t.replace(/&amp;/g, '&');
            new URL(t);
            return t.split('?')[0];
          } catch (e) {
            return null;
          }
        };
        const uniq = Array.from(new Set(matches.map(cleanUrl).filter(Boolean) as string[]));
        debug.push(`Bing HTML extracted ${uniq.length} links: ${JSON.stringify(uniq.slice(0, 30))}`);
        if (uniq.length > 0) return NextResponse.json({ found: uniq.length, links: uniq, method: 'bing-html', _debug: debug });
      } else {
        debug.push(`Bing HTML response: ${bingHtmlRes.status}`);
      }
    } catch (e: any) {
      debug.push(`Bing HTML failed: ${String(e?.message || e)}`);
    }

    // If we have an AI key, try Gemini as a last resort (more expensive/fragile)
    if (genAI) {
      try {
        const modelName = (process.env.GOOGLE_GEMINI_MODEL || 'gemini-2.5-flash').trim();
        debug.push(`Attempting Gemini model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.0 } });
        const prompt = `ROLE: Auction Lot URL Extractor. TASK: Extract auction lot URLs from the text below. TARGET: ${siteFilter}. INPUT:\n\n`;
        const result = await model.generateContent(prompt + "\n\n" + 'Please output JSON like {"links": [...]}');
        const raw = result?.response ? await result.response.text() : String(result);
        debug.push(`Gemini raw length: ${String(raw?.length || 0)}`);
        const cleaned = String(raw).replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        let data: any = null;
        try { data = JSON.parse(cleaned); } catch (e) {
          const maybe = String(raw).match(/(\{[\s\S]*\})/);
          if (maybe && maybe[1]) data = JSON.parse(maybe[1]);
        }
        const links = Array.isArray(data?.links) ? data.links.map((s: string) => String(s).split('?')[0]) : [];
        const pattern = defaultUrlPattern(source);
        const filtered = links.filter((l: string) => pattern.test(l));
        const unique = Array.from(new Set(filtered));
        debug.push(`Gemini found ${unique.length} links`);
        if (unique.length > 0) return NextResponse.json({ found: unique.length, links: unique, method: 'gemini', _debug: debug });
      } catch (e: any) {
        debug.push(`Gemini failed: ${String(e?.message || e)}`);
      }
    } else {
      debug.push('Skipping Gemini: GOOGLE_API_KEY not set');
    }

    // DuckDuckGo fallback
    try {
      const ddgQuery = `${siteFilter} "${artist}" auction lot`;
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`;
      debug.push(`Fetching DuckDuckGo HTML: ${ddgUrl}`);
      const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
      if (ddgRes.ok) {
        const ddgHtml = await ddgRes.text();
        const uddgMatches = Array.from(ddgHtml.matchAll(/uddg=([^&"']+)/gi)).map(m => { try { return decodeURIComponent(m[1]); } catch { return ''; } });
        const patt = defaultUrlPattern(source);
        const filtered = uddgMatches.filter(u => patt.test(u)).map((s: string) => s.split('?')[0]);
        const unique = Array.from(new Set(filtered));
        debug.push(`DuckDuckGo found ${unique.length} links`);
        if (unique.length > 0) return NextResponse.json({ found: unique.length, links: unique, method: 'duckduckgo', _debug: debug });
      } else {
        debug.push(`DuckDuckGo response: ${ddgRes.status}`);
      }
    } catch (e: any) {
      debug.push(`DuckDuckGo failed: ${String(e?.message || e)}`);
    }

    debug.push('No lots found via any method');
    return NextResponse.json({ found: 0, links: [], warning: 'No lots found', _debug: debug });

  } catch (error: any) {
    console.error('[Monitor Error]:', error);
    return NextResponse.json({ error: 'Internal Server Error', detail: String(error?.message || error) }, { status: 500 });
  }
}