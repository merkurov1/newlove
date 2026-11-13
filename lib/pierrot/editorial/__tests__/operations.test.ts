/**
 * @jest-environment node
 */
import { runEditorialOperation } from '../operations';
import { ManuscriptDataError } from '@/lib/knowledge/rag/manuscript';
import { buildManuscriptStructure, type ManuscriptChunk } from '@/lib/knowledge/rag/manuscriptStructure';
import { emptyEditorialContext, type EditorialContext, type EditorialIntent } from '../types';
import type { UnframedProjectState } from '../project';

const chapter14 = 'CHAPTER 14: THE LONDON SHUTTLE';
const chapter36 = 'CHAPTER 36: THE SILENT CITY AND THE NEW DEAL';

const chunks: ManuscriptChunk[] = [
  {
    chunkId: 'chk_0000',
    chunkIndex: 0,
    sectionIndex: 0,
    heading: 'INTRODUCTION: UNFRAMED',
    sectionPath: ['INTRODUCTION: UNFRAMED'],
    charStart: 0,
    charEnd: 1_000,
    lineStart: 1,
    lineEnd: 20,
    content: 'INTRODUCTION: UNFRAMED\nThis is the opening of the book about digital status and freedom.',
  },
  {
    chunkId: 'chk_0001',
    chunkIndex: 1,
    sectionIndex: 0,
    heading: 'INTRODUCTION: UNFRAMED',
    sectionPath: ['INTRODUCTION: UNFRAMED'],
    charStart: 1_000,
    charEnd: 2_000,
    lineStart: 21,
    lineEnd: 40,
    content: 'The introduction continues with the promise of the story and the first thesis.',
  },
  {
    chunkId: 'chk_0002',
    chunkIndex: 2,
    sectionIndex: 1,
    heading: chapter14,
    sectionPath: ['PART II', chapter14],
    charStart: 2_000,
    charEnd: 4_000,
    lineStart: 41,
    lineEnd: 80,
    content: `${chapter14}\n2008 was the year the world cracked. In London I bought the Spectral Tiger and parked it in Ironforge. The city became a waiting room.`,
  },
  {
    chunkId: 'chk_0003',
    chunkIndex: 3,
    sectionIndex: 1,
    heading: chapter14,
    sectionPath: ['PART II', chapter14],
    charStart: 3_900,
    charEnd: 5_500,
    lineStart: 81,
    lineEnd: 110,
    content: 'The account with the Spectral Tiger is likely still alive in the database. I learned that a digital ghost can be more stable than a bank account.',
  },
  {
    chunkId: 'chk_0004',
    chunkIndex: 4,
    sectionIndex: 2,
    heading: chapter36,
    sectionPath: ['PART III', chapter36],
    charStart: 5_500,
    charEnd: 7_500,
    lineStart: 111,
    lineEnd: 150,
    content: `${chapter36}\nIn 2014 the city was silent and the new deal was being negotiated. London appeared again as a comparison, not as the same event.`,
  },
  {
    chunkId: 'chk_0005',
    chunkIndex: 5,
    sectionIndex: 3,
    heading: 'EPILOGUE: THE RETURN ON INVESTMENT',
    sectionPath: ['PART IV', 'EPILOGUE: THE RETURN ON INVESTMENT'],
    charStart: 7_500,
    charEnd: 8_000,
    lineStart: 151,
    lineEnd: 170,
    content: 'EPILOGUE: THE RETURN ON INVESTMENT\nThe loop closed. I remained unframed.',
  },
];

const structure = buildManuscriptStructure({
  chunks: chunks.map(({ content: _content, ...meta }) => meta),
  sourceCharCount: 8_000,
  expectedChunkCount: 6,
});

const inventory = {
  document: {
    id: 'doc_unframed_manuscript',
    title: 'UNFRAMED',
    sourcePath: 'app/unframed/Unframed.markdown',
    sourceSha256: 'a'.repeat(64),
    parserVersion: 'unframed-parser-v1',
    chunkerVersion: 'unframed-chunker-v1',
    embeddingModel: 'baai/bge-m3',
    accessClass: 'owner' as const,
    chunkCount: 6,
    sourceCharCount: 8_000,
    sourceType: 'manuscript',
    ingestionStatus: 'completed',
    extractionStatus: 'complete',
    updatedAt: '2026-11-13T00:00:00.000Z',
    metadata: {},
  },
  chunks: chunks.map(({ content: _content, ...meta }) => meta),
  structure,
  coverage: structure.coverage,
  loadedAt: '2026-11-13T00:00:00.000Z',
};

