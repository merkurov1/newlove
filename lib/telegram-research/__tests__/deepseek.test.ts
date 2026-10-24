/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DeepSeekClient,
  DeepSeekError,
  buildChunks,
  runDeepSeek,
  type DeepSeekChatResult,
  type DeepSeekConfig,
} from '../deepseek';
import { makeMessage } from '../testing';

function config(overrides: Partial<DeepSeekConfig> = {}): DeepSeekConfig {
  return {
    apiKey: 'test-key-not-real',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    maxOutputTokens: 1000,
    temperature: 0.1,
    timeoutMs: 1000,
    maxRetries: 1,
    budgetUsd: 10,
    maxRequests: 100,
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1.2,
    thinking: 'disabled',
    ...overrides,
  };
}

function messages(count = 20) {
  return Array.from({ length: count }, (_, index) =>
    makeMessage({
      id: index + 1,
      dateMs: Date.parse('2024-01-01T00:00:00.000Z') + index * 60_000,
      senderId: index % 2 === 0 ? 1 : 42,
      text: `сообщение номер ${index + 1} с текстом`,
    })
  );
}

function targetIds(user: string): number[] {
  return [...user.matchAll(/\[target\] \[(\d+)\]/g)].map((match) => Number(match[1]));
}

class FakeClient {
  readonly model = 'deepseek-flash';
  calls = 0;
  failStage: string | null = null;
  invalidIds = false;

  async assertKey(): Promise<void> {
    return undefined;
  }

  async chatJson(system: string, user: string): Promise<DeepSeekChatResult> {
    this.calls += 1;
    if (this.failStage && system.includes(this.failStage)) {
      throw new DeepSeekError('синтетическая ошибка API', {
        code: 'INVALID_JSON',
        retryable: true,
      });
    }
    const ids = targetIds(user);
    const id = this.invalidIds ? 999_999 : (ids[0] ?? 1);
    if (system.includes('Извлекай только события')) {
      return result({
        events: [
          {
            type: 'assignment',
            summary: 'Проверить текст',
            sourceMessageIds: [id],
            confidence: 0.9,
            date: null,
            deadline: null,
            status: 'stated',
            participants: [],
          },
        ],
        notes: [],
      });
    }
    if (system.includes('Выдели темы')) {
      return result({
        topics: [
          {
            label: 'Редактура',
            description: 'Обсуждение правок',
            sourceMessageIds: [id],
            confidence: 0.8,
          },
        ],
        notes: [],
      });
    }
    return result({
      summary: 'Краткий синтез',
      timeline: [{ date: null, summary: 'Событие', sourceMessageIds: [id], confidence: 0.8 }],
      editorialEvents: [],
      recurringThemes: [],
      openQuestions: [],
      linguisticObservations: [
        {
          kind: 'observable',
          observation: 'Короткие реплики',
          evidenceMessageIds: [id],
          confidence: 0.7,
          alternativeInterpretations: [],
        },
      ],
      limitations: ['Тестовые данные'],
      disclaimer: 'Только наблюдаемые признаки.',
    });
  }
}

function result(data: unknown): DeepSeekChatResult {
  return {
    data,
    rawContent: JSON.stringify(data),
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.0001 },
    model: 'deepseek-flash',
  };
}

function asClient(fake: FakeClient): DeepSeekClient {
  return fake as unknown as DeepSeekClient;
}

describe('buildChunks', () => {
  it('делает последовательные фрагменты с перекрытием без дублей target', () => {
    const chunks = buildChunks(messages(20), { maxCharacters: 500, overlapMessages: 2 });
    expect(chunks.length).toBeGreaterThan(1);

    const targets = chunks.flatMap((chunk) => chunk.targetMessageIds);
    expect(targets).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(new Set(targets).size).toBe(targets.length);

    for (let index = 1; index < chunks.length; index += 1) {
      const previous = new Set(chunks[index - 1].targetMessageIds);
      expect(chunks[index].contextMessageIds.length).toBeLessThanOrEqual(2);
      expect(chunks[index].contextMessageIds.every((id) => previous.has(id))).toBe(true);
      expect(chunks[index].dateFrom >= chunks[index - 1].dateTo).toBe(true);
    }
  });

  it('не теряет очень длинное сообщение', () => {
    const chunks = buildChunks(
      [
        makeMessage({ id: 1, dateMs: 1_700_000_000_000, text: 'x'.repeat(5000) }),
        makeMessage({ id: 2, dateMs: 1_700_000_001_000, text: 'короткое' }),
      ],
      { maxCharacters: 1000, overlapMessages: 0 }
    );
    expect(chunks.flatMap((chunk) => chunk.targetMessageIds)).toEqual([1, 2]);
  });
});

