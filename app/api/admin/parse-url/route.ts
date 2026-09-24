import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchViaScrapingAnt(targetUrl: string): Promise<string> {
  const apiKey = (process.env.SCRAPINGANT_API_KEY || '').trim();
  if (!apiKey) throw new Error('SCRAPINGANT_API_KEY is missing');

  // Тот самый js_snippet, который дал кучу инфы:
  // Ждем 4 секунды гидратацию React и забираем глобальное состояние + DOM
  const jsSnippet = Buffer.from(`
    await new Promise(r => setTimeout(r, 4000));
    return JSON.stringify({
      title: document.title,
      h1: document.querySelector('h1')?.innerText || '',
      chrComponents: window.chrComponents || null,
      nextData: window.__NEXT_DATA__ || null,
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      allImages: Array.from(document.querySelectorAll('img')).map(i => i.src),
      bodyText: document.body.innerText
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
    signal: AbortSignal.timeout(55_000),
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
      antData = JSON.parse(rawResponse);
    } catch {
      const $ = cheerio.load(rawResponse);
      antData = {
        title: $('title').text(),
        h1: $('h1').text(),
        ogImage: $('meta[property="og:image"]').attr('content') || '',
        bodyText: $('body').text()
      };
    }

    // 1. Разбор заголовка страницы (у нас он работал отлично!)
    // "JEAN-MICHEL BASQUIAT (1960-1988), Ancient Scientist | Christie's"
    const pageTitle = antData.title || '';
    let artist = '';
    let title = '';
    let date = '';

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

    // 2. Ищем лучшую картинку из найденных изображений
    let bestImage = antData.ogImage || '';
    if (antData.allImages && antData.allImages.length > 0) {
      // Ищем картинку самого лота (обычно содержит 'lot' или 'image' или 'dfp' в URL)
      const lotImg = antData.allImages.find((img: string) => 
        (img.includes('lot') || img.includes('images') || img.includes('christies')) && 
        !img.includes('logo') && !img.includes('icon')
      );
      if (lotImg) bestImage = lotImg;
    }

    // 3. Очищаем bodyText от служебного мусора браузера/JS
    let cleanText = antData.bodyText || '';
    // Отрезаем служебные плагины browser-update и скрипты header/navigation, если они попали в текст
    if (cleanText.includes('window.chrComponents')) {
      cleanText = cleanText.split('window.chrComponents')[0];
    }

    return NextResponse.json({
      success: true,
      artist,
      title: title || antData.h1,
      date,
      image_url: bestImage,
      medium: '',
      dimensions: '',
      estimate: '',
      provenance: '',
      raw_description: cleanText.trim().slice(0, 8000),
      rawLength: JSON.stringify(antData).length,
      extracted: antData
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'parse_failed', details: e?.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
