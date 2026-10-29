import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildUnframedManifest,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
} from '../../lib/knowledge/unframed';
import { hashC4Protocol } from '../../lib/knowledge/evaluation/c4/protocol';
import { C4_QUESTIONS, hashC4QuestionSet } from '../../lib/knowledge/evaluation/c4/questions';
import { splitC4Questions } from '../../lib/knowledge/evaluation/c4/split';
import type { C4Question } from '../../lib/knowledge/evaluation/c4/types';
import {
  UNFRAMED_EMBEDDING_DIMENSIONS,
  UNFRAMED_EMBEDDING_MODEL,
  resolveUnframedEmbeddingConfig,
} from '../../lib/knowledge/rag/config';
import { createOpenRouterEmbeddingClientFromEnv } from '../../lib/knowledge/rag/embeddings';
import {
  evaluateSemanticQuestion,
  semanticBreakdowns,
  semanticMetrics,
  type SemanticQuestionEvaluation,
} from '../../lib/knowledge/rag/evaluation';
import { buildUnframedIngestionPlan } from '../../lib/knowledge/rag/ingestion';

const EXPECTED_QUESTION_HASH = 'd65b319474378ebc2f0f71ba946f11a4fdbf93417b1c53d05288834eb816d167';
const EXPECTED_PROTOCOL_HASH = 'd2dba136d553ddb959880bc315d4b886474f3559899dadfd171e60574d4541b8';
const TOP_K = 5;
const THRESHOLDS = Array.from({ length: 13 }, (_, index) =>
  Number((0.2 + index * 0.05).toFixed(2))
);

function fail(code: string, exitCode = 1): void {
  process.stderr.write(
    `${JSON.stringify({
      mode: 'local-evaluation',
      phase: 'D2',
      status: 'failed',
      code,
    })}\n`
  );
  process.exitCode = exitCode;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code);
  }

  return 'unknown_error';
}

function count(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    value: denominator > 0 ? numerator / denominator : null,
  };
}

function thresholdCalibration(results: SemanticQuestionEvaluation[], threshold: number) {
  const answerable = results.filter(
    (result) => result.scored && result.answerability === 'answerable'
  );
  const unanswerable = results.filter(
    (result) => result.scored && result.answerability === 'unanswerable'
  );
  const acceptedAnswerable = answerable.filter(
    (result) => (result.top[0]?.score ?? -1) >= threshold
  );
  const acceptedWithEvidence = acceptedAnswerable.filter((result) => result.relevantHit === true);
  const acceptedUnanswerable = unanswerable.filter(
    (result) => (result.top[0]?.score ?? -1) >= threshold
  );

  return {
    threshold,
    answerableCoverage: count(acceptedAnswerable.length, answerable.length),
    answerableEvidenceRecall: count(acceptedWithEvidence.length, answerable.length),
    correctAbstention: count(
      unanswerable.length - acceptedUnanswerable.length,
      unanswerable.length
    ),
    falseAccept: count(acceptedUnanswerable.length, unanswerable.length),
  };
}

