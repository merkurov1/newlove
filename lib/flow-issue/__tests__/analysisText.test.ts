/** @jest-environment node */

import {
  MAX_ANALYSIS_TEXT_CHARS,
  buildAnalysisInput,
  isAnalyzable,
  plainAnalysisText,
} from '../analysis';
import type { FlowItem } from '../types';

const IMAGE_URL = 'https://cdn.example.com/photo.jpg';
const THUMBNAIL_URL = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
const DATA_URI = `data:image/png;base64,${'A'.repeat(256)}`;

function item(overrides: Partial<FlowItem> = {}): FlowItem {
  return {
    id: 'item-1',
    type: 'note',
    status: 'published',
    visibility: 'public',
    lang: 'en',
    slug: 'item-1',
    title: 'A concrete observation',
    body_md: 'The body of the note.',
    source_url: null,
    ai_allowed: true,
    metadata: {},
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    published_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function expectContainsAll(input: string, values: string[]) {
  for (const value of values) {
    expect(input).toContain(value);
  }
}

function expectNoVisualPayloads(input: string) {
  expect(input).not.toContain(IMAGE_URL);
  expect(input).not.toContain(THUMBNAIL_URL);
  expect(input).not.toContain('data:image');
  expect(input).not.toContain(DATA_URI);
}

describe('Flow item text extraction for analysis', () => {
  it('includes every text field of every supported item type', () => {
    const cases: Array<{ source: FlowItem; expected: string[] }> = [
      {
        source: item({
          type: 'note',
          metadata: {
            notes: 'A private editorial note.',
            custom_text: 'An imported note field.',
          },
        }),
        expected: ['The body of the note.', 'A private editorial note.', 'An imported note field.'],
      },
      {
        source: item({
          type: 'link',
          title: '',
          body_md: '',
          metadata: {
            editor_note: 'Why this source matters.',
            link_previews: [
              {
                url: 'https://example.com/one',
                title: 'First preview title',
                description: 'First preview description',
                site_name: 'First Site',
                image: IMAGE_URL,
              },
              {
                url: 'https://example.com/two',
                title: 'Second preview title',
                description: 'Second preview description',
                site_name: 'Second Site',
              },
              {
                url: 'https://example.com/three',
                title: 'Third preview title',
                description: 'Third preview description',
                site_name: 'Third Site',
              },
            ],
          },
        }),
        expected: [
          'Why this source matters.',
          'First preview title',
          'First preview description',
          'First Site',
          'Second preview description',
          'Third preview description',
          'Third Site',
        ],
      },
      {
        source: item({
          type: 'video',
          title: '',
          body_md: '',
          metadata: {
            youtube: {
              video_id: 'dQw4w9WgXcQ',
              title: 'A published video',
              description: 'The video description from the provider.',
              author_name: 'The author channel',
              thumbnail_url: THUMBNAIL_URL,
            },
            transcript: 'A transcript fragment from the video.',
          },
        }),
        expected: [
          'A published video',
          'The video description from the provider.',
          'The author channel',
          'A transcript fragment from the video.',
        ],
      },
      {
        source: item({
          type: 'photo',
          title: '',
          body_md: '',
          metadata: {
            public_url: IMAGE_URL,
            alt: 'A quiet street at dawn',
            caption: 'Morning light on the facades.',
            images: [
              {
                url: IMAGE_URL,
                alt: 'A nested photograph alt',
                caption: 'A nested photograph caption',
              },
            ],
          },
        }),
        expected: [
          'A quiet street at dawn',
          'Morning light on the facades.',
          'A nested photograph alt',
          'A nested photograph caption',
        ],
      },
      {
        source: item({
          type: 'audio',
          title: '',
          body_md: '',
          metadata: {
            transcript: 'An audio transcript with actual words.',
            show_notes: 'The show notes for the episode.',
          },
        }),
        expected: ['An audio transcript with actual words.', 'The show notes for the episode.'],
      },
    ];

    for (const { source, expected } of cases) {
      const input = buildAnalysisInput(source);
      expectContainsAll(input, expected);
      expectNoVisualPayloads(input);
    }
  });

  it('does not duplicate text stored in several fields', () => {
    const input = buildAnalysisInput(
      item({
        title: 'The same title',
        body_md: 'The same body.',
        metadata: {
          title: '  the   SAME title ',
          description: 'The same body.',
          summary: 'A distinct summary.',
        },
      })
    );

    expect(input.toLocaleLowerCase().match(/the same title/g)).toHaveLength(1);
    expect(input.toLocaleLowerCase().match(/the same body/g)).toHaveLength(1);
    expect(input).toContain('A distinct summary.');
  });

  it('keeps image alt text but removes markdown and HTML image payloads', () => {
    const input = buildAnalysisInput(
      item({
        body_md: [
          'Before the image.',
          `![Alt text kept](${IMAGE_URL})`,
          `<img src="${IMAGE_URL}" alt="HTML alt kept">`,
          `<img src="${DATA_URI}">`,
          'After the image.',
        ].join('\n\n'),
      })
    );

    expect(input).toContain('Before the image.');
    expect(input).toContain('Alt text kept');
    expect(input).toContain('HTML alt kept');
    expect(input).toContain('After the image.');
    expectNoVisualPayloads(input);
  });

  it('treats an item as analyzable when its only text is in metadata', () => {
    const source = item({
      title: '',
      body_md: '',
      metadata: {
        imported_text: 'The only text of this record.',
      },
    });

    expect(isAnalyzable(source)).toBe(true);
    expect(plainAnalysisText(source)).toContain('The only text of this record.');
  });

  it('does not treat a visual-only item as analyzable', () => {
    const source = item({
      type: 'photo',
      title: '',
      body_md: '',
      metadata: {
        public_url: IMAGE_URL,
        images: [{ url: IMAGE_URL }],
      },
    });

    expect(isAnalyzable(source)).toBe(false);
    expect(buildAnalysisInput(source)).not.toContain(IMAGE_URL);
  });

  it('handles long items without exceeding the analysis budget', () => {
    const source = item({
      body_md: `Start of a long item. ${'concrete detail '.repeat(4_000)}End marker.`,
    });
    const input = buildAnalysisInput(source);

    expect(input).toContain('Start of a long item.');
    expect(input.length).toBeLessThanOrEqual(MAX_ANALYSIS_TEXT_CHARS);
  });
});
