import * as cheerio from "cheerio";
import { HouseParser } from "./house-parser";
import { extractLotDetails } from "./extract-detail";
import type { LotData } from "./types";

export class GenericFallbackParser extends HouseParser {
  readonly houseId = "unknown" as const;
  readonly matches: string[] = [];

  parse(html: string, url: string): LotData {
    const $ = cheerio.load(html);
    const details = extractLotDetails($);
    const rootText = $.root().text();

    const title =
      this.normalizeText(
        $('meta[property="og:title"]').attr("content"),
      ) ||
      this.normalizeText(
        $('meta[name="twitter:title"]').attr("content"),
      ) ||
      details.title ||
      this.normalizeText($("h1").first().text()) ||
      this.normalizeText($("title").first().text());

    const artist =
      details.artist ||
      this.normalizeText($('meta[name="artist"]').attr("content")) ||
      this.normalizeText($('meta[property="artist"]').attr("content"));

    const estimateText =
      this.extractByLabel(rootText, "estimate") ||
      this.extractByLabel(rootText, "est.");

    const imageUrl =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $("img").first().attr("src") ||
      null;

    return {
      auctionHouse: "unknown",
      title,
      artist,
      year: details.year || this.parseYear(title),
      medium: details.medium,
      dimensions: details.dimensions,
      signature: details.signature,
      description: details.description,
      provenance: details.provenance,
      exhibitions: details.exhibitions,
      literature: details.literature,
      auctionDate: details.auctionDate,
      lotNumber: details.lotNumber,
      estimate: this.parseEstimate(estimateText),
      imageUrl,
      imageCandidates: imageUrl
        ? [{ url: imageUrl, source: "fallback" }]
        : [],
      url,
      source: "fallback",
      parserName: "generic-fallback",
      parserVersion: this.version,
      confidence: 0.25,
      raw: {
        title,
        artist,
        imageUrl,
        estimateText,
        provenance: details.provenance,
        exhibitions: details.exhibitions,
        literature: details.literature,
      },
      parseErrors: title ? [] : ["title not found in fallback parser"],
    };
  }

  private extractByLabel(
    text: string,
    label: string,
  ): string | null {
    const match = text.match(
      new RegExp(
        `${label}\\s*[:\\-]?\\s*([\\$£€\\d,\\.\\s–-]+)`,
        "i",
      ),
    );

    return match?.[1] ? match[1].trim() : null;
  }
}
