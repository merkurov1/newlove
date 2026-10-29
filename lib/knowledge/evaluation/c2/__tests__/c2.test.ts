/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildUnframedManifest,
  sha256Hex,
} from '../../../unframed';
import { SourceHashMismatchError } from '../../../types';
import { createBaselineRetriever, createImprovedRetriever, DEFAULT_IMPROVED_CONFIG } from '../../c1/retrieval';
import type { C1Question } from '../../c1/types';
import { evaluatePhaseC2, serializeC2Report } from '../evaluate';
import { reciprocalRankFusion } from '../hybrid';
import { C2_QUESTIONS, hashC2QuestionSet } from '../questions';
import { detectSemanticAvailability } from '../semanticAvailability';
import { splitC2Questions } from '../split';

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

function build(raw: string) {
  return buildUnframedManifest({
    raw,
    expectedSha256: sha256Hex(raw),
  });
}

function sectionIndexForChapter(
  buildResult: ReturnType<typeof build>,
  chapterPrefix: string,
): number {
  const section = buildResult.document.sections.find((candidate) =>
    candidate.heading.startsWith(chapterPrefix),
  );

  if (!section) throw new Error('synthetic chapter not found');

  return section.index;
}

function chunkIdForSection(
  buildResult: ReturnType<typeof build>,
  sectionIndex: number,
): string {
  const chunk = buildResult.chunks.find(
    (candidate) => candidate.sectionIndex === sectionIndex,
  );

  if (!chunk) throw new Error('synthetic section has no chunk');

  return chunk.id;
}

function questionsFor(buildResult: ReturnType<typeof build>): C1Question[] {
  const chapter1 = sectionIndexForChapter(buildResult, 'CHAPTER 01');
  const chapter2 = sectionIndexForChapter(buildResult, 'CHAPTER 02');
  const chapter3 = sectionIndexForChapter(buildResult, 'CHAPTER 03');

  return [
    {
      id: 'Q1',
      category: 'direct_factual',
      language: 'en',
      group: 'same-group',
      question: 'bravouniqueterm',
      answerability: 'answerable',
      relevantChunkIds: [chunkIdForSection(buildResult, chapter1)],
      relevantSectionIndexes: [chapter1],
    },
    {
      id: 'Q2',
      category: 'specific_passage',
      language: 'en',
      group: 'same-group',
      question: 'bravouniqueterm deltaterm',
      answerability: 'answerable',
      relevantChunkIds: [chunkIdForSection(buildResult, chapter3)],
      relevantSectionIndexes: [chapter3],
    },
    {
      id: 'Q3',
      category: 'structure',
      language: 'en',
      group: 'same-group',
      question: 'charlieuniqueterm',
      answerability: 'answerable',
      relevantSectionIndexes: [chapter2],
    },
    {
      id: 'Q4',
      category: 'absent',
      language: 'en',
      group: 'same-group',
      question: 'zuluuniqueterm',
      answerability: 'unanswerable',
    },
    {
      id: 'Q5',
      category: 'misleading',
      language: 'en',
      group: 'same-group',
      question: 'alphauniqueterm',
      answerability: 'unanswerable',
    },
    {
      id: 'Q6',
      category: 'ambiguous',
      language: 'en',
      group: 'same-group',
      question: 'bravouniqueterm',
      answerability: 'unverified',
    },
    {
      id: 'Q7',
      category: 'direct_factual',
      language: 'en',
      group: 'same-group',
      question: 'bravouniqueterm',
      answerability: 'answerable',
      relevantChunkIds: ['chk_missing'],
    },
  ];
}

