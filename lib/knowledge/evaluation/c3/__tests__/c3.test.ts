/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  buildUnframedManifest,
  sha256Hex,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
} from '../../../unframed';
import { SourceHashMismatchError } from '../../../types';
import { createImprovedRetriever, DEFAULT_IMPROVED_CONFIG } from '../../c1/retrieval';
import { computeFeatures } from '../features';
import { accepts } from '../policies';
import { evaluatePhaseC3, serializeC3Report } from '../evaluate';
import { C3_QUESTIONS } from '../questions';
import { splitC3Questions } from '../split';
import type { C3QuestionResult } from '../types';

const realRaw = fs.readFileSync(
  path.join(process.cwd(), UNFRAMED_SOURCE_PATH),
  'utf8',
);
const realBuild = buildUnframedManifest({
  raw: realRaw,
  expectedSha256: UNFRAMED_EXPECTED_SHA256,
});
const realReport = evaluatePhaseC3({
  build: realBuild,
  questions: C3_QUESTIONS,
  topK: 5,
  expectedSourceSha256: UNFRAMED_EXPECTED_SHA256,
});

const syntheticRaw = [
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
].join('\n');

function syntheticBuild() {
  return buildUnframedManifest({
    raw: syntheticRaw,
    expectedSha256: sha256Hex(syntheticRaw),
  });
}

function syntheticResult(
  buildResult: ReturnType<typeof syntheticBuild>,
): C3QuestionResult {
  const retriever = createImprovedRetriever(buildResult, {
    ...DEFAULT_IMPROVED_CONFIG,
    minScore: 0,
  });
  const retrieval = retriever('bravouniqueterm', 5);
  const hit = retrieval.hits[0];

  return {
    id: 'Q',
    category: 'direct_factual',
    language: 'en',
    split: 'test',
    answerability: 'answerable',
    groundTruthValid: true,
    scored: true,
    excludedReason: null,
    baselineOutcome: retrieval.outcome,
    top: retrieval.hits.map((item, index) => ({
      rank: index + 1,
      chunkId: item.chunkId,
      sectionIndex: item.sectionIndex,
      sectionId: `section:${item.sectionIndex}`,
      chapterNumber: 1,
      score: item.score,
    })),
    relevantHit: true,
    firstRelevantRank: 1,
    recallAt1: 1,
    recallAt3: 1,
    recallAt5: 1,
    precisionAt5: 1 / 5,
    mrrContribution: 1,
    features: {
      topScore: hit?.score ?? 0,
      secondScore: 0,
      margin: hit?.score ?? 0,
      queryTokenCount: 1,
      distinctMatchedTerms: 1,
      coverage: 1,
      exactPhrase: true,
      expectedSectionMatch: true,
    },
    latencyMs: retrieval.latencyMs,
  };
}

