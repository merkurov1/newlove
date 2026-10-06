import * as cheerio from 'cheerio';
import type { LotData, ImageCandidate } from './types';

export function parseLotDom(html: string, url: string, houseName?: string): Partial<LotData> {
  const $ = cheerio.load(html);
  const result: Partial<LotData> = {};
  const candidates: ImageCandidate[] = [];

  const host = new URL(url).hostname.toLowerCase();

  if (host.includes('sothebys.com')) {
    result.house = "Sotheby's";
    result.artist = $('h2[class*="Artist"], .lot-head-artist').first().text().trim();
    result.title = $('h1[class*="Title"], .lot-head-title').first().text().trim();
    result.estimate = $('[class*="Estimate"], .lot-estimate').first().text().trim();
    result.price = $('[class*="PriceRealized"], .price-realized').first().text().trim();

    $('img[src*="sothebys"]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !candidates.some((c) => c.url === src)) {
        candidates.push({ url: src, source: 'sothebys-dom' });
      }
    });
  } else if (host.includes('christies.com')) {
    result.house = "Christie's";
    result.artist = $('.chr-lot-header__artist-name, [data-qa="artist_name"]').first().text().trim();
    result.title = $('.chr-lot-header__title, [data-qa="lot_title"]').first().text().trim();
    result.estimate = $('.chr-lot-header__estimate, [data-qa="estimate"]').first().text().trim();
    result.price = $('.chr-lot-header__price, [data-qa="price_realized"]').first().text().trim();

    $('img[src*="christies"]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !candidates.some((c) => c.url === src)) {
        candidates.push({ url: src, source: 'christies-dom' });
      }
    });
  } else if (host.includes('phillips.com')) {
    result.house = 'Phillips';
    result.artist = $('.lot-detail__artist, .artist-name').first().text().trim();
    result.title = $('.lot-detail__title, .lot-title').first().text().trim();
    result.estimate = $('.lot-detail__estimate').first().text().trim();
    result.price = $('.lot-detail__sold-price').first().text().trim();
  } else if (host.includes('bonhams.com')) {
    result.house = 'Bonhams';
    result.artist = $('.lot-artist-name, .artist-title').first().text().trim();
    result.title = $('.lot-title, .title-text').first().text().trim();
    result.estimate = $('.lot-estimate').first().text().trim();
    result.price = $('.lot-price-realised').first().text().trim();
  }

  if (!result.title) {
    result.title = $('h1').first().text().trim() || $('h2').first().text().trim();
  }

  $('main img, article img, .lot-image img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.startsWith('http') && !candidates.some((c) => c.url === src)) {
      candidates.push({ url: src, source: 'generic-dom' });
    }
  });

  if (candidates.length > 0 && !result.imageUrl) {
    result.imageUrl = candidates[0].url;
  }

  result.imageCandidates = candidates;
  return result;
}
