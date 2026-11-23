import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { MediaRecord } from '@/data/media';
import MediaArchive from '../MediaArchive';
import { renderToStaticMarkup } from 'react-dom/server';

const mockReplace = jest.fn();
let mockCurrentSearchParams = '';

jest.mock('next/navigation', () => ({
  usePathname: () => '/media',
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockCurrentSearchParams),
}));

function MediaArchiveWithParams(props: React.ComponentProps<typeof MediaArchive>) {
  return <MediaArchive {...props} initialSearchParams={mockCurrentSearchParams} />;
}

function record(overrides: Partial<MediaRecord> & Pick<MediaRecord, 'slug' | 'title' | 'lang'>) {
  return {
    outlet: 'Example outlet',
    url: `https://example.com/${overrides.slug}`,
    date: '2026-05-28',
    topic: 'Internet & Censorship',
    kind: 'mention',
    summary: 'Publication summary.',
    ...overrides,
  } satisfies MediaRecord;
}

const records: MediaRecord[] = [
  record({
    slug: 'gazeta-shqip',
    title: 'Gazeta Shqip publication',
    outlet: 'Gazeta Shqip',
    lang: 'SQ',
  }),
  record({
    slug: 'armenian-publication',
    title: 'Armenian publication',
    outlet: 'Armenian outlet',
    lang: 'HY',
  }),
  record({
    slug: 'unlisted-language',
    title: 'Publication with unlisted language',
    outlet: 'Example Times',
    lang: 'AZ',
  }),
];

describe('MediaArchive languages', () => {
  beforeEach(() => {
    mockCurrentSearchParams = '';
    mockReplace.mockClear();
  });

  it('shows codes together with their names and labelled filter options', () => {
    render(<MediaArchiveWithParams records={records} archives={[]} />);

    expect(screen.getByText('SQ / Albanian')).toBeInTheDocument();
    expect(screen.getByText('HY / Armenian')).toBeInTheDocument();
    expect(screen.getByText('AZ / Azerbaijani')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Albanian \(SQ\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Armenian \(HY\)/ })).toBeInTheDocument();
  });

  it('filters the public catalogue by the SQ code', () => {
    mockCurrentSearchParams = 'lang=SQ';

    render(<MediaArchiveWithParams records={records} archives={[]} />);

    const timeline = within(screen.getByRole('region', { name: 'Media timeline' }));
    expect(timeline.getByText('Gazeta Shqip publication')).toBeInTheDocument();
    expect(timeline.queryByText('Armenian publication')).not.toBeInTheDocument();
    expect(timeline.queryByText('Publication with unlisted language')).not.toBeInTheDocument();
  });

  it('keeps an unknown language visible instead of calling it English', () => {
    render(<MediaArchiveWithParams records={records} archives={[]} />);

    expect(screen.getByText('AZ / Azerbaijani')).toBeInTheDocument();
    expect(screen.queryByText('AZ / English')).not.toBeInTheDocument();
  });
});

function authored(
  outlet: string,
  year: string,
  count: number,
  kind: MediaRecord['kind'] = 'column'
): MediaRecord[] {
  return Array.from({ length: count }, (_, index) =>
    record({
      slug: `${outlet.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}-${index + 1}`,
      title: `${outlet} ${year} article ${index + 1}`,
      outlet,
      date: `${year}-0${(index % 9) + 1}-1${index % 9}`,
      kind,
      lang: 'RU',
    })
  );
}

function reprint(
  slug: string,
  title: string,
  outlet: string,
  original: MediaRecord,
  relationType = 'syndication'
): MediaRecord {
  return record({
    slug,
    title,
    outlet,
    date: '2026-05-28',
    lang: 'SQ',
    related: [
      {
        slug: original.slug,
        title: original.title,
        outlet: original.outlet,
        url: original.url,
        date: original.date,
        relationType,
        confidence: 1,
        role: 'original',
      },
    ],
  });
}

