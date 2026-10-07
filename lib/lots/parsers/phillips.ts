import { HouseParser } from "../house-parser";
import type { LotData } from "../types";

/**
 * Phillips auction house parser.
 * Handles phillips.com auction lot pages.
 */
export class PhillipsParser extends HouseParser {
  readonly houseId = "phillips";
  readonly matches = ["phillips"];

  parse(html: string, url: string): LotData {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const parseErrors: string[] = [];

    const title = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".lot__title")?.textContent,
        doc.querySelector("[data-test='lot-title']")?.textContent,
        doc.querySelector("h1")?.textContent
      )
    );

    const artist = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".artist__name")?.textContent,
        doc.querySelector(".maker-name")?.textContent,
        doc.querySelector("[data-test='artist']")?.textContent
      )
    );

    const lotNumber = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".lot__number")?.textContent,
        doc.querySelector(".lot-number")?.textContent
      )
    );

    const estimateText = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".estimate")?.textContent,
        doc.querySelector("[data-test='estimate']")?.textContent
      )
    );

    const priceText = this.normalizeText(
      this.pickFirst(
        doc.querySelector(".price")?.textContent,
        doc.querySelector("[data-test='sale-price']")?.textContent
      )
    );

    const soldText = this.normalizeText(
      this.pickFirst(
        doc.querySelector("[data-test='sale-status']")?.textContent,
        doc.querySelector(".sale-status")?.textContent
      )
    );

    const medium = this.normalizeText(
      doc.querySelector(".medium")?.textContent ?? null
    );

    const dimensions = this.normalizeText(
      doc.querySelector(".dimensions")?.textContent ?? null
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
      imageCandidates: imageUrl ? [{ url: imageUrl, source: "phillips" }] : [],
      url,
      raw: { lotNumber, estimateText, priceText, soldText, medium, dimensions },
      parseErrors,
    };
  }
}
