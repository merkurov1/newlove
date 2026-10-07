import { parseLotHtml } from "./parse";
import { parseLotDom } from "./cheerio";
import type { LotData } from "./types";

export * from "./types";
export * from "./parse";
export * from "./cheerio";
export * from "./fallback";

/**
 * Backward-compatible parseLot() wrapper.
 * It merges generic JSON-LD and DOM extraction while keeping the new house-based registry as primary path.
 */
export function parseLot(html: string, url: string, house?: string): LotData {
  const jsonLdResult = parseLotHtml(html, url, house);
  const domResult = parseLotDom(html, url, house);

  const mergedCandidates = [
    ...(jsonLdResult.imageCandidates || []),
    ...(domResult.imageCandidates || []),
  ];

  const uniqueCandidates = mergedCandidates.filter(
    (item, index, self) => index === self.findIndex((t) => t.url === item.url)
  );

  return {
    ...domResult,
    ...jsonLdResult,
    title: jsonLdResult.title || domResult.title,
    artist: jsonLdResult.artist || domResult.artist,
    imageUrl: jsonLdResult.imageUrl || domResult.imageUrl,
    imageCandidates: uniqueCandidates,
    source: "generic-json-ld",
    confidence: 0.5,
    warnings: ["Generic fallback parser was used."],
  };
}
