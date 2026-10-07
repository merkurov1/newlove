import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

export class BonhamsParser extends HouseParser {
  readonly houseId = "bonhams";
  readonly matches = ["bonhams"];

  parse(html: string, url: string): LotData {
    const $ = cheerio.load(html);
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      $(".lot-title").first().text() ||
        $('[data-testid="lot-title"]').first().text() ||
        $("h1").first().text() ||
        null
    );

    const artist = this.normalizeText(
      $(".artist-name").first().text() ||
        $(".maker-name").first().text() ||
        $('[data-testid="artist"]').first().text() ||
        null
    );

    const lotNumber = this.normalizeText(
      $(".lot-number").first().text() ||
        $('[data-testid="lot-number"]').first().text() ||
        null
    );

    const estimateText = this.normalizeText(
      $(".estimate").first().text() ||
        $('[data-testid="estimate"]').first().text() ||
        null
    );

    const priceText = this.normalizeText(
      $(".sale-price").first().text() ||
        $('[data-testid="sale-price"]').first().text() ||
        null
    );

    const soldText = this.normalizeText(
      $(".sale-status").first().text() ||
        $('[data-testid="sale-status"]').first().text() ||
        null
    );

    const medium = this.normalizeText($(".medium").first().text() || null);
    const dimensions = this.normalizeText($(".dimensions").first().text() || null);

    const imageUrl =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $("img").first().attr("src") ||
      null;

    if (!title) parseErrors.push("title not found");
    if (!artist) parseErrors.push("artist not found");

    return {
      auctionHouse: this.houseId,
      lotNumber,
      title,
      artist,
      year: this.parseYear(title ?? undefined),
      medium,
      dimensions,
      estimate: this.parseEstimate(estimateText ?? undefined),
      price: priceText
        ? {
            raw: priceText,
            currency: this.detectCurrency(priceText),
            realized: this.parseNumber(priceText) ?? undefined,
          }
        : null,
      sold: soldText !== null ? /sold|sale/i.test(soldText) : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl ? [{ url: imageUrl, source: "bonhams" }] : [],
      url,
      source: "house-parser",
      confidence: 0.8,
      raw: { lotNumber, estimateText, priceText, soldText, medium, dimensions },
      parseErrors,
    };
  }
}
