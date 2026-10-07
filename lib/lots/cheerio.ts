import * as cheerio from "cheerio";
import type { LotData, ImageCandidate } from "./types";

function normalizeText(value?: string | null): string | null {
  if (!value) return null;

  const result = value
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();

  return result || null;
}

function detectCurrency(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (/\bUSD\b|\$/i.test(value)) return "USD";
  if (/\bGBP\b|£/i.test(value)) return "GBP";
  if (/\bEUR\b|€/i.test(value)) return "EUR";
  if (/\bCHF\b/i.test(value)) return "CHF";
  return undefined;
}

function parseEstimate(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const numbers = raw
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number);

  return {
    raw,
    currency: detectCurrency(raw),
    min: numbers?.[0] ?? null,
    max: numbers?.[1] ?? numbers?.[0] ?? null,
  };
}

function parsePrice(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const numbers = raw
    .replace(/,/g, "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number);

  return {
    raw,
    currency: detectCurrency(raw),
    realized: numbers?.[0],
  };
}

export function parseLotDom(
  html: string,
  url: string,
  houseName?: string
): Partial<LotData> {
  const $ = cheerio.load(html);
  const result: Partial<LotData> = {};
  const candidates: ImageCandidate[] = [];

  const host = new URL(url).hostname.toLowerCase();

  if (host.includes("sothebys.com")) {
    result.house = "Sotheby's";
    result.artist = normalizeText(
      $('h2[class*="Artist"], .lot-head-artist').first().text()
    );
    result.title = normalizeText(
      $('h1[class*="Title"], .lot-head-title').first().text()
    );

    const estimate = normalizeText(
      $('[class*="Estimate"], .lot-estimate').first().text()
    );

    const price = normalizeText(
      $('[class*="PriceRealized"], .price-realized').first().text()
    );

    result.estimate = parseEstimate(estimate);
    result.price = parsePrice(price);

    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (
        src &&
        src.startsWith("http") &&
        !candidates.some((c) => c.url === src)
      ) {
        candidates.push({
          url: src,
          source: "sothebys-dom",
        });
      }
    });
  } else if (host.includes("christies.com")) {
    result.house = "Christie's";

    result.artist = normalizeText(
      $('.chr-lot-header__artist-name, [data-qa="artist_name"]')
        .first()
        .text()
    );

    result.title = normalizeText(
      $('.chr-lot-header__title, [data-qa="lot_title"]')
        .first()
        .text()
    );

    const estimate = normalizeText(
      $('.chr-lot-header__estimate, [data-qa="estimate"]')
        .first()
        .text()
    );

    const price = normalizeText(
      $('.chr-lot-header__price, [data-qa="price_realized"]')
        .first()
        .text()
    );

    result.estimate = parseEstimate(estimate);
    result.price = parsePrice(price);
  } else if (host.includes("phillips.com")) {
    result.house = "Phillips";

    result.artist = normalizeText(
      $(".lot-detail__artist, .artist-name").first().text()
    );

    result.title = normalizeText(
      $(".lot-detail__title, .lot-title").first().text()
    );

    result.estimate = parseEstimate(
      $(".lot-detail__estimate").first().text()
    );

    result.price = parsePrice(
      $(".lot-detail__sold-price").first().text()
    );
  } else if (host.includes("bonhams.com")) {
    result.house = "Bonhams";

    result.artist = normalizeText(
      $(".lot-artist-name, .artist-title").first().text()
    );

    result.title = normalizeText(
      $(".lot-title, .title-text").first().text()
    );

    result.estimate = parseEstimate(
      $(".lot-estimate").first().text()
    );

    result.price = parsePrice(
      $(".lot-price-realised").first().text()
    );
  }

  if (!result.title) {
    result.title =
      normalizeText($("h1").first().text()) ||
      normalizeText($("h2").first().text());
  }

  $("main img, article img, .lot-image img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");

    if (
      src &&
      src.startsWith("http") &&
      !candidates.some((c) => c.url === src)
    ) {
      candidates.push({
        url: src,
        source: "generic-dom",
      });
    }
  });

  if (candidates.length > 0 && !result.imageUrl) {
    result.imageUrl = candidates[0].url;
  }

  result.imageCandidates = candidates;

  return result;
}