describe('Phase C.2 retrieval bake-off', () => {
  it('keeps deterministic lexical rankings for both BM25 strategies', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const retrievers = [
      createBaselineRetriever(buildResult),
      createImprovedRetriever(buildResult, {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
      }),
    ];

    for (const retriever of retrievers) {
      const first = retriever('bravouniqueterm deltaterm', 5);
      const second = retriever('bravouniqueterm deltaterm', 5);

      expect(second.outcome).toBe(first.outcome);
      expect(second.hits.map((hit) => hit.chunkId)).toEqual(
        first.hits.map((hit) => hit.chunkId),
      );
      expect(second.hits.map((hit) => hit.score)).toEqual(
        first.hits.map((hit) => hit.score),
      );
    }
  });

  it('fuses ranks deterministically with stable tie-breaking', () => {
    const first = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a', 'd'],
    ]);
    const second = reciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a', 'd'],
    ]);

    expect(second).toEqual(first);
    expect(first.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(first.find((entry) => entry.id === 'a')?.componentRanks).toEqual([1, 2]);
    expect(first.find((entry) => entry.id === 'b')?.componentRanks).toEqual([2, 1]);
  });

  it('reports semantic strategy as blocked rather than fabricating results', () => {
    const availability = detectSemanticAvailability();

    expect(availability.available).toBe(false);
    expect(availability.model.multilingual).toBe(false);
    expect(availability.blocker).toContain('no local ONNX/embedding runtime');
  });

  it('validates ground truth and computes abstention/false-positive metrics', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const report = evaluatePhaseC2({
      build: buildResult,
      questions: questionsFor(buildResult),
      topK: 5,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
      },
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });
    const strategyA = report.strategies.find((strategy) => strategy.strategy === 'A');
    const testMetrics = strategyA?.bySplit?.test?.metrics;

    expect(testMetrics?.answerableCount).toBe(3);
    expect(testMetrics?.unanswerableCount).toBe(2);
    expect(testMetrics?.invalidGroundTruthCount).toBe(1);
    expect(testMetrics?.recallAt5).toBe(1);
    expect(testMetrics?.precisionAt5).toBeCloseTo(1 / 5, 10);
    expect(testMetrics?.falsePositiveRate).toBe(0.5);
    expect(testMetrics?.correctAbstentionRate).toBe(0.5);
    expect(report.checks.questionSetValid).toBe(false);
  });

  it('keeps fact groups in exactly one split', () => {
    const split = splitC2Questions(C2_QUESTIONS);
    const groups = new Map<string, string>();

    for (const [name, questions] of Object.entries({
      dev: split.dev,
      calibration: split.calibration,
      test: split.test,
    })) {
      for (const question of questions) {
        const existing = groups.get(question.group);

        if (existing) expect(existing).toBe(name);
        else groups.set(question.group, name);
      }
    }

    expect(split.summary.devQuestionCount).toBeGreaterThan(0);
    expect(split.summary.calibrationQuestionCount).toBeGreaterThan(0);
    expect(split.summary.testQuestionCount).toBeGreaterThan(0);
  });

  it('selects abstention thresholds from calibration only', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const report = evaluatePhaseC2({
      build: buildResult,
      questions: questionsFor(buildResult),
      topK: 5,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
      },
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });

    expect(report.abstentionPolicy?.selection).toBe('calibration-only');
    expect(report.abstentionPolicy?.threshold).toBeGreaterThanOrEqual(3);
    expect(report.checks.factGroupIntegrity).toBe(true);
  });

  it('has unique question IDs and a complete disjoint split', () => {
    const split = splitC2Questions(C2_QUESTIONS);
    const ids = C2_QUESTIONS.map((question) => question.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      split.dev.length + split.calibration.length + split.test.length,
    ).toBe(C2_QUESTIONS.length);
  });

  it('fails closed on source hash mismatch', () => {
    expect(() =>
      buildUnframedManifest({
        raw: SYNTHETIC_SOURCE,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(SourceHashMismatchError);
  });

  it('has a stable question-set hash', () => {
    expect(hashC2QuestionSet()).toBe(hashC2QuestionSet());
  });

  it('does not emit passage text in the metadata-only report', () => {
    const marker = 'TOP_SECRET_MARKER_C2';
    const raw = [
      '# UNFRAMED',
      '## Table of Contents',
      '## INTRODUCTION: UNFRAMED',
      '### Chapter 01: TOC PLACEHOLDER',
      'INTRODUCTION: UNFRAMED',
      '',
      `${marker} ${'ordinary words '.repeat(20)}`,
    ].join('\n');
    const buildResult = build(raw);
    const report = evaluatePhaseC2({
      build: buildResult,
      questions: [
        {
          id: 'TEXT-CHECK',
          category: 'direct_factual',
          language: 'en',
          group: 'text-check',
          question: 'ordinary words',
          answerability: 'answerable',
          relevantSectionIndexes: [0],
        },
      ],
      topK: 5,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
      },
      expectedSourceSha256: sha256Hex(raw),
    });
    const serialized = serializeC2Report(report);

    expect(serialized).not.toContain(marker);
    expect(report.checks.noPassageTextInReport).toBe(true);
    expect(report.diagnostics.invalidOffsetCount).toBe(0);
    expect(report.diagnostics.chunksCrossingSectionBoundaryCount).toBe(0);
  });
});
