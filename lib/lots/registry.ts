import { GenericFallbackParser } from "./fallback";
import type { LotData } from "./types";
import { ChristiesParser } from "./parsers/christies";
import { SothebysParser } from "./parsers/sothebys";
import { PhillipsParser } from "./parsers/phillips";
import { BonhamsParser } from "./parsers/bonhams";

export * from "./types";
export * from "./parse";
export * from "./cheerio";
export * from "./fallback";
export * from "./registry";

export function parseLot(html: string, url: string, house?: string): LotData {
  const registry = [
    new ChristiesParser(),
    new SothebysParser(),
    new PhillipsParser(),
    new BonhamsParser(),
  ];

  const match = registry.find((parser) => parser.supports(url));
  const result = match ? match.parse(html, url) : new GenericFallbackParser().parse(html, url);

  return {
    ...result,
    house: house || result.auctionHouse || "unknown",
    source: result.source || (match ? "house-parser" : "fallback"),
    confidence: result.confidence ?? (match ? 0.8 : 0.25),
  };
}
