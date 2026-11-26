import { renderIssue, renderIssueWeb } from '../render';
import { DEFAULT_ISSUE_TEMPLATE } from '../template';
import type { IssueEntry, IssuePayload } from '../types';

function webStyle(html: string): string {
  return html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
}

function cssRules(css: string): string[] {
  return [...css.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((prelude) => prelude && !prelude.startsWith('@'));
}

function themeTemplate(overrides: Partial<IssuePayload['template']['theme']> = {}) {
  return {
    ...DEFAULT_ISSUE_TEMPLATE,
    theme: { ...DEFAULT_ISSUE_TEMPLATE.theme, ...overrides },
  };
}

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

  it('scopes every web rule under .flow-issue-root', () => {
    const { htmlWeb } = renderIssue(payload(), {
      title: 'Issue 24',
      slug: 'issue-24',
      number: 24,
    });
    const style = webStyle(htmlWeb);

    expect(style.length).toBeGreaterThan(0);

    const unscoped = cssRules(style)
      .flatMap((rule) => rule.split(','))
      .map((selector) => selector.trim())
      .filter(Boolean)
      .filter((selector) => !selector.startsWith('.flow-issue-root'));

    expect(unscoped).toEqual([]);
  });

  it('does not mask layout overflow on the page or the root', () => {
    const { htmlWeb } = renderIssue(payload(), {
      title: 'Issue 24',
      slug: 'issue-24',
      number: 24,
    });
    const style = webStyle(htmlWeb);

    expect(style).not.toMatch(/\.flow-issue-root\s*\{[^}]*overflow-x:\s*(?:clip|hidden)/);
    expect(style).toContain('overflow-wrap:anywhere');
    expect(style).toContain('word-break:break-word');
  });

  it('keeps natural image proportions instead of cropping editorial media', () => {
    const issue = payload();
    issue.photos = [
      {
        ...entry({ id: 'photo-1', type: 'photo', title: 'Portrait', body: '' }),
        image: 'https://example.com/portrait.jpg',
        alt: 'Portrait',
        caption: 'A portrait frame',
      },
    ];
    issue.links = [
      {
        ...entry({
          id: 'link-1',
          type: 'link',
          title: 'A link',
          body: '',
          url: 'https://example.com/story',
        }),
        description: 'A link description',
        siteName: 'Example',
        author: '',
        image: 'https://example.com/link.jpg',
        originalDate: null,
        ageDays: null,
      },
    ];

    const { htmlWeb } = renderIssue(issue, {
      title: 'Issue 24',
      slug: 'issue-24',
      number: 24,
    });
    const style = webStyle(htmlWeb);

    expect(style).toContain('object-fit:contain');
    expect(style).not.toContain('object-fit:cover');
    expect(style).toContain('height:auto');
    expect(htmlWeb).toContain('https://example.com/portrait.jpg');
  });

  it('maps legacy template colours to Daylight Glass while keeping custom fonts', () => {
    const issue = payload();
    issue.template = themeTemplate({
      paper: '#FFFFFF',
      ink: '#111111',
      muted: '#52525B',
      rule: '#D4D4D8',
      accent: '#111111',
      maxWidth: 760,
      serifFont: 'Georgia',
      sansFont: 'Inter',
    });

    const style = webStyle(
      renderIssueWeb(issue, { title: 'Issue 24', slug: 'issue-24', number: 24 })
    );

    expect(style).toContain('--bg:#F7F3EC');
    expect(style).toContain('--ink:#201E1A');
    expect(style).toContain('--soft:#6B6257');
    expect(style).toContain('--line:#DDD4C5');
    expect(style).toContain('--claret:#7A2233');
    expect(style).toContain('--serif:var(--font-serif');
    expect(style).toContain('--sans:var(--font-sans');
  });

  it('preserves genuinely custom theme colours and fonts', () => {
    const issue = payload();
    issue.template = themeTemplate({
      paper: '#F2EBDD',
      ink: '#2A2420',
      muted: '#73695C',
      rule: '#C9BCA8',
      accent: '#7A2233',
      maxWidth: 900,
      serifFont: 'Literata, Georgia, serif',
      sansFont: 'Public Sans, Arial, sans-serif',
    });

    const style = webStyle(
      renderIssueWeb(issue, { title: 'Issue 24', slug: 'issue-24', number: 24 })
    );

    expect(style).toContain('--bg:#F2EBDD');
    expect(style).toContain('--ink:#2A2420');
    expect(style).toContain('--serif:Literata, Georgia, serif');
    expect(style).toContain('--sans:Public Sans, Arial, sans-serif');
    expect(style).toContain('max-width:1440px');
  });

  it('keeps responsive gallery breakpoints for mobile, tablet and desktop', () => {
    const style = webStyle(
      renderIssueWeb(payload(), { title: 'Issue 24', slug: 'issue-24', number: 24 })
    );

    expect(style).toContain('@media(min-width:640px)');
    expect(style).toContain('@media(min-width:900px)');
    expect(style).toContain('@media(min-width:960px)');
    expect(style).toContain('@media(min-width:1024px)');
    expect(style).toContain('grid-template-columns:repeat(12,minmax(0,1fr))');
    expect(style).toContain('grid-template-columns:minmax(0,1fr)');
  });

  it('does not change the email or text renderer when the web theme changes', () => {
    const issue = payload();
    issue.template = themeTemplate({
      paper: '#FFFFFF',
      ink: '#111111',
      muted: '#52525B',
      rule: '#D4D4D8',
      accent: '#111111',
    });

    const { htmlEmail, textEmail } = renderIssue(issue, {
      title: 'Issue 24',
      slug: 'issue-24',
      number: 24,
    });

    expect(htmlEmail).toContain('background:#FAF8F5');
    expect(htmlEmail).not.toContain('--glass');
    expect(htmlEmail).not.toContain('grid-template-columns');
    expect(textEmail).not.toContain('<style');
  });

  it('uses the new web title while keeping the existing email signature form', () => {
    const title = 'Tomb in Siberia | New Scientist | Поток - 13 ноября 2026 г.';
    const { htmlWeb, htmlEmail, textEmail } = renderIssue(payload(), {
      title,
      slug: 'issue-25',
      number: 25,
    });

    expect(htmlWeb).toContain(`<h1>${title}</h1>`);
    expect(htmlEmail).toContain('Tomb in Siberia | New Scientist «| Поток - 13 ноября 2026 г.»');
    expect(textEmail).toContain('Tomb in Siberia | New Scientist «| Поток - 13 ноября 2026 г.»');
  });
});
