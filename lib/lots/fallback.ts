import { HouseParser } from "./house-parser";
import type { LotData } from "./types";
import * as cheerio from "cheerio";

/**
 * Generic fallback parser.
 * Used when house-specific parser is unavailable or confidence is low.
 */
export class GenericFallbackParser extends HouseParser {
  readonly houseId = "unknown";
  readonly matches = [];

  parse(html: string, url: string): LotData {
    const $ = cheerio.load(html);
    const rootText = $.root().text();

    const title =
      this.normalizeText($('meta[property="og:title"]').attr("content") || undefined) ||
      this.normalizeText($('meta[name="twitter:title"]').attr("content") || undefined) ||
      this.normalizeText($("h1").first().text() || undefined) ||
      this.normalizeText($("title").first().text() || undefined) ||
      null;

    const artist =
      this.normalizeText($('meta[name="artist"]').attr("content") || undefined) ||
      this.normalizeText($('meta[property="artist"]').attr("content") || undefined) ||
      this.extractArtistFromText(rootText) ||
      null;

    const estimateText = this.extractByLabel(rootText, "estimate") || this.extractByLabel(rootText, "est.");
    const imageUrl =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $("img").first().attr("src") ||
      null;

    const normalizedImage = imageUrl ? { url: imageUrl, source: "fallback" } : null;

    return {
      auctionHouse: this.houseId,
      title,
      artist,
      year: this.parseYear(title || undefined),
      estimate: this.parseEstimate(estimateText || undefined),
      imageUrl,
      imageCandidates: normalizedImage ? [normalizedImage] : [],
      url,
      source: "fallback",
      confidence: 0.25,
      warnings: ["House-specific parser unavailable; generic fallback used."],
      raw: { estimateText, imageUrl },
      parseErrors: title ? [] : ["title not found in fallback parser"],
    };
  }

  private extractArtistFromText(text: string): string | null {
    const patterns = [
      /by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
      /artist\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
      /maker\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }

    return null;
  }

  private extractByLabel(text: string, label: string): string | null {
    const match = text.match(new RegExp(`${label}\\s*[:\-]?\\s*([\\$£€\\d,\\.\s–-]+)`, "i"));
    return match?.[1] ? match[1].trim() : null;
  }
}
