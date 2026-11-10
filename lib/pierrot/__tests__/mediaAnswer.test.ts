/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import type {
  MediaArchiveStats,
  MediaCatalogList,
  MediaDiagnostics,
  MediaRecordDetail,
} from '@/lib/knowledge/media/catalog';
import { answerMediaArchiveQuestion, type MediaAnswerDependencies } from '../mediaAnswer';

function stats(overrides: Partial<MediaArchiveStats> = {}): MediaArchiveStats {
  return {
    total: 265,
    published: 262,
    draft: 3,
    own: 203,
    mentions: 62,
    outlets: 43,
    unknownDates: 0,
    range: { from: '2010-01-01', to: '2026-11-03' },
    byYear: [
      { key: '2026', count: 60 },
      { key: '2025', count: 99 },
    ],
    byOutlet: [{ key: 'Новая газета', count: 160 }],
    byKind: [{ key: 'column', count: 156 }],
    byLanguage: [{ key: 'RU', count: 236 }],
    byTopic: [{ key: 'Internet & Censorship', count: 180 }],
    coverage: { fullText: 233, partialText: 7, metadataOnly: 11, blocked: 10, missingDocument: 4 },
    indexing: { completed: 233, failed: 16, partial: 7, blocked: 5, notIndexed: 4 },
    documents: { withChunks: 240, withoutChunks: 21, failedIngestion: 21, embeddingMissing: 0 },
    analysis: {
      runsCompleted: 179,
      runsFailed: 1,
      quotes: 143,
      currentQuotes: 143,
      topics: 63,
      entities: 476,
      relations: 265,
    },
    provenance: {
      source: 'media_archive_records',
      mode: 'sql_aggregate',
      totalMatching: 265,
      returned: 265,
      page: 1,
      pageSize: 265,
      hasMore: false,
      complete: true,
      filters: {},
      caveats: [],
      generatedAt: '2026-11-10T00:00:00.000Z',
    },
    ...overrides,
  };
}

function list(total: number, returned: number, overrides: Partial<MediaCatalogList> = {}): MediaCatalogList {
  const items = Array.from({ length: returned }, (_, index) => ({
    id: `id-${index}`,
    title: `Publication ${index + 1}`,
    outlet: 'Outlet',
    canonicalUrl: `https://example.com/${index}`,
    url: `https://example.com/${index}`,
    slug: `publication-${index}`,
    publishedDate: '2026-10-01',
    language: 'RU',
    kind: 'column',
    topic: 'Internet & Censorship',
    author: 'Антон Меркуров',
    status: 'published',
    indexingStatus: 'completed',
    indexingError: null,
    documentId: `doc-${index}`,
    coverageStatus: 'completed',
    textQuality: 'full_text',
    chunkCount: 3,
    sourceCharCount: 9000,
    country: 'Russia',
  }));

  return {
    items,
    total,
    page: 1,
    pageSize: 100,
    hasMore: returned < total,
    provenance: {
      source: 'media_archive_records',
      mode: 'sql_catalog',
      totalMatching: total,
      returned,
      page: 1,
      pageSize: 100,
      hasMore: returned < total,
      complete: returned >= total,
      filters: {},
      caveats: returned < total ? ['partial page'] : [],
      generatedAt: '2026-11-10T00:00:00.000Z',
    },
    ...overrides,
  };
}

