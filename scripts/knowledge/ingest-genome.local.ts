#!/usr/bin/env tsx
/**
 * One-off owner import for a large 23andMe raw genotype file.
 *
 * Dry run:
 *   npx tsx scripts/knowledge/ingest-genome.local.ts
 *
 * Apply (uploads parts, enqueues Brain jobs, processes the run, writes owner
 * memory):
 *   npx tsx scripts/knowledge/ingest-genome.local.ts --apply
 *
 * The source file is never committed. Only derived TXT parts and a compact
 * owner-only overview are uploaded to the private brain-sources bucket.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import dotenv from 'dotenv';

import { enqueueBrainSources } from '@/lib/knowledge/brain/enqueue';
import { processBrainRunInline } from '@/lib/knowledge/brain/inline';
import { previewBrainSource } from '@/lib/knowledge/brain/preview';
import { createBrainStorage } from '@/lib/knowledge/brain/storage';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { createMemoryRecord, searchMemory } from '@/lib/pierrot/memory/store';
import { getServerSupabaseClient } from '@/lib/serverAuth';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

const SOURCE_FILE = '/tmp/opencode/genome-full.txt';
const ORIGINAL_FILENAME = 'genome_Anton_Merkurov_v5_Full_20200416085410.txt';
const BASE_TITLE = 'Геном Антона Меркурова v5 (23andMe, build 37)';
const SUMMARY_TITLE = 'Геном Антона Меркурова v5 — обзор и индекс';
const OWNER_USER_ID = 'fffa55a9-1ed7-49ff-953d-dfffa9f00844';
const MAX_PART_BYTES = 4_700_000;
const TXT_LIMIT = 5 * 1024 * 1024;

type GenomeLine = { rsid: string; chromosome: string; position: string; genotype: string };
type Part = {
  index: number;
  chromosomes: string[];
  lines: GenomeLine[];
  title: string;
  filename: string;
  content: string;
  bytes: number;
  sha256: string;
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function chromosomeLabel(chromosomes: string[]): string {
  if (chromosomes.length === 1) return chromosomes[0];
  const numeric = chromosomes.every((chromosome) => /^\d+$/.test(chromosome));
  const consecutive =
    numeric &&
    chromosomes.every(
      (chromosome, index) =>
        index === 0 || Number(chromosome) === Number(chromosomes[index - 1]) + 1
    );

  if (consecutive) {
    return `${chromosomes[0]}–${chromosomes[chromosomes.length - 1]}`;
  }

  return chromosomes.join(', ');
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

async function loadGenome() {
  const raw = await fs.readFile(SOURCE_FILE, 'utf8');
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const header = lines.filter((line) => line.startsWith('#'));
  const data: GenomeLine[] = [];
  let malformed = 0;

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length !== 4) {
      malformed += 1;
      continue;
    }
    data.push({
      rsid: parts[0],
      chromosome: parts[1],
      position: parts[2],
      genotype: parts[3],
    });
  }

  const chromosomes: string[] = [];
  const byChromosome = new Map<string, GenomeLine[]>();

  for (const line of data) {
    if (!byChromosome.has(line.chromosome)) {
      chromosomes.push(line.chromosome);
      byChromosome.set(line.chromosome, []);
    }
    byChromosome.get(line.chromosome)!.push(line);
  }

  return { header, data, chromosomes, byChromosome, malformed, sourceBytes: byteLength(text) };
}

function buildParts(input: Awaited<ReturnType<typeof loadGenome>>): Part[] {
  const groups: Array<{ chromosomes: string[]; lines: GenomeLine[]; bytes: number }> = [];
  let current: { chromosomes: string[]; lines: GenomeLine[]; bytes: number } | null = null;

  for (const chromosome of input.chromosomes) {
    const lines = input.byChromosome.get(chromosome) || [];
    const bytes = lines.reduce(
      (total, line) => total + byteLength(`${line.rsid}\t${line.chromosome}\t${line.position}\t${line.genotype}\n`),
      0
    );

    if (current && current.bytes + bytes > MAX_PART_BYTES && current.chromosomes.length > 0) {
      groups.push(current);
      current = null;
    }

    if (!current) current = { chromosomes: [], lines: [], bytes: 0 };
    current.chromosomes.push(chromosome);
    current.lines.push(...lines);
    current.bytes += bytes;
  }

  if (current) groups.push(current);

  return groups.map((group, index) => {
    const label = chromosomeLabel(group.chromosomes);
    const title = `${BASE_TITLE} — хромосомы ${label}`;
    const filename = `genome_Anton_Merkurov_v5_part_${index + 1}_chromosomes_${group.chromosomes
      .join('_')}.txt`;
    const headerLines = [
      `# GENOME PART ${index + 1}/${groups.length} — хромосомы ${label}`,
      `# Original file: ${ORIGINAL_FILENAME}`,
      '# Source: 23andMe raw genotype data; reference human assembly build 37.',
      `# Chromosomes in this part: ${group.chromosomes.join(', ')}`,
      `# SNPs in this part: ${group.lines.length}`,
      '# Columns: rsid<TAB>chromosome<TAB>position<TAB>genotype',
      '# Owner-only reference data. This is not a medical interpretation.',
      '#',
    ];
    const body = group.lines
      .map((line) => `${line.rsid}\t${line.chromosome}\t${line.position}\t${line.genotype}`)
      .join('\n');
    const content = `${headerLines.join('\n')}\n${body}\n`;
    const bytes = byteLength(content);

    if (bytes > TXT_LIMIT) {
      throw new Error(`part_${index + 1}_too_large:${bytes}`);
    }

    return {
      index: index + 1,
      chromosomes: group.chromosomes,
      lines: group.lines,
      title,
      filename,
      content,
      bytes,
      sha256: sha256(content),
    };
  });
}

function buildSummary(input: Awaited<ReturnType<typeof loadGenome>>, parts: Part[]): string {
  const noCalls = input.data.filter((line) => line.genotype === '--').length;
  const rows = input.chromosomes
    .map((chromosome) => {
      const lines = input.byChromosome.get(chromosome) || [];
      const noCall = lines.filter((line) => line.genotype === '--').length;
      return `| ${chromosome} | ${lines.length} | ${noCall} |`;
    })
    .join('\n');
  const partRows = parts
    .map(
      (part) =>
        `- Часть ${part.index}: хромосомы ${chromosomeLabel(part.chromosomes)}, SNP: ${part.lines.length}, файл: ${part.filename}`
    )
    .join('\n');

  return `# ${SUMMARY_TITLE}

## Что это

Это owner-only копия сырых genotype-данных 23andMe Антона Меркурова, версия v5, файл \`${ORIGINAL_FILENAME}\`, сгенерированный 16 апреля 2020 года. Формат — 23andMe raw data, reference human assembly build 37.

Файл содержит ${input.data.length.toLocaleString('ru-RU')} SNP-строк по ${input.chromosomes.length} хромосомам/последовательностям, включая X, Y и MT. No-call genotypes (\`--\`): ${noCalls.toLocaleString('ru-RU')}.

Исходный файл большой (${(input.sourceBytes / 1024 / 1024).toFixed(1)} МБ), поэтому он разбит на части по хромосомам. Каждая часть проиндексирована в Brain отдельно. Этот документ — обзор и индекс, а не интерпретация.

## Формат строки

\`rsid<TAB>chromosome<TAB>position<TAB>genotype\`

Пример: \`rs548049170	1	69869	TT\`.

## Части

${partRows}

## Как со мной работать

- Искать конкретный SNP по rsid: например \`rs429358\`, \`rs7412\`, \`rs1801133\`.
- Искать по хромосоме и позиции: например \`хромосома 19\` или \`position 44908684\`.
- Сравнивать genotype calls между SNP.
- Строить статистику по хромосомам, no-call и покрытию.

## Важные ограничения

- Это сырые genotype-данные, а не медицинское заключение.
- По ним нельзя ставить диагноз, назначать лечение или делать выводы о здоровье без валидированной клинической интерпретации.
- Отсутствие SNP в файле не означает отсутствие варианта.
- No-call (\`--\`) означает, что генотип не определён.
- Данные доступны только владельцу. Публичная выдача запрещена.

## Статистика по хромосомам

| Хромосома | SNP | No-call |
|---|---:|---:|
${rows}
`;
}

async function apply(input: Awaited<ReturnType<typeof loadGenome>>, parts: Part[]) {
  const storage = createBrainStorage();
  const store = createBrainStore();

  if (!storage || !store) throw new Error('brain_storage_or_store_unavailable');

  const descriptors = [];
  const uploaded: Array<{ title: string; documentId: string | null; chunkCount: number | null }> = [];

  for (const part of parts) {
    const buffer = Buffer.from(part.content, 'utf8');
    const stored = await storage.storeOriginal(buffer, 'txt');
    if (stored.sourceSha256 !== part.sha256) throw new Error('stored_hash_mismatch');

    const preview = await previewBrainSource({
      kind: 'txt',
      storagePath: stored.sourcePath,
      sourceSha256: stored.sourceSha256,
      originalFilename: part.filename,
      mimeType: 'text/plain',
      byteSize: stored.byteSize,
      overrides: {
        title: part.title,
        author: 'Anton Merkurov',
        language: 'en',
      },
    });

    console.log(
      JSON.stringify({
        part: part.index,
        title: part.title,
        storagePath: stored.sourcePath,
        bytes: stored.byteSize,
        chunks: preview.preview.chunkCount,
        duplicate: preview.preview.duplicate?.status || null,
      })
    );

    descriptors.push({
      kind: 'txt' as const,
      storagePath: stored.sourcePath,
      sourceSha256: stored.sourceSha256,
      originalFilename: part.filename,
      mimeType: 'text/plain',
      byteSize: stored.byteSize,
      title: part.title,
      author: 'Anton Merkurov',
      language: 'en',
    });
    uploaded.push({
      title: part.title,
      documentId: preview.preview.duplicate?.documentId || preview.preview.documentId,
      chunkCount: preview.preview.chunkCount,
    });
  }

  const summary = buildSummary(input, parts);
  const summaryPreview = await previewBrainSource({
    kind: 'text',
    text: summary,
    overrides: {
      title: SUMMARY_TITLE,
      author: 'Anton Merkurov',
      language: 'ru',
    },
  });

  if (!summaryPreview.storagePath) throw new Error('summary_storage_path_missing');

  console.log(
    JSON.stringify({
      summary: SUMMARY_TITLE,
      storagePath: summaryPreview.storagePath,
      bytes: summaryPreview.preview.byteSize,
      chunks: summaryPreview.preview.chunkCount,
      duplicate: summaryPreview.preview.duplicate?.status || null,
    })
  );

  descriptors.push({
    kind: 'text' as const,
    storagePath: summaryPreview.storagePath,
    sourceSha256: summaryPreview.preview.sourceSha256,
    originalFilename: 'genome_Anton_Merkurov_v5_overview.txt',
    mimeType: 'text/plain',
    byteSize: summaryPreview.preview.byteSize,
    title: SUMMARY_TITLE,
    author: 'Anton Merkurov',
    language: 'ru',
  });
  uploaded.push({
    title: SUMMARY_TITLE,
    documentId:
      summaryPreview.preview.duplicate?.documentId || summaryPreview.preview.documentId,
    chunkCount: summaryPreview.preview.chunkCount,
  });

  const enqueue = await enqueueBrainSources({
    sources: descriptors,
    requestedBy: 'owner:genome-import',
    recheckExisting: false,
  });

  console.log(
    JSON.stringify({
      runId: enqueue.startRun?.id || null,
      rows: enqueue.rows,
      skipped: enqueue.skipped,
      jobs: enqueue.jobs.map((job) => ({
        id: job.id,
        status: job.status,
        title: job.title_override,
        storagePath: job.storage_path,
      })),
    })
  );

  if (enqueue.startRun) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await processBrainRunInline({
        store,
        runId: enqueue.startRun.id,
        maxJobs: 3,
        budgetMs: 180_000,
      });
      console.log(JSON.stringify({ attempt: attempt + 1, result }));
      if (result.done || result.processed === 0) break;
    }
  }

  const shaList = descriptors.map((descriptor) => descriptor.sourceSha256).filter(Boolean);
  const { data: documents, error } = await store.client
    .from('knowledge_documents')
    .select('id,title,source_sha256,chunk_count,ingestion_status,public_retrieval_allowed,access_class')
    .in('source_sha256', shaList)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`document_readback_failed:${error.message}`);

  for (const document of documents || []) {
    if (document.public_retrieval_allowed === true) {
      const { error: updateError } = await store.client
        .from('knowledge_documents')
        .update({ public_retrieval_allowed: false, access_class: 'owner' })
        .eq('id', document.id);
      if (updateError) throw new Error(`owner_only_update_failed:${updateError.message}`);
    }
  }

  console.log(JSON.stringify({ documents }));

  const memoryStore = getServerSupabaseClient({ useServiceRole: true });
  const existing = await searchMemory(memoryStore, {
    userId: OWNER_USER_ID,
    query: 'Геном Антона Меркурова v5 Brain',
    kinds: ['memory', 'saved'],
    limit: 5,
  }).catch(() => null);

  if (!existing || existing.records.length === 0) {
    const documentIds = (documents || []).map((document) => document.id);
    await createMemoryRecord(memoryStore, OWNER_USER_ID, {
      kind: 'memory',
      title: 'Геном Антона Меркурова v5 в Brain',
      content:
        'В Brain владельца загружен сырой геном 23andMe v5 (build 37): 638 544 SNP по 25 хромосомам/последовательностям, включая X, Y и MT. Файл разбит на 4 части по хромосомам и дополнен owner-only обзором. Данные доступны только владельцу и не являются медицинской интерпретацией. Работать с ними через Brain по rsid, хромосоме или позиции; не делать медицинских выводов без валидированной интерпретации.',
      tags: ['genome', 'brain', '23andme', 'owner-only'],
      importance: 0.8,
      confidence: 1,
      sourceRefs: documentIds.map((id) => ({ type: 'brain_document', id })),
    });
    console.log(JSON.stringify({ memory: 'created' }));
  } else {
    console.log(JSON.stringify({ memory: 'existing', ids: existing.records.map((record) => record.id) }));
  }
}

async function main() {
  const applyMode = process.argv.includes('--apply');
  const input = await loadGenome();
  const parts = buildParts(input);
  const summary = buildSummary(input, parts);

  console.log(
    JSON.stringify(
      {
        mode: applyMode ? 'apply' : 'dry-run',
        dataLines: input.data.length,
        chromosomes: input.chromosomes.length,
        malformed: input.malformed,
        parts: parts.map((part) => ({
          index: part.index,
          title: part.title,
          chromosomes: part.chromosomes,
          lines: part.lines.length,
          bytes: part.bytes,
          sha256: part.sha256,
        })),
        summaryBytes: byteLength(summary),
      },
      null,
      2
    )
  );

  if (!applyMode) return;
  await apply(input, parts);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
