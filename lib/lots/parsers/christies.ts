import type { LotData } from "./types";
import { ChristiesParser } from "./parsers/christies";
import { SothebysParser } from "./parsers/sothebys";
import { PhillipsParser } from "./parsers/phillips";
import { BonhamsParser } from "./parsers/bonhams";
import { GenericFallbackParser } from "./fallback";

export class ParserRegistry {
  private parsers = [
    new ChristiesParser(),
    new SothebysParser(),
    new PhillipsParser(),
    new BonhamsParser(),
  ];

  public detectHouse(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("christies")) return "christies";
    if (u.includes("sothebys")) return "sothebys";
    if (u.includes("phillips")) return "phillips";
    if (u.includes("bonhams")) return "bonhams";
    return "unknown";
  }

  public parse(html: string, url: string): LotData | null {
    const parser = this.parsers.find((p) => p.supports(url));
    if (!parser) {
      const fallback = new GenericFallbackParser().parse(html, url);
      return {
        ...fallback,
        auctionHouse: "unknown",
        source: "fallback",
        confidence: fallback.confidence ?? 0.25,
      };
    }

    try {
      const result = parser.parse(html, url);
      return {
        ...result,
        source: "house-parser",
        confidence: result.confidence ?? 0.8,
      };
    } catch (error: any) {
      const fallback = new GenericFallbackParser().parse(html, url);
      return {
        ...fallback,
        auctionHouse: "unknown",
        source: "fallback",
        confidence: fallback.confidence ?? 0.25,
        warnings: [
          ...(fallback.warnings || []),
          `House parser crashed: ${String(error)}`,
        ],
      };
    }
  }

  public registerParser(parser: any) {
    this.parsers.push(parser);
  }
}