describe('runDeepSeek', () => {
  it('проходит этапы events/topics/synthesis и сохраняет прогресс', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tg-deepseek-'));
    const fake = new FakeClient();
    const progress = await runDeepSeek({
      messages: messages(20),
      directory,
      config: config(),
      client: asClient(fake),
      maxCharacters: 500,
      overlapMessages: 2,
    });

    expect(progress.status).toBe('complete');
    expect(progress.entries.every((entry) => entry.status === 'complete')).toBe(true);
    expect(progress.usage.requests).toBeGreaterThan(3);
    const synthesis = JSON.parse(
      await readFile(path.join(directory, 'synthesis.json'), 'utf8')
    ) as {
      data: { summary: string };
    };
    expect(synthesis.data.summary).toBe('Краткий синтез');

    const callsAfterFirstRun = fake.calls;
    const second = await runDeepSeek({
      messages: messages(20),
      directory,
      config: config(),
      client: asClient(fake),
      maxCharacters: 500,
      overlapMessages: 2,
    });
    expect(second.status).toBe('complete');
    expect(fake.calls).toBe(callsAfterFirstRun);
  });

  it('повторно анализирует только неудачные фрагменты', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tg-deepseek-'));
    const bad = new FakeClient();
    bad.failStage = 'Извлекай только события';
    const first = await runDeepSeek({
      messages: messages(8),
      directory,
      config: config(),
      client: asClient(bad),
      maxCharacters: 500,
      overlapMessages: 1,
    });
    expect(first.status).toBe('partial');
    expect(first.entries.some((entry) => entry.status === 'failed')).toBe(true);

    const good = new FakeClient();
    const second = await runDeepSeek({
      messages: messages(8),
      directory,
      config: config(),
      client: asClient(good),
      maxCharacters: 500,
      overlapMessages: 1,
      retryFailed: true,
    });
    expect(second.status).toBe('complete');
    const failedIds = first.entries
      .filter((entry) => entry.status === 'failed')
      .map((entry) => `${entry.stage}:${entry.chunkIndex}`);
    expect(failedIds.length).toBeGreaterThan(0);
    expect(good.calls).toBe(failedIds.length + 1);
  });

  it('отклоняет ответ со ссылкой на несуществующий message id', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tg-deepseek-'));
    const fake = new FakeClient();
    fake.invalidIds = true;
    const progress = await runDeepSeek({
      messages: messages(5),
      directory,
      config: config(),
      client: asClient(fake),
      maxCharacters: 500,
      overlapMessages: 1,
    });
    expect(progress.status).toBe('partial');
    expect(progress.entries.some((entry) => entry.error?.includes('несуществующие ID'))).toBe(true);
  });

  it('останавливается по бюджету до отправки запросов', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tg-deepseek-'));
    const fake = new FakeClient();
    const progress = await runDeepSeek({
      messages: messages(5),
      directory,
      config: config({ budgetUsd: 0.000001, maxOutputTokens: 100 }),
      client: asClient(fake),
      maxCharacters: 500,
      overlapMessages: 1,
    });
    expect(fake.calls).toBe(0);
    expect(progress.status).toBe('partial');
    expect(progress.entries.some((entry) => entry.error?.includes('бюджет'))).toBe(true);
  });

  it('помечает повреждённый ответ API как failed', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tg-deepseek-'));
    const fake = new FakeClient();
    fake.failStage = 'Извлекай только события';
    const progress = await runDeepSeek({
      messages: messages(5),
      directory,
      config: config(),
      client: asClient(fake),
      maxCharacters: 500,
      overlapMessages: 1,
    });
    expect(progress.status).toBe('partial');
    expect(progress.entries.some((entry) => entry.error?.includes('синтетическая ошибка'))).toBe(
      true
    );
  });

  it('dry-run не отправляет запросы и не требует ключа', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tg-deepseek-'));
    const fake = new FakeClient();
    const progress = await runDeepSeek({
      messages: messages(5),
      directory,
      config: config({ apiKey: '' }),
      client: asClient(fake),
      maxCharacters: 500,
      overlapMessages: 1,
      dryRun: true,
    });
    expect(fake.calls).toBe(0);
    expect(progress.status).toBe('planned');
  });
});
