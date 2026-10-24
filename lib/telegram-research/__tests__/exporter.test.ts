/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { exportHistory, type ExportClient } from '../exporter';
import { TgCliError, type TgHistoryResponse } from '../tg-cli';
import { makeChat, rawMessage } from '../testing';

class FakeClient implements ExportClient {
  readonly calls: Array<{ offsetId: number; limit: number }> = [];
  private readonly pages: Map<number, unknown[]>;
  private readonly failures: Map<number, number>;

  constructor(pages: Map<number, unknown[]>, failures = new Map<number, number>()) {
    this.pages = pages;
    this.failures = new Map(failures);
  }

  async historyPage(_peer: string, offsetId: number, limit = 100): Promise<TgHistoryResponse> {
    this.calls.push({ offsetId, limit });
    const failuresLeft = this.failures.get(offsetId) ?? 0;
    if (failuresLeft > 0) {
      this.failures.set(offsetId, failuresLeft - 1);
      throw new TgCliError({
        code: 'NETWORK_ERROR',
        message: 'синтетический сетевой сбой',
        waitSeconds: null,
        exitCode: 4,
        details: { offsetId },
        suggestion: null,
      });
    }
    return response(this.pages.get(offsetId) ?? []);
  }
}

function response(messages: unknown[]): TgHistoryResponse {
  const raw = {
    _: messages.length === 0 ? 'messages.messages' : 'messages.messagesSlice',
    messages,
    users: [
      { _: 'user', id: 42, firstName: 'Test', lastName: 'Contact', username: 'test_contact' },
      { _: 'user', id: 1, firstName: 'Me', username: 'me' },
    ],
  };
  return { messages, users: raw.users, chats: [], count: messages.length, raw };
}

function rawPage(ids: number[]): unknown[] {
  return ids.map((id) =>
    rawMessage(id, 1_700_000_000 + id, `message ${id}`, {
      fromId: { _: 'peerUser', userId: id % 2 === 0 ? 42 : 1 },
      out: id % 2 !== 0,
    })
  );
}

function standardPages(): Map<number, unknown[]> {
  return new Map<number, unknown[]>([
    [0, rawPage([105, 104, 103, 102, 101])],
    [101, rawPage([100, 99, 98, 97, 96])],
    [96, rawPage([95, 94, 93, 92, 91])],
    [91, []],
  ]);
}

async function tempPaths(): Promise<{
  root: string;
  state: string;
  corpus: string;
  manifest: string;
  rawPagesDir: string;
  meta: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'tg-research-'));
  return {
    root,
    state: path.join(root, 'export-state.json'),
    corpus: path.join(root, 'corpus.jsonl'),
    manifest: path.join(root, 'manifest.json'),
    rawPagesDir: path.join(root, 'raw', 'pages'),
    meta: path.join(root, 'raw', 'meta.json'),
  };
}

