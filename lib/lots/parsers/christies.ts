import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import { extractChristiesEmbeddedLot } from "../embedded";
import { extractLotDetails } from "../extract-detail";
import type { LotData } from "../types";

export class ChristiesParser extends HouseParser {
  readonly houseId = "christies";
  readonly matches = ["christies.com"];

  parse(
    html: string,
    url: string
  ): LotData {
    const $ = cheerio.load(html);
    const embedded = extractChristiesEmbeddedLot(html);
    const details = extractLotDetails($);
    const parseErrors: string[] = [];

    const title =
      embedded?.title ||
      this.normalizeText(
        $('[data-testid="lot-title"]').first().text() ||
          $(".lot-title").first().text() ||
          $('[data-qa="lot_title"]').first().text() ||
          $("h1").first().text()
      );

    const artist =
      embedded?.artist ||
      this.normalizeText(
        $('[data-testid="artist-name"]').first().text() ||
          $(".artist-name").first().text() ||
          $('[data-testid="artist"]').first().text() ||
          $('[data-qa="artist_name"]').first().text()
      );

    const lotNumber =
      embedded?.lotNumber ||
      this.normalizeText(
        $('[data-testid="lot-number"]').first().text() ||
          $(".lot-number").first().text() ||
          details.lotNumber
      );

    const estimateText =
      embedded?.estimateRaw ||
      this.normalizeText(
        $('[data-testid="estimate"]').first().text() ||
          $(".estimate").first().text() ||
          $('[data-qa="estimate"]').first().text()
      );

    const priceText =
      embedded?.priceRaw ||
      this.normalizeText(
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
        $(".medium").first().text() ||
        details.medium
    );

    const dimensions = this.normalizeText(
      $('[data-testid="dimensions"]').first().text() ||
        $(".dimensions").first().text() ||
        details.dimensions ||
        embedded?.dimensions
    );

    const imageUrl =
      embedded?.imageUrl ||
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
      lotEssay: details.lotEssay,
      catalogueNote: details.catalogueNote,
      conditionReport: details.conditionReport,
      conditionReportStatus: details.conditionReportStatus,
      artistDates: details.artistDates,
      provenance: details.provenance,
      exhibitions: details.exhibitions,
      literature: details.literature,
      auctionDate: details.auctionDate,
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
      parserName: "christies",
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
        embedded_header: Boolean(embedded),
      },
      parseErrors,
    };
  }
}