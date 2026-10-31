import * as cheerio from 'cheerio';

import {
  chunkArticle,
  type ArticleChunkingResult,
} from '@/lib/knowledge/brain/chunk';
import {
  extractArticle,
  type ExtractedArticle,
} from '@/lib/knowledge/brain/extract';
import { fetchHtmlSafely, normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import {
  evaluateMediaTextQuality,
  type MediaQualityAssessment,
} from '@/lib/knowledge/media/quality';

export type MediaPageMetadata = {
  url: string;
  canonical_url: string;
  title: string;
  outlet: string;
  summary: string;
  image_url: string | null;
  published_date: string | null;
};

export type MediaPageExtraction = {
  metadata: MediaPageMetadata;
  article: ExtractedArticle;
  quality: MediaQualityAssessment;
  chunking: ArticleChunkingResult;
  html: string;
  fetchedBytes: number;
  finalUrl: string;
  contentType: string;
};

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function validArchiveDate(value: string | null): string | null {
  const date = value?.slice(0, 10) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function safeCanonical(value: string, fallback: string): string {
  try {
    return normalizeSourceUrl(value);
  } catch {
    return fallback;
  }
}

function outletFromArticle(article: ExtractedArticle, fallbackUrl: string): string {
  if (article.siteName) return clean(article.siteName, 300);

  try {
    return new URL(fallbackUrl).hostname.replace(/^www\./i, '').slice(0, 300);
  } catch {
    return 'Unknown publication';
  }
}

/**
 * Single safe fetch and full-text extraction for the Media Archive. It uses
 * the existing Brain URL guard, parser, chunker and quality evaluator. It does
 * not bypass paywalls. A 3 MB cap is enough for modern news pages while the
 * parser still rejects subscriber previews as non-full text.
 */
export function extractMediaHtml(input: {
  html: string;
  finalUrl: string;
  sourceUrl?: string;
  fetchedBytes?: number;
  contentType?: string;
}): MediaPageExtraction {
  const article = extractArticle(input.html, input.finalUrl);
  const canonicalUrl = safeCanonical(
    article.canonicalUrl,
    safeCanonical(input.finalUrl, input.sourceUrl || input.finalUrl)
  );
  const outlet = outletFromArticle(article, canonicalUrl);
  const quality = evaluateMediaTextQuality(article);
  const chunking = chunkArticle(article, 'doc_media_preview');
  const $ = cheerio.load(input.html);
  const description =
    article.description ||
    $('meta[name="description"]').first().attr('content')?.trim() ||
    '';

  return {
    metadata: {
      url: input.sourceUrl || input.finalUrl,
      canonical_url: canonicalUrl,
      title: clean(article.title, 500) || clean($('title').first().text(), 500),
      outlet,
      summary: clean(description, 2000),
      image_url: article.imageUrl ?? null,
      published_date: validArchiveDate(article.publishedAt),
    },
    article,
    quality,
    chunking,
    html: input.html,
    fetchedBytes: input.fetchedBytes ?? Buffer.byteLength(input.html, 'utf8'),
    finalUrl: input.finalUrl,
    contentType: input.contentType || 'text/html',
  };
}

export async function extractMediaPage(inputUrl: string): Promise<MediaPageExtraction> {
  const fetched = await fetchHtmlSafely(inputUrl, {
    timeoutMs: 15_000,
    maxBytes: 3_000_000,
    maxRedirects: 5,
    userAgent: 'Mozilla/5.0 (compatible; MerkurovMediaArchive/2.0)',
  });

  return extractMediaHtml({
    html: fetched.html,
    finalUrl: fetched.url,
    sourceUrl: inputUrl,
    fetchedBytes: fetched.bytes,
    contentType: fetched.contentType,
  });
}
