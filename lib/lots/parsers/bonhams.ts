import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

export class BonhamsParser extends HouseParser {
  readonly houseId = "bonhams";
  readonly matches = ["bonhams.com"];

  parse(
    html: string,
    url: string
  ): LotData {
    const $ = cheerio.load(html);
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      $(".lot-title").first().text() ||
        $(".title-text").first().text() ||
        $('[data-testid="lot-title"]').first().text() ||
        $("h1").first().text()
    );

    const artist = this.normalizeText(
      $(".lot-artist-name").first().text() ||
        $(".artist-title").first().text() ||
        $(".artist-name").first().text() ||
        $(".maker-name").first().text() ||
        $('[data-testid="artist"]').first().text()
    );

    const lotNumber = this.normalizeText(
      $(".lot-number").first().text() ||
        $('[data-testid="lot-number"]').first().text()
    );

    const estimateText = this.normalizeText(
      $(".lot-estimate").first().text() ||
        $(".estimate").first().text() ||
        $('[data-testid="estimate"]').first().text()
    );

    const priceText = this.normalizeText(
      $(".lot-price-realised").first().text() ||
        $(".sale-price").first().text() ||
        $('[data-testid="sale-price"]').first().text()
    );

    const soldText = this.normalizeText(
      $(".sale-status").first().text() ||
        $('[data-testid="sale-status"]').first().text()
    );

    const medium = this.normalizeText(
      $(".medium").first().text() ||
        $('[data-testid="medium"]').first().text()
    );

    const dimensions = this.normalizeText(
      $(".dimensions").first().text() ||
        $('[data-testid="dimensions"]').first().text()
    );

    const imageUrl =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $(".lot-image img").first().attr("src") ||
      $("img").first().attr("src") ||
      null;

    if (!title) {
      parseErrors.push("title not found");
    }

    if (!artist) {
      parseErrors.push("artist not found");
    }

    return {
      auctionHouse: this.houseId,
      lotNumber,
      title,
      artist,
      year: this.parseYear(title),
      medium,
      dimensions,
      estimate: this.parseEstimate(estimateText),
      price: this.parsePrice(priceText),
      sold:
        soldText !== null
          ? /sold|sale|realised/i.test(soldText)
          : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl
        ? [
            {
              url: imageUrl,
              source: "bonhams",
            },
          ]
        : [],
      url,
      source: "house-parser",
      confidence: 0.8,
      raw: {
        lotNumber,
        estimateText,
        priceText,
        soldText,
        medium,
        dimensions,
      },
      parseErrors,
    };
  }
}