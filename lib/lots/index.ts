import { parseLotHtml } from './parse';
import { parseLotDom } from './cheerio';
import type { LotData } from './types';

export * from './types';
export * from './parse';
export * from './cheerio';

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
  };
}
