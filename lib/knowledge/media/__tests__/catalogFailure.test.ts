/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { classifyMediaFailure } from '../catalog';

describe('Media failure classification', () => {
  it.each([
    ['http_status_403', 'blocked', 'blocked', 'access_blocked', false],
    ['http_status_401', 'blocked', 'blocked', 'access_blocked', false],
    ['paywall_detected', 'blocked', 'blocked', 'paywall', false],
    ['http_status_402', 'failed', 'blocked', 'paywall', false],
    ['http_status_404', 'failed', 'blocked', 'source_unavailable', false],
    ['fetch_timeout', 'failed', 'blocked', 'temporary', true],
    ['fetch_failed', 'failed', 'blocked', 'fetch_error', true],
    ['http_status_503', 'failed', 'blocked', 'fetch_error', true],
    ['embedding_failed', 'failed', 'partial_text', 'embedding_error', true],
    ['metadata_only', 'failed', 'metadata_only', 'metadata_only', false],
    ['truncated_content', 'partial', 'partial_text', 'incomplete_text', false],
    ['needs_review', 'partial', 'partial_text', 'manual_review', false],
  ] as const)(
    'classifies %s as %s (retryable=%s)',
    (errorCode, coverageStatus, textQuality, expected, retryable) => {
      const result = classifyMediaFailure({
        errorCode,
        coverageStatus,
        textQuality,
        hasDocument: true,
        chunkCount: textQuality === 'metadata_only' || textQuality === 'blocked' ? 0 : 4,
      });

      expect(result.class).toBe(expected);
      expect(result.retryable).toBe(retryable);
    }
  );

  it('does not retry a missing Media link', () => {
    const result = classifyMediaFailure({
      hasDocument: false,
      errorCode: null,
      textQuality: null,
    });

    expect(result.class).toBe('missing_media_link');
    expect(result.retryable).toBe(false);
  });

  it('retries an invalid analysis JSON only with a bounded budget', () => {
    const result = classifyMediaFailure({
      hasDocument: true,
      errorCode: 'deepseek_invalid_json',
      coverageStatus: 'completed',
      textQuality: 'full_text',
    });

    expect(result.class).toBe('parser_error');
    expect(result.retryable).toBe(true);
  });
});
