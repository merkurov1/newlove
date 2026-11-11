/**
 * One deterministic editorial representation for a Flow → Bluesky post.
 *
 * The post text, external-card copy, destination, image and ALT are resolved
 * together so each element can be checked against the others before anything
 * is uploaded or published. This module is pure: it performs no network or
 * database work and is shared by publication, tests and previews.
 */

import {
  FLOW_SITE_URL,
  graphemeLength,
  isTechnicalText,
  truncateGraphemes,
  type FlowContent,
  type FlowContentType,
  type FlowImage,
  type FlowLanguage,
  type FlowLink,
} from './content';
import {
  BLUESKY_MAX_GRAPHEMES,
  fallbackBlueskySummary,
  resolveBlueskyShareUrl,
  stripBlueskyUrls,
  truncateAtWord,
} from './blueskyPost';
import { resolveFlowMetadataFromContent } from './metadata';

export type BlueskyPresentationMode = 'note' | 'article' | 'visual' | 'link';
export type BlueskyEmbedType = 'external' | 'images';

export type BlueskyPresentation = {
  postText: string;
  postBody: string;
  cardTitle: string;
  cardDescription: string | null;
  cardImage: string | null;
  imageAlt: string | null;
  destinationUrl: string;
  flowUrl: string;
  sourceUrl: string | null;
  contentType: FlowContentType;
  language: FlowLanguage;
  presentationMode: BlueskyPresentationMode;
  embedType: BlueskyEmbedType;
  nativeImageUrl: string | null;
  cardImageSource:
    'content-image' | 'video-thumbnail' | 'link-preview' | 'generated-flow-card' | null;
  usedSummary: boolean;
  truncated: boolean;
};

export type BlueskyValidationIssue = {
  code: string;
  message: string;
};

export type BlueskyPresentationInput = {
  content: FlowContent;
  summary?: string | null;
  flowUrl?: string | null;
  maxGraphemes?: number;
};