function dependencies(overrides: Partial<MediaAnswerDependencies> = {}): MediaAnswerDependencies {
  const base: MediaAnswerDependencies = {
    stats: jest.fn(async (filters) => {
      if (filters?.scope === 'mentions') {
        return stats({ total: 62, own: 203, mentions: 2 });
      }
      if (filters?.year === 2026) {
        return stats({ total: 60, own: 53, mentions: 7 });
      }
      return stats();
    }) as unknown as MediaAnswerDependencies['stats'],
    list: jest.fn(async () => list(53, 53)) as unknown as MediaAnswerDependencies['list'],
    mentions: jest.fn(async () => ({
      total: 2,
      byOutlets: [{ key: 'Le Monde', count: 2 }],
      byYear: [{ key: '2026', count: 2 }],
      byKind: [{ key: 'mention', count: 2 }],
      byLanguage: [{ key: 'FR', count: 2 }],
      records: list(2, 2).items,
      provenance: list(2, 2).provenance,
    })) as unknown as MediaAnswerDependencies['mentions'],
    detail: jest.fn(async () => ({ status: 'not_found' as const })) as unknown as MediaAnswerDependencies['detail'],
    diagnostics: jest.fn(async () => ({
      summary: {
        total: 265,
        own: 203,
        mentions: 62,
        withDocument: 261,
        missingDocument: 4,
        noChunks: 21,
        failed: 16,
        partial: 7,
        blocked: 5,
        metadataOnly: 11,
        notIndexed: 4,
        duplicateCanonical: 0,
        duplicateTitle: 0,
        duplicateContentHash: 0,
        duplicateQuotes: 0,
        topicMismatch: 12,
        outletMismatch: 1,
        dateMismatch: 0,
        multiCurrentTopic: 0,
        multiCurrentRole: 0,
        brainLinkedDocuments: 170,
        brainDocumentsWithoutMedia: 26,
        analysisFailed: 1,
      },
      rows: [],
      duplicates: { canonical: [], title: [], contentHash: [], quotes: [] },
      brainWithoutMedia: [],
      provenance: list(0, 0).provenance,
    })) as unknown as MediaAnswerDependencies['diagnostics'],
    analytics: jest.fn(async () => ({
      stats: stats(),
      months: [{ key: '2026-10', count: 6 }],
      countries: [{ key: 'Russia', count: 178 }],
      duplicates: { canonical: [], title: [], contentHash: [], quotes: [] },
      brain: {
        entities: 2989,
        relationships: 3963,
        documentsWithRelationships: 170,
        mediaDocuments: 261,
      },
      provenance: stats().provenance,
    })) as unknown as MediaAnswerDependencies['analytics'],
    semantic: jest.fn(async () => ({
      summary: '',
      facts: [],
      interpretation: [],
      insufficient: false,
      results: [],
      count: 0,
      semantic: true as const,
      scannedChunks: 0,
      publications: 0,
      minSimilarity: 0.25,
      complete: false as const,
      caveats: ['semantic sample'],
    })) as unknown as MediaAnswerDependencies['semantic'],
  };

  return { ...base, ...overrides };
}

