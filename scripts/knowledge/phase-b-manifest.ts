import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildUnframedManifest,
  UNFRAMED_CHUNKER_VERSION,
  UNFRAMED_DOCUMENT_ID,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_PARSER_VERSION,
  UNFRAMED_SOURCE_PATH,
} from '../../lib/knowledge/unframed';
import type { UnframedBuild } from '../../lib/knowledge/types';

type FailureCode =
  | 'missing_dry_run'
  | 'public_source_refused'
  | 'source_read_failed'
  | 'source_hash_mismatch'
  | 'manuscript_structure'
  | 'unknown_error';

function fail(code: FailureCode, exitCode: number): void {
  process.stderr.write(
    `${JSON.stringify({ mode: 'dry-run', status: 'failed', code })}\n`,
  );
  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--dry-run')) {
    fail('missing_dry_run', 2);
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

  let build: UnframedBuild;

  try {
    build = buildUnframedManifest({
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

  const checksAllPassed = Object.values(build.checks).every(Boolean);

  const summary = {
    mode: 'dry-run' as const,
    status: checksAllPassed ? ('ok' as const) : ('failed' as const),
    sourcePath: UNFRAMED_SOURCE_PATH,
    sourceSha256: build.manifest.sourceSha256,
    parserVersion: UNFRAMED_PARSER_VERSION,
    chunkerVersion: UNFRAMED_CHUNKER_VERSION,
    documentId: UNFRAMED_DOCUMENT_ID,
    sourceCharCount: build.manifest.sourceCharCount,
    sourceWordCount: build.manifest.sourceWordCount,
    bodyCharCount: build.manifest.bodyCharCount,
    bodyWordCount: build.manifest.bodyWordCount,
    partCount: build.manifest.partCount,
    chapterCount: build.manifest.chapterCount,
    sectionCount: build.manifest.sectionCount,
    chunkCount: build.manifest.chunkCount,
    manifestHash: build.manifest.manifestHash,
    checks: build.checks,
    checksAllPassed,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!checksAllPassed) process.exitCode = 1;
}

main().catch(() => {
  fail('unknown_error', 1);
});
