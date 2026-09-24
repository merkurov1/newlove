import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HOUSES: Record<string, string> = {
  'christies.com': "Christie's",
  'sothebys.com': "Sotheby's",
  'phillips.com': 'Phillips',
  'bonhams.com': 'Bonhams',
};

const houseFor = (host: string) => {
  const d = Object.keys(HOUSES).find((k) => host === k || host.endsWith('.' + k));
  return d ? HOUSES[d] : null;
};

async function fetchViaScrapingAnt(targetUrl: string): Promise<string> {
  const apiKey = (process.env.SCRAPINGANT_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('SCRAPINGANT_API_KEY is not defined in environment variables');
  }

  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.append('url', targetUrl);
  endpoint.searchParams.append('x-api-key', apiKey);
  endpoint.searchParams.append('browser', 'true');
  endpoint.searchParams.append('proxy_country', 'US');

  console.log(`[ScrapingAnt] Fetching: ${targetUrl}`);

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ScrapingAnt HTTP ${res.status}: ${errText}`);
  }

  return await res.text();
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url, html: pastedHtml, debug } = await req.json();

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return NextResponse.json({ error: 'bad_url' }, { status: 400 });
    }

    const house = houseFor(target.hostname) || 'Auction House';
    let html: string;

    if (typeof pastedHtml === 'string' && pastedHtml.length > 500) {
      console.log('[Parse] Using pasted HTML content');
      html = pastedHtml;
    } else {
      try {
        html = await fetchViaScrapingAnt(target.href);
      } catch (err: any) {
        console.error('[ScrapingAnt Error]:', err.message);
        return NextResponse.json(
          { error: 'scrapingant_failed', details: err.message },
          { status: 502 }
        );
      }
    }

    console.log(`[Parse] Processing HTML length: ${html.length} chars`);
    const lot: any = parseLotHtml(html, target.href, house, { debug: !!debug });

    // Выпрямляем ответ для фронтенда
    return NextResponse.json({
      success: true,
      artist: lot?.artist || '',
      title: lot?.title || '',
      image_url: lot?.imageUrl || lot?.image_url || lot?.image || '',
      medium: lot?.medium || '',
      dimensions: lot?.dimensions || '',
      estimate: lot?.estimate || '',
      date: lot?.date || lot?.year || '',
      provenance: lot?.provenance || '',
      raw_description: lot?.description || lot?.raw_description || '',
      rawLength: html.length,
      lot, // Сохраняем и исходный объект на всякий случай
    });
  } catch (e: any) {
    console.error('[parse-url Error]:', e);
    return NextResponse.json({ error: 'parse_failed', details: e?.message ?? String(e) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
