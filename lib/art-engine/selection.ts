import type { NormalizedExtraction } from './types';

export function slugifyArtwork(
  artist: string,
  title: string,
  year?: string | number | null,
): string {
  const base = [artist, title, year]
    .filter(Boolean)
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90)
    .replace(/-+$/g, '');

  return base || 'selection-artwork';
}

export function buildSelectionSpecs(
  extraction: NormalizedExtraction,
): string {
  const lines: string[] = ['**Details:**'];

  if (extraction.year) lines.push(`Year: ${extraction.year}`);
  if (extraction.medium) lines.push(`Medium: ${extraction.medium}`);
  if (extraction.dimensions) {
    lines.push(`Dimensions: ${extraction.dimensions}`);
  }
  if (extraction.signature) lines.push(`Signed: ${extraction.signature}`);
  if (extraction.lotNumber) lines.push(`Lot: ${extraction.lotNumber}`);
  if (extraction.auctionHouse) {
    lines.push(`Auction: ${extraction.auctionHouse}`);
  }
  if (extraction.auctionDate) {
    lines.push(`Date: ${extraction.auctionDate}`);
  }
  if (extraction.estimate?.raw) {
    lines.push(`Estimate: ${extraction.estimate.raw}`);
  }
  if (extraction.price?.raw) {
    lines.push(`Price realized: ${extraction.price.raw}`);
  }

  const section = (label: string, items: string[]) => {
    if (!items.length) return;
    lines.push('', `${label}:`);
    for (const item of items) lines.push(`- ${item}`);
  };

  section('Provenance', extraction.provenance);
  section('Exhibited', extraction.exhibitions);
  section('Literature', extraction.literature);

  return lines.join('\n');
}

function imageBlock(imageUrl: string) {
  return {
    type: 'image',
    data: {
      file: {
        url: imageUrl,
      },
      caption: '',
      stretched: false,
      withBorder: false,
      withBackground: false,
    },
  };
}

export function buildSelectionContent(imageUrl: string): string {
  return JSON.stringify([imageBlock(imageUrl)]);
}

/**
 * Updates the lead image without discarding any other editorial blocks that
 * may already exist in an old Selection article.
 */
export function mergeSelectionContent(
  existingContent: unknown,
  imageUrl: string,
): string {
  let blocks: any[] | null = null;

  try {
    const parsed =
      typeof existingContent === 'string'
        ? JSON.parse(existingContent)
        : existingContent;
    if (Array.isArray(parsed)) blocks = parsed;
  } catch {
    blocks = null;
  }

  if (!blocks || blocks.length === 0) {
    return buildSelectionContent(imageUrl);
  }

  const imageIndex = blocks.findIndex(
    (block) => block?.type === 'image' && block?.data?.file,
  );

  if (imageIndex >= 0) {
    blocks[imageIndex] = {
      ...blocks[imageIndex],
      type: 'image',
      data: {
        ...blocks[imageIndex].data,
        file: {
          ...(blocks[imageIndex].data.file || {}),
          url: imageUrl,
        },
      },
    };
  } else {
    blocks.unshift(imageBlock(imageUrl));
  }

  return JSON.stringify(blocks);
}

export function selectionArticleSnapshot(article: Record<string, any>) {
  return {
    id: article.id || null,
    title: article.title || null,
    slug: article.slug || null,
    artist: article.artist || null,
    curatorNote: article.curatorNote || null,
    quote: article.quote || null,
    specs: article.specs || null,
    content: article.content || null,
    preview_image: article.preview_image || null,
    published: article.published ?? null,
    publishedAt: article.publishedAt || null,
  };
}

export function publicSelectionUrl(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

export function alternativeSelectionUrl(slug: string): string {
  return `/selection/${encodeURIComponent(slug)}`;
}
