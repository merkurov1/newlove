import type { ExtractedArticle } from '@/lib/knowledge/brain/extract';
import type { MediaCoverageStatus } from '@/lib/knowledge/brain/store';

export type MediaTextQuality =
  | 'full_text'
  | 'partial_text'
  | 'metadata_only'
  | 'blocked';

export type MediaQualityAssessment = {
  quality: MediaTextQuality;
  coverageStatus: MediaCoverageStatus;
  jobStatus: 'completed' | 'partial' | 'failed';
  extractionStatus: string;
  errorCode: string | null;
};

const MIN_FULL_TEXT_CHARS = 600;
const MIN_FULL_TEXT_WORDS = 120;
const MIN_FULL_TEXT_PARAGRAPHS = 2;

export function hasUsableArticleText(article: ExtractedArticle): boolean {
  return (
    article.charCount >= MIN_FULL_TEXT_CHARS &&
    article.wordCount >= MIN_FULL_TEXT_WORDS &&
    article.diagnostics.paragraphCount >= MIN_FULL_TEXT_PARAGRAPHS
  );
}

export function evaluateMediaTextQuality(article: ExtractedArticle): MediaQualityAssessment {
  const usable = hasUsableArticleText(article);

  if (article.diagnostics.paywallDetected) {
    return usable
      ? {
          quality: 'partial_text',
          coverageStatus: 'partial',
          jobStatus: 'partial',
          extractionStatus: 'partial',
          errorCode: 'paywall_detected',
        }
      : {
          quality: 'blocked',
          coverageStatus: 'blocked',
          jobStatus: 'partial',
          extractionStatus: 'blocked',
          errorCode: 'paywall_detected',
        };
  }

  if (article.diagnostics.truncated) {
    return usable
      ? {
          quality: 'partial_text',
          coverageStatus: 'partial',
          jobStatus: 'partial',
          extractionStatus: 'partial',
          errorCode: 'truncated_content',
        }
      : {
          quality: 'metadata_only',
          coverageStatus: 'failed',
          jobStatus: 'failed',
          extractionStatus: 'failed',
          errorCode: 'truncated_content',
        };
  }

  if (!usable) {
    return {
      quality: 'metadata_only',
      coverageStatus: 'failed',
      jobStatus: 'failed',
      extractionStatus: 'failed',
      errorCode:
        article.wordCount < MIN_FULL_TEXT_WORDS || article.charCount < MIN_FULL_TEXT_CHARS
          ? 'metadata_only'
          : 'too_few_paragraphs',
    };
  }

  if (article.status === 'failed') {
    return {
      quality: 'blocked',
      coverageStatus: 'blocked',
      jobStatus: 'failed',
      extractionStatus: 'blocked',
      errorCode: 'extraction_failed',
    };
  }

  if (article.status === 'needs_review') {
    return {
      quality: 'partial_text',
      coverageStatus: 'partial',
      jobStatus: 'partial',
      extractionStatus: 'needs_review',
      errorCode: 'needs_review',
    };
  }

  if (article.status === 'partial') {
    return {
      quality: 'partial_text',
      coverageStatus: 'partial',
      jobStatus: 'partial',
      extractionStatus: 'partial',
      errorCode: 'extraction_incomplete',
    };
  }

  return {
    quality: 'full_text',
    coverageStatus: 'completed',
    jobStatus: 'completed',
    extractionStatus: 'complete',
    errorCode: null,
  };
}

export function evaluateMediaFailure(errorCode: string): MediaQualityAssessment {
  const blockedCodes = new Set([
    'http_status_401',
    'http_status_403',
    'http_status_451',
    'unsupported_content_type',
    'response_too_large',
    'media_record_archived',
    'media_record_url_missing',
  ]);

  if (blockedCodes.has(errorCode) || errorCode.includes('paywall')) {
    return {
      quality: 'blocked',
      coverageStatus: 'blocked',
      jobStatus: 'failed',
      extractionStatus: 'blocked',
      errorCode,
    };
  }

  if (errorCode === 'no_chunks') {
    return {
      quality: 'metadata_only',
      coverageStatus: 'failed',
      jobStatus: 'failed',
      extractionStatus: 'failed',
      errorCode,
    };
  }

  return {
    quality: 'blocked',
    coverageStatus: 'failed',
    jobStatus: 'failed',
    extractionStatus: 'failed',
    errorCode,
  };
}
