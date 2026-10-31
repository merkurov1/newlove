/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  BrainSourceError,
  normalizePlainText,
  normalizePublishedAt,
  sha256Hex,
  sourceObjectPathFromPath,
  sourcePathForStorage,
  validateMetadataOverride,
  validatePastedText,
  validateTxtBuffer,
} from '../sourceValidation';

describe('Brain source validation', () => {
  it('normalizes line endings and preserves Unicode text', () => {
    const value = normalizePlainText('\uFEFFПривет\r\n\r\nМир  \r\n');

    expect(value).toBe('Привет\n\nМир');
    expect(sha256Hex(value)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects invalid UTF-8 and binary TXT files', () => {
    expect(() => validateTxtBuffer(Buffer.from([0xff, 0xfe, 0xfd]))).toThrow(BrainSourceError);
    expect(() => validateTxtBuffer(Buffer.from('hello\u0000world'))).toThrow(BrainSourceError);
  });

  it('accepts Unicode pasted text and rejects empty/NUL input', () => {
    const accepted = validatePastedText('Привет, мир. 🜂\n\nВторой абзац.');

    expect(accepted.normalized).toContain('Привет');
    expect(() => validatePastedText('   ')).toThrow(BrainSourceError);
    expect(() => validatePastedText('nul\u0000byte')).toThrow(BrainSourceError);
  });

  it('validates metadata overrides and dates', () => {
    expect(validateMetadataOverride({ title: ' Title ', author: ' Author ', language: 'RU' })).toEqual(
      {
        title: 'Title',
        author: 'Author',
        publishedAt: null,
        language: 'ru',
      }
    );
    expect(normalizePublishedAt('2025-02-28')).toBe('2025-02-28T00:00:00.000Z');
    expect(() => normalizePublishedAt('2025-02-30')).toThrow(BrainSourceError);
    expect(() => validateMetadataOverride({ language: 'not a language!' })).toThrow(
      BrainSourceError
    );
  });

  it('keeps private storage paths deterministic and rejects public-looking paths', () => {
    const sha = sha256Hex('file');
    const full = sourcePathForStorage(sha, 'pdf');

    expect(full).toBe(`brain-sources/${sha.slice(0, 2)}/${sha}.pdf`);
    expect(sourceObjectPathFromPath(full)).toBe(`${sha.slice(0, 2)}/${sha}.pdf`);
    expect(sourceObjectPathFromPath(`https://example.com/${sha}.pdf`)).toBeNull();
  });
});