function selectThreshold(results: SemanticQuestionEvaluation[]) {
  return THRESHOLDS.map((threshold) => thresholdCalibration(results, threshold)).sort(
    (left, right) => {
      const leftScore =
        (left.answerableEvidenceRecall.value ?? 0) + (left.correctAbstention.value ?? 0);
      const rightScore =
        (right.answerableEvidenceRecall.value ?? 0) + (right.correctAbstention.value ?? 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return (left.falseAccept.value ?? 0) - (right.falseAccept.value ?? 0);
    }
  )[0];
}

async function embedQuestions(
  questions: C4Question[],
  client: ReturnType<typeof createOpenRouterEmbeddingClientFromEnv>
): Promise<Map<string, number[]>> {
  const embeddings = await client.embed(questions.map((question) => question.question));

  if (embeddings.length !== questions.length) {
    throw new Error('embedding_count_mismatch');
  }

  return new Map(questions.map((question, index) => [question.id, embeddings[index]]));
}

async function main(): Promise<void> {
  if (!process.argv.includes('--local-evaluation')) {
    fail('local_evaluation_flag_required', 2);
    return;
  }

  const questionHash = hashC4QuestionSet(C4_QUESTIONS);
  const protocolHash = hashC4Protocol();

  if (questionHash !== EXPECTED_QUESTION_HASH || protocolHash !== EXPECTED_PROTOCOL_HASH) {
    fail('frozen_artifact_hash_mismatch');
    return;
  }

  const sourcePath = path.resolve(process.cwd(), UNFRAMED_SOURCE_PATH);

  if (sourcePath.includes(`${path.sep}public${path.sep}`)) {
    fail('public_source_refused');
    return;
  }

  let raw: string;
  try {
    raw = await fs.readFile(sourcePath, 'utf8');
  } catch {
    fail('source_read_failed');
    return;
  }

  const build = buildUnframedManifest({
    raw,
    sourcePath: UNFRAMED_SOURCE_PATH,
    expectedSha256: UNFRAMED_EXPECTED_SHA256,
  });
  const split = splitC4Questions(C4_QUESTIONS);

  if (!process.argv.includes('--authorized-paid-evaluation')) {
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'local-evaluation',
          phase: 'D2',
          status: 'blocked',
          reason: 'paid_embedding_calls_not_authorized',
          authorizationFlag: '--authorized-paid-evaluation',
          sourcePath: build.manifest.sourcePath,
          sourceSha256: build.manifest.sourceSha256,
          manifestHash: build.manifest.manifestHash,
          questionSetHash: questionHash,
          protocolHash,
          split: split.summary,
          model: {
            id: UNFRAMED_EMBEDDING_MODEL,
            dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
            batchSize: 32,
          },
          frozenTest: {
            questions: split.test.length,
            evaluated: false,
            note: 'The held-out test split is not embedded or scored until the configuration is frozen.',
          },
          wouldEmbedChunks: build.chunks.length,
          wouldEmbedDevelopmentQuestions: split.dev.length,
          wouldEmbedCalibrationQuestions: split.calibration.length,
          wouldCallEmbeddingApi: true,
          wouldWriteDatabase: false,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const config = resolveUnframedEmbeddingConfig(process.env);
  const client = createOpenRouterEmbeddingClientFromEnv(process.env);
  const plan = buildUnframedIngestionPlan({
    build,
    modelId: config.modelId,
    dimensions: config.dimensions,
    accessClass: 'owner',
  });
  const chunkStarted = Date.now();
  const chunkEmbeddings = await client.embed(plan.embeddingInputs.map((item) => item.text));
  const indexBuildMs = Date.now() - chunkStarted;

  if (chunkEmbeddings.length !== plan.chunks.length) {
    throw new Error('embedding_count_mismatch');
  }

  const candidates = plan.chunks.map((chunk, index) => ({
    chunkId: chunk.id,
    sectionIndex: chunk.section_index,
    embedding: chunkEmbeddings[index],
  }));

  const devEmbeddings = await embedQuestions(split.dev, client);
  const calibrationEmbeddings = await embedQuestions(split.calibration, client);
  const devResults = split.dev.map((question) =>
    evaluateSemanticQuestion({
      question,
      split: 'dev',
      candidates,
      queryEmbedding: devEmbeddings.get(question.id) as number[],
      build,
      topK: TOP_K,
    })
  );
  const calibrationResults = split.calibration.map((question) =>
    evaluateSemanticQuestion({
      question,
      split: 'calibration',
      candidates,
      queryEmbedding: calibrationEmbeddings.get(question.id) as number[],
      build,
      topK: TOP_K,
    })
  );

  const selected = selectThreshold(calibrationResults);

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'local-evaluation',
        phase: 'D2',
        status: 'ok',
        sourcePath: build.manifest.sourcePath,
        sourceSha256: build.manifest.sourceSha256,
        manifestHash: build.manifest.manifestHash,
        questionSetHash: questionHash,
        protocolHash,
        model: {
          id: config.modelId,
          dimensions: config.dimensions,
          batchSize: 32,
        },
        topK: TOP_K,
        indexBuildMs,
        dev: {
          metrics: semanticMetrics(devResults),
          byLanguage: semanticBreakdowns(devResults),
        },
        calibration: {
          metrics: semanticMetrics(calibrationResults),
          byLanguage: semanticBreakdowns(calibrationResults),
          selectedThreshold: selected.threshold,
          thresholdCandidates: THRESHOLDS.map((threshold) =>
            thresholdCalibration(calibrationResults, threshold)
          ),
        },
        frozenTest: {
          questions: split.test.length,
          evaluated: false,
          note: 'The held-out test split remains untouched until the configuration is frozen.',
        },
        caveat:
          'Semantic similarity is not answer quality. Thresholds are selected only on calibration data.',
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => fail(errorCode(error)));
