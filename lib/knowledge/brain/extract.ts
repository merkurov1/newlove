import { createHash } from 'node:crypto';

import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';

import { normalizeSourceUrl, tryNormalizeSourceUrl } from './url';

export type ArticleBlockType = 'heading' | 'paragraph' | 'quote' | 'list';

export type ArticleBlock = {
  type: ArticleBlockType;
  text: string;
  level?: number;
};

export type ArticleExtractionStatus = 'ok' | 'partial' | 'failed';

export type ArticleExtractionDiagnostics = {
  parser: 'scored' | 'fallback' | 'none';
  fallbackChars: number;
  selectedChars: number;
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  linkDensity: number;
  paywallDetected: boolean;
  htmlChars: number;
};

export type ExtractedArticle = {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string | null;
  siteName: string | null;
  publishedAt: string | null;
  language: string;
  text: string;
  blocks: ArticleBlock[];
  contentHash: string;
  wordCount: number;
  charCount: number;
  status: ArticleExtractionStatus;
  diagnostics: ArticleExtractionDiagnostics;
};

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
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '.cookie',
  '.cookies',
  '.cookie-banner',
  '.paywall',
  '.subscribe',
  '.subscription',
  '.newsletter',
  '.advert',
  '.advertisement',
  '.ads',
  '.promo',
  '.related',
  '.recommended',
  '.recommendations',
  '.comments',
  '.comment',
  '.share',
  '.social',
  '.breadcrumbs',
  '.tags',
  '.metadata',
];

const CONTENT_ROOT_SELECTORS = [
  'article',
  '[itemprop="articleBody"]',
  'main article',
  'main',
  '[role="main"]',
  '.article-body',
  '.article__body',
  '.article__text',
  '.article-text',
  '.post-content',
  '.entry-content',
  '.story-body',
  '.story__body',
  '.content-body',
  '.content__body',
  '.material-body',
  '.text-content',
  '.content',
  '#content',
];

const SHORT_NOISE = new Set([
  'share',
  'tweet',
  'follow us',
  'sign up',
  'subscribe',
  'read more',
  'advertisement',
  'поделиться',
  'подписаться',
  'читать далее',
  'реклама',
]);

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

function isNoiseText(text: string): boolean {
  if (!text) return true;
  if (text.length <= 2) return true;
  return SHORT_NOISE.has(text.toLowerCase());
}

function detectLanguage(value: string): string {
  const cyrillic = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return 'unknown';
  if (cyrillic > latin * 0.25) return 'ru';
  if (latin > 0) return 'en';
  return 'unknown';
}

function detectPaywall(html: string): boolean {
  const lower = html.toLowerCase();
  return PAYWALL_PATTERNS.some((pattern) => lower.includes(pattern));
}

function collectBlocks(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>
): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];

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

    if (isNoiseText(text)) return;

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
    if (key.length === 0) return;

    blocks.push(block);
  });

  return blocks;
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

function scoreRoot($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>, parser: 'scored' | 'fallback'): ScoredRoot {
  const paragraphChars = root.find('p,li,blockquote').toArray().reduce((sum, element) => {
    return sum + normalizeText($(element).text()).length;
  }, 0);

  const totalChars = normalizeText(root.text()).length;
  const linkChars = root.find('a').toArray().reduce((sum, element) => {
    return sum + normalizeText($(element).text()).length;
  }, 0);

  const headingCount = root.find('h1,h2,h3,h4,h5,h6').length;
  const linkDensity = totalChars > 0 ? Math.min(1, linkChars / totalChars) : 1;

  // Reward real paragraph text and headings; punish link-heavy navigation.
  const score = paragraphChars - linkChars * 1.5 + headingCount * 60;

  return { root, score, paragraphChars, linkDensity, parser };
}

function chooseMainRoot(
  $: cheerio.CheerioAPI
): { root: cheerio.Cheerio<AnyNode>; parser: ArticleExtractionDiagnostics['parser']; paragraphChars: number; linkDensity: number } {
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
  const bodyLinks = $('body').find('a').toArray().reduce((sum, element) => {
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
      ['Article', 'NewsArticle', 'BlogPosting', 'ReportageNewsArticle', 'OpinionNewsArticle'].includes(
        entry
      )
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

/**
 * Extracts full article text with a scored main-content selector and a body
 * fallback. A result is never silently treated as complete: short, paywalled
 * or empty extractions are marked partial/failed and must not be indexed.
 */
export function extractArticle(html: string, finalUrl: string): ExtractedArticle {
  const $ = cheerio.load(html);

  const jsonLdValues = parseJsonLd($);
  const jsonLd = jsonLdValues.find(isArticleJsonLd) ?? jsonLdValues[0] ?? null;

  const canonicalUrl = canonicalFromDocument($, finalUrl, jsonLd);
  const title = chooseTitle($, jsonLd);

  $(NOISE_SELECTORS.join(',')).remove();

  const main = chooseMainRoot($);
  const blocks = collectBlocks($, main.root);

  if (blocks.length === 0) {
    const text = normalizeText(main.root.text());
    if (text) blocks.push({ type: 'paragraph', text });
  }

  const text = blocksToText(blocks);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const charCount = text.length;
  const paragraphCount = blocks.filter(
    (block) => block.type === 'paragraph' || block.type === 'list' || block.type === 'quote'
  ).length;
  const headingCount = blocks.filter((block) => block.type === 'heading').length;
  const paywallDetected = detectPaywall(html);

  const author =
    metaContent($, ['meta[name="author"]', 'meta[property="article:author"]']) ||
    (jsonLd ? jsonLdAuthor(jsonLd) : null);

  const publishedAt = normalizePublished(
    metaContent($, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[itemprop="datePublished"]',
    ]) ||
      (jsonLd ? jsonLdString(jsonLd, 'datePublished') : null)
  );

  const siteName =
    metaContent($, ['meta[property="og:site_name"]']) ||
    (jsonLd && jsonLd.publisher && typeof jsonLd.publisher === 'object'
      ? String((jsonLd.publisher as { name?: unknown }).name || '') || null
      : null);

  const status: ArticleExtractionStatus =
    !text
      ? 'failed'
      : paywallDetected
        ? 'partial'
        : wordCount < 20
          ? 'failed'
          : wordCount < 80 ||
              paragraphCount < 2 ||
              charCount < 500 ||
              main.linkDensity > 0.35
            ? 'partial'
            : 'ok';

  return {
    url: finalUrl,
    canonicalUrl,
    title,
    author: author ? author.slice(0, 300) : null,
    siteName: siteName ? siteName.slice(0, 200) : null,
    publishedAt,
    language: detectLanguage(`${title}\n${text}`),
    text,
    blocks,
    contentHash: sha256Hex(text),
    wordCount,
    charCount,
    status,
    diagnostics: {
      parser: blocks.length > 0 ? main.parser : 'none',
      fallbackChars: main.paragraphChars,
      selectedChars: charCount,
      wordCount,
      paragraphCount,
      headingCount,
      linkDensity: Number(main.linkDensity.toFixed(4)),
      paywallDetected,
      htmlChars: html.length,
    },
  };
}