describe('Phase C.3 evidence and abstention audit', () => {
  it('audits the C2 success metric against verified relevant chunks', () => {
    const aTest = realReport.c2Audit.find(
      (row) => row.strategy === 'A' && row.split === 'test',
    );

    expect(aTest).toBeDefined();
    expect(aTest?.reportedSuccess).toBeGreaterThan(
      aTest?.independentEvidenceSuccess ?? 0,
    );
    expect(aTest?.successDiscrepancy).toBeGreaterThan(0.05);
  });

  it('computes independent top-score, margin, coverage and phrase features', () => {
    const buildResult = syntheticBuild();
    const result = syntheticResult(buildResult);
    const features = computeFeatures(
      {
        id: 'Q',
        category: 'direct_factual',
        language: 'en',
        group: 'q',
        question: 'bravouniqueterm',
        answerability: 'answerable',
        relevantSectionIndexes: [1],
      },
      result,
      new Map(buildResult.chunks.map((chunk) => [chunk.id, chunk])),
    );

    expect(features.topScore).toBeGreaterThan(0);
    expect(features.margin).toBeGreaterThan(0);
    expect(features.coverage).toBe(1);
    expect(features.distinctMatchedTerms).toBe(1);
    expect(features.exactPhrase).toBe(true);
    expect(features.expectedSectionMatch).toBe(true);
  });

  it('tests each simple policy independently', () => {
    const buildResult = syntheticBuild();
    const result = syntheticResult(buildResult);

    expect(accepts('baseline_b', null, result)).toBe(true);
    expect(accepts('top_score', result.features.topScore * 0.5, result)).toBe(true);
    expect(accepts('top_score', 100, result)).toBe(false);
    expect(accepts('margin', result.features.margin * 0.5, result)).toBe(true);
    expect(accepts('coverage', 0.9, result)).toBe(true);
    expect(accepts('distinct_terms', 1, result)).toBe(true);
    expect(accepts('exact_phrase', null, result)).toBe(true);
    expect(
      accepts('top_score_and_coverage', result.features.topScore * 0.5, result),
    ).toBe(true);
  });

  it('reports the expected challenge-set counts and language balance', () => {
    expect(realReport.dataset.totalQuestions).toBe(50);
    expect(realReport.dataset.answerable).toBe(20);
    expect(realReport.dataset.unanswerable).toBe(20);
    expect(realReport.dataset.unverified).toBe(10);
    expect(realReport.dataset.languageCounts).toEqual({ en: 42, ru: 8 });
  });

  it('keeps fact groups in one split and reports exact split denominators', () => {
    const split = splitC3Questions(C3_QUESTIONS);
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

    expect(split.dev.length + split.calibration.length + split.test.length).toBe(
      C3_QUESTIONS.length,
    );
    expect(realReport.checks.factGroupIntegrity).toBe(true);
  });

  it('selects thresholds on calibration and evaluates them on held-out data', () => {
    const baseline = realReport.policies.find(
      (policy) => policy.policy === 'baseline_b',
    );
    const topScore = realReport.policies.find(
      (policy) => policy.policy === 'top_score',
    );
    const margin = realReport.policies.find(
      (policy) => policy.policy === 'margin',
    );

    expect(baseline?.threshold).toBeNull();
    expect(topScore?.threshold).toBe(9);
    expect(margin?.threshold).toBe(6);
    expect(topScore?.test.answerableEvidenceRecall).toBeLessThanOrEqual(
      baseline?.test.answerableEvidenceRecall ?? 0,
    );
  });

  it('does not count weak or accepted unanswerable evidence as correct abstention', () => {
    const baseline = realReport.policies.find(
      (policy) => policy.policy === 'baseline_b',
    );
    const margin = realReport.policies.find(
      (policy) => policy.policy === 'margin',
    );

    expect(baseline?.test.correctAbstentionRate).toBe(0);
    expect(baseline?.test.falseAcceptRate).toBe(1);
    expect(margin?.test.correctAbstentionRate).toBe(1);
    expect(margin?.test.falseRejectRate).toBeGreaterThan(0);
  });

  it('excludes unverified questions from scored policy metrics', () => {
    const baseline = realReport.policies.find(
      (policy) => policy.policy === 'baseline_b',
    );

    expect(realReport.ranking.test.answerableCount + realReport.ranking.test.unanswerableCount).toBe(
      realReport.ranking.test.verifiedCount,
    );
    expect(baseline?.test.answerableCount).toBe(6);
    expect(baseline?.test.unanswerableCount).toBe(8);
    expect(baseline?.test.questionCount).toBe(16);
  });

  it('fails closed on source hash mismatch', () => {
    expect(() =>
      buildUnframedManifest({
        raw: syntheticRaw,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(SourceHashMismatchError);
  });

  it('keeps metadata-only output free of passage text and stable', () => {
    const serialized = serializeC3Report(realReport);
    const second = evaluatePhaseC3({
      build: realBuild,
      questions: C3_QUESTIONS,
      topK: 5,
      expectedSourceSha256: UNFRAMED_EXPECTED_SHA256,
    });

    expect(serialized).not.toContain('TOP_SECRET');
    expect(realReport.checks.noPassageTextInReport).toBe(true);
    expect(second.questionSetHash).toBe(realReport.questionSetHash);
    expect(second.ranking.test.mrr).toBe(realReport.ranking.test.mrr);
  });
});
