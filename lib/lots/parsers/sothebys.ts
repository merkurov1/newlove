import * as cheerio from "cheerio";
import { HouseParser } from "../house-parser";
import { extractSothebysEmbeddedLot } from "../embedded";
import { extractLotDetails } from "../extract-detail";
import type { LotData } from "../types";

export class SothebysParser extends HouseParser {
  readonly houseId = "sothebys";
  readonly matches = ["sothebys.com"];

  parse(
    html: string,
    url: string
  ): LotData {
    const $ = cheerio.load(html);
    const embedded = extractSothebysEmbeddedLot(html);
    const details = extractLotDetails($);
    const parseErrors: string[] = [];

    const domTitle = this.normalizeText(
      $(".lot-title").first().text() ||
        $('[data-testid="lot-title"]').first().text() ||
        $("h1").first().text()
    );

    const domArtist = this.normalizeText(
      $(".artist-name").first().text() ||
        $(".maker-name").first().text() ||
        $('[data-testid="artist"]').first().text()
    );

    const structuredTitle = embedded?.title || details.title;
    const structuredArtist = embedded?.artist || details.artist;

    // Sotheby's sometimes renders the artist in the title slot. Prefer the
    // structured catalogue title only when the DOM title is missing or is
    // actually the artist name.
    const useStructuredTitle = Boolean(
      structuredTitle &&
        (!domTitle ||
          domTitle === structuredArtist ||
          domTitle === domArtist),
    );

    const title = useStructuredTitle
      ? structuredTitle
      : domTitle || structuredTitle;

    const artist = useStructuredTitle
      ? structuredArtist || domArtist
      : domArtist || structuredArtist;

    const lotNumber =
      embedded?.lotNumber ||
      this.normalizeText(
        $(".lot-number").first().text() ||
          $('[data-testid="lot-number"]').first().text() ||
          details.lotNumber
      );

    const estimateText =
      embedded?.estimateRaw ||
      this.normalizeText(
        $(".estimate").first().text() ||
          $('[data-testid="estimate"]').first().text()
      );

    const priceText = this.normalizeText(
      $(".price-realized").first().text() ||
        $('[data-testid="price-realized"]').first().text() ||
        $(".sale-price").first().text()
    );

    const soldText = this.normalizeText(
      $(".sale-status").first().text() ||
        $('[data-testid="sale-status"]').first().text()
    );

    const medium = this.normalizeText(
      $(".medium").first().text() ||
        $('[data-testid="medium"]').first().text() ||
        details.medium
    );

    const dimensions = this.normalizeText(
      $(".dimensions").first().text() ||
        $('[data-testid="dimensions"]').first().text() ||
        details.dimensions
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

    const estimate =
      embedded?.estimateLow !== null &&
      embedded?.estimateLow !== undefined &&
      embedded?.estimateHigh !== null &&
      embedded?.estimateHigh !== undefined
        ? {
            raw: embedded.estimateRaw || undefined,
            currency: embedded.currency || undefined,
            min: embedded.estimateLow,
            max: embedded.estimateHigh,
          }
        : this.parseEstimate(estimateText);

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
      currency: embedded?.currency || undefined,
      estimate,
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
              source: "sothebys",
            },
          ]
        : [],
      url,
      source: "house-parser",
      parserName: "sothebys",
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