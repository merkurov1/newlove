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
import { evaluatePhaseC4, serializeC4Report } from '../evaluate';
import { acceptsC4 } from '../policies';
import { hashC4Protocol } from '../protocol';
import { C4_QUESTIONS, hashC4QuestionSet } from '../questions';
import { detectC4SemanticAvailability } from '../semanticAvailability';
import { splitC4Questions } from '../split';
import type { C4QuestionResult } from '../types';

const realRaw = fs.readFileSync(
  path.join(process.cwd(), UNFRAMED_SOURCE_PATH),
  'utf8',
);
const realBuild = buildUnframedManifest({
  raw: realRaw,
  expectedSha256: UNFRAMED_EXPECTED_SHA256,
});
const realReport = evaluatePhaseC4({
  build: realBuild,
  questions: C4_QUESTIONS,
  topK: 5,
  expectedSourceSha256: UNFRAMED_EXPECTED_SHA256,
});

function toyResult(overrides: Partial<C4QuestionResult> = {}): C4QuestionResult {
  return {
    id: 'toy',
    category: 'direct_factual',
    language: 'en',
    languageMode: 'en',
    split: 'test',
    answerability: 'answerable',
    groundTruthValid: true,
    scored: true,
    excludedReason: null,
    baselineOutcome: 'relevant_results',
    top: [],
    relevantHit: true,
    firstRelevantRank: 1,
    recallAt1: 1,
    recallAt3: 1,
    recallAt5: 1,
    precisionAt5: 0.2,
    mrrContribution: 1,
    features: {
      topScore: 7,
      secondScore: 3,
      margin: 4,
      queryTokenCount: 2,
      distinctMatchedTerms: 2,
      coverage: 1,
      exactPhrase: true,
      expectedSectionMatch: false,
    },
    latencyMs: 0,
    ...overrides,
  };
}

describe('Phase C.4 protocol and multilingual bake-off', () => {
  it('reports the frozen dataset composition', () => {
    expect(realReport.dataset.totalQuestions).toBe(134);
    expect(realReport.dataset.verified).toBe(124);
    expect(realReport.dataset.unverified).toBe(10);
    expect(realReport.dataset.answerable).toBe(84);
    expect(realReport.dataset.unanswerable).toBe(40);
    expect(realReport.dataset.languageModeCounts).toEqual({
      en: 65,
      pure_ru: 55,
      latin_ru: 14,
    });
  });

  it('keeps fact groups inside one split', () => {
    const split = splitC4Questions(C4_QUESTIONS);
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
      C4_QUESTIONS.length,
    );
    expect(realReport.checks.factGroupIntegrity).toBe(true);
  });

  it('uses numerator/denominator evidence metrics, not outcome labels', () => {
    const bTest = realReport.strategies.find(
      (strategy) => strategy.strategy === 'B',
    )?.bySplit?.test?.metrics;

    expect(bTest?.recallAt1.numerator).toBe(8);
    expect(bTest?.recallAt1.denominator).toBe(30);
    expect(bTest?.recallAt5.numerator).toBe(14);
    expect(bTest?.recallAt5.denominator).toBe(30);
    expect(bTest?.precisionAt5.numerator).toBe(18);
    expect(bTest?.precisionAt5.denominator).toBe(150);
    expect(bTest?.answerableEvidenceRecall.numerator).toBe(14);
    expect(bTest?.answerableEvidenceRecall.denominator).toBe(30);
  });

  it('reports all-accept and all-abstain boundaries separately', () => {
    const baseline = realReport.policies.find(
      (policy) => policy.strategy === 'B' && policy.policy === 'baseline_b',
    );
    const exact = realReport.policies.find(
      (policy) => policy.strategy === 'B' && policy.policy === 'exact_phrase',
    );

    expect(baseline?.test.correctAbstention.numerator).toBe(5);
    expect(baseline?.test.falseAccept.numerator).toBe(7);
    expect(exact?.test.correctAbstention.numerator).toBe(12);
    expect(exact?.test.falseAccept.numerator).toBe(0);
    expect(exact?.test.falseReject.numerator).toBe(27);
  });

  it('does not use expected-section ground truth in a policy decision', () => {
    const result = toyResult();
    const sameFeaturesNoGroundTruth = toyResult({
      features: { ...result.features, expectedSectionMatch: true },
    });

    expect(acceptsC4('top_score', 3, result)).toBe(
      acceptsC4('top_score', 3, sameFeaturesNoGroundTruth),
    );
    expect(acceptsC4('margin', 2, result)).toBe(
      acceptsC4('margin', 2, sameFeaturesNoGroundTruth),
    );
    expect(acceptsC4('coverage', 0.8, result)).toBe(
      acceptsC4('coverage', 0.8, sameFeaturesNoGroundTruth),
    );
  });

  it('selects thresholds on calibration only', () => {
    const bTop = realReport.policies.find(
      (policy) => policy.strategy === 'B' && policy.policy === 'top_score',
    );
    const bMargin = realReport.policies.find(
      (policy) => policy.strategy === 'B' && policy.policy === 'margin',
    );
    const bCoverage = realReport.policies.find(
      (policy) => policy.strategy === 'B' && policy.policy === 'coverage',
    );

    expect(bTop?.threshold).toBe(6);
    expect(bMargin?.threshold).toBe(6);
    expect(bCoverage?.threshold).toBe(0.4);
  });

  it('marks semantic and hybrid strategies blocked, not measured', () => {
    const availability = detectC4SemanticAvailability();
    const semantic = realReport.strategies.find(
      (strategy) => strategy.strategy === 'C',
    );
    const hybrid = realReport.strategies.find(
      (strategy) => strategy.strategy === 'D',
    );

    expect(availability.available).toBe(false);
    expect(availability.model.multilingual).toBe(false);
    expect(semantic?.status).toBe('blocked');
    expect(hybrid?.status).toBe('blocked');
    expect(semantic?.bySplit).toBeUndefined();
    expect(hybrid?.bySplit).toBeUndefined();
  });

  it('has stable protocol and fixture hashes', () => {
    expect(hashC4Protocol()).toBe(realReport.protocolHash);
    expect(hashC4QuestionSet()).toBe(realReport.questionSetHash);
    expect(hashC4QuestionSet()).toBe(hashC4QuestionSet());
  });

  it('fails closed on source hash mismatch', () => {
    expect(() =>
      buildUnframedManifest({
        raw: realRaw,
        expectedSha256: '0'.repeat(64),
      }),
    ).toThrow(SourceHashMismatchError);
  });

  it('keeps metadata-only output free of passage text', () => {
    const serialized = serializeC4Report(realReport);

    expect(serialized).not.toContain('TOP_SECRET');
    expect(realReport.checks.noPassageTextInReport).toBe(true);
    expect(realReport.checks.noGroundTruthLeakage).toBe(true);
    expect(realReport.diagnostics.invalidOffsetCount).toBe(0);
    expect(realReport.diagnostics.chunksCrossingSectionBoundaryCount).toBe(0);
  });
});
