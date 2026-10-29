import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildUnframedManifest,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
} from '../../lib/knowledge/unframed';
import type { UnframedBuild } from '../../lib/knowledge/types';
import { evaluatePhaseC3, serializeC3Report } from '../../lib/knowledge/evaluation/c3/evaluate';
import { C3_QUESTIONS } from '../../lib/knowledge/evaluation/c3/questions';

type FailureCode =
  | 'missing_local_evaluation'
  | 'public_source_refused'
  | 'source_read_failed'
  | 'source_hash_mismatch'
  | 'manuscript_structure'
  | 'unknown_error';

function fail(code: FailureCode, exitCode: number): void {
  process.stderr.write(
    `${JSON.stringify({ mode: 'local-evaluation', phase: 'C3', status: 'failed', code })}\n`,
  );
  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--local-evaluation')) {
    fail('missing_local_evaluation', 2);
    return;
  }

  const sourcePath = path.resolve(process.cwd(), UNFRAMED_SOURCE_PATH);

  if (sourcePath.includes(`${path.sep}public${path.sep}`)) {
    fail('public_source_refused', 1);
    return;
  }

  let raw: string;

  try {
    raw = await fs.readFile(sourcePath, 'utf8');
  } catch {
    fail('source_read_failed', 1);
    return;
  }

  let first: UnframedBuild;
  let second: UnframedBuild;

  try {
    first = buildUnframedManifest({
      raw,
      sourcePath: UNFRAMED_SOURCE_PATH,
      expectedSha256: UNFRAMED_EXPECTED_SHA256,
    });
    second = buildUnframedManifest({
      raw,
      sourcePath: UNFRAMED_SOURCE_PATH,
      expectedSha256: UNFRAMED_EXPECTED_SHA256,
    });
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'unknown_error';

    if (code === 'source_hash_mismatch') {
      fail('source_hash_mismatch', 1);
      return;
    }

    if (code === 'manuscript_structure') {
      fail('manuscript_structure', 1);
      return;
    }

    fail('unknown_error', 1);
    return;
  }

  const firstIds = first.chunks.map((chunk) => chunk.id);
  const secondIds = second.chunks.map((chunk) => chunk.id);
  const stableChunkIds =
    firstIds.length === secondIds.length &&
    firstIds.every((id, index) => id === secondIds[index]);

  const report = evaluatePhaseC3({
    build: first,
    questions: C3_QUESTIONS,
    topK: 5,
    expectedSourceSha256: UNFRAMED_EXPECTED_SHA256,
    determinism: {
      stableManifest: first.manifest.manifestHash === second.manifest.manifestHash,
      stableChunkIds,
      uniqueChunkIds: new Set(firstIds).size === firstIds.length,
    },
  });

  process.stdout.write(serializeC3Report(report));

  if (!report.allChecksPassed) process.exitCode = 1;
}

main().catch(() => {
  fail('unknown_error', 1);
});