const lexicalHits = [
  {
    chunk: inventory.chunks[2],
    excerpt: '2008 was the year the world cracked. In London I bought the Spectral Tiger.',
    method: 'lexical' as const,
    score: 0.9,
    chapter: structure.chapterByKey.get('chapter:14') || null,
  },
  {
    chunk: inventory.chunks[3],
    excerpt: 'The account with the Spectral Tiger is likely still alive in the database.',
    method: 'lexical' as const,
    score: 0.8,
    chapter: structure.chapterByKey.get('chapter:14') || null,
  },
  {
    chunk: inventory.chunks[4],
    excerpt: 'In 2014 the city was silent. London appeared again as a comparison.',
    method: 'lexical' as const,
    score: 0.7,
    chapter: structure.chapterByKey.get('chapter:36') || null,
  },
];

const mockLoadInventory = jest.fn();
const mockLoadChapterText = jest.fn();
const mockLoadManuscriptText = jest.fn();
const mockLoadByIds = jest.fn();
const mockLexical = jest.fn();
const mockSemantic = jest.fn();
const mockFindPhrase = jest.fn();
const mockLoadProject = jest.fn();
const mockSearchHistory = jest.fn();
const mockFormatProject = jest.fn();
const mockComposeBrief = jest.fn();

jest.mock('@/lib/knowledge/rag/manuscript', () => {
  const actual = jest.requireActual('@/lib/knowledge/rag/manuscript');
  return {
    ...actual,
    loadManuscriptInventory: (...args: unknown[]) => mockLoadInventory(...args),
    loadChapterText: (...args: unknown[]) => mockLoadChapterText(...args),
    loadManuscriptText: (...args: unknown[]) => mockLoadManuscriptText(...args),
    loadManuscriptChunksByIds: (...args: unknown[]) => mockLoadByIds(...args),
    searchManuscriptLexical: (...args: unknown[]) => mockLexical(...args),
    searchManuscriptSemantic: (...args: unknown[]) => mockSemantic(...args),
    findManuscriptPhrase: (...args: unknown[]) => mockFindPhrase(...args),
    mergeManuscriptHits: actual.mergeManuscriptHits,
  };
});

jest.mock('../project', () => ({
  loadUnframedProject: (...args: unknown[]) => mockLoadProject(...args),
  formatProjectState: (...args: unknown[]) => mockFormatProject(...args),
  composeProjectBrief: (...args: unknown[]) => mockComposeBrief(...args),
  searchUnframedProjectHistory: (...args: unknown[]) => mockSearchHistory(...args),
}));

function intent(patch: Partial<EditorialIntent>): EditorialIntent {
  return {
    operation: 'manuscript.inspect',
    confidence: 0.9,
    signals: ['test'],
    manuscriptRequested: true,
    projectRequested: false,
    explicitDocument: true,
    explicitProject: false,
    followUp: false,
    chapterNumber: null,
    chapterNumbers: [],
    chapterTitle: null,
    compareChapters: null,
    quotePhrase: null,
    searchQuery: '',
    wantsFullRead: false,
    wantsBroadCoverage: false,
    constraints: { excludedTopics: [], fromYear: null, toYear: null, raw: [] },
    needsClarification: false,
    clarification: null,
    ...patch,
  };
}

function context(patch: Partial<EditorialContext> = {}): EditorialContext {
  return {
    ...emptyEditorialContext(),
    projectId: 'project-1',
    projectSlug: 'unframed',
    projectName: 'Unframed',
    documentId: 'doc_unframed_manuscript',
    documentTitle: 'UNFRAMED',
    ...patch,
  };
}

