import { renderIssue } from '../render';
import { DEFAULT_ISSUE_TEMPLATE } from '../template';
import type { IssueEntry, IssuePayload } from '../types';

const longUrl =
  'https://www.newscientist.com/article/2597653-tomb-in-siberia-reveals-humans-were-using-cannabis-2800-years-ago/?utm_id=97758_v0_s00_e0_tv1&fbclid=IwY2xjawVdZgJleHRuA2FlbQIxMABwZG9mBWJyaWQRMXo0YVE4MVl2TEh6Wmc0M09zcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEfBpcULeX4jZhTmMywzX9THWyo_MYc2Y_eVKvzTF8d0Y1a-n6k6vAz1lc-BNA_aem_-FrvSY9ZMkgNhETkxdYSVg';

function entry(overrides: Partial<IssueEntry> = {}): IssueEntry {
  return {
    id: 'item-1',
    type: 'note',
    title: 'Title',
    body: 'Body',
    url: null,
    publishedAt: '2026-11-08T14:35:00.000Z',
    createdAt: '2026-11-08T14:35:00.000Z',
    metadata: {},
    lang: 'ru',
    kind: 'other',
    own: true,
    ...overrides,
  };
}

function payload(): IssuePayload {
  return {
    schemaVersion: 2,
    lang: 'ru',
    period: {
      start: '2026-11-03T00:00:00.000Z',
      end: '2026-11-10T00:00:00.000Z',
      timezone: 'UTC',
    },
    stats: {
      total: 16,
      published: 16,
      drafts: 0,
      days: 7,
      medianDelaySeconds: null,
      byType: { note: 4, link: 6, video: 2, photo: 4 },
      byKind: { about_flow: 4, world: 6, other: 6 },
      own: 14,
      external: 2,
      byUtcHour: [],
      perDay: [],
      delays: [],
      quality: {
        langFieldMismatch: 0,
        photoAltEqualsFilename: 0,
        emptyDrafts: 0,
      },
    },
    lead: entry({
      id: 'lead',
      title: 'Long source title',
      url: longUrl,
      body: 'Lead body with a long source link.',
    }),
    latest: [],
    links: [],
    videos: [],
    photos: [],
    sourceIndex: [
      {
        id: 'source-1',
        source: 'New Scientist',
        title: 'Long source title',
        url: longUrl,
        originalDate: null,
        addedAt: '2026-11-08T14:35:00.000Z',
      },
    ],
    templateVersion: 1,
    template: {
      ...DEFAULT_ISSUE_TEMPLATE,
      theme: {
        ...DEFAULT_ISSUE_TEMPLATE.theme,
        // Published issues still carry the old 760px snapshot.
        maxWidth: 760,
      },
    },
    design: {
      template: 'classic',
      tokens: {
        accent: '#111111',
        paper: '#FAF8F5',
        ink: '#111111',
      },
    },
  } as IssuePayload;
}

describe('flow issue web layout', () => {
  it('uses the wider newspaper page even when the payload stores the old width', () => {
    const { htmlWeb } = renderIssue(payload(), {
      title: 'Issue 24',
      slug: 'issue-24',
      number: 24,
    });

    expect(htmlWeb).toContain('.page{max-width:1440px');
    expect(htmlWeb).toContain('overflow-wrap:anywhere');
    expect(htmlWeb).toContain('table-layout:fixed');
  });

  it('keeps long tracking URLs intact and makes them wrap safely', () => {
    const { htmlWeb } = renderIssue(payload(), {
      title: 'Issue 24',
      slug: 'issue-24',
      number: 24,
    });

    expect(htmlWeb).toContain('fbclid=IwY2xjawVdZgJleHRuA2FlbQIxMABwZG9mBWJyaWQRMXo0');
    expect(htmlWeb).toContain('word-break:break-word');
    expect(htmlWeb).toContain('minmax(0,1fr)');
  });
});
