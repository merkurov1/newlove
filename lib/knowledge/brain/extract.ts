import { createHash } from 'node:crypto';

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

import {
  getSourceDomain,
  normalizeSourceUrl,
  publishedDateFromUrl,
  tryNormalizeSourceUrl,
} from './url';

export type ArticleBlockType = 'heading' | 'paragraph' | 'quote' | 'list';

export type ArticleBlock = {
  type: ArticleBlockType;
  text: string;
  level?: number;
};

export type ArticleExtractionStatus = 'complete' | 'partial' | 'failed' | 'needs_review';

export type ArticlePublishedAtSource = 'metadata' | 'jsonld' | 'url_path' | null;

export type ArticleExtractionDiagnostics = {
  parser: 'scored' | 'fallback' | 'none';
  fallbackChars: number;
  selectedChars: number;
  bodyChars: number;
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  linkDensity: number;
  boilerplateChars: number;
  boilerplateCount: number;
  boilerplateRatio: number;
  completeness: number;
  paywallDetected: boolean;
  truncated: boolean;
  htmlChars: number;
  sourceDomain: string | null;
  siteProfile: ArticleSiteProfile;
  extractionVersion: string;
  publishedAtSource: ArticlePublishedAtSource;
};

export type ArticleSiteProfile = 'novaya' | 'substack' | 'generic';

export type ExtractedArticle = {
  url: string;
  canonicalUrl: string;
  sourceDomain: string | null;
  sourceType: 'article';
  title: string;
  author: string | null;
  siteName: string | null;
  description?: string | null;
  imageUrl?: string | null;
  publishedAt: string | null;
  publishedAtSource: ArticlePublishedAtSource;
  language: string;
  text: string;
  blocks: ArticleBlock[];
  contentHash: string;
  wordCount: number;
  charCount: number;
  status: ArticleExtractionStatus;
  extractionVersion: string;
  diagnostics: ArticleExtractionDiagnostics;
};

export const ARTICLE_EXTRACTION_VERSION = 'brain-article-extractor-v2';

const PAYWALL_PATTERNS = [
  'subscribe to continue reading',
  'subscribe to continue',
  'to continue reading this article',
  'continue reading with a subscription',
  'this article is for subscribers',
  'this content is for subscribers',
  'this story is for subscribers',
  'already a subscriber?',
  'доступ к статье только для подписчиков',
  'доступ только для подписчиков',
  'продолжить чтение статьи',
  'статья доступна только подписчикам',
  'материал доступен по подписке',
  'оформите подписку, чтобы читать',
  'чтобы читать дальше, оформите подписку',
  'article réservé aux abonnés',
  'réservé aux abonnés',
  'cet article est réservé aux abonnés',
  'il vous reste',
  'pour lire la suite',
  'nur für abonnenten',
  'dieser artikel ist für abonnenten',
  'weiterlesen mit abo',
  'solo suscriptores',
  'contenido exclusivo para suscriptores',
  'para seguir leyendo',
  'solo per abbonati',
  'contenuto riservato agli abbonati',
  'continua a leggere',
];

