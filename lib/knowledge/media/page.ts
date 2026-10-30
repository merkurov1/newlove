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
 * not bypass paywalls and deliberately keeps the public page limits
 * (1 MB / 10 s) instead of relaxing them.
 */
export async function extractMediaPage(inputUrl: string): Promise<MediaPageExtraction> {
  const fetched = await fetchHtmlSafely(inputUrl, {
    timeoutMs: 10_000,
    maxBytes: 1_000_000,
    maxRedirects: 5,
    userAgent: 'Mozilla/5.0 (compatible; MerkurovMediaArchive/2.0)',
  });

  const article = extractArticle(fetched.html, fetched.url);
  const canonicalUrl = safeCanonical(
    article.canonicalUrl,
    safeCanonical(fetched.url, inputUrl)
  );
  const outlet = outletFromArticle(article, canonicalUrl);
  const quality = evaluateMediaTextQuality(article);
  const chunking = chunkArticle(article, 'doc_media_preview');
  const $ = cheerio.load(fetched.html);
  const description =
    article.description ||
    $('meta[name="description"]').first().attr('content')?.trim() ||
    '';

  return {
    metadata: {
      url: fetched.url,
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
    fetchedBytes: fetched.bytes,
    finalUrl: fetched.url,
    contentType: fetched.contentType,
  };
}