const MAX_CARD_TITLE = 200;
const MAX_CARD_DESCRIPTION = 300;
const SEPARATOR = '\n\n';
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const MARKDOWN_PATTERN = /(?:\*\*|__|##|`|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\))/;

const TYPE_LABELS: Record<BlueskyPresentationMode, Record<FlowLanguage, string>> = {
  note: { ru: 'Заметка', en: 'Note' },
  article: { ru: 'Статья', en: 'Article' },
  visual: { ru: 'Фото', en: 'Photo' },
  link: { ru: 'Ссылка', en: 'Link' },
};

const PLACEHOLDER_ALT =
  /^(?:alt|image|photo|picture|img|thumbnail|фото|изображение|картинка|flow image|flow photo)(?:\s*[#-]?\d+)?$/i;

const GENERIC_FALLBACK_DESCRIPTIONS = new Set([
  'заметка антона меркурова в flow.',
  'a note by anton merkurov on flow.',
  'публикация антона меркурова в flow.',
  'a publication by anton merkurov on flow.',
  'ссылка, отобранная антоном меркуровым.',
  'a link selected by anton merkurov.',
  'фотография антона меркурова в flow.',
  'a photograph by anton merkurov on flow.',
  'видео в flow антона меркурова.',
  'a video on anton merkurov’s flow.',
  'цитата в flow антона меркурова.',
  'a quote on anton merkurov’s flow.',
]);

const ALLOWED_CARD_LABELS = new Set([
  ...Object.values(TYPE_LABELS).flatMap((labels) => [labels.ru, labels.en]),
  'Видео',
  'Video',
  'Цитата',
  'Quote',
]);

function isPlaceholderCardTitle(value: string): boolean {
  const title = oneLine(value);
  if (!title) return true;
  if (ALLOWED_CARD_LABELS.has(title)) return false;
  return isHttpUrl(title) || isTechnicalText(title);
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Remove Markdown/HTML artifacts while preserving readable paragraphs. */
export function cleanBlueskyText(value: string | null | undefined): string {
  if (!value) return '';

  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeForComparison(value: string): string {
  return stripBlueskyUrls(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(value: string): Set<string> {
  return new Set(normalizeForComparison(value).split(' ').filter(Boolean));
}

/** Exact and deterministic near-duplicate detection for presentation text. */
export function isBlueskyDuplicate(first: string, second: string): boolean {
  const a = normalizeForComparison(first);
  const b = normalizeForComparison(second);

  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 24 && b.length >= 24 && (a.includes(b) || b.includes(a))) {
    return true;
  }

  const left = wordSet(first);
  const right = wordSet(second);
  if (left.size < 5 || right.size < 5) return false;

  let overlap = 0;
  for (const word of left) {
    if (right.has(word)) overlap += 1;
  }

  return overlap / Math.min(left.size, right.size) >= 0.8;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isFlowUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const flowHost = new URL(FLOW_SITE_URL).hostname.replace(/^www\./i, '').toLowerCase();
    return host === flowHost && /^\/flow(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

function meaningfulTitle(value: string | null | undefined): string {
  const candidate = oneLine(cleanBlueskyText(value));
  return candidate && !isTechnicalText(candidate) && !isHttpUrl(candidate) ? candidate : '';
}

/**
 * A title may be used as post copy only when it was chosen by the author or a
 * real source. Generated/body/fallback titles stay in the card and never
 * become invented post text.
 */
function bodyTitle(content: FlowContent): string {
  if (!content.showTitle) return '';
  return meaningfulTitle(content.title);
}

function isMeaningfulAlt(value: string | null | undefined): value is string {
  const candidate = oneLine(cleanBlueskyText(value));
  if (!candidate) return false;
  if (PLACEHOLDER_ALT.test(candidate)) return false;
  if (isTechnicalText(candidate)) return false;
  if (isHttpUrl(candidate)) return false;
  if (/^(?:storage|media|uploads?)\//i.test(candidate)) return false;
  return candidate.length >= 3;
}

function resolveImageAlt(content: FlowContent, image: FlowImage | null): string | null {
  if (!image) return null;

  const metadata = content.metadata;
  const candidates = [
    image.alt,
    image.caption,
    textValue(metadata.image_alt),
    textValue(metadata.imageAlt),
    textValue(metadata.alt),
    textValue(metadata.caption),
  ];

  for (const candidate of candidates) {
    if (isMeaningfulAlt(candidate)) {
      return truncateGraphemes(oneLine(candidate), 200).trim();
    }
  }

  return null;
}

export function resolveBlueskyPresentationMode(content: FlowContent): BlueskyPresentationMode {
  if (content.contentType === 'photo' || content.contentType === 'video') {
    return 'visual';
  }
  if (content.contentType === 'link' || content.contentType === 'quote') {
    return 'link';
  }
  if (content.contentType === 'article') return 'article';
  if (content.contentType === 'note') return 'note';

  if (content.videos.length > 0) return 'visual';

  const hasExternalLink = content.links.some((link) => !link.inBody && !isFlowUrl(link.url));
  if (content.images.length > 0 && !hasExternalLink && content.bodyText.trim().length <= 350) {
    return 'visual';
  }

  if (hasExternalLink) return 'link';
  if (content.bodyText.trim().length > 350) return 'article';
  return 'note';
}

function typeLabel(mode: BlueskyPresentationMode, language: FlowLanguage): string {
  return TYPE_LABELS[mode][language];
}

function visualLabel(content: FlowContent): string {
  if (content.contentType === 'video' || content.videos.length > 0) {
    return content.language === 'ru' ? 'Видео' : 'Video';
  }
  return content.language === 'ru' ? 'Фото' : 'Photo';
}

function linkLabel(content: FlowContent, link: FlowLink | null): string {
  if (content.contentType === 'quote') {
    return content.language === 'ru' ? 'Цитата' : 'Quote';
  }

  const site = oneLine(link?.siteName || link?.domain || '');
  return site && !isTechnicalText(site) ? site : typeLabel('link', content.language);
}

function resolveCardTitle(input: {
  preferred: string | null | undefined;
  fallback: string;
  postBody: string;
}): string {
  const preferred = oneLine(cleanBlueskyText(input.preferred));

  if (
    preferred &&
    !isTechnicalText(preferred) &&
    !isHttpUrl(preferred) &&
    !isBlueskyDuplicate(preferred, input.postBody)
  ) {
    return truncateGraphemes(preferred, MAX_CARD_TITLE).trim();
  }

  return truncateGraphemes(oneLine(input.fallback), MAX_CARD_TITLE).trim();
}

function resolveCardDescription(input: {
  candidates: Array<string | null | undefined>;
  postBody: string;
  cardTitle: string;
}): string | null {
  for (const raw of input.candidates) {
    const candidate = oneLine(cleanBlueskyText(raw));
    if (!candidate || isHttpUrl(candidate) || isTechnicalText(candidate)) continue;
    if (GENERIC_FALLBACK_DESCRIPTIONS.has(candidate.toLowerCase())) continue;
    if (isBlueskyDuplicate(candidate, input.postBody)) continue;
    if (isBlueskyDuplicate(candidate, input.cardTitle)) continue;
    return truncateGraphemes(candidate, MAX_CARD_DESCRIPTION).trim();
  }

  return null;
}

function sentenceParts(value: string): string[] {
  const matches = value.match(/[^.!?…]+[.!?…]+(?:["'»”)]*)?/g);
  return (matches ?? [value]).map((part) => part.trim()).filter(Boolean);
}

function removeTitleSentences(value: string, title: string): string {
  if (!value || !title) return value;

  const kept = sentenceParts(value).filter((sentence) => !isBlueskyDuplicate(sentence, title));

  return kept.join(' ').trim();
}

function prepareSummary(summary: string | null | undefined, title: string): string {
  const clean = oneLine(cleanBlueskyText(summary));
  if (!clean) return '';
  return removeTitleSentences(clean, title);
}

function articleBody(content: FlowContent, summary: string | null | undefined): string {
  const title = meaningfulTitle(content.title);
  const cleanedSummary = prepareSummary(summary, title);
  if (cleanedSummary) return cleanedSummary;

  const body = removeTitleSentences(cleanBlueskyText(content.bodyText), title);
  if (body) {
    return graphemeLength(body) <= 220 ? body : fallbackBlueskySummary(body, 220);
  }

  const description = oneLine(cleanBlueskyText(content.description));
  if (description && !isBlueskyDuplicate(description, title)) return description;

  return bodyTitle(content);
}

function noteOrVisualBody(
  content: FlowContent,
  image: FlowImage | null,
  summary: string | null | undefined
): string {
  const body = cleanBlueskyText(content.bodyText);
  if (body) {
    return graphemeLength(body) <= 260
      ? body
      : prepareSummary(summary, '') || fallbackBlueskySummary(body, 220);
  }

  const caption = oneLine(cleanBlueskyText(image?.caption));
  if (caption) return caption;

  const title = bodyTitle(content);
  return title && !ALLOWED_CARD_LABELS.has(oneLine(title)) ? title : '';
}

function linkBody(content: FlowContent, link: FlowLink | null): string {
  const body = cleanBlueskyText(content.bodyText);
  if (body) {
    return graphemeLength(body) <= 260 ? body : fallbackBlueskySummary(body, 220);
  }

  const sourceTitle = oneLine(cleanBlueskyText(link?.title));
  if (sourceTitle && !isTechnicalText(sourceTitle)) return sourceTitle;

  const sourceDescription = oneLine(cleanBlueskyText(link?.description));
  if (sourceDescription) return sourceDescription;

  return bodyTitle(content);
}

function appendFlowUrl(
  body: string,
  flowUrl: string,
  max: number
): { text: string; body: string; truncated: boolean } {
  const available = max - graphemeLength(flowUrl) - graphemeLength(SEPARATOR);
  const cleanBody = body.trim();

  if (available <= 0) {
    return { text: flowUrl, body: '', truncated: Boolean(cleanBody) };
  }

  if (!cleanBody) {
    return { text: flowUrl, body: '', truncated: false };
  }

  const limited =
    graphemeLength(cleanBody) <= available ? cleanBody : truncateAtWord(cleanBody, available);

  return {
    text: limited ? `${limited}${SEPARATOR}${flowUrl}` : flowUrl,
    body: limited,
    truncated: limited !== cleanBody,
  };
}

function externalSource(
  content: FlowContent,
  flowUrl: string
): { link: FlowLink | null; url: string | null } {
  const links = content.links.filter(
    (link) => link.url && !isFlowUrl(link.url) && link.url !== flowUrl
  );
  const link = links.find((entry) => !entry.inBody) ?? links[0] ?? null;
  const sourceUrl =
    link?.url ?? (content.sourceUrl && !isFlowUrl(content.sourceUrl) ? content.sourceUrl : null);

  return { link, url: sourceUrl };
}

function generatedCardUrl(content: FlowContent): string | null {
  const metadata = resolveFlowMetadataFromContent(content);
  return metadata.isGeneratedCard ? metadata.previewImage : null;
}

function firstLinkImage(content: FlowContent): string | null {
  return content.links.find((link) => link.image)?.image ?? null;
}

/**
 * Build the complete final Bluesky presentation. Deterministic for identical
 * content, summary and URL.
 */
export function buildBlueskyPresentation(input: BlueskyPresentationInput): BlueskyPresentation {
  const content = input.content;
  const max = input.maxGraphemes ?? BLUESKY_MAX_GRAPHEMES;
  const flowUrl =
    input.flowUrl?.trim() ||
    resolveBlueskyShareUrl({
      canonicalUrl: content.canonicalUrl,
      id: content.id,
    });
  const mode = resolveBlueskyPresentationMode(content);
  const firstImage = content.images[0] ?? null;
  const firstVideo = content.videos[0] ?? null;
  const generatedCard = generatedCardUrl(content);
  const source = mode === 'link' ? externalSource(content, flowUrl) : null;

  const nativeImage =
    mode === 'visual' &&
    content.contentType !== 'video' &&
    content.videos.length === 0 &&
    firstImage
      ? firstImage
      : null;
  const imageAlt = resolveImageAlt(content, firstImage ?? null);
  const useNativeImage = Boolean(nativeImage && imageAlt);

  let postBody = '';
  let cardTitle = '';
  let cardDescription: string | null = null;
  let cardImage: string | null = null;
  let cardImageSource: BlueskyPresentation['cardImageSource'] = null;
  let destinationUrl = flowUrl;
  let sourceUrl = content.sourceUrl;
  let usedSummary = false;

  if (mode === 'link') {
    destinationUrl = source?.url ?? flowUrl;
    sourceUrl = source?.url ?? content.sourceUrl;
    postBody = linkBody(content, source?.link ?? null);

    cardTitle = resolveCardTitle({
      preferred: source?.link?.title ?? content.title,
      fallback: linkLabel(content, source?.link ?? null),
      postBody,
    });
    cardDescription = resolveCardDescription({
      candidates: [source?.link?.description, content.description],
      postBody,
      cardTitle,
    });
    cardImage = source?.link?.image ?? null;
    cardImageSource = cardImage ? 'link-preview' : null;
  } else if (mode === 'article') {
    const preparedSummary = prepareSummary(input.summary, meaningfulTitle(content.title));
    usedSummary = Boolean(preparedSummary);
    postBody = articleBody(content, input.summary);

    cardTitle = resolveCardTitle({
      preferred: content.title,
      fallback: typeLabel('article', content.language),
      postBody,
    });
    cardDescription = resolveCardDescription({
      candidates: [content.description],
      postBody,
      cardTitle,
    });
    cardImage = firstImage?.url ?? firstLinkImage(content) ?? generatedCard;
    cardImageSource = firstImage?.url
      ? 'content-image'
      : firstLinkImage(content)
        ? 'link-preview'
        : generatedCard
          ? 'generated-flow-card'
          : null;
  } else if (mode === 'visual') {
    postBody = noteOrVisualBody(content, firstImage, input.summary);

    cardTitle = resolveCardTitle({
      preferred: firstVideo?.title ?? content.title,
      fallback: visualLabel(content),
      postBody,
    });
    cardDescription = resolveCardDescription({
      candidates: [content.description],
      postBody,
      cardTitle,
    });

    if (content.contentType === 'video' || content.videos.length > 0) {
      cardImage = firstVideo?.thumbnail ?? generatedCard;
      cardImageSource = firstVideo?.thumbnail
        ? 'video-thumbnail'
        : generatedCard
          ? 'generated-flow-card'
          : null;
    } else {
      cardImage = firstImage?.url ?? generatedCard;
      cardImageSource = firstImage?.url
        ? 'content-image'
        : generatedCard
          ? 'generated-flow-card'
          : null;
    }
  } else {
    postBody = noteOrVisualBody(content, firstImage, input.summary);

    cardTitle = resolveCardTitle({
      preferred: content.title,
      fallback: typeLabel('note', content.language),
      postBody,
    });
    cardDescription = resolveCardDescription({
      candidates: [content.description],
      postBody,
      cardTitle,
    });
    cardImage = firstImage?.url ?? generatedCard;
    cardImageSource = firstImage?.url
      ? 'content-image'
      : generatedCard
        ? 'generated-flow-card'
        : null;
  }

  const text = appendFlowUrl(postBody, flowUrl, max);

  return {
    postText: text.text,
    postBody: text.body,
    cardTitle,
    cardDescription,
    cardImage,
    imageAlt,
    destinationUrl,
    flowUrl,
    sourceUrl,
    contentType: content.contentType,
    language: content.language,
    presentationMode: mode,
    embedType: useNativeImage ? 'images' : 'external',
    nativeImageUrl: useNativeImage ? (nativeImage?.url ?? null) : null,
    cardImageSource,
    usedSummary,
    truncated: text.truncated,
  };
}

/**
 * Pre-publication validation. A caller must refuse to publish when this
 * returns any issue.
 */
export function validateBlueskyPresentation(
  presentation: BlueskyPresentation,
  options: { maxGraphemes?: number } = {}
): BlueskyValidationIssue[] {
  const issues: BlueskyValidationIssue[] = [];
  const max = options.maxGraphemes ?? BLUESKY_MAX_GRAPHEMES;

  if (!presentation.postText.trim()) {
    issues.push({ code: 'empty_post', message: 'Bluesky post text is empty.' });
  }

  if (graphemeLength(presentation.postText) > max) {
    issues.push({
      code: 'text_too_long',
      message: `Bluesky post is ${graphemeLength(presentation.postText)} graphemes; maximum is ${max}.`,
    });
  }

  if (MARKDOWN_PATTERN.test(presentation.postText)) {
    issues.push({
      code: 'literal_markdown',
      message: 'Bluesky post text contains literal Markdown markers.',
    });
  }

  if (!isHttpUrl(presentation.destinationUrl)) {
    issues.push({
      code: 'invalid_destination_url',
      message: `Bluesky destination URL is invalid: ${presentation.destinationUrl}`,
    });
  }

  if (!isHttpUrl(presentation.flowUrl)) {
    issues.push({
      code: 'invalid_flow_url',
      message: `Flow URL is invalid: ${presentation.flowUrl}`,
    });
  }

  if (!presentation.cardTitle.trim()) {
    issues.push({
      code: 'missing_card_title',
      message: 'Bluesky external card has no title.',
    });
  }

  if (presentation.cardTitle && isPlaceholderCardTitle(presentation.cardTitle)) {
    issues.push({
      code: 'technical_card_title',
      message: `Bluesky card title is a technical placeholder: ${presentation.cardTitle}`,
    });
  }

  if (presentation.cardTitle && isBlueskyDuplicate(presentation.postBody, presentation.cardTitle)) {
    issues.push({
      code: 'duplicate_post_card_title',
      message: 'Bluesky post text duplicates the card title.',
    });
  }

  if (
    presentation.cardDescription &&
    isBlueskyDuplicate(presentation.postBody, presentation.cardDescription)
  ) {
    issues.push({
      code: 'duplicate_post_card_description',
      message: 'Bluesky post text duplicates the card description.',
    });
  }

  if (
    presentation.cardDescription &&
    isBlueskyDuplicate(presentation.cardTitle, presentation.cardDescription)
  ) {
    issues.push({
      code: 'duplicate_card_title_description',
      message: 'Bluesky card title duplicates the card description.',
    });
  }

  if (presentation.cardDescription && MARKDOWN_PATTERN.test(presentation.cardDescription)) {
    issues.push({
      code: 'literal_markdown_in_card',
      message: 'Bluesky card description contains literal Markdown markers.',
    });
  }

  if (presentation.embedType === 'images') {
    if (!presentation.nativeImageUrl || !isHttpUrl(presentation.nativeImageUrl)) {
      issues.push({
        code: 'missing_native_image',
        message: 'Native-image mode has no valid image URL.',
      });
    }
    if (!presentation.imageAlt?.trim()) {
      issues.push({
        code: 'missing_native_image_alt',
        message: 'Native-image mode has no meaningful ALT text.',
      });
    }
  }

  if (presentation.cardImage && !isHttpUrl(presentation.cardImage)) {
    issues.push({
      code: 'invalid_card_image',
      message: `Bluesky card image URL is invalid: ${presentation.cardImage}`,
    });
  }

  if (presentation.imageAlt && PLACEHOLDER_ALT.test(presentation.imageAlt)) {
    issues.push({
      code: 'technical_image_alt',
      message: `Bluesky image ALT is a technical placeholder: ${presentation.imageAlt}`,
    });
  }

  return issues;
}
