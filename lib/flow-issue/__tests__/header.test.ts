import { DEFAULT_ISSUE_TEMPLATE } from '../template';
import { buildIssueTitle, hasLegacyQuotedIssueSignature, resolveIssueTitle } from '../title';
import { buildIssueHeader, formatIssueNumber, formatIssuePeriod } from '../header';
import type { IssueEntry, IssuePayload } from '../types';

const entry: IssueEntry = {
  id: 'lead',
  type: 'link',
  title: 'Tomb in Siberia reveals humans were using cannabis 2800 years ago',
  body: '',
  url: 'https://www.newscientist.com/article/2597653',
  publishedAt: '2026-11-13T10:00:00.000Z',
  createdAt: '2026-11-13T10:00:00.000Z',
  metadata: {
    link_previews: [
      {
        url: 'https://www.newscientist.com/article/2597653',
        title: 'Tomb in Siberia reveals humans were using cannabis 2800 years ago',
        site_name: 'New Scientist',
      },
    ],
  },
  lang: 'ru',
  kind: 'world',
  own: false,
};

function payload(lang: 'ru' | 'en', lead: IssueEntry = entry): IssuePayload {
  return {
    schemaVersion: 2,
    lang,
    period: {
      start: '2026-11-06T00:00:00.000Z',
      end: '2026-11-13T00:00:00.000Z',
      timezone: 'UTC',
    },
    stats: {
      total: 1,
      published: 1,
      drafts: 0,
      days: 7,
      medianDelaySeconds: null,
      byType: { link: 1 },
      byKind: { about_flow: 0, world: 1, other: 0 },
      own: 0,
      external: 1,
      byUtcHour: [],
      perDay: [],
      delays: [],
      quality: { langFieldMismatch: 0, photoAltEqualsFilename: 0, emptyDrafts: 0 },
    },
    lead,
    latest: [],
    links: [],
    videos: [],
    photos: [],
    sourceIndex: [],
    templateVersion: 1,
    template: DEFAULT_ISSUE_TEMPLATE,
    design: {
      template: 'classic',
      tokens: { accent: '#7A2233', paper: '#FAF8F5', ink: '#1C1A1B' },
    },
  };
}

describe('Flow issue header contract', () => {
  it('formats the Russian header in the required order and wording', () => {
    const header = buildIssueHeader(payload('ru'), 25);

    expect(header).toEqual({
      period: '6 НОЯБРЯ 2026 Г. — 13 НОЯБРЯ 2026 Г.',
      issueNumber: 'ВЫПУСК №25',
      timezone: 'ВРЕМЯ УКАЗАНО ПО UTC',
      address: 'MERKUROV.LOVE/FLOW',
      brand: 'ПОТОК',
    });
  });

  it('formats the English header with the same structure', () => {
    const header = buildIssueHeader(payload('en'), 25);

    expect(header).toEqual({
      period: '6 NOVEMBER 2026 — 13 NOVEMBER 2026',
      issueNumber: 'ISSUE №25',
      timezone: 'TIMES ARE SHOWN IN UTC',
      address: 'MERKUROV.LOVE/FLOW',
      brand: 'FLOW',
    });
  });

  it('keeps number and period formatting shared with the archive', () => {
    expect(formatIssueNumber(25, 'ru')).toBe('ВЫПУСК №25');
    expect(formatIssueNumber(null, 'en')).toBe('ISSUE');
    expect(formatIssuePeriod('2026-11-06T00:00:00.000Z', '2026-11-13T00:00:00.000Z', 'ru')).toBe(
      '6 НОЯБРЯ 2026 Г. — 13 НОЯБРЯ 2026 Г.'
    );
  });
});

describe('Flow issue title contract', () => {
  it('includes the original title, its source and the unquoted RU issue signature', () => {
    expect(buildIssueTitle(payload('ru'))).toBe(
      'Tomb in Siberia reveals humans were using cannabis 2800 years ago | New Scientist | Поток - 13 ноября 2026 г.'
    );
  });

  it('uses the unquoted English signature in the English edition', () => {
    expect(buildIssueTitle(payload('en'))).toBe(
      'Tomb in Siberia reveals humans were using cannabis 2800 years ago | New Scientist | Flow - 13 November 2026'
    );
  });

  it('does not invent a source for an own note', () => {
    const ownNote: IssueEntry = {
      ...entry,
      id: 'own-note',
      type: 'note',
      title: 'Собственная заметка',
      url: null,
      metadata: {},
      own: true,
    };

    expect(buildIssueTitle(payload('ru', ownNote))).toBe(
      'Собственная заметка | Поток - 13 ноября 2026 г.'
    );
  });

  it('keeps a stored legacy quoted title instead of renaming it retroactively', () => {
    const legacy =
      'Tomb in Siberia reveals humans were using cannabis 2800 years ago | New Scientist «| Поток - 13 ноября 2026 г.»';

    expect(hasLegacyQuotedIssueSignature(legacy)).toBe(true);
    expect(resolveIssueTitle(payload('ru'), legacy)).toBe(legacy);
    expect(hasLegacyQuotedIssueSignature(buildIssueTitle(payload('ru')))).toBe(false);
  });

  it('falls back to the new title for a new record without a stored title', () => {
    expect(resolveIssueTitle(payload('ru'), '')).toBe(buildIssueTitle(payload('ru')));
  });
});
