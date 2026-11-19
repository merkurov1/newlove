/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import type { WebSearchResult } from '@/lib/knowledge/web/types';
import type { PierrotModelResult } from '@/lib/pierrot/model';
import { runPersonalAssistantTurn } from '../pipeline';
import type {
  PersonalAssistantMessage,
  PersonalAssistantProfile,
  PersonalAssistantStore,
} from '../store';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

function modelResult(reply: string): PierrotModelResult {
  return {
    reply,
    provider: 'deepseek',
    model: 'deepseek-chat',
    latencyMs: 12,
    fallbackUsed: false,
    finishReason: 'stop',
    usage: null,
    attempts: [],
  };
}

function relevantWebResult(query: string): WebSearchResult {
  return {
    outcome: 'relevant_results',
    query,
    latencyMs: 40,
    sources: [
      {
        index: 1,
        title: 'Example report',
        url: 'https://example.com/report',
        domain: 'example.com',
        publishedAt: '2026-11-19',
        author: null,
        text: 'A verified report about the current event.',
      },
    ],
  };
}

function createStore(input?: {
  history?: PersonalAssistantMessage[];
  memories?: Array<{ id: string; content: string; updatedAt: string | null }>;
  memoryEnabled?: boolean;
}) {
  const profile: PersonalAssistantProfile = {
    id: PROFILE_ID,
    telegramUserId: 291983727,
    displayName: 'Светлана Георгиевна',
    memoryEnabled: input?.memoryEnabled ?? true,
  };

  const messages: PersonalAssistantMessage[] = [...(input?.history ?? [])];
  const memories = [...(input?.memories ?? [])];

  const store: PersonalAssistantStore = {
    ensureProfile: jest.fn(async () => profile),
    setMemoryEnabled: jest.fn(async (_profileId: string, enabled: boolean) => {
      profile.memoryEnabled = enabled;
    }),
    loadHistory: jest.fn(async () => messages.slice()),
    appendMessage: jest.fn(async (entry) => {
      messages.push({ role: entry.role, content: entry.content });
    }),
    listMemories: jest.fn(async () => memories.slice()),
    rememberMemory: jest.fn(async (_profileId: string, content: string) => {
      memories.unshift({ id: `memory-${memories.length + 1}`, content, updatedAt: null });
    }),
    updateLatestMemory: jest.fn(async (_profileId: string, content: string) => {
      if (memories.length === 0) return false;
      memories[0] = { ...memories[0], content };
      return true;
    }),
    forgetMemory: jest.fn(async (_profileId: string, query: string | null) => {
      const before = memories.length;
      if (query) {
        for (let index = memories.length - 1; index >= 0; index -= 1) {
          if (memories[index].content.toLowerCase().includes(query.toLowerCase())) {
            memories.splice(index, 1);
          }
        }
      } else if (memories.length > 0) {
        memories.shift();
      }
      return before - memories.length;
    }),
    buildMemoryContext: jest.fn(async () =>
      memories.length > 0
        ? [
            'PERSONAL_MEMORY',
            ...memories.map((memory, index) => `${index + 1}. ${memory.content}`),
          ].join('\n')
        : null
    ),
  };

  return { store, profile, messages, memories };
}

