import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

export class ChristiesParser extends HouseParser {
  readonly houseId = "christies";
  readonly matches = ["christies.com"];

  parse(
    html: string,
    url: string
  ): LotData {
    const $ = cheerio.load(html);
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      $('[data-testid="lot-title"]').first().text() ||
        $(".lot-title").first().text() ||
        $('[data-qa="lot_title"]').first().text() ||
        $("h1").first().text()
    );

    const artist = this.normalizeText(
      $('[data-testid="artist-name"]').first().text() ||
        $(".artist-name").first().text() ||
        $('[data-testid="artist"]').first().text() ||
        $('[data-qa="artist_name"]').first().text()
    );

    const lotNumber = this.normalizeText(
      $('[data-testid="lot-number"]').first().text() ||
        $(".lot-number").first().text()
    );

    const estimateText = this.normalizeText(
      $('[data-testid="estimate"]').first().text() ||
        $(".estimate").first().text() ||
        $('[data-qa="estimate"]').first().text()
    );

    const priceText = this.normalizeText(
      $('[data-testid="sale-price"]').first().text() ||
        $(".sale-price").first().text() ||
        $('[data-qa="price_realized"]').first().text()
    );

    const soldText = this.normalizeText(
      $('[data-testid="sold-status"]').first().text() ||
        $(".sold-status").first().text()
    );

    const medium = this.normalizeText(
      $('[data-testid="medium"]').first().text() ||
        $(".medium").first().text()
    );

    const dimensions = this.normalizeText(
      $('[data-testid="dimensions"]').first().text() ||
        $(".dimensions").first().text()
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
          ? /sold|vendu|vente|成交/i.test(soldText)
          : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl
        ? [
            {
              url: imageUrl,
              source: "christies",
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