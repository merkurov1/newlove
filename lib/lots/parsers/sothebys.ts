import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

/**
 * Sotheby's auction house parser.
 * Handles sothebys.com auction lot pages.
 */
export class SothebysParser extends HouseParser {
  readonly houseId = "sothebys";
  readonly matches = ["sothebys"];

  parse(html: string, url: string): LotData {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".lot-title")?.textContent,
        doc.querySelector("[data-testid='lot-title']")?.textContent,
        doc.querySelector("h1")?.textContent
      )
    );

    const artist = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".artist-name")?.textContent,
        doc.querySelector(".maker-name")?.textContent,
        doc.querySelector("[data-testid='artist']")?.textContent
      )
    );

    const lotNumber = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".lot-number")?.textContent,
        doc.querySelector("[data-testid='lot-number']")?.textContent
      )
    );

    const estimateText = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".estimate")?.textContent,
        doc.querySelector("[data-testid='estimate']")?.textContent
      )
    );

    const priceText = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".price-realized")?.textContent,
        doc.querySelector("[data-testid='price-realized']")?.textContent,
        doc.querySelector(".sale-price")?.textContent
      )
    );

    const soldText = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".sale-status")?.textContent,
        doc.querySelector("[data-testid='sale-status']")?.textContent
      )
    );

    const medium = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".medium")?.textContent,
        doc.querySelector("[data-testid='medium']")?.textContent
      )
    );

    const dimensions = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".dimensions")?.textContent,
        doc.querySelector("[data-testid='dimensions']")?.textContent
      )
    );

    const imageUrl =
      doc.querySelector("img")?.getAttribute("src") ??
      doc
        .querySelector("meta[property='og:image']")
        ?.getAttribute("content") ??
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
      sold:
        soldText !== null
          ? /sold|sale/i.test(soldText)
          : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl ? [{ url: imageUrl, source: "sothebys" }] : [],
      url,
      raw: { lotNumber, estimateText, priceText, soldText, medium, dimensions },
      parseErrors,
    };
  }
}
