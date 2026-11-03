import { GenericFallbackParser } from "./fallback";
import { HouseParser } from "./house-parser";
import { mergeLotData } from "./merge";
import { parseLotDom } from "./cheerio";
import { parseLotHtml } from "./parse";
import { BonhamsParser } from "./parsers/bonhams";
import { ChristiesParser } from "./parsers/christies";
import { PhillipsParser } from "./parsers/phillips";
import { SothebysParser } from "./parsers/sothebys";
import type { AuctionHouse, LotData } from "./types";

const HOUSE_DISPLAY_NAMES: Record<AuctionHouse, string> = {
  christies: "Christie's",
  sothebys: "Sotheby's",
  phillips: "Phillips",
  bonhams: "Bonhams",
  unknown: "Unknown",
};

export function houseDisplayName(house: string): string {
  const normalized = normalizeHouseId(house);
  return HOUSE_DISPLAY_NAMES[normalized];
}

export function normalizeHouseId(value?: string | null): AuctionHouse {
  const normalized = (value || "").toLowerCase().replace(/[^a-z]/g, "");

  if (normalized.includes("christie")) return "christies";
  if (normalized.includes("sotheby")) return "sothebys";
  if (normalized.includes("phillips")) return "phillips";
  if (normalized.includes("bonhams")) return "bonhams";

  return "unknown";
}

export class ParserRegistry {
  private parsers: HouseParser[] = [
    new ChristiesParser(),
    new SothebysParser(),
    new PhillipsParser(),
    new BonhamsParser(),
  ];

  detectHouse(url: string): string {
    const lower = (url || "").toLowerCase();

    if (lower.includes("christies.com")) return "christies";
    if (lower.includes("sothebys.com")) return "sothebys";
    if (lower.includes("phillips.com")) return "phillips";
    if (lower.includes("bonhams.com")) return "bonhams";

    return "unknown";
  }

  parse(html: string, url: string, houseHint?: string): LotData {
    const houseId = normalizeHouseId(houseHint || this.detectHouse(url));
    const parser =
      this.parsers.find((item) => item.houseId === houseId) ||
      this.parsers.find((item) => item.supports(url));

    const generic = this.parseGeneric(html, url, houseId);

    if (!parser) {
      return {
        ...generic,
        auctionHouse: houseId,
        house: houseDisplayName(houseId),
        warnings: [
          ...(generic.warnings || []),
          "House-specific parser unavailable; generic fallback used.",
        ],
      };
    }

    try {
      const houseResult = parser.parse(html, url);

      return mergeLotData(
        {
          ...houseResult,
          auctionHouse: parser.houseId,
          house: houseDisplayName(parser.houseId),
          parserName: parser.houseId,
          parserVersion: parser.version,
          source: "house-parser",
          confidence: Math.max(
            houseResult.confidence ?? 0,
            0.8,
          ),
        },
        generic,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      return {
        ...generic,
        auctionHouse: houseId,
        house: houseDisplayName(houseId),
        warnings: [
          ...(generic.warnings || []),
          `House parser failed: ${message}`,
        ],
        parseErrors: [
          ...(generic.parseErrors || []),
          `House parser failed: ${message}`,
        ],
      };
    }
  }

  registerParser(parser: HouseParser): void {
    this.parsers.push(parser);
  }

  private parseGeneric(
    html: string,
    url: string,
    houseId: AuctionHouse,
  ): LotData {
    const fallback = new GenericFallbackParser().parse(html, url);
    const jsonLd = parseLotHtml(html, url, houseId);
    const dom = parseLotDom(html, url, houseId) as LotData;

    const jsonLdHasData = Boolean(
      jsonLd.title ||
        jsonLd.artist ||
        jsonLd.imageUrl ||
        jsonLd.estimate ||
        jsonLd.price,
    );

    const merged = mergeLotData(
      {
        ...dom,
        auctionHouse: houseId,
        house: houseDisplayName(houseId),
      },
      mergeLotData(
        {
          ...jsonLd,
          auctionHouse: houseId,
          house: houseDisplayName(houseId),
          parserName: jsonLdHasData ? "generic-json-ld" : "generic-fallback",
          parserVersion: "1.0.0",
          source: jsonLdHasData ? "generic-json-ld" : "fallback",
          confidence: jsonLdHasData ? 0.5 : 0.25,
        },
        fallback,
      ),
    );

    return {
      ...merged,
      auctionHouse: houseId,
      house: houseDisplayName(houseId),
      parserName:
        merged.parserName ||
        (jsonLdHasData ? "generic-json-ld" : "generic-fallback"),
      parserVersion: merged.parserVersion || "1.0.0",
      source:
        merged.source ||
        (jsonLdHasData ? "generic-json-ld" : "fallback"),
      confidence: merged.confidence ?? (jsonLdHasData ? 0.5 : 0.25),
      warnings: jsonLdHasData
        ? merged.warnings || []
        : [
            ...(merged.warnings || []),
            "Generic fallback parser used.",
          ],
    };
  }
}

/** Shared registry for ingestion. Stateless and safe to reuse per request. */
export const parserRegistry = new ParserRegistry();
