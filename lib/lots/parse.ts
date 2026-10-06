export interface NormalizedPrice {
  raw?: string;
  currency?: string;
  amountMin?: number;
  amountMax?: number;
  realized?: number;
}

export interface ImageCandidate {
  url: string;
  source?: string;
  width?: number;
  height?: number;
}

export interface LotData {
  title?: string;
  artist?: string;
  estimate?: string;
  price?: string;
  normalizedPrice?: NormalizedPrice;
  description?: string;
  imageUrl?: string;
  imageCandidates?: ImageCandidate[];
  house?: string;
  medium?: string;
  dimensions?: string;
  year?: string;
  auctionDate?: string;
  [key: string]: any;
}

/**
 * Извлекает значение контента из Meta-тегов
 */
function getMetaContent(html: string, propertyOrName: string): string | undefined {
  const metaRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${propertyOrName}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const match = html.match(metaRegex);
  if (match && match[1]) return match[1].trim();

  // Фоллбек для иного порядка атрибутов
  const reverseMetaRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${propertyOrName}["']`,
    'i'
  );
  const reverseMatch = html.match(reverseMetaRegex);
  return reverseMatch && reverseMatch[1] ? reverseMatch[1].trim() : undefined;
}

/**
 * Нормализует цены и валюты
 */
function parsePriceString(priceStr?: string): NormalizedPrice | undefined {
  if (!priceStr) return undefined;

  const result: NormalizedPrice = { raw: priceStr };

  // Определение валюты
  if (priceStr.includes('$') || priceStr.includes('USD')) result.currency = 'USD';
  else if (priceStr.includes('€') || priceStr.includes('EUR')) result.currency = 'EUR';
  else if (priceStr.includes('£') || priceStr.includes('GBP')) result.currency = 'GBP';
  else if (priceStr.includes('CHF')) result.currency = 'CHF';

  // Извлечение всех чисел
  const numbers = priceStr
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number);

  if (numbers && numbers.length > 0) {
    if (numbers.length === 1) {
      result.realized = numbers[0];
    } else if (numbers.length >= 2) {
      result.amountMin = Math.min(numbers[0], numbers[1]);
      result.amountMax = Math.max(numbers[0], numbers[1]);
    }
  }

  return result;
}

/**
 * Извлекает JSON-LD блоки из HTML
 */
function extractJsonLd(html: string): any[] {
  const jsonLdBlocks: any[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        jsonLdBlocks.push(...parsed);
      } else if (parsed && typeof parsed === 'object') {
        if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
          jsonLdBlocks.push(...parsed['@graph']);
        } else {
          jsonLdBlocks.push(parsed);
        }
      }
    } catch {
      // Игнорируем невалидный JSON-LD
    }
  }

  return jsonLdBlocks;
}

/**
 * Парсит HTML страницы лота и возвращает структурированные данные
 */
export function parseLotHtml(
  html: string,
  url: string,
  house?: string,
  options?: { debug?: boolean }
): LotData {
  const candidates: ImageCandidate[] = [];
  const result: LotData = {
    house: house || '',
    imageCandidates: candidates,
  };

  // 1. Извлечение JSON-LD (Приоритет №1)
  const jsonLdItems = extractJsonLd(html);
  const artwork = jsonLdItems.find(
    (item) =>
      item['@type'] === 'VisualArtwork' ||
      item['@type'] === 'Product' ||
      item['@type'] === 'IndividualProduct' ||
      item['@type'] === 'ItemPage'
  );

  if (artwork) {
    result.title = artwork.name || artwork.title;
    result.description = artwork.description;
    
    if (artwork.artist) {
      result.artist = typeof artwork.artist === 'string' ? artwork.artist : artwork.artist.name;
    } else if (artwork.creator) {
      result.artist = typeof artwork.creator === 'string' ? artwork.creator : artwork.creator.name;
    }

    if (artwork.image) {
      const imgUrl = Array.isArray(artwork.image) ? artwork.image[0] : artwork.image;
      const finalImg = typeof imgUrl === 'string' ? imgUrl : imgUrl.contentUrl || imgUrl.url;
      if (finalImg) {
        result.imageUrl = finalImg;
        candidates.push({ url: finalImg, source: 'json-ld' });
      }
    }

    if (artwork.offers) {
      const offer = Array.isArray(artwork.offers) ? artwork.offers[0] : artwork.offers;
      const priceVal = offer.price || offer.lowPrice;
      const curr = offer.priceCurrency || '';
      if (priceVal) {
        result.price = `${curr} ${priceVal}`.trim();
      }
    }
  }

  // 2. Извлечение OpenGraph & Meta-тегов (Приоритет №2 / Дополнение)
  if (!result.title) {
    result.title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');
  }

  if (!result.description) {
    result.description = getMetaContent(html, 'og:description') || getMetaContent(html, 'description');
  }

  const ogImage = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image');
  if (ogImage && !candidates.some((c) => c.url === ogImage)) {
    candidates.push({ url: ogImage, source: 'og:image' });
    if (!result.imageUrl) {
      result.imageUrl = ogImage;
    }
  }

  // 3. Фоллбек заголовка из тега <title>
  if (!result.title) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      result.title = titleMatch[1].replace(/\s+/g, ' ').trim();
    }
  }

  // 4. Нормализация цен
  if (result.price || result.estimate) {
    result.normalizedPrice = parsePriceString(result.price || result.estimate);
  }

  result.imageCandidates = candidates;
  return result;
}
