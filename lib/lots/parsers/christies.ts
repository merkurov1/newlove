import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

/**
 * Christie's auction house parser.
 * Handles christies.com auction lot pages.
 */
export class ChristiesParser extends HouseParser {
  readonly houseId = "christies";
  readonly matches = ["christies"];

  parse(html: string, url: string): LotData {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const parseErrors: string[] = [];

    // Main lot information
    const title = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='lot-title']")?.textContent,
        doc.querySelector(".lot-title")?.textContent,
        doc.querySelector("h1")?.textContent
      )
    );

    const artist = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='artist-name']")?.textContent,
        doc.querySelector(".artist-name")?.textContent,
        doc.querySelector("[data-testid='artist']")?.textContent
      )
    );

    const lotNumber = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='lot-number']")?.textContent,
        doc.querySelector(".lot-number")?.textContent
      )
    );

    // Estimate and pricing
    const estimateText = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='estimate']")?.textContent,
        doc.querySelector(".estimate")?.textContent
      )
    );

    const priceText = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='sale-price']")?.textContent,
        doc.querySelector(".sale-price")?.textContent
      )
    );

    // Sold status
    const soldText = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='sold-status']")?.textContent,
        doc.querySelector(".sold-status")?.textContent
      )
    );

    // Technical details
    const medium = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='medium']")?.textContent,
        doc.querySelector(".medium")?.textContent
      )
    );

    const dimensions = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-testid='dimensions']")?.textContent,
        doc.querySelector(".dimensions")?.textContent
      )
    );

    // Images
    const imageUrl =
      doc.querySelector("img")?.getAttribute("src") ??
      doc
        .querySelector("meta[property='og:image']")
        ?.getAttribute("content") ??
      null;

    // Validation
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
          ? /sold|vendu|vente|成交/i.test(soldText)
          : priceText !== null,
      imageUrl,
      imageCandidates: imageUrl ? [{ url: imageUrl, source: "christies" }] : [],
      url,
      raw: { lotNumber, estimateText, priceText, soldText, medium, dimensions },
      parseErrors,
    };
  }
}
