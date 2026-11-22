import React from 'react';
import { render, screen, within } from '@testing-library/react';

import type { MediaRecord } from '@/data/media';
import MediaArchive from '../MediaArchive';

const mockReplace = jest.fn();
let mockCurrentSearchParams = '';

jest.mock('next/navigation', () => ({
  usePathname: () => '/media',
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockCurrentSearchParams),
}));

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
    render(<MediaArchive records={records} archives={[]} />);

    expect(screen.getByText('SQ / Albanian')).toBeInTheDocument();
    expect(screen.getByText('HY / Armenian')).toBeInTheDocument();
    expect(screen.getByText('AZ / Azerbaijani')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Albanian \(SQ\)/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Armenian \(HY\)/ })).toBeInTheDocument();
  });

  it('filters the public catalogue by the SQ code', () => {
    mockCurrentSearchParams = 'lang=SQ';

    render(<MediaArchive records={records} archives={[]} />);

    const timeline = within(screen.getByRole('region', { name: 'Media timeline' }));
    expect(timeline.getByText('Gazeta Shqip publication')).toBeInTheDocument();
    expect(timeline.queryByText('Armenian publication')).not.toBeInTheDocument();
    expect(timeline.queryByText('Publication with unlisted language')).not.toBeInTheDocument();
  });

  it('keeps an unknown language visible instead of calling it English', () => {
    render(<MediaArchive records={records} archives={[]} />);

    expect(screen.getByText('AZ / Azerbaijani')).toBeInTheDocument();
    expect(screen.queryByText('AZ / English')).not.toBeInTheDocument();
  });
});
