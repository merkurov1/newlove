/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/newsletter/sendNewsletterToSubscriber', () => ({
  sendNewsletterToSubscriber: jest.fn(),
}));

const sendModule = require('@/lib/newsletter/sendNewsletterToSubscriber') as {
  sendNewsletterToSubscriber: jest.Mock;
};

const { processNewsletterJob } = require('../processJob') as {
  processNewsletterJob: (
    jobId: string,
    store: unknown,
    options?: { emailDelayMs?: number; batchDelayMs?: number }
  ) => Promise<{
    ok: boolean;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    totalSubscribers: number;
  }>;
};

type Row = {
  id: string;
  email: string;
  locale?: string | null;
  isActive?: boolean | null;
  confirmedAt?: string | null;
};

const jobId = 'job-1';
const job = {
  id: jobId,
  letter_id: 'letter-1',
  status: 'pending',
};

const letter = {
  id: 'letter-1',
  title: 'Русский выпуск',
  slug: 'ru-issue-1',
  content: '',
  published: true,
  kind: 'issue',
  lang: 'ru',
  html_email: '<html><body>issue</body></html>',
  text_email: 'issue',
  status: 'published',
  sent_at: null,
  sentAt: null,
};

const confirmedRu: Row[] = Array.from({ length: 18 }, (_, index) => ({
  id: `ru-${index + 1}`,
  email: `reader${index + 1}@example.ru`,
  locale: 'ru',
  isActive: true,
  confirmedAt: '2026-11-20T10:00:00.000Z',
}));

const ineligible: Row[] = [
  {
    id: 'pending-ru',
    email: 'pending@example.ru',
    locale: 'ru',
    isActive: false,
    confirmedAt: null,
  },
  {
    id: 'unconfirmed-ru',
    email: 'unconfirmed@example.ru',
    locale: 'ru',
    isActive: true,
    confirmedAt: null,
  },
  {
    id: 'en-confirmed',
    email: 'english@example.com',
    locale: 'en',
    isActive: true,
    confirmedAt: '2026-11-20T10:00:00.000Z',
  },
];

function thenable(result: unknown) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.not = chain;
  builder.limit = chain;
  builder.order = chain;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);

  return builder;
}

function makeStore(rows: Row[], processedIds: string[] = []) {
  const jobUpdates: Array<Record<string, unknown>> = [];
  const letterUpdates: Array<Record<string, unknown>> = [];
  const insertedLogs: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'newsletter_jobs') {
        const builder = thenable({ error: null });
        builder.select = () => thenable({ data: job, error: null });
        builder.update = (payload: Record<string, unknown>) => {
          jobUpdates.push(payload);
          const claim = thenable({ error: null });
          claim.maybeSingle = async () => ({ data: { id: jobId }, error: null });
          return claim;
        };
        return builder;
      }

      if (table === 'letters') {
        const builder = thenable({ error: null });
        builder.select = () => {
          const chain = thenable({ data: letter, error: null });
          chain.maybeSingle = async () => ({ data: letter, error: null });
          return chain;
        };
        builder.update = (payload: Record<string, unknown>) => {
          letterUpdates.push(payload);
          return thenable({ error: null });
        };
        return builder;
      }

      if (table === 'subscribers') {
        return thenable({ data: rows, error: null });
      }

      if (table === 'newsletter_logs') {
        const builder = thenable({
          data: processedIds.map((id) => ({ subscriber_id: id })),
          error: null,
        });
        builder.insert = async (payload: Array<Record<string, unknown>>) => {
          insertedLogs.push(...payload);
          return { error: null };
        };
        return builder;
      }

      if (table === 'subscriber_tokens') {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store, jobUpdates, letterUpdates, insertedLogs };
}

beforeEach(() => {
  jest.clearAllMocks();
  sendModule.sendNewsletterToSubscriber.mockResolvedValue({
    status: 'sent',
    providerResponse: { id: 'provider-1' },
  });
});

describe('processNewsletterJob recipient safety', () => {
  it('sends only to confirmed active subscribers of the issue language', async () => {
    const fake = makeStore([...confirmedRu, ...ineligible]);

    const result = await processNewsletterJob(jobId, fake.store, {
      emailDelayMs: 0,
      batchDelayMs: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.sentCount).toBe(18);
    expect(result.totalSubscribers).toBe(18);

    const sentIds = sendModule.sendNewsletterToSubscriber.mock.calls.map(
      (call) => (call[0] as { id: string }).id
    );
    expect(sentIds).toHaveLength(18);
    expect(sentIds.every((id) => id.startsWith('ru-'))).toBe(true);
    expect(sentIds).not.toContain('pending-ru');
    expect(sentIds).not.toContain('unconfirmed-ru');
    expect(sentIds).not.toContain('en-confirmed');

    const insertedSubscriberIds = fake.insertedLogs.map((row) => String(row.subscriber_id));
    expect(insertedSubscriberIds).toHaveLength(18);
    expect(insertedSubscriberIds).not.toContain('unconfirmed-ru');
    expect(fake.jobUpdates.at(-1)).toMatchObject({ status: 'completed', sent_count: 18 });
  });

  it('does not resend to recipients already logged for the job', async () => {
    const fake = makeStore([...confirmedRu, ...ineligible], ['ru-1', 'ru-2', 'pending-ru']);

    const result = await processNewsletterJob(jobId, fake.store, {
      emailDelayMs: 0,
      batchDelayMs: 0,
    });

    expect(result.sentCount).toBe(16);
    expect(result.totalSubscribers).toBe(16);

    const sentIds = sendModule.sendNewsletterToSubscriber.mock.calls.map(
      (call) => (call[0] as { id: string }).id
    );
    expect(sentIds).not.toContain('ru-1');
    expect(sentIds).not.toContain('ru-2');
    expect(sentIds).toHaveLength(16);
  });
});