function run(operationIntent: EditorialIntent, patch: Partial<EditorialContext> = {}) {
  return runEditorialOperation({
    ownerUserId: 'owner-1',
    conversationId: 'conversation-1',
    sessionId: 'session-1',
    requestId: 'request-1',
    message: 'test message',
    language: 'ru',
    intent: operationIntent,
    context: context(patch),
    store: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadInventory.mockResolvedValue(inventory);
  mockLoadManuscriptText.mockResolvedValue(chunks);
  mockLoadByIds.mockImplementation(async ({ chunkIds }: { chunkIds: string[] }) =>
    chunks.filter((chunk) => chunkIds.includes(chunk.chunkId))
  );
  mockLoadChapterText.mockImplementation(
    async ({ chapter }: { chapter: { startChunkIndex: number; endChunkIndex: number } }) => {
      const selected = chunks.filter(
        (chunk) =>
          chunk.chunkIndex >= chapter.startChunkIndex &&
          chunk.chunkIndex <= chapter.endChunkIndex
      );
      return {
        chunks: selected,
        coverage: {
          ...structure.coverage,
          coverageRatio: 1,
          complete: true,
          warnings: [],
          loadedChunkCount: selected.length,
          documentChunkCount: selected.length,
        },
        missing: [],
      };
    }
  );
  mockLexical.mockResolvedValue(lexicalHits);
  mockSemantic.mockResolvedValue({ available: true, hits: [] });
  mockFindPhrase.mockResolvedValue({
    phrase: 'digital ghost',
    matches: [
      {
        chunkId: 'chk_0003',
        chunkIndex: 3,
        heading: chapter14,
        sectionPath: ['PART II', chapter14],
        charStart: 3_900,
        charEnd: 5_500,
        lineStart: 81,
        lineEnd: 110,
        passage: 'I learned that a digital ghost can be more stable than a bank account.',
        passageCharStart: 4_800,
        passageCharEnd: 5_250,
      },
    ],
  });
});

describe('editorial operations', () => {
  it('A. resolves the exact manuscript and reports real coverage', async () => {
    const result = await run(intent({ operation: 'manuscript.inspect' }));
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('doc_unframed_manuscript');
    expect(result.markdown).toContain('6/6');
    expect(result.diagnostic.retrievalStrategy).toBe('document_identity+chunk_inventory');
  });

  it('B. accounts for all chunks in a whole-book map without claiming a model read', async () => {
    const result = await run(intent({ operation: 'manuscript.outline', wantsFullRead: true }));
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('Все 6 фрагментов учтены');
    expect(result.markdown).toContain('Модель не получала');
    expect(result.diagnostic.chunkCount).toBe(6);
  });

  it('C. returns diversified evidence across chapters', async () => {
    const result = await run(
      intent({ operation: 'manuscript.search', searchQuery: 'London', wantsBroadCoverage: true })
    );
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('CHAPTER 14');
    expect(result.markdown).toContain('CHAPTER 36');
    expect(result.diagnostic.chunkCount).toBe(3);
    expect(result.diagnostic.returnedChunkIds).toEqual(['chk_0002', 'chk_0003', 'chk_0004']);
  });

  it('D. loads a complete chapter in source order with coverage', async () => {
    const result = await run(
      intent({ operation: 'manuscript.chapter', chapterNumber: 14 }),
      { activeChapterNumber: 14 }
    );
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('CHAPTER 14');
    expect(result.markdown).toContain('chunks 2–3');
    expect(result.contextPatch.activeChapterNumber).toBe(14);
    expect(result.diagnostic.coverage).toBe(1);
  });

  it('D2. outputs the full chapter in sequential windows when asked', async () => {
    const result = await runEditorialOperation({
      ownerUserId: 'owner-1',
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      requestId: 'request-1',
      message: 'покажи главу 14 полностью',
      language: 'ru',
      intent: intent({ operation: 'manuscript.chapter', chapterNumber: 14 }),
      context: context({ activeChapterNumber: 14 }),
      store: null,
    });
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('Фрагмент 1/1');
    expect(result.markdown).toContain('Spectral Tiger');
  });

  it('E. compares two independent chapter scopes and keeps exact chunk references', async () => {
    const result = await run(
      intent({ operation: 'manuscript.compare', compareChapters: [14, 36] })
    );
    expect(result.status).toBe('needs_model');
    if (result.status !== 'needs_model') return;
    expect(result.systemPrompt).toContain('CHAPTER 14');
    expect(result.systemPrompt).toContain('CHAPTER 36');
    expect(result.systemPrompt).toContain('chunk:chk_0002');
    expect(result.systemPrompt).toContain('chunk:chk_0004');
    expect(result.diagnostic.retrievalStrategy).toBe('two_independent_chapter_scopes');
  });

  it('F. applies excluded topics from the inherited editorial context', async () => {
    const result = await run(
      intent({ operation: 'manuscript.search', searchQuery: 'London', wantsBroadCoverage: true }),
      {
        sourceConstraints: {
          excludedTopics: ['Spectral Tiger'],
          fromYear: null,
          toYear: null,
          raw: [],
        },
      }
    );
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.diagnostic.chunkCount).toBe(1);
    expect(result.markdown).not.toContain('2008 was the year');
  });

  it('G. broad continuation increases diversity above the old four-chunk cap', async () => {
    const result = await run(
      intent({
        operation: 'manuscript.search',
        searchQuery: 'London',
        followUp: true,
        wantsBroadCoverage: true,
      }),
      { currentEditorialObjective: 'London' }
    );
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.diagnostic.chunkCount).toBeGreaterThan(2);
  });

  it('M. reports incomplete chunk retrieval instead of claiming a complete read', async () => {
    mockLoadChapterText.mockResolvedValue({
      chunks: [chunks[2]],
      coverage: {
        ...structure.coverage,
        coverageRatio: 0.5,
        complete: false,
        warnings: ['missing_chunk_indices:3'],
      },
      missing: [3],
    });
    const result = await run(intent({ operation: 'manuscript.chapter', chapterNumber: 14 }));
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('ПРЕДУПРЕЖДЕНИЕ');
    expect(result.markdown).toContain('отсутствуют фрагменты 3');
    expect(result.diagnostic.coverage).toBe(0.5);
  });

  it('N. exposes a missing manuscript as a source failure, not an empty book', async () => {
    mockLoadInventory.mockRejectedValue(new ManuscriptDataError('not_found'));
    const result = await run(intent({ operation: 'manuscript.inspect' }));
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.markdown).toContain('не найдена в Brain');
    expect(result.markdown).toContain('не значит, что книга пуста');
    expect(result.diagnostic.errors).toContain('not_found');
  });

  it('returns an exact quotation with chunk id and character range', async () => {
    const result = await run(
      intent({ operation: 'manuscript.quote', quotePhrase: 'digital ghost' })
    );
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('chk_0003');
    expect(result.markdown).toContain('digital ghost');
    expect(result.markdown).toContain('4800–5250');
  });

  it('never fabricates a quotation when an exact phrase is absent', async () => {
    mockFindPhrase.mockResolvedValue({ phrase: 'absent phrase', matches: [] });
    const result = await run(
      intent({ operation: 'manuscript.quote', quotePhrase: 'absent phrase' })
    );
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.markdown).toContain('не найдена');
    expect(result.markdown).toContain('не буду пересказывать');
  });

  it('surfaces semantic-channel failure as a limitation, not an empty archive', async () => {
    mockSemantic.mockResolvedValue({ available: false, code: 'embedding_failed', hits: [] });
    const result = await run(
      intent({ operation: 'manuscript.search', searchQuery: 'London' })
    );
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('Семантический канал недоступен');
    expect(result.markdown).toContain('не доказательство отсутствия материала');
    expect(result.diagnostic.fallbackReason).toBe('embedding_failed');
  });

  it('I. reports the project with book, episodes, decisions and open tasks', async () => {
    const state = projectState();
    mockLoadProject.mockResolvedValue(state);
    mockFormatProject.mockReturnValue('## UNFRAMED — состояние проекта\n- рукопись и выпуски');
    mockComposeBrief.mockReturnValue({
      markdown: '# brief',
      revision: 1,
      sourceCount: 3,
      generatedAt: '2026-11-13T00:00:00.000Z',
      unverifiedClaims: [],
    });

    const result = await run(intent({ operation: 'project.overview' }));
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('состояние проекта');
    expect(result.markdown).toContain('Бриф проекта');
    expect(result.diagnostic.selectedSources).toContain('project');
  });

  it('J. never invents prior discussions when project history fails', async () => {
    mockLoadProject.mockResolvedValue(projectState());
    mockSearchHistory.mockResolvedValue({ hits: [], error: 'project_knowledge:permission denied' });
    const result = await run(intent({ operation: 'project.history' }));
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.markdown).toContain('ошибка запроса, а не отсутствие обсуждений');
  });

  it('J2. returns real project ideas with message/decision references', async () => {
    mockLoadProject.mockResolvedValue(projectState());
    mockSearchHistory.mockResolvedValue({
      hits: [
        {
          source: 'message',
          id: 'message-1',
          title: 'Сообщение владельца',
          excerpt: 'Идея: сделать выпуск про Fairlight и звук.',
          createdAt: '2026-11-12T09:31:00.000Z',
          projectId: 'project-1',
          evidenceClass: 'USER_CONFIRMED',
        },
      ],
      error: null,
    });
    const result = await run(intent({ operation: 'project.history' }));
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('message-1');
    expect(result.markdown).toContain('Fairlight');
    expect(result.markdown).toContain('Ничего не добавлено как решение');
  });

  it('K. proposes manuscript passages for an episode without saving a relation', async () => {
    mockLoadProject.mockResolvedValue(projectState());
    const result = await runEditorialOperation({
      ownerUserId: 'owner-1',
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      requestId: 'request-1',
      message: 'Свяжи этот выпуск с книгой.',
      language: 'ru',
      intent: intent({ operation: 'project.link_episode' }),
      context: context(),
      store: null,
    });
    expect(result.status).toBe('deterministic');
    if (result.status !== 'deterministic') return;
    expect(result.markdown).toContain('Episode 42');
    expect(result.markdown).toContain('chk_0002');
    expect(result.markdown).toContain('предложение, а не сохранённая связь');
  });
});

