/**
 * @jest-environment node
 */

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

import {
  buildEditorialComposition,
  compositionReadiness,
  reconcileEditorialComposition,
} from '../composition';
import { buildIssuePayload } from '../build';
import { renderIssue } from '../render';
import { buildCandidate } from '../editorial';
import { ANALYSIS_VERSION, buildAnalysisInput, contentHash, heuristicAnalysis } from '../analysis';
import type {
  EditorialComposition,
  FlowItem,
  IssueAI,
  IssueEntry,
} from '../types';

const start = new Date('2026-11-19T00:00:00.000Z');
const end = new Date('2026-11-26T23:59:59.000Z');

function item(overrides: Partial<FlowItem> = {}): FlowItem {
  const id = overrides.id || 'item-1';

  return {
    id,
    type: 'note',
    status: 'published',
    visibility: 'public',
    lang: 'ru',
    slug: id,
    title: `Материал ${id}`,
    body_md: `Конкретное наблюдение ${id}. Здесь достаточно слов, чтобы заметка была содержательной и имела собственный тезис.`,
    source_url: null,
    ai_allowed: true,
    metadata: {},
    created_at: '2026-11-20T10:00:00.000Z',
    updated_at: '2026-11-20T10:00:00.000Z',
    published_at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

function seventeenItems(): FlowItem[] {
  const notes = [1, 2, 3].map((index) =>
    item({
      id: `note-${index}`,
      title: `Заметка ${index}`,
      published_at: `2026-11-1${index}T10:00:00.000Z`,
    })
  );

  const link = item({
    id: 'link-1',
    type: 'link',
    title: 'Почему архивы важны',
    body_md: '',
    source_url: 'https://example.com/archive',
    published_at: '2026-11-18T10:00:00.000Z',
    metadata: {
      link_previews: [
        {
          url: 'https://example.com/archive',
          title: 'Почему архивы важны',
          description: 'Аргумент о публичной памяти и доступе.',
          site_name: 'Example Journal',
        },
      ],
    },
  });

  const photos = Array.from({ length: 7 }, (_, index) =>
    item({
      id: `photo-${index}`,
      type: 'photo',
      title: '',
      body_md: '',
      lang: 'ru',
      published_at: `2026-11-2${index % 7}T12:00:00.000Z`,
      metadata: {
        public_url: `https://cdn.example.com/photo-${index}.jpg`,
        alt: `Кадр ${index}`,
        caption: `Подпись ${index}`,
      },
    })
  );

  const videos = Array.from({ length: 6 }, (_, index) =>
    item({
      id: `video-${index}`,
      type: 'video',
      title: '',
      body_md: '',
      published_at: `2026-11-2${index}T15:00:00.000Z`,
      metadata: {
        youtube: {
          video_id: `video-id-${index}`,
          title: `Видео ${index}`,
          thumbnail_url: `https://i.ytimg.com/vi/video-id-${index}/hqdefault.jpg`,
          author_name: 'Channel',
        },
      },
    })
  );

  return [...notes, link, ...photos, ...videos];
}

function withAnalysis(source: FlowItem, overrides: Partial<IssueAI> = {}): FlowItem {
  const cached: IssueAI = {
    lang: 'ru',
    kind: 'world',
    model: 'test-model',
    at: '2026-11-20T00:00:00.000Z',
    schemaVersion: ANALYSIS_VERSION,
    contentHash: contentHash(buildAnalysisInput(source)),
    topic: 'наблюдение',
    subtopic: '',
    summary: 'Краткое содержание материала.',
    thesis: 'Тезис материала.',
    editorialValue: 4,
    originality: 4,
    specificity: 4,
    readerValue: 4,
    contextRequired: '',
    confidence: 0.85,
    role: 'supporting',
    rationale: 'Тестовый анализ.',
    ...overrides,
  };

  return {
    ...source,
    metadata: {
      ...(source.metadata || {}),
      issue_ai: cached,
    },
  };
}

function query(result: { data: unknown; error: null }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };

  return chain;
}

function fakeSupabase(items: FlowItem[]) {
  return {
    from(table: string) {
      if (table === 'flow_issue_template_versions' || table === 'letters') {
        return query({ data: null, error: null });
      }

      return query({ data: items, error: null });
    },
  };
}

function entryFor(item: FlowItem): IssueEntry {
  return {
    id: item.id,
    type: item.type,
    title: item.title || item.metadata?.youtube?.title || '',
    body: item.body_md || '',
    url: item.source_url,
    publishedAt: item.published_at || item.created_at,
    createdAt: item.created_at,
    metadata: item.metadata || {},
    lang: 'ru',
    kind: 'other',
    own: true,
    aiAllowed: item.ai_allowed === true,
    image: item.metadata?.public_url || item.metadata?.youtube?.thumbnail_url || '',
    caption: item.metadata?.youtube?.title || item.metadata?.caption || '',
  };
}

describe('editorial composition', () => {
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeAll(() => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  });

  it('accounts for all 17 source materials of issue 27 exactly once', async () => {
    const items = seventeenItems();
    const payload = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);
    const composition = payload.editorialComposition;

    expect(composition).toBeDefined();
    expect(payload.items).toHaveLength(17);

    const ledgerIds = composition!.ledger.map((entry) => entry.id).sort();
    expect(ledgerIds).toEqual(items.map((source) => source.id).sort());
    expect(new Set(ledgerIds).size).toBe(17);

    const partIds = composition!.parts.flatMap((part) => part.entryIds);
    expect(partIds).toHaveLength(17);
    expect(new Set(partIds).size).toBe(17);
    expect(partIds.sort()).toEqual(ledgerIds);

    const diagnostics = composition!.diagnostics;
    expect(diagnostics.source_count).toBe(17);
    expect(diagnostics.assigned_count).toBe(17);
    expect(diagnostics.unassigned_count).toBe(0);
    expect(diagnostics.duplicate_count).toBe(0);
    expect(diagnostics.per_type).toEqual({
      note: 3,
      link: 1,
      photo: 7,
      video: 6,
    });
    expect(diagnostics.complete).toBe(true);
    expect(compositionReadiness(payload).ready).toBe(true);

    // The public web issue must expose every material ID and every real link.
    const rendered = renderIssue(payload, {
      title: 'Выпуск 27',
      slug: 'issue-27',
      number: 27,
    });

    for (const source of items) {
      expect(rendered.htmlWeb).toContain(`data-item-id="${source.id}"`);
    }

    expect(rendered.htmlWeb).toContain('https://cdn.example.com/photo-0.jpg');
    expect(rendered.htmlWeb).toContain('https://www.youtube.com/watch?v=video-id-0');
    expect(rendered.htmlWeb).toContain('https://example.com/archive');

    // Photos and videos are not reduced to decoration: they have their own
    // captions/images and remain visible in the full overview.
    expect(rendered.htmlWeb).toContain('Подпись 0');
    expect(rendered.htmlWeb).toContain('Видео 0');
  });

  it('keeps material that the legacy section limits and the AI score would drop', async () => {
    const items = seventeenItems();
    const payload = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);

    // The legacy template still has limits. They may shape the old arrays,
    // but they must not remove anything from the composition.
    expect(payload.photos.length).toBeLessThanOrEqual(4);

    const composition = payload.editorialComposition!;
    const partIds = composition.parts.flatMap((part) => part.entryIds);
    const legacyIds = new Set(
      [
        payload.lead?.id,
        ...payload.latest.map((entry) => entry.id),
        ...payload.links.map((entry) => entry.id),
        ...payload.videos.map((entry) => entry.id),
        ...payload.photos.map((entry) => entry.id),
      ].filter((id): id is string => Boolean(id))
    );

    expect(composition.ledger.every((entry) => entry.partIndex !== null)).toBe(true);
    expect(partIds).toHaveLength(17);
    expect(partIds.filter((id) => !legacyIds.has(id)).length).toBeGreaterThan(0);
    expect(composition.parts.length).toBeGreaterThan(1);
  });

  it('keeps ai_allowed === false material in the ledger and render output without sending it', async () => {
    const secret = item({
      id: 'private-note',
      title: 'Приватная заметка',
      body_md: 'Очень личный текст, который не должен уходить в модель.',
      ai_allowed: false,
    });
    const items = [secret, item({ id: 'public-note' })];
    const payload = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);

    expect(mockCreate).not.toHaveBeenCalled();

    const composition = payload.editorialComposition!;
    const privateEntry = composition.ledger.find((entry) => entry.id === 'private-note');

    expect(privateEntry).toBeDefined();
    expect(privateEntry?.aiAllowed).toBe(false);
    expect(composition.diagnostics.ai_allowed_count).toBe(1);
    expect(composition.diagnostics.complete).toBe(true);

    const rendered = renderIssue(payload, {
      title: 'Приватный выпуск',
      slug: 'private-issue',
      number: 1,
    });

    expect(rendered.htmlWeb).toContain('data-item-id="private-note"');
    expect(rendered.htmlWeb).toContain('Приватная заметка');
  });

  it('expresses the same composition in RU and EN without a random second selection', async () => {
    // Photos with an explicit RU/EN edition belong to that edition only (an
    // existing product rule). For this equivalence test use the legacy
    // language-neutral form so both editions see the same corpus.
    const items = seventeenItems().map((source) =>
      source.type === 'photo' ? { ...source, lang: null } : source
    );
    const supabase = fakeSupabase(items);
    const ru = await buildIssuePayload(supabase as any, 'ru', start, end);
    const en = await buildIssuePayload(supabase as any, 'en', start, end);

    const ruComposition = ru.editorialComposition!;
    const enComposition = en.editorialComposition!;

    expect(enComposition.ledger.map((entry) => entry.id)).toEqual(
      ruComposition.ledger.map((entry) => entry.id)
    );
    expect(enComposition.parts.map((part) => part.kind)).toEqual(
      ruComposition.parts.map((part) => part.kind)
    );
    expect(enComposition.parts.map((part) => part.entryIds)).toEqual(
      ruComposition.parts.map((part) => part.entryIds)
    );
    expect(enComposition.ledger.map((entry) => entry.role)).toEqual(
      ruComposition.ledger.map((entry) => entry.role)
    );

    expect(ruComposition.column.join(' ')).toMatch(/[А-Яа-я]/);
    expect(enComposition.column.join(' ')).not.toMatch(/[А-Яа-я]/);
    expect(ruComposition.columnSource).toBe('fallback');
    expect(enComposition.columnSource).toBe('fallback');
  });

  it('does not invent a single central story for a mixed week without a real lead', async () => {
    const items = [
      item({
        id: 'mixed-a',
        title: 'Короткая заметка',
        body_md: 'Одно наблюдение.',
        published_at: '2026-11-20T10:00:00.000Z',
      }),
      item({
        id: 'mixed-b',
        type: 'photo',
        title: '',
        body_md: '',
        metadata: { public_url: 'https://cdn.example.com/b.jpg', alt: 'Кадр' },
        published_at: '2026-11-21T10:00:00.000Z',
      }),
    ];

    const payload = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);
    const composition = payload.editorialComposition!;

    expect(composition.parts.some((part) => part.kind === 'central')).toBe(false);
    expect(composition.concept.title).toBe('Несколько линий недели');
    expect(composition.diagnostics.complete).toBe(true);
  });

  it('reports and repairs missing IDs instead of silently shipping an incomplete issue', () => {
    const items = [item({ id: 'one' }), item({ id: 'two' })];
    const entries = new Map(items.map((source) => [source.id, entryFor(source)]));
    const analyses = new Map<string, IssueAI>();
    const candidates = new Map(
      items.map((source) => {
        const entry = entryFor(source);
        const analysis = heuristicAnalysis(source);
        analyses.set(source.id, analysis);
        return [source.id, buildCandidate(entry, analysis, end)];
      })
    );

    const composition = buildEditorialComposition({
      lang: 'ru',
      period: { start: start.toISOString(), end: end.toISOString() },
      records: items,
      editionIds: new Set(items.map((source) => source.id)),
      entries,
      analyses,
      candidates,
      windowEnd: end,
    });

    const tampered: EditorialComposition = {
      ...composition,
      ledger: composition.ledger.filter((entry) => entry.id !== 'two'),
      parts: composition.parts.map((part) => ({
        ...part,
        entryIds: part.entryIds.filter((id) => id !== 'two'),
      })),
    };

    const repaired = reconcileEditorialComposition(tampered, items, entries);

    expect(repaired.ledger.map((entry) => entry.id).sort()).toEqual(['one', 'two']);
    expect(repaired.diagnostics.complete).toBe(true);
    expect(repaired.diagnostics.issues.join(' ')).toContain('two');
    expect(compositionReadiness({ editorialComposition: repaired }).ready).toBe(true);
  });

  it('flags duplicate source IDs instead of pretending the issue is complete', () => {
    const source = item({ id: 'duplicate' });
    const entries = new Map([[source.id, entryFor(source)]]);

    const composition = buildEditorialComposition({
      lang: 'ru',
      period: { start: start.toISOString(), end: end.toISOString() },
      records: [source, source],
      editionIds: new Set([source.id]),
      entries,
      analyses: new Map(),
      candidates: new Map(),
      windowEnd: end,
    });

    expect(composition.diagnostics.complete).toBe(false);
    expect(composition.diagnostics.duplicate_count).toBeGreaterThan(0);
    expect(compositionReadiness({ editorialComposition: composition }).ready).toBe(false);
    expect(compositionReadiness({ editorialComposition: composition }).reason).toContain(
      'Неполное покрытие'
    );
  });

  it('builds several thematic lines instead of mechanically filling type sections', async () => {
    const items = [
      withAnalysis(
        item({
          id: 'lead-attention',
          title: 'Внимание как валюта',
          body_md:
            'Длинный аргумент о внимании, который задаёт масштаб всей недели и связывает остальные материалы.',
        }),
        {
          topic: 'внимание',
          role: 'lead',
          editorialValue: 5,
          originality: 5,
          specificity: 4,
          readerValue: 5,
          confidence: 0.9,
        }
      ),
      withAnalysis(
        item({
          id: 'memory-a',
          title: 'Архив как форма памяти',
          body_md: 'Первый материал о памяти: институции, каталоги и доступ к прошлому.',
        }),
        { topic: 'память', editorialValue: 4, originality: 4, specificity: 4, readerValue: 4 }
      ),
      withAnalysis(
        item({
          id: 'memory-b',
          title: 'Забывание как инфраструктура',
          body_md: 'Второй материал о памяти: удаление, исчезновение и право быть забытым.',
        }),
        { topic: 'память', editorialValue: 4, originality: 5, specificity: 4, readerValue: 4 }
      ),
      withAnalysis(
        item({
          id: 'software-a',
          title: 'Код как редактура',
          body_md: 'Первый материал о программном обеспечении: выбор, сортировка и интерфейс.',
        }),
        { topic: 'софт', editorialValue: 4, originality: 4, specificity: 4, readerValue: 4 }
      ),
      withAnalysis(
        item({
          id: 'software-b',
          title: 'Интерфейс как обещание',
          body_md: 'Второй материал о программном обеспечении: ожидания, которые создаёт экран.',
        }),
        { topic: 'софт', editorialValue: 4, originality: 4, specificity: 5, readerValue: 4 }
      ),
      withAnalysis(
        item({
          id: 'walk',
          title: 'Прогулка по городу',
          body_md: 'Самостоятельный сюжет без общей рамки: улицы, погода и случайные встречи.',
        }),
        { topic: 'город', editorialValue: 3, originality: 3, specificity: 3, readerValue: 3 }
      ),
    ];

    const payload = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);
    const composition = payload.editorialComposition!;

    expect(composition.parts.some((part) => part.kind === 'central')).toBe(true);

    const threads = composition.parts.filter((part) => part.kind === 'thread');
    expect(threads.length).toBe(2);
    expect(threads.map((part) => part.entryIds.sort())).toEqual(
      expect.arrayContaining([
        ['memory-a', 'memory-b'],
        ['software-a', 'software-b'],
      ])
    );

    expect(composition.parts.some((part) => part.kind === 'episode')).toBe(true);
    expect(composition.ledger.every((entry) => entry.reason.length > 0)).toBe(true);
    expect(composition.diagnostics.complete).toBe(true);
  });

  it('renders every material even when the legacy sections are empty', async () => {
    const items = [
      withAnalysis(
        item({
          id: 'omitted-note',
          title: 'Слабая заметка',
          body_md: 'Короткий текст, который модельный анализ счёл слабым.',
        }),
        { role: 'omit', editorialValue: 0, originality: 0, specificity: 0, readerValue: 0 }
      ),
      withAnalysis(
        item({
          id: 'omitted-photo',
          type: 'photo',
          title: '',
          body_md: '',
          metadata: { public_url: 'https://cdn.example.com/omit.jpg', alt: 'Кадр' },
        }),
        { role: 'omit', editorialValue: 0, originality: 0, specificity: 0, readerValue: 0 }
      ),
      withAnalysis(
        item({
          id: 'omitted-video',
          type: 'video',
          title: '',
          body_md: '',
          metadata: {
            youtube: {
              video_id: 'omit-video',
              title: 'Видео без транскрипта',
              thumbnail_url: 'https://i.ytimg.com/vi/omit-video/hqdefault.jpg',
            },
          },
        }),
        { role: 'omit', editorialValue: 0, originality: 0, specificity: 0, readerValue: 0 }
      ),
    ];

    const payload = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);

    expect(payload.latest).toHaveLength(0);
    expect(payload.photos).toHaveLength(0);
    expect(payload.videos.map((entry) => entry.id)).toEqual(['omitted-video']);
    expect(payload.editorialComposition!.diagnostics.complete).toBe(true);

    const rendered = renderIssue(payload, {
      title: 'Пустые рубрики',
      slug: 'empty-sections',
      number: 2,
    });

    for (const source of items) {
      expect(rendered.htmlWeb).toContain(`data-item-id="${source.id}"`);
    }
  });

  it('is deterministic across repeated generation with the same data', async () => {
    const items = seventeenItems();
    const first = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);
    const second = await buildIssuePayload(fakeSupabase(items) as any, 'ru', start, end);

    expect(second.editorialComposition!.ledger).toEqual(first.editorialComposition!.ledger);
    expect(second.editorialComposition!.parts).toEqual(first.editorialComposition!.parts);
    expect(second.editorialComposition!.column).toEqual(first.editorialComposition!.column);
  });

  it('lets the column model see every AI-allowed material, not the first 18', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    delete process.env.GEMINI_API_KEY;
    mockCreate.mockReset();

    const items = Array.from({ length: 40 }, (_, index) =>
      item({
        id: `bulk-${index}`,
        title: `Bulk material ${index}`,
        body_md: `${'concrete detail '.repeat(60)} ${index}`,
      })
    );

    const entries = new Map(items.map((source) => [source.id, entryFor(source)]));
    const analyses = new Map<string, IssueAI>();
    const candidates = new Map(
      items.map((source) => {
        const entry = entryFor(source);
        const analysis = heuristicAnalysis(source);
        analyses.set(source.id, analysis);
        return [source.id, buildCandidate(entry, analysis, end)];
      })
    );

    const composition = buildEditorialComposition({
      lang: 'ru',
      period: { start: start.toISOString(), end: end.toISOString() },
      records: items,
      editionIds: new Set(items.map((source) => source.id)),
      entries,
      analyses,
      candidates,
      windowEnd: end,
    });

    const prompts: string[] = [];

    mockCreate.mockImplementation(async (request: any) => {
      const system = String(request?.messages?.[0]?.content || '');
      const prompt = String(request?.messages?.[1]?.content || '');
      prompts.push(prompt);

      if (system.includes('research assistant')) {
        return {
          choices: [{ message: { content: JSON.stringify({ summary: 'Chunk summary.' }) } }],
        };
      }

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Общий сюжет',
                paragraphs: ['Первый абзац.', 'Второй абзац.', 'Третий абзац.'],
              }),
            },
          },
        ],
      };
    });

    const { generateEditorialColumn } = await import('../deepseek');
    const column = await generateEditorialColumn({
      composition,
      entries,
      analyses,
      lang: 'ru',
      period: { start: start.toISOString(), end: end.toISOString() },
    });

    expect(column?.paragraphs).toHaveLength(3);
    expect(prompts.length).toBeGreaterThan(1);

    const joined = prompts.join('\n');

    for (const source of items) {
      expect(joined).toContain(source.title as string);
    }

    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });

  it('feeds textual metadata from every type into the column and drops image payloads', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    delete process.env.GEMINI_API_KEY;
    mockCreate.mockReset();

    const imageUrl = 'https://cdn.example.com/photo.jpg';
    const items = [
      item({
        id: 'photo-with-text',
        type: 'photo',
        title: '',
        body_md: '',
        metadata: {
          public_url: imageUrl,
          images: [{ url: imageUrl, alt: 'A nested image description' }],
          alt: 'A quiet street at dawn',
          caption: 'Morning light on the facades.',
          imported_note: 'An imported textual note.',
        },
      }),
      item({
        id: 'imported-audio',
        type: 'audio',
        title: '',
        body_md: '',
        metadata: {
          transcript: 'An audio transcript with actual words.',
          show_notes: 'The show notes for the episode.',
        },
      }),
    ];

    const entries = new Map(items.map((source) => [source.id, entryFor(source)]));
    const analyses = new Map<string, IssueAI>();
    const candidates = new Map(
      items.map((source) => {
        const entry = entryFor(source);
        const analysis = heuristicAnalysis(source);
        analyses.set(source.id, analysis);
        return [source.id, buildCandidate(entry, analysis, end)];
      })
    );

    const composition = buildEditorialComposition({
      lang: 'ru',
      period: { start: start.toISOString(), end: end.toISOString() },
      records: items,
      editionIds: new Set(items.map((source) => source.id)),
      entries,
      analyses,
      candidates,
      windowEnd: end,
    });

    const prompts: string[] = [];

    mockCreate.mockImplementation(async (request: any) => {
      const system = String(request?.messages?.[0]?.content || '');
      prompts.push(String(request?.messages?.[1]?.content || ''));

      if (system.includes('research assistant')) {
        return {
          choices: [{ message: { content: JSON.stringify({ summary: 'Chunk summary.' }) } }],
        };
      }

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Общий сюжет',
                paragraphs: ['Первый абзац.', 'Второй абзац.', 'Третий абзац.'],
              }),
            },
          },
        ],
      };
    });

    const { generateEditorialColumn } = await import('../deepseek');
    const column = await generateEditorialColumn({
      composition,
      entries,
      analyses,
      lang: 'ru',
      period: { start: start.toISOString(), end: end.toISOString() },
    });

    expect(column).not.toBeNull();

    const joined = prompts.join('\n');

    expect(joined).toContain('A quiet street at dawn');
    expect(joined).toContain('Morning light on the facades.');
    expect(joined).toContain('A nested image description');
    expect(joined).toContain('An imported textual note.');
    expect(joined).toContain('An audio transcript with actual words.');
    expect(joined).toContain('The show notes for the episode.');
    expect(joined).not.toContain(imageUrl);

    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalKey;
  });
});
