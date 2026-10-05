import * as cheerio from 'cheerio';

export interface LotData {
  title: string | null;
  artist: string | null;
  description: string | null;
  imageUrl: string | null;
  estimate: string | null;
  auctionHouse: string;
  sourceUrl: string;
  specs?: {
    medium?: string | null;
    dimensions?: string | null;
    date?: string | null;
    provenance?: string | null;
  };
  evidence?: {
    title: string;
    artist: string;
    description: string;
    image: string;
  };
  rawJsonLd?: any;
}

function cleanText(value: unknown, maxLength = 5000): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function firstText($: cheerio.CheerioAPI, selectors: string[], minLength = 20): string | null {
  for (const selector of selectors) {
    const value = cleanText($(selector).first().text());
    if (value && value.length >= minLength) return value;
  }
  return null;
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
  let titleEvidence = 'unknown';
  let artistEvidence = 'unknown';
  let descriptionEvidence = 'unknown';
  let imageEvidence = 'unknown';
  let medium: string | null = null;
  let dimensions: string | null = null;
  let date: string | null = null;
  let provenance: string | null = null;

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
      titleEvidence = 'json-ld';
    } else if (typeof jsonLdData.title === 'string') {
      title = jsonLdData.title;
      titleEvidence = 'json-ld';
    }

    // Описание
    if (typeof jsonLdData.description === 'string') {
      description = jsonLdData.description;
      descriptionEvidence = 'json-ld';
    }

    // Автор / Художник
    const rawCreator: any = jsonLdData.creator || jsonLdData.artist || jsonLdData.author;
    if (typeof rawCreator === 'string') {
      artist = rawCreator;
    } else if (rawCreator && typeof rawCreator === 'object') {
      if (typeof rawCreator.name === 'string') {
        artist = rawCreator.name;
        artistEvidence = 'json-ld';
      }
    }

    // Изображение
    const rawImg: any = jsonLdData.image;
    if (typeof rawImg === 'string') {
      imageUrl = rawImg;
      imageEvidence = 'json-ld';
    } else if (Array.isArray(rawImg) && rawImg.length > 0) {
      const firstImg: any = rawImg[0];
      if (typeof firstImg === 'string') {
        imageUrl = firstImg;
        imageEvidence = 'json-ld';
      } else if (firstImg && typeof firstImg === 'object' && typeof firstImg.url === 'string') {
          imageUrl = firstImg.url;
          imageEvidence = 'json-ld';
      }
    } else if (rawImg && typeof rawImg === 'object' && typeof rawImg.url === 'string') {
      imageUrl = rawImg.url;
      imageEvidence = 'json-ld';
    }

    medium = cleanText(jsonLdData.artMedium || jsonLdData.material || jsonLdData.medium, 500);
    date = cleanText(jsonLdData.dateCreated || jsonLdData.copyrightYear, 100);
    if (jsonLdData.width || jsonLdData.height) {
      dimensions = [jsonLdData.height, jsonLdData.width, jsonLdData.depth]
        .filter(Boolean)
        .join(' × ');
    } else if (typeof jsonLdData.size === 'string') {
      dimensions = cleanText(jsonLdData.size, 300);
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
    if (imageUrl) imageEvidence = 'meta';
  }

  if (!title) {
    title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      null;
    if (title) titleEvidence = 'meta';
  }

  if (!description) {
    description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      null;
    if (description) descriptionEvidence = 'meta';
  }

  if (!artist) {
    artist =
      cleanText($('meta[name="author"]').attr('content'), 300) ||
      cleanText($('[itemprop="artist"], [itemprop="creator"], [data-testid*="artist"], [class*="artist"]').first().text(), 300);
    if (artist) artistEvidence = 'dom';
  }

  if (!description) {
    description = firstText($, [
      '[itemprop="description"]',
      '[data-testid*="description"]',
      '[class*="lot-description"]',
      '[class*="artwork-description"]',
      '[class*="description"]',
    ]);
    if (description) descriptionEvidence = 'dom';
  }

  if (!description) {
    const paragraphs = $('main p, article p, [role="main"] p')
      .toArray()
      .map((element) => cleanText($(element).text(), 1500))
      .filter((value): value is string => typeof value === 'string' && value.length > 60)
      .filter((value) => !/^(share|save|view lot|bid|estimate|login|sign in)/i.test(value));
    description = paragraphs.sort((a, b) => b.length - a.length)[0] || null;
    if (description) descriptionEvidence = 'body';
  }

  if (!medium) {
    medium = firstText($, ['[itemprop="material"]', '[itemprop="artMedium"]', '[data-testid*="medium"]', '[class*="medium"]'], 2);
  }

  if (!dimensions) {
    dimensions = firstText($, ['[itemprop="size"]', '[data-testid*="dimension"]', '[class*="dimension"]'], 2);
  }

  if (!date) {
    date = cleanText($('[itemprop="dateCreated"], [data-testid*="year"], [class*="year"]').first().text(), 100);
  }

  provenance = firstText($, ['[data-testid*="provenance"]', '[class*="provenance"]']);

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
    specs: { medium, dimensions, date, provenance },
    evidence: {
      title: titleEvidence,
      artist: artistEvidence,
      description: descriptionEvidence,
      image: imageEvidence,
    },
    ...(options?.debug ? { rawJsonLd: jsonLdData } : {}),
  };
}
