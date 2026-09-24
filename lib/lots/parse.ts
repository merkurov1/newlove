import * as cheerio from 'cheerio';

export interface LotData {
  title: string | null;
  artist: string | null;
  description: string | null;
  imageUrl: string | null;
  estimate: string | null;
  auctionHouse: string;
  sourceUrl: string;
  rawJsonLd?: any;
}

export function parseLotHtml(
  html: string,
  url: string,
  house: string,
  options?: { debug?: boolean }
): LotData {
  const $ = cheerio.load(html);

  let title: string | null = null;
  let artist: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;
  let estimate: string | null = null;
  let jsonLdData: any = null;

  // 1. Извлечение JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;

      const parsed: any = JSON.parse(content);
      const items: any[] = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const type = item['@type'];
        if (
          type === 'VisualArtwork' ||
          type === 'Product' ||
          type === 'ItemPage' ||
          type === 'IndividualProduct'
        ) {
          jsonLdData = item;
          break;
        }
      }
    } catch {
      // Игнорируем ошибки JSON
    }
  });

  if (jsonLdData) {
    // Название
    if (typeof jsonLdData.name === 'string') {
      title = jsonLdData.name;
    } else if (typeof jsonLdData.title === 'string') {
      title = jsonLdData.title;
    }

    // Описание
    if (typeof jsonLdData.description === 'string') {
      description = jsonLdData.description;
    }

    // Автор / Художник
    const rawCreator: any = jsonLdData.creator || jsonLdData.artist || jsonLdData.author;
    if (typeof rawCreator === 'string') {
      artist = rawCreator;
    } else if (rawCreator && typeof rawCreator === 'object') {
      if (typeof rawCreator.name === 'string') {
        artist = rawCreator.name;
      }
    }

    // Изображение
    const rawImg: any = jsonLdData.image;
    if (typeof rawImg === 'string') {
      imageUrl = rawImg;
    } else if (Array.isArray(rawImg) && rawImg.length > 0) {
      const firstImg: any = rawImg[0];
      if (typeof firstImg === 'string') {
        imageUrl = firstImg;
      } else if (firstImg && typeof firstImg === 'object' && typeof firstImg.url === 'string') {
        imageUrl = firstImg.url;
      }
    } else if (rawImg && typeof rawImg === 'object' && typeof rawImg.url === 'string') {
      imageUrl = rawImg.url;
    }

    // Эстимейт / Цена
    if (jsonLdData.offers) {
      const offers: any = Array.isArray(jsonLdData.offers) ? jsonLdData.offers[0] : jsonLdData.offers;
      if (offers && typeof offers === 'object') {
        const currency = typeof offers.priceCurrency === 'string' ? offers.priceCurrency : '';
        if (offers.price !== undefined && offers.price !== null) {
          estimate = `${offers.price} ${currency}`.trim();
        } else if (offers.lowPrice !== undefined && offers.highPrice !== undefined) {
          estimate = `${offers.lowPrice} - ${offers.highPrice} ${currency}`.trim();
        }
      }
    }
  }

  // 2. OpenGraph / Meta Fallbacks
  if (!imageUrl) {
    imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      null;
  }

  if (!title) {
    title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      null;
  }

  if (!description) {
    description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;
  }

  // Приводим URL к абсолютному виду
  if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    try {
      imageUrl = new URL(imageUrl, url).href;
    } catch {
      // Игнорируем ошибки URL
    }
  }

  return {
    title,
    artist,
    description,
    imageUrl,
    estimate,
    auctionHouse: house,
    sourceUrl: url,
    ...(options?.debug ? { rawJsonLd: jsonLdData } : {}),
  };
}
