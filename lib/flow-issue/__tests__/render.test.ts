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

  it('renders the issue header once, in the agreed order, without a duplicate line', () => {
    const issue = payload();
    issue.period = {
      start: '2026-11-06T00:00:00.000Z',
      end: '2026-11-13T00:00:00.000Z',
      timezone: 'UTC',
    };

    const { htmlWeb } = renderIssue(issue, {
      title: 'Tomb in Siberia | New Scientist «| Поток - 13 ноября 2026 г.»',
      slug: 'issue-25',
      number: 25,
    });

    const period = '6 НОЯБРЯ 2026 Г. — 13 НОЯБРЯ 2026 Г.';
    const number = 'ВЫПУСК №25';
    const timezone = 'ВРЕМЯ УКАЗАНО ПО UTC';
    const address = 'MERKUROV.LOVE/FLOW';
    const brand = 'ПОТОК';

    const positions = [period, number, timezone, address, brand].map((value) =>
      htmlWeb.indexOf(value)
    );

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(htmlWeb.match(new RegExp(period, 'g'))).toHaveLength(1);
    expect(htmlWeb.match(new RegExp(number, 'g'))).toHaveLength(1);
    expect(htmlWeb).not.toContain(`${period} · ${number}`);
    expect(htmlWeb).not.toContain('mast-period');
  });

  it('renders the English masthead with FLOW and the same order', () => {
    const issue = payload();
    issue.lang = 'en';
    issue.period = {
      start: '2026-11-06T00:00:00.000Z',
      end: '2026-11-13T00:00:00.000Z',
      timezone: 'UTC',
    };

    const { htmlWeb, htmlEmail, textEmail } = renderIssue(issue, {
      title: 'A headline «| Flow - 13 November 2026»',
      slug: 'issue-25',
      number: 25,
    });

    for (const output of [htmlWeb, htmlEmail, textEmail]) {
      expect(output).toContain('6 NOVEMBER 2026 — 13 NOVEMBER 2026');
      expect(output).toContain('ISSUE №25');
      expect(output).toContain('TIMES ARE SHOWN IN UTC');
      expect(output).toContain('MERKUROV.LOVE/FLOW');
      expect(output).toContain('FLOW');

      // The period and issue number belong to the header only. Neither the
      // web page, the email nor the text version may repeat them in a
      // second "period · issue" line.
      expect(output.match(/6 NOVEMBER 2026 — 13 NOVEMBER 2026/g)).toHaveLength(1);
      expect(output.match(/ISSUE №25/g)).toHaveLength(1);
    }
  });

  it('keeps every published video even when the template disables the section', () => {
    const issue = payload();
    issue.videos = [
      {
        ...entry({
          id: 'video-1',
          type: 'video',
          title: 'Published video without transcript',
          body: '',
          url: 'https://www.youtube.com/watch?v=abc123',
          metadata: {
            youtube: {
              video_id: 'abc123',
              title: 'Published video without transcript',
              thumbnail_url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
            },
          },
        }),
        image: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
        videoId: 'abc123',
      },
    ];
    issue.template = {
      ...issue.template,
      sections: {
        ...issue.template.sections,
        enabled: { ...issue.template.sections.enabled, videos: false },
      },
    };

    const { htmlWeb, htmlEmail, textEmail } = renderIssue(issue, {
      title: 'Issue 25',
      slug: 'issue-25',
      number: 25,
    });

    for (const output of [htmlWeb, htmlEmail, textEmail]) {
      expect(output).toContain('Published video without transcript');
    }

    // No transcript means no invented description: the video is represented
    // by its real title, date and link only.
    expect(htmlWeb).not.toContain('transcript of');
    expect(htmlWeb).toContain('https://www.youtube.com/watch?v=abc123');
  });
});
