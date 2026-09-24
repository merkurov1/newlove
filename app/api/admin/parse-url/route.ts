import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchViaScrapingAnt(targetUrl: string): Promise<string> {
  const apiKey = (process.env.SCRAPINGANT_API_KEY || '').trim();
  if (!apiKey) throw new Error('SCRAPINGANT_API_KEY is missing');

  // JS-скрипт, который выполнится ВНУТРИ хромиума ScrapingAnt
  // Он ждет прогрузки данных и извлекает все доступные источники
  const jsSnippet = Buffer.from(`
    await new Promise(r => setTimeout(r, 4000)); // Ждем 4 сек гидратацию React
    return JSON.stringify({
      title: document.title,
      h1: document.querySelector('h1')?.innerText || '',
      nextData: window.__NEXT_DATA__ || null,
      initialState: window.__INITIAL_STATE__ || null,
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      allImages: Array.from(document.querySelectorAll('img')).map(i => i.src).filter(s => s.includes('christies')),
      bodyText: document.body.innerText.slice(0, 8000)
    });
  `).toString('base64');

  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.append('url', targetUrl);
  endpoint.searchParams.append('x-api-key', apiKey);
  endpoint.searchParams.append('browser', 'true');
  endpoint.searchParams.append('proxy_country', 'US');
  endpoint.searchParams.append('js_snippet', jsSnippet);

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(50_000),
  });

  if (!res.ok) throw new Error(`ScrapingAnt HTTP ${res.status}`);
  return await res.text();
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    const rawResponse = await fetchViaScrapingAnt(url);
    
    let antData: any = {};
    try {
      // ScrapingAnt возвращает результат js_snippet или HTML
      antData = JSON.parse(rawResponse);
    } catch {
      // Если возвращен HTML, парсим базово cheerio
      const $ = cheerio.load(rawResponse);
      antData = {
        title: $('title').text(),
        h1: $('h1').text(),
        ogImage: $('meta[property="og:image"]').attr('content') || '',
        bodyText: $('body').text().slice(0, 8000)
      };
    }

    // Разбираем Заголовок
    const pageTitle = antData.title || '';
    let artist = '';
    let title = '';
    let date = '';

    // Формат Christie's: "JEAN-MICHEL BASQUIAT (1960-1988), Ancient Scientist | Christie's"
    const titleMatch = pageTitle.match(/^([^,(]+)(?:\(([^)]+)\))?,\s*([^|]+)/i);
    if (titleMatch) {
      artist = titleMatch[1].trim();
      date = titleMatch[2]?.trim() || '';
      title = titleMatch[3].trim();
    } else if (pageTitle.includes('|')) {
      const parts = pageTitle.split('|').map((p: string) => p.trim());
      artist = parts[0] || '';
      title = parts[1] || '';
    }

    // Ищем лучшую картинку из найденных
    let bestImage = antData.ogImage || '';
    if (!bestImage && antData.allImages?.length > 0) {
      bestImage = antData.allImages.find((img: string) => img.includes('lot') || img.includes('image')) || antData.allImages[0];
    }

    return NextResponse.json({
      success: true,
      artist,
      title,
      date,
      image_url: bestImage,
      medium: '',
      dimensions: '',
      estimate: '',
      provenance: '',
      raw_description: antData.bodyText || '',
      rawLength: JSON.stringify(antData).length,
      extracted: antData
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'parse_failed', details: e?.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
