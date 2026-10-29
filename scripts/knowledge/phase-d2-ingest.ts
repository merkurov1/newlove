import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildUnframedManifest,
  UNFRAMED_EXPECTED_SHA256,
  UNFRAMED_SOURCE_PATH,
} from '../../lib/knowledge/unframed';
import {
  UNFRAMED_EMBEDDING_DIMENSIONS,
  UNFRAMED_EMBEDDING_MODEL,
  resolveUnframedEmbeddingConfig,
} from '../../lib/knowledge/rag/config';
import { createOpenRouterEmbeddingClientFromEnv } from '../../lib/knowledge/rag/embeddings';
import {
  applyUnframedIngestion,
  buildUnframedIngestionPlan,
  summarizeDryRun,
} from '../../lib/knowledge/rag/ingestion';
import { createSupabaseKnowledgeRepository } from '../../lib/knowledge/rag/supabaseStore';

type CliMode = 'dry_run' | 'apply';

function fail(code: string, exitCode = 1): void {
  process.stderr.write(`${JSON.stringify({ status: 'failed', code })}\n`);
  process.exitCode = exitCode;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code);
  }

  return 'unknown_error';
}

function parseMode(argv: string[]): CliMode | null {
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');

  if (dryRun === apply) return null;

  return apply ? 'apply' : 'dry_run';
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));

  if (!mode) {
    fail('mode_required', 2);
    return;
  }

  if (mode === 'apply' && !process.argv.includes('--confirm-paid-embedding')) {
    fail('paid_embedding_confirmation_required', 2);
    return;
  }

  const allowStaleDelete = mode === 'apply' && process.argv.includes('--allow-stale-delete');
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

  if (!Object.values(build.checks).every(Boolean)) {
    fail('parser_checks_failed');
    return;
  }

  const config = resolveUnframedEmbeddingConfig(process.env);
  const plan = buildUnframedIngestionPlan({
    build,
    modelId: config.modelId,
    dimensions: config.dimensions,
    accessClass: 'owner',
  });

  if (mode === 'dry_run') {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...summarizeDryRun(plan),
          mode,
          sourcePath: build.manifest.sourcePath,
          parserVersion: build.manifest.parserVersion,
          chunkerVersion: build.manifest.chunkerVersion,
          checks: build.checks,
          modelContract: {
            model: UNFRAMED_EMBEDDING_MODEL,
            dimensions: UNFRAMED_EMBEDDING_DIMENSIONS,
            verifiedVia: 'OpenRouter embeddings catalogue and OpenAPI contract',
          },
          wouldCallEmbeddingApi: false,
          wouldWriteDatabase: false,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (!(process.env.OPENROUTER_API_KEY || '').trim()) {
    fail('openrouter_api_key_missing');
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('supabase_service_role_key_missing');
    return;
  }

  const repository = createSupabaseKnowledgeRepository(process.env);

  if (!repository) {
    fail('supabase_configuration_missing');
    return;
  }

  const embeddingClient = createOpenRouterEmbeddingClientFromEnv(process.env);
  const embeddings = await embeddingClient.embed(plan.embeddingInputs.map((item) => item.text));
  const summary = await applyUnframedIngestion({
    plan,
    embeddings,
    repository,
    allowStaleDelete,
  });

  process.stdout.write(`${JSON.stringify({ ...summary, mode }, null, 2)}\n`);
}

main().catch((error) => fail(errorCode(error)));
