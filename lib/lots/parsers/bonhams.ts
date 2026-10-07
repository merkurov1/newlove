import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

export class PhillipsParser extends HouseParser {
  readonly houseId = "phillips";
  readonly matches = ["phillips"];

  parse(html: string, url: string): LotData {
    const $ = cheerio.load(html);
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      $(".lot__title").first().text() ||
        $('[data-test="lot-title"]').first().text() ||
        $("h1").first().text() ||
        null
    );

    const artist = this.normalizeText(
      $(".artist__name").first().text() ||
        $(".maker-name").first().text() ||
        $('[data-test="artist"]').first().text() ||
        null
    );

    const lotNumber = this.normalizeText(
      $(".lot__number").first().text() ||
        $(".lot-number").first().text() ||
        null
    );

    const estimateText = this.normalizeText(
      $(".estimate").first().text() ||
        $('[data-test="estimate"]').first().text() ||
        null
    );

    const priceText = this.normalizeText(
      $(".price").first().text() ||
        $('[data-test="sale-price"]').first().text() ||
        null
    );

    const soldText = this.normalizeText(
      $('[data-test="sale-status"]').first().text() ||
        $(".sale-status").first().text() ||
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
      imageCandidates: imageUrl ? [{ url: imageUrl, source: "phillips" }] : [],
      url,
      source: "house-parser",
      confidence: 0.8,
      raw: { lotNumber, estimateText, priceText, soldText, medium, dimensions },
      parseErrors,
    };
  }
}
