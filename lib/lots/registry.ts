import { GenericFallbackParser } from "./fallback";
import { HouseParser } from "./house-parser";
import { BonhamsParser } from "./parsers/bonhams";
import { ChristiesParser } from "./parsers/christies";
import { PhillipsParser } from "./parsers/phillips";
import { SothebysParser } from "./parsers/sothebys";
import type { LotData } from "./types";

export class ParserRegistry {
  private parsers: HouseParser[] = [
    new ChristiesParser(),
    new SothebysParser(),
    new PhillipsParser(),
    new BonhamsParser(),
  ];

  detectHouse(url: string): string {
    const lower = url.toLowerCase();

    if (lower.includes("christies.com")) {
      return "christies";
    }

    if (lower.includes("sothebys.com")) {
      return "sothebys";
    }

    if (lower.includes("phillips.com")) {
      return "phillips";
    }

    if (lower.includes("bonhams.com")) {
      return "bonhams";
    }

    return "unknown";
  }

  parse(
    html: string,
    url: string
  ): LotData {
    const parser = this.parsers.find(
      (item) => item.supports(url)
    );

    if (!parser) {
      return new GenericFallbackParser().parse(
        html,
        url
      );
    }

    try {
      return parser.parse(html, url);
    } catch (error) {
      const fallback =
        new GenericFallbackParser().parse(
          html,
          url
        );

      return {
        ...fallback,
        warnings: [
          ...(fallback.warnings || []),
          `House parser failed: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        ],
      };
    }
  }

  registerParser(parser: HouseParser): void {
    this.parsers.push(parser);
  }
}