const TRUNCATION_PATTERNS = [
  'continue reading',
  'read the full article',
  'read the full story',
  'read the rest of',
  'this is a preview',
  'preview of the article',
  'subscribe to read',
  'sign in to read',
  'log in to read',
  'продолжение следует',
  'читать полностью',
  'продолжить чтение',
  'материал доступен по подписке',
  'lire la suite',
  'pour lire la suite',
  'weiterlesen',
  'leer más',
  'continua a leggere',
];

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'form',
  'nav',
  'body > header',
  'body > footer',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '[hidden]',
  '[style*="display:none"]',
  '[style*="display: none"]',
  '.cookie',
  '.cookies',
  '.cookie-banner',
  '.cookie-consent',
  '.cookie-notice',
  '.gdpr',
  '.consent',
  '.paywall',
  '.subscribe',
  '.subscription',
  '.subscribe-widget',
  '.subscription-widget',
  '.subscription-widget-wrap',
  '.newsletter',
  '.newsletter-cta',
  '.advert',
  '.advertisement',
  '.advertising',
  '.ads',
  '.ad',
  '.promo',
  '.banner',
  '.outbrain',
  '.taboola',
  '.related',
  '.related-posts',
  '.recommended',
  '.recommended-posts',
  '.recommendations',
  '.read-next',
  '.comments',
  '.comment',
  '.share',
  '.share-buttons',
  '.social',
  '.social-buttons',
  '.post-footer',
  '.post-ufi',
  '.post-cta',
  '.post-end-cta',
  '.byline',
  '.author-bio',
  '.dateline',
  '.breadcrumbs',
  '.tags',
  '.menu',
  '.navigation',
  '.top-bar',
  '.site-header',
  '.site-footer',
  '.metadata',
  '[class*="cookie"]',
  '[class*="paywall"]',
  '[class*="subscribe-widget"]',
  '[class*="subscription-widget"]',
  '[class*="newsletter-cta"]',
  '[class*="related-posts"]',
  '[class*="recommended-posts"]',
  '[class*="read-next"]',
  '[class*="share-buttons"]',
  '[class*="social-buttons"]',
  '[class*="post-ufi"]',
  '[id*="cookie"]',
];

const CONTENT_ROOT_SELECTORS = [
  'article',
  '[itemprop="articleBody"]',
  '[itemprop="articleBody"] .article__body',
  'article .article__body',
  'article .article__text',
  'article .material-body',
  'article .article-text',
  'main article',
  'main',
  '[role="main"]',
  '.article-body',
  '.article__body',
  '.article__text',
  '.article-text',
  '.post-content',
  '.post-content.markup',
  '.available-content',
  '.body.markup',
  '.entry-content',
  '.story-body',
  '.story__body',
  '.content-body',
  '.content__body',
  '.material-body',
  '.text-content',
  '.content',
  '#content',
  '.article-content',
  '.article__content',
  '.article-body__content',
  '.post__content',
  '.post-body',
  '.post-entry',
  '.gh-content',
  '.c-content',
  '.c-article-body',
  '.c-article-content',
  '.article-text-content',
  '.article__text-content',
  '.story-content',
  '.story__content',
  '.news-text',
  '.news__text',
  '.text-block',
  '[data-testid="article-body"]',
  '[data-component="article-body"]',
  '[data-qa="article-body"]',
  '[data-article-body]',
];

const SHORT_NOISE = new Set([
  'ad',
  'ads',
  'advertisement',
  'advertising',
  'all rights reserved',
  'back to top',
  'by',
  'close',
  'cookie',
  'cookies',
  'copy link',
  'copyright',
  'email',
  'follow',
  'follow us',
  'loading',
  'log in',
  'menu',
  'no posts',
  'nothing here',
  'read more',
  'read next',
  'recommended',
  'related',
  'share',
  'sign in',
  'sign up',
  'subscribe',
  'tweet',
  'войти',
  'загрузка',
  'меню',
  'наверх',
  'нет записей',
  'поделиться',
  'подписаться',
  'пока нет',
  'реклама',
  'читать далее',
]);

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^(advertisement|advertising|реклама)$/i,
  /^(share|tweet|email|copy link|поделиться|скопировать ссылку)$/i,
  /^(subscribe|sign up|подписаться|оформить подписку)/i,
  /^(read more|read next|читайте также|читать далее|смотрите также)/i,
  /^(related|recommended|you may also like|материалы по теме)/i,
  /^(cookie|we use cookies|используем cookie)/i,
  /^(all rights reserved|copyright|©)/i,
  /^(follow us|follow|мы в соцсетях)/i,
  /^(no posts|nothing here|пока нет|нет записей)/i,
  /^(loading|загрузка)/i,
  /^(sign in|log in|войти)/i,
  /^(back to top|наверх)/i,
  /^(about the author|об авторе|author bio|биография автора)/i,
];

const NOVAYA_ROOT_SELECTORS = [
  'article [itemprop="articleBody"]',
  'article .article__body',
  'article .article__text',
  'article .material-body',
  'article .article-text',
  'article',
  '[itemprop="articleBody"]',
];

