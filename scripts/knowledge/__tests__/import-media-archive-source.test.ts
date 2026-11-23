/** @jest-environment node */

import { createHash } from 'node:crypto';
import path from 'node:path';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { MediaArchiveRecord } from '@/lib/knowledge/brain/store';

type ImportScript = typeof import('../import-media-archive-source');
type BrainStoreMock = {
  createBrainStore: jest.Mock;
};
type BrainStorageMock = {
  createBrainStorage: jest.Mock;
};
type QueueMock = {
  enqueueMediaCoverageJob: jest.Mock;
};
type InlineMock = {
  processBrainRunInline: jest.Mock;
};
type RetrievalMock = {
  retrieveBrainEvidence: jest.Mock;
};

const RECORD_ID = '775e8169-a02e-4b64-b3f8-e3722a48c28f';
const BUNDLE_DIR = path.join('data', 'media-archive', RECORD_ID);
const PDF_PATH = path.join(BUNDLE_DIR, 'Pilot.pdf');
const TEXT_PATH = path.join(BUNDLE_DIR, 'yarmarka-intellekta.txt');
const MANIFEST_PATH = path.join(BUNDLE_DIR, 'manifest.json');
const SOURCE_URL = 'https://www.expertiza.org/MAYDAYCO/CDPRO/Pilot.pdf';
const DOCUMENT_ID = 'doc_media_775e8169a02e4b64b3f8e3722a48c28f';

const record: MediaArchiveRecord = {
  id: RECORD_ID,
  url: SOURCE_URL,
  canonical_url: SOURCE_URL,
  title: 'Ярмарка интеллекта',
  outlet: 'CDпро.ru',
  author: null,
  source_format: 'url',
  content_hash: null,
  source_path: SOURCE_URL,
  source_sha256: null,
  published_date: '2001-12-10',
  lang: 'RU',
  kind: 'column',
  topic: 'Art & Culture',
  summary: '',
  image_url: null,
  status: 'published',
  ai_metadata: { reviewed: true, import_pending: false },
  updated_at: '2026-11-23T00:00:00.000Z',
};

