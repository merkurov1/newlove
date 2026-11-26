/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  excludeProcessedSubscribers,
  fetchNewsletterRecipients,
  isConfirmedActiveSubscriber,
  maskNewsletterEmail,
  selectNewsletterRecipients,
  summarizeNewsletterAudience,
} from '../recipients';

type Row = {
  id: string;
  email: string;
  locale?: string | null;
  isActive?: boolean | null;
  confirmedAt?: string | null;
};

const confirmedRu: Row[] = Array.from({ length: 18 }, (_, index) => ({
  id: `ru-${index + 1}`,
  email: `reader${index + 1}@example.ru`,
  locale: 'ru',
  isActive: true,
  confirmedAt: '2026-11-20T10:00:00.000Z',
}));

const confirmedEn: Row[] = [
  {
    id: 'en-1',
    email: 'reader@example.com',
    locale: 'en',
    isActive: true,
    confirmedAt: '2026-11-20T10:00:00.000Z',
  },
  {
    id: 'en-2',
    email: 'reader2@example.com',
    locale: 'en-US',
    isActive: true,
    confirmedAt: '2026-11-20T10:00:00.000Z',
  },
];

const ineligible: Row[] = [
  {
    id: 'ru-pending',
    email: 'pending@example.ru',
    locale: 'ru',
    isActive: false,
    confirmedAt: null,
  },
  {
    id: 'ru-unconfirmed-active',
    email: 'unconfirmed@example.ru',
    locale: 'ru',
    isActive: true,
    confirmedAt: null,
  },
  {
    id: 'ru-inactive-confirmed',
    email: 'inactive@example.ru',
    locale: 'ru',
    isActive: false,
    confirmedAt: '2026-11-20T10:00:00.000Z',
  },
];

function makeStore(rows: Row[], error: unknown = null) {
  const calls: unknown[][] = [];
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      calls.push(['select', columns]);
      return builder;
    },
    eq: (column: string, value: unknown) => {
      calls.push(['eq', column, value]);
      return builder;
    },
    not: (column: string, operator: string, value: unknown) => {
      calls.push(['not', column, operator, value]);
      return builder;
    },
    limit: (value: number) => {
      calls.push(['limit', value]);
      return builder;
    },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows, error }).then(resolve, reject),
  };

  return {
    store: {
      from: (table: string) => {
        calls.push(['from', table]);
        return builder;
      },
    },
    calls,
  };
}

describe('newsletter recipient selection', () => {
  it('never selects an inactive or unconfirmed subscriber', () => {
    const rows = [...confirmedRu, ...confirmedEn, ...ineligible];

    expect(confirmedRu.every(isConfirmedActiveSubscriber)).toBe(true);
    expect(ineligible.every(isConfirmedActiveSubscriber)).toBe(false);

    const ruRecipients = selectNewsletterRecipients(rows, 'ru');
    const enRecipients = selectNewsletterRecipients(rows, 'en');

    expect(ruRecipients).toHaveLength(18);
    expect(ruRecipients.every((row) => row.locale === 'ru')).toBe(true);
    expect(enRecipients.map((row) => row.id)).toEqual(['en-1', 'en-2']);

    const selectedIds = new Set([...ruRecipients, ...enRecipients].map((row) => row.id));
    expect(selectedIds.has('ru-pending')).toBe(false);
    expect(selectedIds.has('ru-unconfirmed-active')).toBe(false);
    expect(selectedIds.has('ru-inactive-confirmed')).toBe(false);
  });

  it('queries only active rows with a non-null confirmedAt and repeats the guard in memory', async () => {
    const rows = [...confirmedRu, ...confirmedEn, ...ineligible];
    const fake = makeStore(rows, null);

    const result = await fetchNewsletterRecipients(fake.store as never, 'ru');

    expect(result.error).toBeNull();
    expect(result.recipients).toHaveLength(18);
    expect(fake.calls).toContainEqual(['from', 'subscribers']);
    expect(fake.calls).toContainEqual(['eq', 'isActive', true]);
    expect(fake.calls).toContainEqual(['not', 'confirmedAt', 'is', null]);
  });

  it('summarizes the confirmed audience by language', () => {
    const summary = summarizeNewsletterAudience([...confirmedRu, ...confirmedEn, ...ineligible]);

    expect(summary).toEqual({ total: 20, ru: 18, en: 2 });
  });

  it('excludes recipients already logged for the job', () => {
    const remaining = excludeProcessedSubscribers(confirmedRu, new Set(['ru-1', 'ru-2']));

    expect(remaining).toHaveLength(16);
    expect(remaining.some((row) => row.id === 'ru-1')).toBe(false);
  });

  it('masks preview emails', () => {
    expect(maskNewsletterEmail('person@example.com')).toBe('p*****@example.com');
    expect(maskNewsletterEmail('not-an-email')).toBe('***');
  });
});
