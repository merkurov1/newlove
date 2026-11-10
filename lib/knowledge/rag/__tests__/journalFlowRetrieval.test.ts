/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  buildJournalFlowPrompt,
  buildJournalFlowSources,
  buildJournalFlowUnavailablePrompt,
  emptyJournalFlowEvidence,
  parseJournalFlowRequest,
  retrieveJournalFlowEvidence,
  type JournalFlowStore,
} from '../journalFlowRetrieval';

const journal = [
  {
    id: 'letter-ru-24',
    title: 'Выпуск 24',
    slug: 'ru-issue-24',
    number: 24,
    language: 'ru',
    publishedAt: '2026-11-10T08:23:24.707Z',
    periodStart: '2026-11-03T08:22:00.000Z',
    periodEnd: '2026-11-10T08:22:00.000Z',
    url: '/letters/ru-issue-24',
    excerpt: 'Главная тема выпуска — таск-менеджеры умерли.',
    contentChars: 20258,
  },
  {
    id: 'letter-ru-22',
    title: 'Выпуск 22',
    slug: 'ru-issue-22',
    number: 22,
    language: 'ru',
    publishedAt: '2026-11-06T12:25:33.100Z',
    periodStart: '2026-10-30T12:23:00.000Z',
    periodEnd: '2026-11-06T12:20:00.000Z',
    url: '/letters/ru-issue-22',
    excerpt: 'Предыдущий выпуск.',
    contentChars: 17896,
  },
];

const flow = [
  {
    id: 'flow-1',
    type: 'article',
    title: 'Таск-менеджеры умерли',
    body: 'Короткая запись в потоке.',
    language: 'ru',
    publishedAt: '2026-11-05T11:47:36.130Z',
    sourceUrl: 'https://example.org/flow-1',
    url: '/flow?item=flow-1',
  },
];

function fakeStore(overrides: Partial<JournalFlowStore> = {}): JournalFlowStore {
  return {
    countJournal: async () => 23,
    loadJournal: async (request) => journal.slice(0, request.limit),
    countFlow: async () => 90,
    loadFlow: async () => flow,
    ...overrides,
  };
}

describe('Journal/Flow request parsing', () => {
  it('reads a bounded “last two issues” request', () => {
    expect(parseJournalFlowRequest('А последние два выпуска?', { plan: { language: 'ru' } })).toMatchObject(
      {
        sources: ['journal'],
        limit: 2,
        language: 'ru',
      }
    );
  });

  it('keeps Journal and Flow separate', () => {
    const request = parseJournalFlowRequest('Сопоставь Journal и Flow за 2025 год', {
      plan: { language: 'ru' },
    });

    expect(request?.sources).toEqual(['journal', 'flow']);
    expect(request?.year).toBe(2025);
    expect(request?.wantsComparison).toBe(true);
  });

  it('does not claim GitHub issues as Journal', () => {
    expect(parseJournalFlowRequest('GitHub issues по Art Engine')).toBeNull();
  });

  it('does not treat the /flow URL as the Flow editorial stream', () => {
    expect(parseJournalFlowRequest('Посещаемость /flow')).toBeNull();
    expect(parseJournalFlowRequest('Трафик https://merkurov.love/flow')).toBeNull();
  });

  it('keeps Journal statistics on the Journal inventory', () => {
    const request = parseJournalFlowRequest('Покажи статистику Journal', {
      plan: { language: 'ru' },
    });

    expect(request?.sources).toEqual(['journal']);
  });
});

describe('Journal/Flow retrieval', () => {
  it('uses exact published counts but returns a bounded issue sample', async () => {
    const evidence = await retrieveJournalFlowEvidence('Последние два выпуска', {
      plan: { language: 'ru' },
      store: fakeStore(),
    });

    expect(evidence?.outcome).toBe('relevant_results');
    expect(evidence?.journal).toHaveLength(2);
    expect(evidence?.totalJournal).toBe(23);
    expect(evidence?.request.limit).toBe(2);
  });

  it('keeps Journal issues and Flow entries in separate evidence arrays', async () => {
    const evidence = await retrieveJournalFlowEvidence('Journal и Flow', {
      plan: { language: 'ru' },
      store: fakeStore(),
    });

    const sources = buildJournalFlowSources(evidence!);
    expect(sources.filter((source) => source.sourceType === 'journal')).toHaveLength(2);
    expect(sources.filter((source) => source.sourceType === 'flow')).toHaveLength(1);

    const prompt = buildJournalFlowPrompt(evidence!);
    expect(prompt).toContain('JOURNAL_AND_FLOW_CONTEXT');
    expect(prompt).toContain('"journal"');
    expect(prompt).toContain('"flow"');
    expect(prompt).toContain('Never call a Flow item an issue');
  });

  it('reports an unavailable source without pretending it is empty', () => {
    const request = parseJournalFlowRequest('Последние выпуски')!;
    const evidence = emptyJournalFlowEvidence(request, 'unavailable', 'journal_query_failed', Date.now());

    expect(buildJournalFlowPrompt(evidence)).toBeNull();
    expect(buildJournalFlowUnavailablePrompt(evidence)).toContain('JOURNAL_FLOW_UNAVAILABLE');
    expect(buildJournalFlowSources(evidence)).toHaveLength(0);
  });

  it('reports an honest empty result', async () => {
    const evidence = await retrieveJournalFlowEvidence('Последние выпуски', {
      plan: { language: 'ru' },
      store: fakeStore({
        loadJournal: async () => [],
        countJournal: async () => 0,
      }),
    });

    expect(evidence?.outcome).toBe('no_match');
    expect(buildJournalFlowUnavailablePrompt(evidence!)).toContain('JOURNAL_FLOW_EMPTY');
  });

  it('returns unavailable when the database is not configured', async () => {
    const evidence = await retrieveJournalFlowEvidence('Последние выпуски', { store: null });
    expect(evidence?.outcome).toBe('unavailable');
    expect(evidence?.code).toBe('missing_configuration');
  });
});