describe('MediaArchive authored outlet+year series', () => {
  beforeEach(() => {
    mockCurrentSearchParams = '';
    mockReplace.mockClear();
  });

  it('collapses Retrograde Mercury into separate year groups', () => {
    const retrograde = [
      ...authored('Ретроградный Меркуров', '2025', 4),
      ...authored('Ретроградный Меркуров', '2024', 4),
      ...authored('Ретроградный Меркуров', '2023', 4),
    ];

    const { container } = render(<MediaArchiveWithParams records={retrograde} archives={[]} />);

    expect(container.querySelectorAll('.ma-series')).toHaveLength(3);
    expect(screen.getAllByText('Ретроградный Меркуров').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/4 publications/)).toHaveLength(3);
  });

  it('collapses iHODL 2018 and Forbes.ru 2010 and keeps small groups expanded', () => {
    const grouped = [
      ...authored('iHODL', '2018', 4, 'blog'),
      ...authored('Forbes.ru', '2010', 5),
      ...authored('Small outlet', '2017', 3),
    ];

    const { container } = render(<MediaArchiveWithParams records={grouped} archives={[]} />);

    expect(container.querySelectorAll('.ma-series')).toHaveLength(2);
    expect(screen.getAllByText('Авторские публикации')).toHaveLength(2);
    ['1', '2', '3'].forEach((number) => {
      expect(screen.getAllByText(`Small outlet 2017 article ${number}`).length).toBeGreaterThan(0);
    });
  });

  it('keeps the Novaya Gazeta title and lists each publication date, title and link', () => {
    const novaya = authored('Новая газета', '2026', 4);

    const { container } = render(<MediaArchiveWithParams records={novaya} archives={[]} />);

    expect(screen.getByText('«Виртуальный Меркуров»')).toBeInTheDocument();
    novaya.forEach((item) => {
      expect(screen.getAllByText(item.title).length).toBeGreaterThan(0);
      expect(container.querySelector(`a[href="${item.url}"]`)).not.toBeNull();
    });
  });

  it('collapses the remaining outlet+year groups with four or more authored entries', () => {
    const grouped = [
      ...authored('Merkuroff.wordpress.com', '2014', 4, 'blog'),
      ...authored('Merkuroff.wordpress.com', '2013', 4, 'blog'),
      ...authored('Runet', '2013', 4),
      ...authored('Slon.ru', '2012', 4),
      ...authored('Газета.Ru', '2011', 4),
      ...authored('Forbes.ru', '2010', 4),
      ...authored('Хабр', '2009', 4, 'blog'),
    ];

    const { container } = render(<MediaArchiveWithParams records={grouped} archives={[]} />);

    expect(container.querySelectorAll('.ma-series')).toHaveLength(7);
    expect(screen.getAllByText('Авторские публикации')).toHaveLength(7);
  });

  it('keeps small authored outlets as individual rows and ignores other formats', () => {
    const mixed = [
      ...authored('Small authored outlet', '2017', 3),
      record({
        slug: 'mention-one',
        title: 'Mention one',
        outlet: 'Small authored outlet',
        date: '2017-03-04',
        kind: 'mention',
      }),
      record({
        slug: 'interview-one',
        title: 'Interview one',
        outlet: 'Small authored outlet',
        date: '2017-03-03',
        kind: 'interview',
      }),
    ];

    const { container } = render(<MediaArchiveWithParams records={mixed} archives={[]} />);

    const timeline = within(screen.getByRole('region', { name: 'Media timeline' }));

    expect(container.querySelectorAll('.ma-series')).toHaveLength(0);
    ['1', '2', '3'].forEach((number) => {
      expect(
        timeline.getAllByText(`Small authored outlet 2017 article ${number}`).length
      ).toBeGreaterThan(0);
    });
    expect(timeline.getByText('Mention one')).toBeInTheDocument();
    expect(timeline.getByText('Interview one')).toBeInTheDocument();
  });

  it('keeps grouping active for the Columns and Publication filters', () => {
    const retrograde = authored('Ретроградный Меркуров', '2025', 4);

    mockCurrentSearchParams = 'type=columns&outlet=Ретроградный Меркуров';
    const { container } = render(<MediaArchiveWithParams records={retrograde} archives={[]} />);

    expect(container.querySelectorAll('.ma-series')).toHaveLength(1);
    expect(screen.getByText(/4 publications/)).toBeInTheDocument();
  });
});

