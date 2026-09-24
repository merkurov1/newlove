import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchViaScrapingAnt(targetUrl: string): Promise<string> {
  const apiKey = (process.env.SCRAPINGANT_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('SCRAPINGANT_API_KEY is missing');
  }

  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.append('url', targetUrl);
  endpoint.searchParams.append('x-api-key', apiKey);
  endpoint.searchParams.append('browser', 'true');
  endpoint.searchParams.append('proxy_country', 'US');

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) throw new Error(`ScrapingAnt HTTP ${res.status}`);
  return await res.text();
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    const html = await fetchViaScrapingAnt(url);
    const $ = cheerio.load(html);

    // 1. Ищем все теги JSON-LD (в них аукционные дома хранят чистые данные)
    const jsonLdBlocks: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (raw) jsonLdBlocks.push(JSON.parse(raw));
      } catch {}
    });

    // 2. Ищем метатеги OpenGraph (og:title, og:image)
    const ogData: Record<string, string> = {};
    $('meta[property^="og:"]').each((_, el) => {
      const prop = $(el).attr('property')?.replace('og:', '');
      const content = $(el).attr('content');
      if (prop && content) ogData[prop] = content;
    });

    // 3. Вытаскиваем заголовок h1/h2 для сравнения
    const h1 = $('h1').text().trim();
    const titleTag = $('title').text().trim();

    return NextResponse.json({
      success: true,
      rawLength: html.length,
      extracted: {
        ogData,
        jsonLdBlocks,
        h1,
        titleTag,
      },
      // Первые 3000 символов чистого текста страницы для быстрой оценки
      bodyTextSnippet: $('body').text().replace(/\s+/g, ' ').slice(0, 3000)
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'parse_failed', details: e?.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
