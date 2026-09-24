import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch page, status: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Удаляем ненужный тяжелый мусор
    $('script, style, svg, noscript, iframe, footer, nav, header').remove();

    // Извлекаем изображение
    let imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      '';

    if (!imageUrl) {
      const firstImg = $('img').first().attr('src');
      if (firstImg) {
        imageUrl = firstImg.startsWith('http')
          ? firstImg
          : new URL(firstImg, url).toString();
      }
    }

    // Чистим текст и ограничиваем длину (максимум ~40 000 символов, чтобы не выходить за лимиты токенов)
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 40000);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').text().trim() ||
      '';

    return NextResponse.json({
      title,
      image: imageUrl,
      rawData: cleanText,
      url,
    });
  } catch (error: any) {
    console.error('[parse-url Error]:', error);
    return NextResponse.json(
      { error: 'Failed to parse URL', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
