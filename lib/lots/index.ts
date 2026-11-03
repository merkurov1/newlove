import { parseLotHtml } from "./parse";
import { parseLotDom } from "./cheerio";
import { parserRegistry } from "./registry";
import type { LotData } from "./types";

export * from "./types";
export * from "./parse";
export * from "./cheerio";
export * from "./fallback";
export * from "./registry";
export * from "./extract-detail";

/**
 * Backward-compatible entry point.
 *
 * Production now goes through ParserRegistry. The generic JSON-LD/DOM
 * extraction remains available as a fallback/enrichment layer, but it can no
 * longer overwrite house-specific fields.
 */
export function parseLot(
  html: string,
  url: string,
  house?: string,
): LotData {
  return parserRegistry.parse(html, url, house);
}

export { parseLotHtml, parseLotDom };