describe('exportHistory pagination', () => {
  it('проходит всю историю, удаляет дубли и подтверждает голову', async () => {
    const paths = await tempPaths();
    const client = new FakeClient(standardPages());
    let clock = Date.parse('2026-01-01T00:00:00.000Z');
    const result = await exportHistory({
      client,
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 0,
      now: () => new Date((clock += 1000)),
      sleepFn: async () => undefined,
      latestVisible: async () => ({ id: 105, checkedAt: '2026-01-01T00:00:00.000Z' }),
    });

    expect(result.manifest.corpus.messageCount).toBe(15);
    expect(result.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 15 }, (_, index) => 91 + index)
    );
    expect(result.manifest.export.pages).toBe(4);
    expect(result.manifest.export.headPages).toBe(1);
    expect(result.manifest.export.duplicatesDropped).toBe(5);
    expect(result.manifest.completeness.checks.reachedEmptyPage).toBe(true);
    expect(result.manifest.completeness.checks.headStable).toBe(true);
    expect(result.manifest.completeness.checks.latestVisibleMessageMatched).toBe(true);
    expect(result.manifest.completeness.status).toBe('complete');
    expect(client.calls.map((call) => call.offsetId)).toEqual([0, 101, 96, 91, 0]);

    const corpus = await readFile(paths.corpus, 'utf8');
    expect(corpus.trim().split('\n')).toHaveLength(15);
  });

  it('возобновляет экспорт после сбоя, не теряя уже скачанные страницы', async () => {
    const paths = await tempPaths();
    const first = new FakeClient(standardPages(), new Map([[101, 99]]));
    const firstResult = await exportHistory({
      client: first,
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 1,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleepFn: async () => undefined,
      latestVisible: async () => ({ id: 105, checkedAt: '2026-01-01T00:00:00.000Z' }),
    });

    expect(firstResult.messages.map((message) => message.id)).toEqual([101, 102, 103, 104, 105]);
    expect(firstResult.state.reachedStart).toBe(false);
    expect(firstResult.manifest.completeness.status).toBe('incomplete');
    expect(firstResult.state.nextOffsetId).toBe(101);

    const second = new FakeClient(standardPages());
    const secondResult = await exportHistory({
      client: second,
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 1,
      now: () => new Date('2026-01-02T00:00:00.000Z'),
      sleepFn: async () => undefined,
      latestVisible: async () => ({ id: 105, checkedAt: '2026-01-02T00:00:00.000Z' }),
    });

    expect(second.calls[0]?.offsetId).toBe(101);
    expect(secondResult.messages).toHaveLength(15);
    expect(secondResult.manifest.completeness.status).toBe('complete');
    expect(secondResult.state.errors.every((error) => error.resolved)).toBe(true);
  });

  it('повторяет head sync после сбоя и снимает старую ошибку', async () => {
    const paths = await tempPaths();
    const pages = standardPages();
    let offsetZeroCalls = 0;
    const firstClient: ExportClient = {
      async historyPage(_peer, offsetId) {
        if (offsetId === 0) {
          offsetZeroCalls += 1;
          if (offsetZeroCalls > 1) {
            throw new TgCliError({
              code: 'NETWORK_ERROR',
              message: 'синтетический сбой head sync',
              waitSeconds: null,
              exitCode: 4,
              details: null,
              suggestion: null,
            });
          }
        }
        return response(pages.get(offsetId) ?? []);
      },
    };

    const first = await exportHistory({
      client: firstClient,
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 0,
      sleepFn: async () => undefined,
      latestVisible: async () => ({ id: 105, checkedAt: '2026-01-01T00:00:00.000Z' }),
    });
    expect(first.state.reachedStart).toBe(true);
    expect(first.state.headStable).toBe(false);
    expect(first.state.errors.some((error) => !error.resolved)).toBe(true);

    const second = await exportHistory({
      client: new FakeClient(pages),
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 0,
      sleepFn: async () => undefined,
      latestVisible: async () => ({ id: 105, checkedAt: '2026-01-02T00:00:00.000Z' }),
    });
    expect(second.manifest.completeness.status).toBe('complete');
    expect(second.state.errors.every((error) => error.resolved)).toBe(true);
  });

  it('дедуплицирует повторы внутри одной страницы', async () => {
    const paths = await tempPaths();
    const pages = standardPages();
    pages.set(0, rawPage([105, 105, 104, 103, 102, 101]));
    const result = await exportHistory({
      client: new FakeClient(pages),
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 0,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleepFn: async () => undefined,
      latestVisible: async () => ({ id: 105, checkedAt: '2026-01-01T00:00:00.000Z' }),
    });
    expect(result.manifest.corpus.messageCount).toBe(15);
    expect(result.manifest.export.duplicatesDropped).toBeGreaterThanOrEqual(6);
  });

  it('не объявляет пустой диалог полным без подтверждения головы', async () => {
    const paths = await tempPaths();
    const result = await exportHistory({
      client: new FakeClient(new Map([[0, []]])),
      peer: '@test_contact',
      chat: makeChat(),
      paths,
      pageSize: 5,
      maxRetries: 0,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleepFn: async () => undefined,
      latestVisible: async () => null,
    });
    expect(result.messages).toHaveLength(0);
    expect(result.state.reachedStart).toBe(true);
    expect(result.manifest.completeness.status).toBe('partial');
    expect(result.manifest.completeness.checks.headStable).toBe(false);
  });

  it('падает на повреждённой сырой странице, а не молча теряет данные', async () => {
    const paths = await tempPaths();
    await mkdir(paths.rawPagesDir, { recursive: true });
    await writeFile(path.join(paths.rawPagesDir, 'backward-000001.json'), '{not json', 'utf8');

    await expect(
      exportHistory({
        client: new FakeClient(standardPages()),
        peer: '@test_contact',
        chat: makeChat(),
        paths,
        pageSize: 5,
        maxRetries: 0,
        sleepFn: async () => undefined,
      })
    ).rejects.toThrow();
  });
});