function projectState(): UnframedProjectState {
  return {
    project: {
      id: 'project-1',
      ownerUserId: 'owner-1',
      slug: 'unframed',
      name: 'UNFRAMED',
      description: '',
      objective: '',
      status: 'active',
      priority: 0,
      ownerRating: null,
      ownerRatingUpdatedAt: null,
      conversationId: 'conversation-1',
      projectBrief: '',
      briefRevision: 1,
      lastActivityAt: '2026-11-13T00:00:00.000Z',
      createdAt: '2026-11-11T00:00:00.000Z',
      updatedAt: '2026-11-13T00:00:00.000Z',
    },
    projectUnavailable: null,
    materials: [
      {
        id: 'doc_unframed_manuscript',
        title: 'UNFRAMED',
        sourceType: 'manuscript',
        sourcePath: 'app/unframed/Unframed.markdown',
        chunkCount: 169,
        sourceCharCount: 310_765,
        ingestionStatus: 'completed',
        extractionStatus: 'complete',
        relation: 'linked',
        role: 'manuscript',
      },
    ],
    materialsUnavailable: null,
    episodes: [
      {
        number: 42,
        slug: 'container',
        title: 'Step Out of the Physical Container',
        year: null,
        seriesLabel: 'A memoir by Anton Merkurov',
        videoUrl: 'https://www.youtube.com/embed/ZGhmmDVVwQg',
        statement: 'A cyber-noir transmission from the digital awakening.',
        chapterLabel: '06 — The Digital Awakening',
        chapterNumber: 6,
        bookUrl: '/unframed/book',
        source: 'repository_dataset',
        brainDocumentId: 'doc_episode_42',
      },
    ],
    decisions: [],
    decisionsUnavailable: null,
    openTasks: [
      {
        id: 'decision-1',
        title: 'Выбрать сцену для следующего ролика',
        content: '',
        kind: 'task',
        status: 'current',
        decidedAt: '2026-11-12T09:31:00.000Z',
        projectName: 'Unframed',
      },
    ],
    conversations: [
      { id: 'conversation-1', title: 'UNFRAMED', updatedAt: '2026-11-13T00:00:00.000Z' },
    ],
    artifacts: [],
    manuscript: inventory,
    manuscriptUnavailable: null,
  };
}