const SUBSTACK_ROOT_SELECTORS = [
  '.available-content',
  '.post-content.markup',
  '.post-content',
  '.body.markup',
  'article .body',
  'article',
];

function detectSiteProfile(url: string): ArticleSiteProfile {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'novayagazeta.ru' || host === 'novayagazeta.eu') return 'novaya';
    if (host === 'substack.com' || host.endsWith('.substack.com')) return 'substack';
  } catch {
    // Fall through to generic.
  }

  return 'generic';
}

function profileRootSelectors(profile: ArticleSiteProfile): string[] {
  if (profile === 'novaya') return NOVAYA_ROOT_SELECTORS;
  if (profile === 'substack') return SUBSTACK_ROOT_SELECTORS;
  return [];
}

function removeSiteNoise($: cheerio.CheerioAPI, profile: ArticleSiteProfile): void {
  if (profile === 'novaya') {
    $(
      [
        '.article__author',
        '.article__date',
        '.article__meta',
        '.article__tags',
        '.article__social',
        '.article__related',
        '.article__subscribe',
        '.article__footer',
        '.material__footer',
        '.material__social',
        '.material__tags',
        '.material__author',
      ].join(',')
    ).remove();
  }

  if (profile === 'substack') {
    $(
      [
        '.post-footer',
        '.post-ufi',
        '.post-cta',
        '.post-end-cta',
        '.subscription-widget-wrap',
        '.subscribe-widget',
        '.paywall',
        '.share',
        '.social',
        '.newsletter-cta',
        '.post-end-cta',
      ].join(',')
    ).remove();
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function isNoiseText(text: string): boolean {
  if (!text) return true;
  if (text.length <= 2) return true;

  const lower = text.toLowerCase();
  if (SHORT_NOISE.has(lower)) return true;

  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(lower));
}

function detectTruncation(html: string, text: string): boolean {
  const visible = text.toLowerCase();

  if (TRUNCATION_PATTERNS.some((pattern) => visible.includes(pattern))) return true;

  // A short extraction with a preview/subscribe marker in the raw page is a
  // truncation signal. Long complete articles can contain a "read more" link
  // in a removed widget, so the raw HTML is only consulted for short text.
  if (text.length < 600) {
    const raw = html.toLowerCase();
    return TRUNCATION_PATTERNS.some((pattern) => raw.includes(pattern));
  }

  return false;
}

function detectLanguage(value: string): string {
  const cyrillic = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return 'unknown';
  if (cyrillic > latin * 0.25) return 'ru';
  if (latin > 0) return 'en';
  return 'unknown';
}

/**
 * Normalizes a BCP-47-like language tag to a short lower-case code.
 * Media coverage frequently arrives in French, Italian, Spanish, German or
 * Polish, so an explicit document language must win over the text heuristic
 * (which only distinguishes Cyrillic from Latin).
 */
function normalizeLanguageTag(value: string | null | undefined): string | null {
  if (!value) return null;

  const tag = value
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .split('-')[0];

  return /^[a-z]{2,3}$/.test(tag) ? tag : null;
}

function detectDocumentLanguage(
  $: cheerio.CheerioAPI,
  title: string,
  text: string
): string {
  return (
    normalizeLanguageTag($('html').attr('lang')) ??
    normalizeLanguageTag(metaContent($, ['meta[property="og:locale"]'])) ??
    normalizeLanguageTag(
      metaContent($, ['meta[http-equiv="content-language"]', 'meta[name="language"]'])
    ) ??
    detectLanguage(`${title}\n${text}`)
  );
}

function detectPaywall(html: string): boolean {
  const lower = html.toLowerCase();
  return PAYWALL_PATTERNS.some((pattern) => lower.includes(pattern));
}

type CollectedBlocks = {
  blocks: ArticleBlock[];
  boilerplateChars: number;
  boilerplateCount: number;
};

function collectBlocks($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): CollectedBlocks {
  const blocks: ArticleBlock[] = [];
  let boilerplateChars = 0;
  let boilerplateCount = 0;

  root.find('h1,h2,h3,h4,h5,h6,p,blockquote,pre,li').each((_, element) => {
    const node = $(element as Element);
    const tag = (element as Element).tagName?.toLowerCase();

    if (!tag) return;

    // A blockquote/li already contains its paragraphs; do not duplicate them.
    if (tag === 'p' && (node.parents('blockquote').length > 0 || node.parents('li').length > 0)) {
      return;
    }

    if (tag === 'li' && node.parents('li').length > 0) {
      return;
    }

    const text = normalizeText(node.text());

    if (isNoiseText(text)) {
      boilerplateChars += text.length;
      boilerplateCount += 1;
      return;
    }

    let block: ArticleBlock;

    if (/^h[1-6]$/.test(tag)) {
      block = {
        type: 'heading',
        text,
        level: Number(tag.slice(1)),
      };
    } else if (tag === 'blockquote') {
      block = {
        type: 'quote',
        text: text
          .split(/\n+/)
          .map((line) => `> ${line.trim()}`)
          .join('\n'),
      };
    } else if (tag === 'li') {
      block = { type: 'list', text: `• ${text}` };
    } else {
      block = { type: 'paragraph', text };
    }

    const key = `${block.type}:${block.text}`;

    if (!key) return;

    blocks.push(block);
  });

  return { blocks, boilerplateChars, boilerplateCount };
}

function blocksToText(blocks: ArticleBlock[]): string {
  return blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type ScoredRoot = {
  root: cheerio.Cheerio<AnyNode>;
  score: number;
  paragraphChars: number;
  linkDensity: number;
  parser: ArticleExtractionDiagnostics['parser'];
};

function scoreRoot(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
  parser: 'scored' | 'fallback'
): ScoredRoot {
  const paragraphChars = root
    .find('p,li,blockquote')
    .toArray()
    .reduce((sum, element) => {
      return sum + normalizeText($(element).text()).length;
    }, 0);

  const totalChars = normalizeText(root.text()).length;
  const linkChars = root
    .find('a')
    .toArray()
    .reduce((sum, element) => {
      return sum + normalizeText($(element).text()).length;
    }, 0);

  const headingCount = root.find('h1,h2,h3,h4,h5,h6').length;
  const linkDensity = totalChars > 0 ? Math.min(1, linkChars / totalChars) : 1;

  // Reward real paragraph text and headings; punish link-heavy navigation.
  const score = paragraphChars - linkChars * 1.5 + headingCount * 60;

  return { root, score, paragraphChars, linkDensity, parser };
}

function chooseMainRoot(
  $: cheerio.CheerioAPI,
  profile: ArticleSiteProfile
): {
  root: cheerio.Cheerio<AnyNode>;
  parser: ArticleExtractionDiagnostics['parser'];
  paragraphChars: number;
  linkDensity: number;
} {
  for (const selector of profileRootSelectors(profile)) {
    const root = $(selector).first();

    if (root.length === 0) continue;

    const scored = scoreRoot($, root, 'scored');

    if (scored.paragraphChars >= 300 && scored.score >= 200) {
      return {
        root: scored.root,
        parser: scored.parser,
        paragraphChars: scored.paragraphChars,
        linkDensity: scored.linkDensity,
      };
    }
  }

  const candidates = new Map<string, cheerio.Cheerio<AnyNode>>();

  for (const selector of CONTENT_ROOT_SELECTORS) {
    $(selector).each((_, element) => {
      const node = $(element as Element);
      const key = element as unknown as string;
      if (!candidates.has(key)) candidates.set(key, node);
    });
  }

  // Also consider divs/sections whose class or id looks like article content.
  $('div,section').each((_, element) => {
    const node = $(element as Element);
    const signature = `${node.attr('class') || ''} ${node.attr('id') || ''}`;

    if (!/article|content|story|text|body|post|material|entry/i.test(signature)) return;
    if (node.find('p').length < 2) return;

    const key = element as unknown as string;
    if (!candidates.has(key)) candidates.set(key, node);
  });

  let best: ScoredRoot | null = null;

  for (const root of candidates.values()) {
    const scored = scoreRoot($, root, 'scored');

    if (!best || scored.score > best.score) best = scored;
  }

  const bodyChars = normalizeText($('body').text()).length;
  const bodyLinks = $('body')
    .find('a')
    .toArray()
    .reduce((sum, element) => {
      return sum + normalizeText($(element).text()).length;
    }, 0);
  const bodyLinkDensity = bodyChars > 0 ? Math.min(1, bodyLinks / bodyChars) : 1;

  if (!best || best.paragraphChars < 300 || best.score < 200) {
    return {
      root: $('body'),
      parser: 'fallback',
      paragraphChars: bodyChars,
      linkDensity: bodyLinkDensity,
    };
  }

  return {
    root: best.root,
    parser: best.parser,
    paragraphChars: best.paragraphChars,
    linkDensity: best.linkDensity,
  };
}

function metaContent($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = $(selector).first().attr('content')?.trim();
    if (value) return value;
  }

  return null;
}

function parseJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);

      const push = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const record = value as Record<string, unknown>;

        if (Array.isArray(record['@graph'])) {
          for (const entry of record['@graph']) push(entry);
        } else {
          values.push(record);
        }
      };

      if (Array.isArray(parsed)) {
        for (const entry of parsed) push(entry);
      } else {
        push(parsed);
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  });

  return values;
}

