/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  buildUnframedManifest,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
} from '../unframed';
import {
  ManuscriptStructureError,
  SourceHashMismatchError,
  type UnframedBuild,
} from '../types';

const realRaw = fs.readFileSync(path.join(process.cwd(), UNFRAMED_SOURCE_PATH), 'utf8');
const realBuild = buildUnframedManifest({
  raw: realRaw,
  expectedSha256: UNFRAMED_EXPECTED_SHA256,
});

function syntheticSource(body: string): string {
  return [
    '# UNFRAMED',
    '## Table of Contents',
    '## INTRODUCTION: UNFRAMED',
    '### Chapter 01: TOC PLACEHOLDER',
    'INTRODUCTION: UNFRAMED',
    '',
    body,
  ].join('\n');
}

function syntheticBook(): string {
  return syntheticSource(
    [
      'Intro paragraph.',
      '',
      '# PART I',
      'CHAPTER 01: FIRST CHAPTER',
      '',
      'First chapter paragraph.',
      '',
      'CHAPTER 02: SECOND CHAPTER',
      '',
      'Second chapter paragraph.',
      '',
      '# PART II',
      'CHAPTER 03: THIRD CHAPTER',
      '',
      'Third chapter paragraph.',
      '',
      'EPILOGUE: ENDING',
      '',
      'Epilogue paragraph.',
    ].join('\n'),
  );
}

function buildSynthetic(body: string, maxChunkChars = 2_400): UnframedBuild {
  return buildUnframedManifest({
    raw: syntheticSource(body),
    maxChunkChars,
    overlapChars: 0,
  });
}

describe('UNFRAMED Phase B parser and chunker', () => {
  it('excludes the TOC and starts at the second introduction heading', () => {
    const build = buildSynthetic('Intro paragraph.');
    const bodyHeadingOffset =
      build.document.normalized.indexOf('\nINTRODUCTION: UNFRAMED') + 1;

    expect(build.document.bodyStart).toBe(bodyHeadingOffset);
    expect(build.document.bodyStart).toBeGreaterThan(
      build.document.normalized.indexOf('## Table of Contents'),
    );
    expect(build.document.sections[0].type).toBe('introduction');
    expect(
      build.document.sections.every(
        (section) => section.charStart >= build.document.bodyStart,
      ),
    ).toBe(true);
    expect(
      build.manifest.sections.some((section) => section.heading.startsWith('##')),
    ).toBe(false);
  });

  it('recognizes PART, CHAPTER, INTRODUCTION, PROLOGUE and EPILOGUE', () => {
    expect(realBuild.manifest.partCount).toBe(4);
    expect(realBuild.manifest.chapterCount).toBe(46);
    expect(realBuild.manifest.sectionCount).toBe(49);

    const types = realBuild.manifest.sections.map((section) => section.type);

    expect(types.filter((type) => type === 'introduction')).toHaveLength(1);
    expect(types.filter((type) => type === 'prologue')).toHaveLength(1);
    expect(types.filter((type) => type === 'epilogue')).toHaveLength(1);
    expect(types.filter((type) => type === 'chapter')).toHaveLength(46);
  });

  it('does not create chunks that cross section boundaries', () => {
    for (const chunk of realBuild.chunks) {
      const section = realBuild.document.sections[chunk.sectionIndex];

      expect(section).toBeDefined();
      expect(chunk.charStart).toBeGreaterThanOrEqual(section.bodyStart);
      expect(chunk.charEnd).toBeLessThanOrEqual(section.charEnd);
      expect(chunk.sectionPath).toEqual(section.sectionPath);
    }
  });

  it('keeps chunk IDs and the manifest deterministic across repeated builds', () => {
    const second = buildUnframedManifest({
      raw: realRaw,
      expectedSha256: UNFRAMED_EXPECTED_SHA256,
    });

    expect(second.manifest.manifestHash).toBe(realBuild.manifest.manifestHash);
    expect(second.manifest.chunks.map((chunk) => chunk.id)).toEqual(
      realBuild.manifest.chunks.map((chunk) => chunk.id),
    );
    expect(new Set(realBuild.manifest.chunks.map((chunk) => chunk.id)).size).toBe(
      realBuild.manifest.chunks.length,
    );
  });

  it('preserves exact offsets and section paths', () => {
    for (const chunk of realBuild.chunks) {
      expect(realBuild.document.normalized.slice(chunk.charStart, chunk.charEnd)).toBe(
        chunk.text,
      );
      expect(chunk.charCount).toBe(chunk.text.length);
      expect(chunk.lineStart).toBeGreaterThanOrEqual(1);
      expect(chunk.lineEnd).toBeGreaterThanOrEqual(chunk.lineStart);
    }

    const firstChapter = realBuild.document.sections.find(
      (section) => section.type === 'chapter',
    );
    const introduction = realBuild.document.sections.find(
      (section) => section.type === 'introduction',
    );
    const epilogue = realBuild.document.sections.find(
      (section) => section.type === 'epilogue',
    );

    expect(firstChapter?.sectionPath[0]).toMatch(/^PART /);
    expect(firstChapter?.sectionPath[1]).toMatch(/^CHAPTER \d{2}: /);
    expect(introduction?.sectionPath).toHaveLength(1);
    expect(epilogue?.sectionPath[epilogue.sectionPath.length - 1]).toMatch(
      /^EPILOGUE: /,
    );
  });

  it('splits an oversized paragraph at sentence boundaries when possible', () => {
    const sentence = 'Alpha beta gamma delta epsilon zeta eta theta. ';
    const build = buildSynthetic(sentence.repeat(8), 150);

    expect(build.chunks.length).toBeGreaterThan(1);

    for (const chunk of build.chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(150);
      expect(chunk.text.endsWith('.')).toBe(true);
    }

    expect(build.checks.maxChunkCharsRespected).toBe(true);
  });

  it('hard-splits an unpunctuated oversized paragraph at word boundaries', () => {
    const words = Array.from({ length: 80 }, (_, index) => `word${index}`);
    const build = buildSynthetic(words.join(' '), 100);

    expect(build.chunks.length).toBeGreaterThan(1);

    for (const chunk of build.chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(100);
      expect(chunk.text).toBe(chunk.text.trim());
      expect(chunk.text.split(/\s+/).every((word) => words.includes(word))).toBe(true);
    }
  });

  it('is idempotent on an unchanged repeat run', () => {
    const first = buildSynthetic(syntheticBook());
    const second = buildSynthetic(syntheticBook());

    expect(second.manifest.manifestHash).toBe(first.manifest.manifestHash);
    expect(second.manifest.chunkCount).toBe(first.manifest.chunkCount);
    expect(second.manifest.chunks.map((chunk) => chunk.id)).toEqual(
      first.manifest.chunks.map((chunk) => chunk.id),
    );
    expect(Object.values(first.checks).every(Boolean)).toBe(true);
  });

  it('fails closed on a source hash mismatch', () => {
    expect(() =>
      buildUnframedManifest({
        raw: realRaw,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(SourceHashMismatchError);

    try {
      buildUnframedManifest({
        raw: realRaw,
        expectedSha256: '0'.repeat(64),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SourceHashMismatchError);
      expect((error as SourceHashMismatchError).code).toBe('source_hash_mismatch');
    }
  });

  it('fails closed when the body heading is missing', () => {
    expect(() =>
      buildUnframedManifest({
        raw: '# UNFRAMED\n\n## Table of Contents\n',
      }),
    ).toThrow(ManuscriptStructureError);
  });
});
