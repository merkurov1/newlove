/**
 * Single Content Metadata Resolver for Flow.
 *
 * `generateMetadata`, the Open Graph image route, Twitter cards, Telegram,
 * Bluesky and both feeds read image/title/description decisions from here.
 */

import {
  FLOW_SITE_URL,
  truncateGraphemes,
  type FlowContent,
} from './content';

export type FlowSocialMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
  flowUrl: string;
  previewImage: string;
  cardImage: string | null;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  imageType: string | null;
  isGeneratedCard: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
  contentType: FlowContent['contentType'];
  language: FlowContent['language'];
  version: string;
};

function generatedCardUrl(content: FlowContent): string {
  if (content.slug) {
    return `${FLOW_SITE_URL}/flow/${encodeURIComponent(
      content.slug
    )}/og?v=${encodeURIComponent(content.version)}`;
  }

  return `${FLOW_SITE_URL}/og?${new URLSearchParams({
    title: content.title,
    subtitle: 'Flow — Anton Merkurov',
  }).toString()}`;
}

type SelectedImage = {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  mime: string | null;
};

/**
 * Image priority:
 *   1. attached main image (metadata.images / media / legacy image fields)
 *   2. YouTube thumbnail when the publication is a video
 *   3. link-preview image
 *   4. branded generated card
 */
function selectImage(content: FlowContent): SelectedImage | null {
  const firstImage = content.images[0];
  if (firstImage) {
    return {
      url: firstImage.url,
      alt: firstImage.alt ?? firstImage.caption,
      width: firstImage.width,
      height: firstImage.height,
      mime: firstImage.mime,
    };
  }

  const firstVideo = content.videos[0];
  if (firstVideo?.thumbnail) {
    return {
      url: firstVideo.thumbnail,
      alt: firstVideo.title,
      width: firstVideo.thumbnailWidth,
      height: firstVideo.thumbnailHeight,
      mime: 'image/jpeg',
    };
  }

  const linkImage = content.links.find((link) => link.image)?.image;
  if (linkImage) {
    const matchingLink = content.links.find((link) => link.image === linkImage);
    return {
      url: linkImage,
      alt: matchingLink?.title ?? content.title,
      width: null,
      height: null,
      mime: null,
    };
  }

  return null;
}

export function resolveFlowMetadataFromContent(
  content: FlowContent
): FlowSocialMetadata {
  const selected = selectImage(content);
  const generated = generatedCardUrl(content);

  const previewImage = selected?.url ?? generated;
  const isGeneratedCard = !selected;
  const description = truncateGraphemes(content.description, 160).trim();

  return {
    title: truncateGraphemes(content.title, 160).trim(),
    description,
    canonicalUrl: content.canonicalUrl,
    flowUrl: content.canonicalUrl,
    previewImage,
    cardImage: selected?.url ?? null,
    imageAlt: truncateGraphemes(
      selected?.alt ?? content.imageAlt ?? content.title,
      200
    ).trim(),
    imageWidth: isGeneratedCard ? 1200 : selected?.width ?? null,
    imageHeight: isGeneratedCard ? 630 : selected?.height ?? null,
    imageType: isGeneratedCard ? 'image/png' : selected?.mime ?? null,
    isGeneratedCard,
    publishedAt: content.publishedAt,
    updatedAt: content.updatedAt,
    contentType: content.contentType,
    language: content.language,
    version: content.version,
  };
}