describe('MediaArchive reprints', () => {
  beforeEach(() => {
    mockCurrentSearchParams = '';
    mockReplace.mockClear();
  });

  const original = record({
    slug: 'le-monde-data-centres',
    title: 'Le Monde data centres investigation',
    outlet: 'Le Monde',
    date: '2026-05-27',
    lang: 'FR',
  });

  it('groups three Albanian syndications by their original publication', () => {
    const albanian = [
      reprint('dosja-al-syndication', 'Dosja.al syndication', 'Dosja.al', original),
      reprint('gazeta-shqip-syndication', 'Gazeta Shqip syndication', 'Gazeta Shqip', original),
      reprint('voxnews-syndication', 'VoxNews syndication', 'VoxNews', original),
    ];

    const { container } = render(<MediaArchiveWithParams records={[original, ...albanian]} archives={[]} />);

    const group = container.querySelector('.ma-series');
    expect(container.querySelectorAll('.ma-series')).toHaveLength(1);
    expect(group).not.toBeNull();
    expect(group?.querySelectorAll('a[href*="dosja-al-syndication"]')).toHaveLength(1);
    expect(group?.querySelectorAll('a[href*="gazeta-shqip-syndication"]')).toHaveLength(1);
    expect(group?.querySelectorAll('a[href*="voxnews-syndication"]')).toHaveLength(1);
    expect(group?.querySelectorAll('a[target="_blank"]')).toHaveLength(3);
    expect(group?.querySelectorAll('a[href*="/media/record/le-monde-data-centres"]')).toHaveLength(
      1
    );
    expect(within(group as HTMLElement).getByText(/Original:/)).toBeInTheDocument();
  });

  it('does not merge different publications from the same outlet', () => {
    const secondOriginal = record({
      slug: 'le-monde-second-original',
      title: 'Le Monde second original',
      outlet: 'Le Monde',
      date: '2026-05-27',
      lang: 'FR',
    });

    const reprints = [
      reprint('dosja-one', 'Dosja one', 'Dosja.al', original),
      reprint('dosja-two', 'Dosja two', 'Dosja.al', secondOriginal),
    ];

    const { container } = render(
      <MediaArchiveWithParams records={[original, secondOriginal, ...reprints]} archives={[]} />
    );

    expect(container.querySelectorAll('.ma-series')).toHaveLength(2);
  });

  it('keeps the French and English Le Monde editions as separate versions', () => {
    const french = record({
      slug: 'le-monde-fr',
      title: 'Le Monde French edition',
      outlet: 'Le Monde',
      date: '2026-05-27',
      lang: 'FR',
    });
    const english = record({
      slug: 'le-monde-en',
      title: 'Le Monde English edition',
      outlet: 'Le Monde',
      date: '2026-05-27',
      lang: 'EN',
    });

    const { container } = render(<MediaArchiveWithParams records={[french, english]} archives={[]} />);

    expect(container.querySelectorAll('.ma-series')).toHaveLength(0);
    expect(screen.getAllByText('Le Monde French edition').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Le Monde English edition').length).toBeGreaterThan(0);
  });

  it('does not fold another edition of the same publication into a reprint group', () => {
    const french = record({
      slug: 'le-monde-fr-edition',
      title: 'Le Monde French edition',
      outlet: 'Le Monde',
      date: '2026-05-27',
      lang: 'FR',
    });
    const englishEdition = record({
      slug: 'le-monde-en-edition',
      title: 'Le Monde English edition',
      outlet: 'Le Monde',
      date: '2026-05-27',
      lang: 'EN',
      related: [
        {
          slug: french.slug,
          title: french.title,
          outlet: french.outlet,
          url: french.url,
          date: french.date,
          relationType: 'syndication',
          confidence: 1,
          role: 'original',
        },
      ],
    });

    const { container } = render(
      <MediaArchiveWithParams records={[french, englishEdition]} archives={[]} />
    );

    expect(container.querySelectorAll('.ma-series')).toHaveLength(0);
    expect(screen.getAllByText('Le Monde French edition').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Le Monde English edition').length).toBeGreaterThan(0);
  });
});

describe('MediaArchive date precision', () => {
  beforeEach(() => {
    mockCurrentSearchParams = '';
    mockReplace.mockClear();
  });

  it('shows only the confirmed year for a year-precision record', () => {
    const novyeIzvestia = record({
      slug: 'novye-izvestia-mercury',
      title: 'Никакой угрозы Рунету нет',
      outlet: 'Новые Известия',
      date: '2019-11-01',
      datePrecision: 'year',
      kind: 'column',
      lang: 'RU',
    });

    const { container } = render(<MediaArchiveWithParams records={[novyeIzvestia]} archives={[]} />);

    const timeline = within(screen.getByRole('region', { name: 'Media timeline' }));
    expect(timeline.getAllByText('2019').length).toBeGreaterThan(0);
    expect(timeline.queryByText('1 Nov')).not.toBeInTheDocument();
    expect(timeline.queryByText('2019-11-01')).not.toBeInTheDocument();
    expect(container.querySelector('time[datetime="2019-11-01"]')).toBeNull();
    expect(container.querySelector('time[datetime="2019"]')).not.toBeNull();
  });

  it('leaves ordinary day-precision dates unchanged', () => {
    const ordinary = record({
      slug: 'ordinary-date',
      title: 'Ordinary dated publication',
      outlet: 'Example outlet',
      date: '2026-05-28',
    });

    const timeline = within(
      render(<MediaArchiveWithParams records={[ordinary]} archives={[]} />).getByRole('region', {
        name: 'Media timeline',
      })
    );

    expect(timeline.getByText('28 May')).toBeInTheDocument();
    expect(timeline.getAllByText('2026').length).toBeGreaterThan(0);
  });
});

describe('MediaArchive selection integrity', () => {
  beforeEach(() => {
    mockCurrentSearchParams = '';
    mockReplace.mockClear();
  });

  it('applies archive search without dropping the matching records', () => {
    mockCurrentSearchParams = 'q=Needle';

    const searchable = [
      record({ slug: 'needle-one', title: 'Needle one', lang: 'EN' }),
      record({ slug: 'needle-two', title: 'Another Needle story', lang: 'EN' }),
      record({ slug: 'other', title: 'Unrelated story', lang: 'EN' }),
    ];

    const timeline = within(
      render(<MediaArchiveWithParams records={searchable} archives={[]} />).getByRole('region', {
        name: 'Media timeline',
      })
    );

    expect(timeline.getByText('Needle one')).toBeInTheDocument();
    expect(timeline.getByText('Another Needle story')).toBeInTheDocument();
    expect(timeline.queryByText('Unrelated story')).not.toBeInTheDocument();
  });

  it('shows individual authored rows for a text query without losing or duplicating them', () => {
    mockCurrentSearchParams = 'q=article';

    const series = authored('Ретроградный Меркуров', '2025', 4);
    const { container } = render(<MediaArchiveWithParams records={series} archives={[]} />);
    const timeline = within(screen.getByRole('region', { name: 'Media timeline' }));

    expect(container.querySelectorAll('.ma-series')).toHaveLength(0);
    expect(container.querySelectorAll('.ma-row')).toHaveLength(4);
    series.forEach((item) => {
      expect(timeline.getAllByText(item.title)).toHaveLength(1);
    });
  });

  it('keeps Load more working without duplicating records', () => {
    const many = Array.from({ length: 35 }, (_, index) =>
      record({
        slug: `record-${index + 1}`,
        title: `Record ${String(index + 1).padStart(2, '0')}`,
        date: `2026-05-${String((index % 28) + 1).padStart(2, '0')}`,
        lang: 'EN',
      })
    );

    const { container } = render(<MediaArchiveWithParams records={many} archives={[]} />);

    expect(container.querySelectorAll('.ma-row')).toHaveLength(30);
    expect(screen.getByText(/Showing 30 of 35 records/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Load 5 more/ }));

    expect(container.querySelectorAll('.ma-row')).toHaveLength(35);
    expect(screen.queryByRole('button', { name: /Load .* more/ })).not.toBeInTheDocument();
  });
});


describe('MediaArchive server rendering', () => {
  it('renders its H1 and summary without a client-only bailout', () => {
    const html = renderToStaticMarkup(
      <MediaArchive records={[]} archives={[]} initialSearchParams="" />
    );

    expect(html).toContain('<h1');
    expect(html).toContain('Public record &amp; commentary');
    expect(html).not.toContain('Loading media archive');
  });

  it('accepts a server-resolved query string as its initial state', () => {
    const html = renderToStaticMarkup(
      <MediaArchive
        records={[]}
        archives={[]}
        initialSearchParams="type=columns&q=internet"
      />
    );

    expect(html).toContain('<h1');
  });
});
