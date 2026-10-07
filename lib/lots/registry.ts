import type { LotData } from "./types";
import { ChristiesParser } from "./parsers/christies";
import { SothebysParser } from "./parsers/sothebys";
import { PhillipsParser } from "./parsers/phillips";
import { BonhamsParser } from "./parsers/bonhams";

/**
 * Registry of auction house parsers.
 * Automatically detects which house a URL belongs to and selects appropriate parser.
 */
export class ParserRegistry {
  private parsers = [
    new ChristiesParser(),
    new SothebysParser(),
    new PhillipsParser(),
    new BonhamsParser(),
  ];

  /**
   * Detect auction house from URL
   */
  public detectHouse(url: string): string {
    const u = url.toLowerCase();
    if (u.includes("christies")) return "christies";
    if (u.includes("sothebys")) return "sothebys";
    if (u.includes("phillips")) return "phillips";
    if (u.includes("bonhams")) return "bonhams";
    return "unknown";
  }

  /**
   * Parse HTML using appropriate house-specific parser
   * Returns null if no parser matches the URL
   */
  public parse(html: string, url: string): LotData | null {
    const parser = this.parsers.find((p) => p.supports(url));
    if (!parser) return null;

    try {
      return parser.parse(html, url);
    } catch (error: any) {
      return {
        auctionHouse: "unknown",
        url,
        title: null,
        artist: null,
        imageUrl: null,
        imageCandidates: [],
        raw: { error: String(error) },
        parseErrors: [`parser crashed: ${String(error)}`],
      };
    }
  }

  /**
   * Add a new parser to the registry
   */
  public registerParser(parser: any) {
    this.parsers.push(parser);
  }
}
