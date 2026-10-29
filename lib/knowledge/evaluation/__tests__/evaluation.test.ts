/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildUnframedManifest,
  sha256Hex,
} from '../../unframed';
import { SourceHashMismatchError } from '../../types';
import {
  buildBm25Index,
  searchBm25,
} from '../bm25';
import {
  evaluateQuestions,
  serializeEvaluationReport,
} from '../evaluate';
import type { EvaluationQuestion } from '../types';

const SYNTHETIC_SOURCE = [
  '# UNFRAMED',
  '## Table of Contents',
  '## INTRODUCTION: UNFRAMED',
  '### Chapter 01: TOC PLACEHOLDER',
  'INTRODUCTION: UNFRAMED',
  '',
  'alphauniqueterm intro paragraph.',
  '',
  '# PART I',
  'CHAPTER 01: FIRST',
  '',
  'bravouniqueterm first paragraph.',
  '',
  'CHAPTER 02: SECOND',
  '',
  'charlieuniqueterm second paragraph.',
  '',
  'CHAPTER 03: THIRD',
  '',
  'deltaterm third paragraph.',
].join('\n');

function buildSynthetic() {
  return buildUnframedManifest({
    raw: SYNTHETIC_SOURCE,
    expectedSha256: sha256Hex(SYNTHETIC_SOURCE),
  });
}

function chunkIdForSection(
  build: ReturnType<typeof buildSynthetic>,
  sectionIndex: number,
): string {
  const chunk = build.chunks.find((candidate) => candidate.sectionIndex === sectionIndex);

  if (!chunk) throw new Error('synthetic section has no chunk');

  return chunk.id;
}

function sectionIndexForChapter(
  build: ReturnType<typeof buildSynthetic>,
  chapterPrefix: string,
): number {
  const section = build.document.sections.find((candidate) =>
    candidate.heading.startsWith(chapterPrefix),
  );

  if (!section) throw new Error('synthetic chapter not found');

  return section.index;
}

function makeQuestions(build: ReturnType<typeof buildSynthetic>): EvaluationQuestion[] {
  const chapter1 = sectionIndexForChapter(build, 'CHAPTER 01');
  const chapter2 = sectionIndexForChapter(build, 'CHAPTER 02');
  const chapter3 = sectionIndexForChapter(build, 'CHAPTER 03');

  return [
    {
      id: 'Q1',
      category: 'direct_factual',
      question: 'bravouniqueterm',
      answerability: 'answerable',
      expectedAnswerLabel: 'first',
      relevantChunkIds: [chunkIdForSection(build, chapter1)],
      relevantSectionIndexes: [chapter1],
    },
    {
      id: 'Q2',
      category: 'specific_passage',
      question: 'bravouniqueterm deltaterm',
      answerability: 'answerable',
      expectedAnswerLabel: 'third',
      relevantChunkIds: [chunkIdForSection(build, chapter3)],
      relevantSectionIndexes: [chapter3],
    },
    {
      id: 'Q3',
      category: 'structure',
      question: 'charlieuniqueterm',
      answerability: 'answerable',
      expectedAnswerLabel: 'second',
      relevantSectionIndexes: [chapter2],
    },
    {
      id: 'Q4',
      category: 'absent',
      question: 'zuluuniqueterm',
      answerability: 'unanswerable',
      expectedAnswerLabel: 'not present',
    },
    {
      id: 'Q5',
      category: 'misleading',
      question: 'alphauniqueterm',
      answerability: 'unanswerable',
      expectedAnswerLabel: 'misleading',
    },
    {
      id: 'Q6',
      category: 'ambiguous',
      question: 'bravouniqueterm',
      answerability: 'unverified',
    },
    {
      id: 'Q7',
      category: 'direct_factual',
      question: 'bravouniqueterm',
      answerability: 'answerable',
      relevantChunkIds: ['chk_missing'],
    },
  ];
}