describe('Media Archive answer completeness', () => {
  it('answers a count with exact SQL totals, not a semantic sample', async () => {
    const deps = dependencies();
    const answer = await answerMediaArchiveQuestion('Сколько у меня публикаций за 2026 год?', 'ru', deps);

    expect(answer?.structured.totalMatching).toBe(53);
    expect(answer?.structured.complete).toBe(true);
    expect(answer?.text).toContain('53');
    expect(answer?.text).toContain('source=media_archive_records');
    expect(deps.semantic).not.toHaveBeenCalled();
  });

  it('states that a list is complete only when the returned page covers the total', async () => {
    const deps = dependencies();
    const answer = await answerMediaArchiveQuestion('Покажи все мои публикации за 2026 год', 'ru', deps);

    expect(answer?.structured.complete).toBe(true);
    expect(answer?.text).toContain('Показаны все 53');
  });

  it('does not present a truncated page as the full list', async () => {
    const deps = dependencies({
      list: jest.fn(async () => list(150, 100)) as unknown as MediaAnswerDependencies['list'],
    });
    const answer = await answerMediaArchiveQuestion('Покажи все публикации за 2026 год', 'ru', deps);

    expect(answer?.structured.complete).toBe(false);
    expect(answer?.text).toContain('Показаны 100 из 150');
    expect(answer?.text).toContain('не полный список');
  });

  it('separates external mentions from own columns', async () => {
    const deps = dependencies();
    const answer = await answerMediaArchiveQuestion('Сколько раз меня упоминали в Le Monde?', 'ru', deps);

    expect(answer?.structured.kind).toBe('count');
    expect(answer?.structured.totalMatching).toBe(2);
    expect(answer?.text).toContain('Внешние упоминания');
    expect(answer?.text).toContain('Собственные колонки/блог');
    expect(deps.list).not.toHaveBeenCalled();
  });

  it('labels semantic retrieval as a sample and reports the catalogue total', async () => {
    const deps = dependencies({
      semantic: jest.fn(async () => ({
        summary: '',
        facts: [],
        interpretation: [],
        insufficient: false,
        results: [
          {
            chunkId: 'chunk-1',
            documentId: 'doc-1',
            mediaRecordId: 'media-1',
            title: 'Internet regulation',
            outlet: 'Le Monde',
            canonicalUrl: 'https://example.com/1',
            publishedDate: '2026-10-01',
            language: 'FR',
            content: 'Regulation of the internet...',
            heading: 'Regulation',
            sectionPath: [],
            similarity: 0.71,
            textQuality: 'full_text',
            topic: 'Internet & Censorship',
            quotes: [],
          },
        ],
        count: 1,
        semantic: true as const,
        scannedChunks: 1,
        publications: 1,
        minSimilarity: 0.25,
        complete: false as const,
        caveats: ['semantic sample'],
      })) as unknown as MediaAnswerDependencies['semantic'],
    });

    const answer = await answerMediaArchiveQuestion(
      'Найди публикации, в которых обсуждается регулирование интернета',
      'ru',
      deps
    );

    expect(answer?.structured.complete).toBe(false);
    expect(answer?.text).toContain('не полный каталог');
    expect(answer?.text).toContain('265');
    expect(answer?.text).not.toContain('Показаны все');
  });

  it('builds a Media analysis report from the complete SQL catalogue', async () => {
    const deps = dependencies({
      list: jest.fn(async () => list(60, 60)) as unknown as MediaAnswerDependencies['list'],
    });
    const answer = await answerMediaArchiveQuestion('Сделай анализ медиа за 2026 год', 'ru', deps);

    expect(answer?.structured.kind).toBe('analysis');
    expect(answer?.text).toContain('Полнота каталога: 60 из 60');
    expect(answer?.text).toContain('complete=true');
    expect(answer?.text).toContain('Семантический поиск при этом не использовался');
    expect(deps.semantic).not.toHaveBeenCalled();
  });

  it('never turns a zero semantic result into “no publications exist”', async () => {
    const deps = dependencies();
    const answer = await answerMediaArchiveQuestion(
      'Найди публикации, в которых обсуждается регулирование интернета',
      'ru',
      deps
    );

    expect(answer?.text).toContain('не означает, что публикаций нет');
    expect(answer?.text).toContain('265');
    expect(answer?.structured.complete).toBe(false);
  });

  it('states explicitly when only metadata is available', async () => {
    const metadataDetail: { status: 'found'; detail: MediaRecordDetail } = {
      status: 'found',
      detail: {
        record: list(1, 1).items[0],
        metadata: {
          summary: 'Only metadata',
          imageUrl: null,
          createdAt: null,
          updatedAt: null,
          aiMetadata: {},
          sourceFormat: 'url',
          contentHash: null,
          diagnostics: {},
        },
        document: null,
        text: {
          available: false,
          quality: 'metadata_only' as const,
          content: '',
          length: 0,
          chunks: 0,
          truncated: false,
          reason: 'Доступны только метаданные',
        },
        fragments: [],
        quotes: [],
        topics: [],
        editorialRole: null,
        entities: [],
        brain: {
          available: false,
          entities: [],
          relationshipCount: 0,
          caveat: 'caveat',
        },
        relations: [],
        provenance: list(1, 1).provenance,
      },
    };

    const deps = dependencies({
      detail: jest.fn(async () => metadataDetail) as unknown as MediaAnswerDependencies['detail'],
    });
    const answer = await answerMediaArchiveQuestion(
      'Что говорится в публикации «Только метаданные»?',
      'ru',
      deps
    );

    expect(answer?.text).toContain('Полный текст недоступен');
    expect(answer?.text).toContain('метаданные');
    expect(answer?.text).toContain('не буду выдавать');
  });

  it('classifies paywall/blocked records without pretending the text exists', async () => {
    const deps = dependencies({
      diagnostics: jest.fn(async () => {
        const base = (await dependencies().diagnostics({ limit: 1 })) as MediaDiagnostics;
        base.rows = [
          {
            ...list(1, 1).items[0],
            coverageStatus: 'blocked',
            textQuality: 'blocked',
            errorCode: 'paywall_detected',
            errorDetail: 'paywall',
            failure: {
              class: 'paywall',
              retryable: false,
              recommendedAction: 'Не обходить paywall.',
            },
          },
        ];
        return base;
      }) as unknown as MediaAnswerDependencies['diagnostics'],
    });

    const answer = await answerMediaArchiveQuestion('Какие публикации ещё не проиндексированы?', 'ru', deps);

    expect(answer?.text).toContain('paywall');
    expect(answer?.text).toContain('retry не показан');
  });
});
