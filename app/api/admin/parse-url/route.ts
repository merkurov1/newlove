import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';

export const runtime = 'nodejs';
export const maxDuration = 60; // Даем больше времени, так как браузерный рендеринг ScrapingAnt может занимать 10-20 секунд

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

const BLOCK_MARKERS = /access denied|captcha|cf-chl|are you a robot|pardon our interruption|unusual traffic/i;

async function fetchViaScrapingAnt(targetUrl: string): Promise<string> {
  const apiKey = process.env.SCRAPINGANT_API_KEY;
  if (!apiKey) {
    throw new Error('SCRAPINGANT_API_KEY is not defined in environment variables');
  }

  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.append('url', targetUrl);
  endpoint.searchParams.append('x-api-key', apiKey);
  endpoint.searchParams.append('browser', 'true'); // Включаем headless browser для обхода JS-челленджей
  endpoint.searchParams.append('proxy_country', 'US'); // Эмулируем заход из США (лучше проходимость)

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ScrapingAnt error [${res.status}]: ${errText}`);
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

    const house = houseFor(target.hostname);
    if (target.protocol !== 'https:' || !house) {
      return NextResponse.json({ error: 'host_not_allowed' }, { status: 400 });
    }

    let html: string;

    if (typeof pastedHtml === 'string' && pastedHtml.length > 500) {
      // Использование напрямую переданного HTML
      html = pastedHtml;
    } else {
      // Использование ScrapingAnt
      try {
        html = await fetchViaScrapingAnt(target.href);
      } catch (err: any) {
        console.error('[ScrapingAnt Fetch Error]:', err.message);
        return NextResponse.json(
          {
            error: 'scrapingant_failed',
            details: err.message,
            hint: 'ScrapingAnt could not bypass protection. Try pasting HTML manually.',
          },
          { status: 502 }
        );
      }

      // Проверка на жесткую блокировку
      const blocked = BLOCK_MARKERS.test(html) && !/application\/ld\+json/.test(html);
      if (blocked) {
        return NextResponse.json(
          {
            error: 'blocked',
            hint: 'Site refused access even through ScrapingAnt.',
          },
          { status: 422 }
        );
      }
    }

    // Извлечение данных из HTML
    const lot = parseLotHtml(html, target.href, house, { debug: !!debug });

    return NextResponse.json({ lot, rawLength: html.length });
  } catch (e: any) {
    console.error('[parse-lot]', e);
    return NextResponse.json({ error: 'parse_failed', details: e?.message ?? String(e) }, { status: 500 });
  }
}