function isArticleJsonLd(value: Record<string, unknown>): boolean {
  const type = value['@type'];
  const types = Array.isArray(type) ? type : [type];

  return types.some(
    (entry) =>
      typeof entry === 'string' &&
      [
        'Article',
        'NewsArticle',
        'BlogPosting',
        'ReportageNewsArticle',
        'OpinionNewsArticle',
      ].includes(entry)
  );
}

function jsonLdAuthor(value: Record<string, unknown>): string | null {
  const author = value.author;

  if (typeof author === 'string' && author.trim()) return author.trim();

  if (Array.isArray(author)) {
    const names = author
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && 'name' in entry) {
          return String((entry as { name?: unknown }).name || '');
        }
        return '';
      })
      .filter(Boolean);

    return names.length > 0 ? names.join(', ') : null;
  }

  if (author && typeof author === 'object' && 'name' in author) {
    const name = String((author as { name?: unknown }).name || '').trim();
    return name || null;
  }

  return null;
}

function jsonLdString(value: Record<string, unknown>, key: string): string | null {
  const raw = value[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function normalizePublished(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function canonicalFromDocument(
  $: cheerio.CheerioAPI,
  finalUrl: string,
  jsonLd: Record<string, unknown> | null
): string {
  const declared =
    $('link[rel="canonical"]').first().attr('href')?.trim() ||
    metaContent($, ['meta[property="og:url"]']) ||
    (jsonLd ? jsonLdString(jsonLd, 'url') : null);

  if (declared) {
    try {
      const absolute = new URL(declared, finalUrl).toString();
      return normalizeSourceUrl(absolute);
    } catch {
      // Fall through to the final URL.
    }
  }

  const normalized = tryNormalizeSourceUrl(finalUrl);

  return normalized.url || finalUrl;
}

function chooseTitle($: cheerio.CheerioAPI, jsonLd: Record<string, unknown> | null): string {
  const candidates = [
    metaContent($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']),
    jsonLd ? jsonLdString(jsonLd, 'headline') : null,
    jsonLd ? jsonLdString(jsonLd, 'name') : null,
    $('h1').first().text(),
    $('title').first().text(),
  ];

  for (const candidate of candidates) {
    const title = normalizeText(candidate || '');
    if (title) return title.slice(0, 500);
  }

  return 'Untitled article';
}

function normalizeAuthor(value: string | null): string | null {
  if (!value) return null;

  const normalized = value
    .replace(/\s+/g, ' ')
    .replace(/^(by|автор[:\s]+)\s+/i, '')
    .trim();

  return normalized ? normalized.slice(0, 300) : null;
}

function extractionCompleteness(input: {
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  linkDensity: number;
  boilerplateRatio: number;
  title: string;
  publishedAt: string | null;
  paywallDetected: boolean;
  truncated: boolean;
}): number {
  let score = 0;

  if (input.wordCount >= 20) score += 0.1;
  if (input.wordCount >= 80) score += 0.15;
  if (input.wordCount >= 300) score += 0.15;
  if (input.wordCount >= 800) score += 0.1;
  if (input.paragraphCount >= 2) score += 0.15;
  if (input.paragraphCount >= 6) score += 0.1;
  if (input.headingCount >= 1) score += 0.1;
  if (input.title && input.title !== 'Untitled article') score += 0.05;
  if (input.publishedAt) score += 0.05;

  if (input.linkDensity <= 0.2) score += 0.1;
  else if (input.linkDensity <= 0.35) score += 0.05;

  if (input.boilerplateRatio <= 0.2) score += 0.05;
  if (input.paywallDetected) score -= 0.35;
  if (input.truncated) score -= 0.35;

  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function chooseExtractionStatus(input: {
  text: string;
  wordCount: number;
  charCount: number;
  paragraphCount: number;
  headingCount: number;
  linkDensity: number;
  boilerplateRatio: number;
  completeness: number;
  paywallDetected: boolean;
  truncated: boolean;
}): ArticleExtractionStatus {
  if (!input.text || input.wordCount < 20 || input.charCount < 120) {
    return input.paywallDetected || input.truncated ? 'partial' : 'failed';
  }

  if (
    input.paywallDetected ||
    input.truncated ||
    input.wordCount < 120 ||
    input.paragraphCount < 2 ||
    input.charCount < 600 ||
    input.linkDensity > 0.35
  ) {
    return 'partial';
  }

  if (
    input.completeness < 0.8 ||
    input.boilerplateRatio > 0.65 ||
    (input.headingCount === 0 && input.wordCount < 400)
  ) {
    return 'needs_review';
  }

  return 'complete';
}

/**
 * Extracts full article text with a site-aware main-content selector and a
 * scored fallback. A result is never silently treated as complete: short,
 * paywalled, truncated or structurally weak extractions are marked
 * partial/failed/needs_review and must not be indexed.
 */
export function extractArticle(html: string, finalUrl: string): ExtractedArticle {
  const $ = cheerio.load(html);
  const profile = detectSiteProfile(finalUrl);

  const jsonLdValues = parseJsonLd($);
  const jsonLd = jsonLdValues.find(isArticleJsonLd) ?? jsonLdValues[0] ?? null;

  const canonicalUrl = canonicalFromDocument($, finalUrl, jsonLd);
  const sourceDomain = getSourceDomain(canonicalUrl);
  const title = chooseTitle($, jsonLd);

  // Scripts and styles are not editorial text; remove them before measuring
  // the page body so boilerplate ratio reflects visible interface text only.
  $('script,style,noscript,template,svg,canvas,iframe').remove();

  const bodyChars = normalizeText($('body').text()).length;

  const noiseNodes = $(NOISE_SELECTORS.join(','));
  let removedNoiseChars = 0;
  noiseNodes.each((_, element) => {
    removedNoiseChars += normalizeText($(element).text()).length;
  });
  noiseNodes.remove();
  removeSiteNoise($, profile);

  const main = chooseMainRoot($, profile);
  const collected = collectBlocks($, main.root);
  const blocks = collected.blocks;

  const jsonLdBody =
    jsonLd && typeof jsonLd.articleBody === 'string' ? jsonLd.articleBody.trim() : null;

  if (blocks.length === 0 && jsonLdBody) {
    for (const paragraph of jsonLdBody.split(/\n{2,}/)) {
      const text = normalizeText(paragraph);
      if (text) blocks.push({ type: 'paragraph', text });
    }
  }

  if (blocks.length === 0) {
    const fallbackText = normalizeText(main.root.text());
    if (fallbackText) blocks.push({ type: 'paragraph', text: fallbackText });
  }

  const text = blocksToText(blocks);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const charCount = text.length;
  const paragraphCount = blocks.filter(
    (block) => block.type === 'paragraph' || block.type === 'list' || block.type === 'quote'
  ).length;
  const headingCount = blocks.filter((block) => block.type === 'heading').length;
  const paywallDetected = detectPaywall(html);
  const truncated = detectTruncation(html, text);
  const unselectedChars = Math.max(0, bodyChars - charCount);
  const boilerplateChars = Math.min(
    unselectedChars,
    removedNoiseChars + collected.boilerplateChars
  );
  const boilerplateRatio =
    boilerplateChars + charCount > 0
      ? Number((boilerplateChars / (boilerplateChars + charCount)).toFixed(4))
      : 0;

  const author = normalizeAuthor(
    metaContent($, ['meta[name="author"]', 'meta[property="article:author"]']) ||
      (jsonLd ? jsonLdAuthor(jsonLd) : null)
  );

  const metadataPublished = normalizePublished(
    metaContent($, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]',
    ])
  );
  const jsonLdPublished = normalizePublished(jsonLd ? jsonLdString(jsonLd, 'datePublished') : null);
  const urlPublished = publishedDateFromUrl(canonicalUrl) ?? publishedDateFromUrl(finalUrl);
  const publishedAt = metadataPublished ?? jsonLdPublished ?? urlPublished;
  const publishedAtSource: ArticlePublishedAtSource = metadataPublished
    ? 'metadata'
    : jsonLdPublished
      ? 'jsonld'
      : urlPublished
        ? 'url_path'
        : null;

  const siteName =
    metaContent($, ['meta[property="og:site_name"]']) ||
    (jsonLd && jsonLd.publisher && typeof jsonLd.publisher === 'object'
      ? String((jsonLd.publisher as { name?: unknown }).name || '') || null
      : null);

  const description = metaContent($, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
    'meta[property="twitter:description"]',
  ]);

  const imageRaw = metaContent($, [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
  ]);

  let imageUrl: string | null = null;

  if (imageRaw) {
    try {
      const candidate = new URL(imageRaw, canonicalUrl || finalUrl);

      if (
        ['http:', 'https:'].includes(candidate.protocol) &&
        !candidate.username &&
        !candidate.password
      ) {
        imageUrl = candidate.toString();
      }
    } catch {
      imageUrl = null;
    }
  }

  const completeness = extractionCompleteness({
    wordCount,
    paragraphCount,
    headingCount,
    linkDensity: main.linkDensity,
    boilerplateRatio,
    title,
    publishedAt,
    paywallDetected,
    truncated,
  });

  const status = chooseExtractionStatus({
    text,
    wordCount,
    charCount,
    paragraphCount,
    headingCount,
    linkDensity: main.linkDensity,
    boilerplateRatio,
    completeness,
    paywallDetected,
    truncated,
  });

  return {
    url: finalUrl,
    canonicalUrl,
    sourceDomain: sourceDomain || null,
    sourceType: 'article',
    title,
    author,
    siteName: siteName ? siteName.slice(0, 200) : null,
    description: description ? description.slice(0, 2000) : null,
    imageUrl,
    publishedAt,
    publishedAtSource,
    language: detectDocumentLanguage($, title, text),
    text,
    blocks,
    contentHash: sha256Hex(text),
    wordCount,
    charCount,
    status,
    extractionVersion: ARTICLE_EXTRACTION_VERSION,
    diagnostics: {
      parser: blocks.length > 0 ? main.parser : 'none',
      fallbackChars: main.paragraphChars,
      selectedChars: charCount,
      bodyChars,
      wordCount,
      paragraphCount,
      headingCount,
      linkDensity: Number(main.linkDensity.toFixed(4)),
      boilerplateChars,
      boilerplateCount: collected.boilerplateCount,
      boilerplateRatio,
      completeness,
      paywallDetected,
      truncated,
      htmlChars: html.length,
      sourceDomain: sourceDomain || null,
      siteProfile: profile,
      extractionVersion: ARTICLE_EXTRACTION_VERSION,
      publishedAtSource,
    },
  };
}
