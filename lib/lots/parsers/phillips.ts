import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import { extractLotDetails } from "../extract-detail";
import type { LotData } from "../types";

export class PhillipsParser extends HouseParser {
  readonly houseId = "phillips";
  readonly matches = ["phillips.com"];

  parse(
    html: string,
    url: string
  ): LotData {
    const $ = cheerio.load(html);
    const details = extractLotDetails($);
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      $(".lot-detail__title").first().text() ||
        $(".lot-title").first().text() ||
        $('[data-test="lot-title"]').first().text() ||
        $("h1").first().text()
    );

    const artist = this.normalizeText(
      $(".lot-detail__artist").first().text() ||
        $(".artist-name").first().text() ||
        $(".maker-name").first().text() ||
        $('[data-test="artist"]').first().text()
    );

    const lotNumber = this.normalizeText(
      $(".lot-number").first().text() ||
        $('[data-test="lot-number"]').first().text() ||
        details.lotNumber
    );

    const estimateText = this.normalizeText(
      $(".lot-detail__estimate").first().text() ||
        $(".estimate").first().text() ||
        $('[data-test="estimate"]').first().text()
    );

    const priceText = this.normalizeText(
      $(".lot-detail__sold-price").first().text() ||
        $(".price").first().text() ||
        $('[data-test="sale-price"]').first().text()
    );

    const soldText = this.normalizeText(
      $(".sale-status").first().text() ||
        $('[data-test="sale-status"]').first().text()
    );

    const medium = this.normalizeText(
      $(".medium").first().text() ||
        $('[data-test="medium"]').first().text() ||
        details.medium
    );

    const dimensions = this.normalizeText(
      $(".dimensions").first().text() ||
        $('[data-test="dimensions"]').first().text() ||
        details.dimensions
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
      year: details.year || this.parseYear(title),
      medium,
      dimensions,
      signature: details.signature,
      description: details.description,
      provenance: details.provenance,
      exhibitions: details.exhibitions,
      literature: details.literature,
      auctionDate: details.auctionDate,
      estimate: this.parseEstimate(estimateText),
      price: this.parsePrice(priceText),
      sold:
        soldText !== null
          ? /sold|sale/i.test(soldText)
          : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl
        ? [
            {
              url: imageUrl,
              source: "phillips",
            },
          ]
        : [],
      url,
      source: "house-parser",
      parserName: "phillips",
      parserVersion: this.version,
      confidence: 0.8,
      raw: {
        lotNumber,
        estimateText,
        priceText,
        soldText,
        medium,
        dimensions,
        signature: details.signature,
        provenance: details.provenance,
        exhibitions: details.exhibitions,
        literature: details.literature,
        auctionDate: details.auctionDate,
      },
      parseErrors,
    };
  }
}