const argv = [
  '--apply',
  '--record-id',
  RECORD_ID,
  '--pdf',
  PDF_PATH,
  '--text',
  TEXT_PATH,
  '--manifest',
  MANIFEST_PATH,
];

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('import-media-archive-source', () => {
  let script: ImportScript;
  let brainStore: BrainStoreMock;
  let brainStorage: BrainStorageMock;
  let queue: QueueMock;
  let inline: InlineMock;
  let retrieval: RetrievalMock;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('dotenv', () => ({
      __esModule: true,
      default: { config: jest.fn() },
    }));
    jest.doMock('@/lib/knowledge/brain/store', () => ({
      createBrainStore: jest.fn(),
    }));
    jest.doMock('@/lib/knowledge/brain/storage', () => ({
      createBrainStorage: jest.fn(),
    }));
    jest.doMock('@/lib/knowledge/media/queue', () => ({
      enqueueMediaCoverageJob: jest.fn(),
    }));
    jest.doMock('@/lib/knowledge/brain/inline', () => ({
      processBrainRunInline: jest.fn(),
    }));
    jest.doMock('@/lib/knowledge/rag/brainRetrieval', () => ({
      retrieveBrainEvidence: jest.fn(),
    }));

    jest.isolateModules(() => {
      script = require('../import-media-archive-source') as ImportScript;
      brainStore = jest.requireMock('@/lib/knowledge/brain/store') as BrainStoreMock;
      brainStorage = jest.requireMock('@/lib/knowledge/brain/storage') as BrainStorageMock;
      queue = jest.requireMock('@/lib/knowledge/media/queue') as QueueMock;
      inline = jest.requireMock('@/lib/knowledge/brain/inline') as InlineMock;
      retrieval = jest.requireMock('@/lib/knowledge/rag/brainRetrieval') as RetrievalMock;
    });
  });

  it('updates the existing record, stores both files and verifies ingestion', async () => {
    const plan = script.planFromFiles(record, PDF_PATH, TEXT_PATH, script.parseArgs(argv));

    const updateMediaRecord = jest.fn(async () => undefined);
    const store = {
      getMediaRecord: jest.fn(async () => record),
      updateMediaRecord,
      getLatestMediaJob: jest.fn(async () => ({
        id: 'job-1',
        status: 'completed',
        error_code: null,
      })),
      findMediaCoverageDocument: jest.fn(async () => ({
        documentId: DOCUMENT_ID,
        ingestionStatus: 'completed',
        coverageStatus: 'completed',
        chunkCount: plan.text.chunkCount,
        contentHash: plan.text.contentHash,
      })),
    };

    const storeSourceBuffer = jest.fn(async (buffer: Buffer, format: 'pdf' | 'txt' | 'html') => {
      const hash = sha256(buffer);
      return {
        sourcePath: `brain-sources/${hash.slice(0, 2)}/${hash}.${format}`,
        sourceSha256: hash,
        byteSize: buffer.length,
      };
    });

    brainStore.createBrainStore.mockReturnValue(store);
    brainStorage.createBrainStorage.mockReturnValue({ storeSourceBuffer });
    queue.enqueueMediaCoverageJob.mockResolvedValue({
      status: 'queued',
      runId: 'run-1',
      job: { id: 'job-1', status: 'queued' },
    });
    inline.processBrainRunInline.mockResolvedValue({
      ok: true,
      processed: 1,
      failed: 0,
      done: true,
      error: null,
    });
    retrieval.retrieveBrainEvidence.mockResolvedValue({
      outcome: 'relevant_results',
      hits: [{ documentId: DOCUMENT_ID }],
    });

    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const code = await script.main(argv);
    const report = JSON.parse(String(log.mock.calls.at(-1)?.[0]));

    expect(code).toBe(0);
    expect(updateMediaRecord).toHaveBeenCalledTimes(1);

    const [updatedId, patch] = updateMediaRecord.mock.calls[0] as [
      string,
      {
        source_format: string;
        source_path: string;
        source_sha256: string;
        content_hash: string;
        indexing_status: string;
        extraction_diagnostics: {
          originalPdf: {
            sourcePath: string;
            sourceSha256: string;
            pageCount: number;
            articlePages: number[];
            articleSpreadPages: number[];
          };
        };
      },
    ];

    expect(updatedId).toBe(RECORD_ID);
    expect(patch.source_format).toBe('text');
    expect(patch.source_path).toBe(plan.text.sourcePath);
    expect(patch.source_sha256).toBe(plan.text.sourceSha256);
    expect(patch.content_hash).toBe(plan.text.contentHash);
    expect(patch.indexing_status).toBe('pending');
    expect(patch.extraction_diagnostics.originalPdf).toMatchObject({
      sourcePath: plan.pdf.sourcePath,
      sourceSha256: plan.pdf.sourceSha256,
      pageCount: 16,
      articlePages: [3],
      articleSpreadPages: [2, 3],
    });

    expect(storeSourceBuffer).toHaveBeenCalledTimes(2);
    expect(storeSourceBuffer.mock.calls[0][1]).toBe('pdf');
    expect(storeSourceBuffer.mock.calls[1][1]).toBe('txt');

    expect(queue.enqueueMediaCoverageJob).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaRecordId: RECORD_ID,
        sourceFormat: 'text',
        storagePath: plan.text.sourcePath,
        sourceSha256: plan.text.sourceSha256,
        titleOverride: 'Ярмарка интеллекта',
        languageOverride: 'RU',
      })
    );

    expect(report.status).toBe('completed');
    expect(report.verification.ok).toBe(true);
    expect(report.verification.retrieval).toMatchObject({
      outcome: 'relevant_results',
      matchedDocument: true,
      ok: true,
    });
    expect(report.text.sourcePath).toBe(plan.text.sourcePath);

    log.mockRestore();
  });

  it('refuses files that do not match the audited manifest', async () => {
    const updateMediaRecord = jest.fn();
    const store = {
      getMediaRecord: jest.fn(async () => record),
      updateMediaRecord,
    };
    brainStore.createBrainStore.mockReturnValue(store);
    brainStorage.createBrainStorage.mockReturnValue({});

    const badArgv = [...argv, '--pdf-pages', '15'];

    await expect(script.main(badArgv)).rejects.toThrow('manifest_pdf_page_count_mismatch');
    expect(updateMediaRecord).not.toHaveBeenCalled();
  });
});
