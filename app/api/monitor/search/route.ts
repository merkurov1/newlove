import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deepseekApiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
const deepseekModel = (process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(
  /\/+$/,
  ''
);

function buildSiteFilter(source: string | undefined) {
  if (!source || source === 'invaluable') return 'site:invaluable.com';
  if (source === 'all')
    return '(site:invaluable.com OR site:sothebys.com OR site:christies.com OR site:bonhams.com OR site:phillips.com)';
  return source.includes('.') ? `site:${source}` : `site:${source}.com`;
}

function defaultUrlPattern(source: string | undefined) {
  if (source === 'all') {
    return /^https?:\/\/(?:www\.)?(?:invaluable\.com\/auction-lot|sothebys\.com\/en\/auctions|christies\.com\/lot|bonhams\.com\/auction|phillips\.com\/detail)/i;
  }
  return /^https?:\/\/(?:www\.)?invaluable\.com\/auction-lot\//i;
}

function boundedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(8_000),
  });
}

export async function POST(req: Request) {
  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = checkRateLimit(getClientIp(req), {
      interval: 60 * 1000,
      maxRequests: 10,
      keyPrefix: 'monitor-search',
    });
    if (limited) return limited;

    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 4_096) {
      return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    if (rawBody.length > 4_096) {
      return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const artist = typeof input.artist === 'string' ? input.artist.trim() : '';
    const source = typeof input.source === 'string' ? input.source.trim().toLowerCase() : undefined;

    if (artist.length < 1 || artist.length > 120) {
      return NextResponse.json({ error: 'Artist name must be 1-120 characters' }, { status: 400 });
    }
    if (
      source &&
      source !== 'all' &&
      source !== 'invaluable' &&
      !/^[a-z0-9.-]{1,120}$/.test(source)
    ) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }

    // Fast-path: if caller specifically asked for Invaluable only, query Invaluable directly.
    if (source === 'invaluable') {
      try {
        const invUrl = `https://www.invaluable.com/search?query=${encodeURIComponent(artist)}&keyword=${encodeURIComponent(artist)}`;
        const invRes = await boundedFetch(invUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          cache: 'no-store',
        });
        if (invRes.ok) {
          const html = await invRes.text();
          // Find likely lot URLs (common path segments: auction-lot, /lot/ etc.)
          const invPattern =
            /href=["'](https?:\/\/(?:www\.)?invaluable\.com\/[^"]*?(?:auction-lot|lot)[^"']*)["']/gi;
          const matches = Array.from(html.matchAll(invPattern)).map((m) => m[1]);
          const unique = Array.from(new Set(matches.map((s) => s.split('?')[0])));
          if (unique.length > 0)
            return NextResponse.json({ found: unique.length, links: unique, method: 'invaluable' });
        }
      } catch {}
      // If invaluable fast-path found nothing, continue to general pipeline as fallback
    }

    const siteFilter = buildSiteFilter(source);
    const query = `${siteFilter} "${artist}" ("auction-lot" OR "auction" OR "lot" OR "lot details")`;
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-us`;

    // Try Jina.ai markdown harvest first (best-effort)
    try {
      const jinaUrl = `https://r.jina.ai/${encodeURI(bingUrl)}`;
      const jinaRes = await boundedFetch(jinaUrl, {
        headers: { 'X-Return-Format': 'markdown', 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      });
      if (jinaRes.ok) {
        const markdown = await jinaRes.text();
        if (markdown.length > 400) {
          const hrefRegex = /https?:\/\/(?:www\.)?[a-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
          const rawMatches = Array.from(new Set(markdown.match(hrefRegex) || []));
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
          const pattern = defaultUrlPattern(source);
          const filtered = matches.filter((m) => pattern.test(m));
          if (filtered.length > 0)
            return NextResponse.json({ found: filtered.length, links: filtered, method: 'jina' });
        }
      }
    } catch {}

    // Prefer direct HTML parsing fallback (Bing -> links)
    try {
      const bingHtmlRes = await boundedFetch(bingUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      });
      if (bingHtmlRes.ok) {
        const html = await bingHtmlRes.text();
        const hrefPattern =
          /href=["'](https?:\/\/(?:www\.)?(?:invaluable\.com\/auction-lot|sothebys\.com\/en\/auctions|christies\.com\/lot|bonhams\.com\/auction|phillips\.com\/detail)[^"']+)["']/gi;
        let matches = Array.from(html.matchAll(hrefPattern)).map((m) => m[1]);
        // Fallback: more permissive capture of any URL containing target domains
        if (matches.length === 0) {
          const anyUrlPattern =
            /https?:\/\/(?:www\.)?[^"'>\s]*?(?:invaluable\.com|sothebys\.com|christies\.com|bonhams\.com|phillips\.com)[^"'>\s]*/gi;
          matches = Array.from(html.matchAll(anyUrlPattern)).map((m) => m[0]);
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
        if (uniq.length > 0)
          return NextResponse.json({ found: uniq.length, links: uniq, method: 'bing-html' });
      }
    } catch {}

    // If a DeepSeek key is available, use it as the last AI-assisted attempt.
    if (deepseekApiKey) {
      try {
        const client = new OpenAI({
          baseURL: deepseekBaseUrl,
          apiKey: deepseekApiKey,
          timeout: 8_000,
          maxRetries: 0,
        });
        const completion = await client.chat.completions.create({
          model: deepseekModel,
          messages: [
            {
              role: 'system',
              content:
                'ROLE: Auction Lot URL Extractor. Extract only auction lot URLs that belong to the requested target domain. Return JSON only.',
            },
            {
              role: 'user',
              content: `TARGET: ${siteFilter}\nARTIST: ${artist}\n\nReturn JSON in the form {"links": [...]} with the auction lot URLs you can establish.`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        });
        const raw = completion?.choices?.[0]?.message?.content || '';
        const cleaned = String(raw)
          .replace(/^```json\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim();
        let data: any = null;
        try {
          data = JSON.parse(cleaned);
        } catch (e) {
          const maybe = String(raw).match(/(\{[\s\S]*\})/);
          if (maybe && maybe[1]) data = JSON.parse(maybe[1]);
        }
        const links = Array.isArray(data?.links)
          ? data.links.map((s: string) => String(s).split('?')[0])
          : [];
        const pattern = defaultUrlPattern(source);
        const filtered = links.filter((l: string) => pattern.test(l));
        const unique = Array.from(new Set(filtered));
        if (unique.length > 0)
          return NextResponse.json({ found: unique.length, links: unique, method: 'deepseek' });
      } catch {}
    }

    // DuckDuckGo fallback
    try {
      const ddgQuery = `${siteFilter} "${artist}" auction lot`;
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`;
      const ddgRes = await boundedFetch(ddgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store',
      });
      if (ddgRes.ok) {
        const ddgHtml = await ddgRes.text();
        const uddgMatches = Array.from(ddgHtml.matchAll(/uddg=([^&"']+)/gi)).map((m) => {
          try {
            return decodeURIComponent(m[1]);
          } catch {
            return '';
          }
        });
        const patt = defaultUrlPattern(source);
        const filtered = uddgMatches
          .filter((u) => patt.test(u))
          .map((s: string) => s.split('?')[0]);
        const unique = Array.from(new Set(filtered));
        if (unique.length > 0)
          return NextResponse.json({ found: unique.length, links: unique, method: 'duckduckgo' });
      }
    } catch {}

    return NextResponse.json({ found: 0, links: [], warning: 'No lots found' });
  } catch (error: unknown) {
    console.error('[Monitor Error]:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
