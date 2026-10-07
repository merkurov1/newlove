import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

export class ChristiesParser extends HouseParser {
  readonly houseId = "christies";
  readonly matches = ["christies"];

  parse(html: string, url: string): LotData {
    const $ = cheerio.load(html);
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      $('[data-testid="lot-title"]').first().text() ||
        $(".lot-title").first().text() ||
        $("h1").first().text() ||
        null
    );

    const artist = this.normalizeText(
      $('[data-testid="artist-name"]').first().text() ||
        $(".artist-name").first().text() ||
        $('[data-testid="artist"]').first().text() ||
        null
    );

    const lotNumber = this.normalizeText(
      $('[data-testid="lot-number"]').first().text() ||
        $(".lot-number").first().text() ||
        null
    );

    const estimateText = this.normalizeText(
      $('[data-testid="estimate"]').first().text() ||
        $(".estimate").first().text() ||
        null
    );

    const priceText = this.normalizeText(
      $('[data-testid="sale-price"]').first().text() ||
        $(".sale-price").first().text() ||
        null
    );

    const soldText = this.normalizeText(
      $('[data-testid="sold-status"]').first().text() ||
        $(".sold-status").first().text() ||
        null
    );

    const medium = this.normalizeText(
      $('[data-testid="medium"]').first().text() ||
        $(".medium").first().text() ||
        null
    );

    const dimensions = this.normalizeText(
      $('[data-testid="dimensions"]').first().text() ||
        $(".dimensions").first().text() ||
        null
    );

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
      sold: soldText !== null ? /sold|vendu|vente|成交/i.test(soldText) : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl ? [{ url: imageUrl, source: "christies" }] : [],
      url,
      source: "house-parser",
      confidence: 0.8,
      raw: { lotNumber, estimateText, priceText, soldText, medium, dimensions },
      parseErrors,
    };
  }
}
