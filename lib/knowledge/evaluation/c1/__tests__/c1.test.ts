/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildUnframedManifest,
  sha256Hex,
} from '../../../unframed';
import { SourceHashMismatchError } from '../../../types';
import {
  evaluatePhaseC1,
  serializeC1Report,
} from '../evaluate';
import type { C1Question } from '../types';
import {
  createBaselineRetriever,
  createImprovedRetriever,
  DEFAULT_IMPROVED_CONFIG,
  DEFAULT_STOPWORDS,
} from '../retrieval';
import { splitC1Questions } from '../split';

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

const TIE_SOURCE = [
  '# UNFRAMED',
  '## Table of Contents',
  '## INTRODUCTION: UNFRAMED',
  '### Chapter 01: TOC PLACEHOLDER',
  'INTRODUCTION: UNFRAMED',
  '',
  '# PART I',
  'CHAPTER 01: FIRST',
  '',
  'tieuniqueterm repeated passage.',
  '',
  'CHAPTER 02: SECOND',
  '',
  'tieuniqueterm repeated passage.',
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

function questionsFor(
  buildResult: ReturnType<typeof build>,
): C1Question[] {
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

describe('Phase C.1 retrieval quality', () => {
  it('keeps deterministic ranking for baseline and improved retrieval', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const baseline = createBaselineRetriever(buildResult);
    const improved = createImprovedRetriever(buildResult, {
      ...DEFAULT_IMPROVED_CONFIG,
      minScore: 0,
    });

    for (const retriever of [baseline, improved]) {
      const first = retriever('bravouniqueterm deltaterm', 3);
      const second = retriever('bravouniqueterm deltaterm', 3);

      expect(second.outcome).toBe(first.outcome);
      expect(second.hits.map((hit) => hit.chunkId)).toEqual(
        first.hits.map((hit) => hit.chunkId),
      );
      expect(second.hits.map((hit) => hit.score)).toEqual(
        first.hits.map((hit) => hit.score),
      );
    }
  });

  it('respects top-k and preserves ranking order', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const baseline = createBaselineRetriever(buildResult);
    const topOne = baseline('bravouniqueterm deltaterm', 1);
    const topThree = baseline('bravouniqueterm deltaterm', 3);

    expect(topOne.hits).toHaveLength(1);
    expect(topThree.hits.length).toBeGreaterThanOrEqual(2);
    expect(topThree.hits[0].chunkId).toBe(topOne.hits[0].chunkId);
  });

  it('calculates Recall@k, Precision@k, MRR, abstention and false-positive metrics', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const report = evaluatePhaseC1({
      build: buildResult,
      questions: questionsFor(buildResult),
      topK: 3,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
      },
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });
    const metrics = report.test.baseline.metrics;

    expect(metrics.answerableCount).toBe(3);
    expect(metrics.unanswerableCount).toBe(2);
    expect(metrics.unverifiedCount).toBe(1);
    expect(metrics.invalidGroundTruthCount).toBe(1);
    expect(metrics.recallAt5).toBe(1);
    expect(metrics.precisionAt5).toBeCloseTo(1 / 3, 10);
    expect(metrics.mrr).toBeCloseTo((1 + 0.5 + 1) / 3, 10);
    expect(metrics.falsePositiveRate).toBe(0.5);
    expect(metrics.correctAbstentionRate).toBe(0.5);
  });

  it('distinguishes relevant, weak and no-match outcomes', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const strict = createImprovedRetriever(buildResult, {
      ...DEFAULT_IMPROVED_CONFIG,
      minScore: 100,
    });
    const permissive = createImprovedRetriever(buildResult, {
      ...DEFAULT_IMPROVED_CONFIG,
      minScore: 0,
    });

    expect(permissive('bravouniqueterm', 3).outcome).toBe('relevant_results');
    expect(strict('bravouniqueterm', 3).outcome).toBe('weak_match');
    expect(strict('zuluuniqueterm', 3).outcome).toBe('no_match');
  });

  it('uses stable chunk-index tie-breaking', () => {
    const buildResult = build(TIE_SOURCE);
    const retriever = createBaselineRetriever(buildResult);
    const result = retriever('tieuniqueterm', 3);

    expect(result.hits.length).toBeGreaterThanOrEqual(2);
    expect(result.hits[0].sectionIndex).toBeLessThan(result.hits[1].sectionIndex);
  });

  it('keeps fact groups in one deterministic split', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const questions = questionsFor(buildResult).map((question, index) => ({
      ...question,
      group: `group-${index % 3}`,
    }));
    const first = splitC1Questions(questions);
    const second = splitC1Questions(questions);

    expect(second.summary).toEqual(first.summary);
    const groupSplit = new Map<string, string>();

    for (const question of [...first.dev, ...first.test]) {
      const split = first.dev.some((item) => item.id === question.id)
        ? 'dev'
        : 'test';
      const existing = groupSplit.get(question.group);

      if (existing) expect(split).toBe(existing);
      else groupSplit.set(question.group, split);
    }
  });

  it('abstains on unanswerable questions when the calibrated threshold rejects weak matches', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const questions = questionsFor(buildResult).filter(
      (question) => question.id === 'Q5',
    );
    const report = evaluatePhaseC1({
      build: buildResult,
      questions,
      topK: 3,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 100,
      },
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });

    expect(report.test.improved.metrics.falsePositiveRate).toBe(0);
    expect(report.test.improved.metrics.correctAbstentionRate).toBe(1);
  });

  it('fails closed on source hash mismatch', () => {
    expect(() =>
      buildUnframedManifest({
        raw: SYNTHETIC_SOURCE,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(SourceHashMismatchError);
  });

  it('marks invalid ground truth as unscored', () => {
    const buildResult = build(SYNTHETIC_SOURCE);
    const report = evaluatePhaseC1({
      build: buildResult,
      questions: questionsFor(buildResult),
      topK: 3,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
      },
      expectedSourceSha256: sha256Hex(SYNTHETIC_SOURCE),
    });
    const invalid = report.test.baseline.questions.find(
      (question) => question.id === 'Q7',
    );

    expect(invalid?.groundTruthValid).toBe(false);
    expect(invalid?.scored).toBe(false);
    expect(invalid?.excludedReason).toBe('invalid_ground_truth');
    expect(report.checks.questionSetValid).toBe(false);
  });

  it('keeps section boundaries and metadata-only output intact', () => {
    const marker = 'TOP_SECRET_MARKER_C1';
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
    const report = evaluatePhaseC1({
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
      topK: 1,
      improvedConfig: {
        ...DEFAULT_IMPROVED_CONFIG,
        minScore: 0,
        stopwords: DEFAULT_STOPWORDS,
      },
      expectedSourceSha256: sha256Hex(raw),
    });
    const serialized = serializeC1Report(report);

    expect(report.diagnostics.chunksCrossingSectionBoundaryCount).toBe(0);
    expect(report.diagnostics.invalidOffsetCount).toBe(0);
    expect(serialized).not.toContain(marker);
    expect(report.checks.noPassageTextInReport).toBe(true);
  });
});