describe('Phase C local BM25 evaluation', () => {
  it('produces deterministic ranking for identical inputs', () => {
    const build = buildSynthetic();
    const index = buildBm25Index(build.chunks);
    const first = searchBm25(index, 'bravouniqueterm deltaterm', 3);
    const second = searchBm25(index, 'bravouniqueterm deltaterm', 3);

    expect(second.hits.map((hit) => hit.chunkId)).toEqual(
      first.hits.map((hit) => hit.chunkId),
    );
    expect(second.hits.map((hit) => hit.score)).toEqual(
      first.hits.map((hit) => hit.score),
    );
  });

  it('respects top-k and preserves ranking order', () => {
    const build = buildSynthetic();
    const index = buildBm25Index(build.chunks);
    const topOne = searchBm25(index, 'bravouniqueterm deltaterm', 1);
    const topThree = searchBm25(index, 'bravouniqueterm deltaterm', 3);

    expect(topOne.hits).toHaveLength(1);
    expect(topThree.hits.length).toBeGreaterThanOrEqual(2);
    expect(topThree.hits[0].chunkId).toBe(topOne.hits[0].chunkId);
  });

  it('calculates Recall@k, Precision@k and MRR from fixed labels', () => {
    const build = buildSynthetic();
    const report = evaluateQuestions({
      build,
      questions: makeQuestions(build),
      topK: 3,
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });

    expect(report.metrics.answerableVerifiedCount).toBe(3);
    expect(report.metrics.unanswerableVerifiedCount).toBe(2);
    expect(report.metrics.unverifiedCount).toBe(1);
    expect(report.metrics.invalidGroundTruthCount).toBe(1);
    expect(report.metrics.recallAtK).toBe(1);
    expect(report.metrics.precisionAtK).toBeCloseTo(1 / 3, 10);
    expect(report.metrics.mrr).toBeCloseTo((1 + 0.5 + 1) / 3, 10);
    expect(report.metrics.retrievalSuccessRate).toBe(1);
  });

  it('distinguishes no relevant result from a successful query', () => {
    const build = buildSynthetic();
    const index = buildBm25Index(build.chunks);
    const noMatch = searchBm25(index, 'zuluuniqueterm', 3);
    const match = searchBm25(index, 'bravouniqueterm', 3);

    expect(noMatch.status).toBe('no_match');
    expect(noMatch.hits).toHaveLength(0);
    expect(match.status).toBe('results');
    expect(match.hits.length).toBeGreaterThan(0);
  });

  it('reports false positives for intentionally unanswerable questions', () => {
    const build = buildSynthetic();
    const report = evaluateQuestions({
      build,
      questions: makeQuestions(build),
      topK: 3,
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });

    const misleading = report.questions.find((question) => question.id === 'Q5');

    expect(misleading?.falsePositive).toBe(true);
    // Q4 has no lexical match; Q5 matches the introduction. One of two
    // intentionally unanswerable questions is therefore a false positive.
    expect(report.metrics.falsePositiveRate).toBe(0.5);
  });

  it('uses stable chunk-index tie-breaking', () => {
    const build = buildSynthetic();
    const index = buildBm25Index(build.chunks);
    const result = searchBm25(index, 'bravouniqueterm deltaterm', 3);
    const chapter1 = sectionIndexForChapter(build, 'CHAPTER 01');
    const chapter3 = sectionIndexForChapter(build, 'CHAPTER 03');

    expect(result.hits[0].sectionIndex).toBe(chapter1);
    expect(result.hits[1].sectionIndex).toBe(chapter3);
  });

  it('fails closed on a source hash mismatch', () => {
    expect(() =>
      buildUnframedManifest({
        raw: SYNTHETIC_SOURCE,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(SourceHashMismatchError);
  });

  it('marks invalid ground-truth references as unscored', () => {
    const build = buildSynthetic();
    const report = evaluateQuestions({
      build,
      questions: makeQuestions(build),
      topK: 3,
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });
    const invalid = report.questions.find((question) => question.id === 'Q7');

    expect(invalid?.groundTruthValid).toBe(false);
    expect(invalid?.scored).toBe(false);
    expect(invalid?.excludedReason).toBe('invalid_ground_truth');
    expect(report.checks.groundTruthReferencesValid).toBe(false);
  });

  it('keeps section-boundary and offset diagnostics clean', () => {
    const build = buildSynthetic();
    const report = evaluateQuestions({
      build,
      questions: makeQuestions(build),
      topK: 3,
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });

    expect(report.diagnostics.chunksCrossingSectionBoundaryCount).toBe(0);
    expect(report.diagnostics.invalidOffsetCount).toBe(0);
    expect(report.checks.sectionBoundariesIntact).toBe(true);
    expect(report.checks.offsetsValid).toBe(true);
  });

  it('does not emit passage text in the metadata-only report', () => {
    const marker = 'TOP_SECRET_MARKER_12345';
    const raw = [
      '# UNFRAMED',
      '## Table of Contents',
      '## INTRODUCTION: UNFRAMED',
      '### Chapter 01: TOC PLACEHOLDER',
      'INTRODUCTION: UNFRAMED',
      '',
      `${marker} ${'ordinary words '.repeat(20)}`,
    ].join('\n');
    const build = buildUnframedManifest({
      raw,
      expectedSha256: sha256Hex(raw),
    });
    const report = evaluateQuestions({
      build,
      questions: [
        {
          id: 'TEXT-CHECK',
          category: 'direct_factual',
          question: 'ordinary words',
          answerability: 'answerable',
          relevantSectionIndexes: [0],
        },
      ],
      topK: 1,
      expectedSourceSha256: sha256Hex(raw),
    });
    const serialized = serializeEvaluationReport(report);

    expect(serialized).not.toContain(marker);
    expect(report.checks.noPassageTextInReport).toBe(true);
  });
});
