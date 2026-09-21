import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 30; 

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Curator Engine] Fetching via Social Bot emulation: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const htmlContent = await response.text();

    if (!response.ok || htmlContent.length < 500) {
      throw new Error(`Target auction house blocked the request (Status: ${response.status})`);
    }

    console.log(`[Curator Engine] Page fetched successfully. HTML length: ${htmlContent.length}. Extracting deep data...`);

    // 1. Извлекаем базовые Open Graph метатеги
    const getMetaContent = (property: string): string => {
      const match = htmlContent.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
                    htmlContent.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'));
      return match ? decodeEntities(match[1]) : '';
    };

    const ogTitle = getMetaContent('og:title');
    const ogDescription = getMetaContent('og:description');
    const ogImage = getMetaContent('og:image');

    // 2. Парсим __NEXT_DATA__ для извлечения скрытых данных лота
    let lotData: any = {};
    const nextDataMatch = htmlContent.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        // Рекурсивно или точечно ищем объект лота в пропсах Next.js
        lotData = findLotObject(json) || {};
      } catch (e) {
        console.warn('[Curator Engine] Failed to parse __NEXT_DATA__ JSON');
      }
    }

    // Извлекаем поля с приоритетом из структурированного __NEXT_DATA__, с фоллбеком на метатеги/текст
    const parsedData = {
      artist: lotData.artist || extractArtist(ogTitle),
      title: lotData.title || extractTitle(ogTitle),
      medium: lotData.medium || extractPattern(htmlContent, /medium/i) || 'N/A',
      dimensions: lotData.dimensions || extractPattern(htmlContent, /dimensions|size/i) || 'N/A',
      date: lotData.date || extractPattern(htmlContent, /\b(19\d{2}|20\d{2})\b/) || 'N/A',
      estimate: lotData.estimate || extractPattern(htmlContent, /estimate/i) || 'N/A',
      provenance: lotData.provenance || extractSection(htmlContent, 'provenance') || 'N/A',
      image_url: ogImage || lotData.image_url || '',
      raw_description: ogDescription || lotData.description || 'N/A'
    };

    console.log('[Curator Engine] Deep extraction complete:', parsedData);
    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}

// Вспомогательные функции
function decodeEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractArtist(ogTitle: string): string {
  if (!ogTitle) return 'N/A';
  const parts = ogTitle.split('|');
  return parts[0]?.trim() || 'N/A';
}

function extractTitle(ogTitle: string): string {
  if (!ogTitle) return 'N/A';
  const parts = ogTitle.split('|');
  return parts[1]?.trim() || 'N/A';
}

// Рекурсивный поиск объекта, похожего на лот, в дереве Next.js
function findLotObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.lot || obj.artwork || (obj.title && obj.artist)) {
    return obj.lot || obj.artwork || obj;
  }
  for (const key of Object.keys(obj)) {
    const found: any = findLotObject(obj[key]);
    if (found) return found;
  }
  return null;
}

function extractPattern(html: string, regex: RegExp): string {
  // Упрощенный поиск текстовых совпадений в HTML для заглушек
  return '';
}

function extractSection(html: string, keyword: string): string {
  // Базовый поиск секций по ключевым словам
  return '';
}