describe('personal assistant turn pipeline', () => {
  it('does not search for an ordinary conversational question', async () => {
    const fake = createStore();
    const searchWeb = jest.fn(async () => relevantWebResult('joke'));
    const generate = jest.fn(async () => modelResult('A short joke.'));

    const result = await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'Tell me a joke',
      messageId: 'tgu_aaaaaaaa',
      store: fake.store,
      dependencies: { searchWeb, generate },
    });

    expect(searchWeb).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.searchedWeb).toBe(false);
    expect(result.reply).toBe('A short joke.');

    const [systemPrompt, messages] = generate.mock.calls[0] as unknown as [string, unknown[]];
    expect(systemPrompt).not.toContain('WEB_EVIDENCE_JSON');
    expect(systemPrompt).not.toContain('WEB_SEARCH_STATUS: unavailable');
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'Tell me a joke' });
  });

  it('uses the existing web search for current facts and appends sources', async () => {
    const fake = createStore();
    const searchWeb = jest.fn(async () => relevantWebResult('latest news today'));
    const generate = jest.fn(async () => modelResult('The report says the event happened.'));

    const result = await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'What is the latest news today?',
      messageId: 'tgu_bbbbbbbb',
      store: fake.store,
      dependencies: { searchWeb, generate },
    });

    expect(searchWeb).toHaveBeenCalledTimes(1);
    expect(result.searchedWeb).toBe(true);
    expect(result.reply).toContain('Sources:');
    expect(result.reply).toContain('https://example.com/report');

    const [systemPrompt] = generate.mock.calls[0] as unknown as [string, unknown[]];
    expect(systemPrompt).toContain('WEB_SEARCH_EVIDENCE');
  });

  it('marks a failed search as unavailable instead of inventing sources', async () => {
    const fake = createStore();
    const searchWeb = jest.fn(async () => {
      throw new Error('network down');
    });
    const generate = jest.fn(async () => modelResult('I could not verify this online.'));

    const result = await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'What is the latest news about the election?',
      messageId: 'tgu_cccccccc',
      store: fake.store,
      dependencies: { searchWeb, generate },
    });

    expect(result.searchedWeb).toBe(true);
    expect(result.reply).not.toContain('Sources:');

    const [systemPrompt] = generate.mock.calls[0] as unknown as [string, unknown[]];
    expect(systemPrompt).toContain('WEB_SEARCH_STATUS: unavailable');
  });

  it('loads and appends only this profile transcript', async () => {
    const fake = createStore({
      history: [
        { role: 'user', content: 'My name is Svetlana.' },
        { role: 'assistant', content: 'Noted.' },
      ],
    });
    const generate = jest.fn(async () => modelResult('Your name is Svetlana.'));

    await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'What is my name?',
      messageId: 'tgu_dddddddd',
      store: fake.store,
      dependencies: { searchWeb: jest.fn(), generate },
    });

    const [, messages] = generate.mock.calls[0] as unknown as [string, unknown[]];
    expect(messages).toEqual([
      { role: 'user', content: 'My name is Svetlana.' },
      { role: 'assistant', content: 'Noted.' },
      { role: 'user', content: 'What is my name?' },
    ]);
    expect(fake.messages).toEqual([
      { role: 'user', content: 'My name is Svetlana.' },
      { role: 'assistant', content: 'Noted.' },
      { role: 'user', content: 'What is my name?' },
      { role: 'assistant', content: 'Your name is Svetlana.' },
    ]);
  });

  it('adds profile memory to the prompt only when memory is enabled', async () => {
    const fake = createStore({
      memories: [{ id: 'm1', content: 'Prefers morning calls.', updatedAt: null }],
    });
    const generate = jest.fn(async () => modelResult('Okay.'));

    await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'When should we talk?',
      messageId: 'tgu_eeeeeeee',
      store: fake.store,
      dependencies: { searchWeb: jest.fn(), generate },
    });

    const [systemPrompt] = generate.mock.calls[0] as unknown as [string, unknown[]];
    expect(systemPrompt).toContain('PERSONAL_MEMORY');
    expect(systemPrompt).toContain('Prefers morning calls.');
  });

  it('handles remember, update, forget, list and disable without calling the model', async () => {
    const fake = createStore();
    const generate = jest.fn(async () => modelResult('model should not run'));
    const searchWeb = jest.fn();
    const run = (message: string, messageId: string) =>
      runPersonalAssistantTurn({
        profile: fake.profile,
        message,
        messageId,
        store: fake.store,
        dependencies: { searchWeb, generate },
      });

    await expect(run('Запомни, что я люблю сирень', 'tgu_f1')).resolves.toMatchObject({
      reply: 'Запомнила.',
      provider: 'system',
    });
    expect(fake.store.rememberMemory).toHaveBeenCalledWith(PROFILE_ID, 'я люблю сирень', 'tgu_f1');

    await expect(run('Обнови память: я люблю пионы', 'tgu_f2')).resolves.toMatchObject({
      reply: 'Обновила запись в памяти.',
    });
    expect(fake.store.updateLatestMemory).toHaveBeenCalledWith(PROFILE_ID, 'я люблю пионы');

    await expect(run('Что ты помнишь?', 'tgu_f3')).resolves.toMatchObject({
      reply: expect.stringContaining('я люблю пионы'),
    });

    await expect(run('Забудь пионы', 'tgu_f4')).resolves.toMatchObject({
      reply: 'Забыла эту запись.',
    });
    expect(fake.store.forgetMemory).toHaveBeenCalledWith(PROFILE_ID, 'пионы');

    await expect(run('Отключи память', 'tgu_f5')).resolves.toMatchObject({
      reply: expect.stringContaining('Память отключена'),
    });
    expect(fake.store.setMemoryEnabled).toHaveBeenCalledWith(PROFILE_ID, false);
    expect(generate).not.toHaveBeenCalled();
    expect(searchWeb).not.toHaveBeenCalled();
  });

  it('stops creating new memories while memory is disabled', async () => {
    const fake = createStore({
      memoryEnabled: false,
      memories: [{ id: 'm1', content: 'Old record.', updatedAt: null }],
    });
    const generate = jest.fn(async () => modelResult('model should not run'));

    const result = await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'Запомни, что я люблю сирень',
      messageId: 'tgu_disabled',
      store: fake.store,
      dependencies: { searchWeb: jest.fn(), generate },
    });

    expect(result.reply).toContain('Память отключена');
    expect(fake.store.rememberMemory).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers a privacy question without touching the memory store', async () => {
    const fake = createStore();
    const generate = jest.fn(async () => modelResult('model should not run'));

    const result = await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'Приватность',
      messageId: 'tgu_privacy',
      store: fake.store,
      dependencies: { searchWeb: jest.fn(), generate },
    });

    expect(result.reply).toContain('Память в этом чате приватна');
    expect(fake.store.listMemories).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps memory operations scoped to the supplied profile only', async () => {
    const fake = createStore();
    const other = createStore();

    await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'Remember that I like peonies',
      messageId: 'tgu_isolated',
      store: fake.store,
      dependencies: { searchWeb: jest.fn(), generate: jest.fn() },
    });

    expect(fake.store.rememberMemory).toHaveBeenCalledWith(
      PROFILE_ID,
      'I like peonies',
      'tgu_isolated'
    );
    expect(other.store.rememberMemory).not.toHaveBeenCalled();
    expect(other.store.appendMessage).not.toHaveBeenCalled();
  });

  it('follows the language of the latest message when it switches', async () => {
    const fake = createStore({
      history: [
        { role: 'user', content: 'Привет, меня зовут Светлана.' },
        { role: 'assistant', content: 'Здравствуйте, Светлана.' },
      ],
    });
    const generate = jest.fn(async () => modelResult('La capital es Madrid.'));

    await runPersonalAssistantTurn({
      profile: fake.profile,
      message: 'Hola, ¿cuál es la capital de España?',
      messageId: 'tgu_language',
      store: fake.store,
      dependencies: { searchWeb: jest.fn(), generate },
    });

    const [systemPrompt, messages] = generate.mock.calls[0] as unknown as [string, unknown[]];
    expect(systemPrompt).toContain('LATEST_USER_LANGUAGE: Spanish');
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'Hola, ¿cuál es la capital de España?',
    });
  });
});
