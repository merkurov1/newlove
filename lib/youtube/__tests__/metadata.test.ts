/** @jest-environment node */

import type { YouTubeVideoDetails } from '../api';
import {
  analyzeVideoMetadata,
  buildMetadataDiff,
  sanitizeMetadataChanges,
} from '../metadata';

function video(overrides: Partial<YouTubeVideoDetails> = {}): YouTubeVideoDetails {
  return {
    videoId: 'TmC6Lr5K4R8',
    channelId: 'UC_shared',
    title: 'The Spectral Tiger and the archive of memory',
    description: 'Archive of memory. How images survive. How images survive.',
    tags: ['video', 'youtube', 'Art', 'art'],
    categoryId: '27',
    defaultLanguage: 'en',
    defaultAudioLanguage: 'en',
    localized: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    thumbnailUrl: null,
    privacyStatus: 'public',
    uploadStatus: 'processed',
    publishAt: null,
    madeForKids: false,
    embeddable: true,
    license: 'youtube',
    publicStatsViewable: true,
    durationSeconds: 900,
    views: 100,
    likes: 10,
    comments: 2,
    ...overrides,
  };
}

describe('metadata analysis', () => {
  it('finds empty, weak, repeated and missing metadata without touching content facts', () => {
    const analysis = analyzeVideoMetadata({
      video: video(),
      projectSlug: 'unframed',
    });

    expect(analysis.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'short_description',
        'repeated_description',
        'missing_chapters',
        'missing_links',
        'generic_tags',
        'duplicate_tags',
      ])
    );
    expect(analysis.proposedChanges.description).toBe('Archive of memory. How images survive.');
    expect(analysis.proposedChanges.tags).toEqual(
      expect.arrayContaining(['Art', 'spectral', 'tiger', 'archive', 'memory', 'unframed'])
    );
    expect(analysis.proposedChanges.tags).not.toContain('video');
    expect(analysis.limitations.join(' ')).toContain('не смотрит само видео');
    expect(analysis.limitations.join(' ')).toContain('Ничего не записывается');
  });

  it('asks for context instead of inventing a description for a thin video', () => {
    const analysis = analyzeVideoMetadata({
      video: video({ title: 'Untitled', description: '', tags: [] }),
      projectSlug: 'art-engine',
    });

    expect(analysis.needsContext).toBe(true);
    expect(analysis.confidence).toBe('low');
    expect(analysis.contextRequest).toContain('транскрипт');
    expect(analysis.proposedChanges.description).toBeUndefined();
    expect(analysis.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['empty_description', 'missing_tags'])
    );
  });

  it('does not add links or promises that were not already in the metadata', () => {
    const analysis = analyzeVideoMetadata({
      video: video(),
      projectSlug: 'pierrot',
    });
    const proposed = JSON.stringify(analysis.proposedChanges);

    expect(proposed).not.toMatch(/https?:\/\//);
    expect(proposed.toLowerCase()).not.toContain('subscribe');
    expect(proposed.toLowerCase()).not.toContain('купить');
  });
});

describe('metadata diff and sanitisation', () => {
  it('marks only changed fields in the before/after diff', () => {
    const diff = buildMetadataDiff(
      { title: 'Old', description: 'Same', tags: ['a'] },
      { title: 'New', tags: ['a'] }
    );

    expect(diff.find((row) => row.field === 'title')?.changed).toBe(true);
    expect(diff.find((row) => row.field === 'description')?.changed).toBe(false);
    expect(diff.find((row) => row.field === 'tags')?.changed).toBe(false);
  });

  it('drops unknown fields so they can never reach videos.update', () => {
    const changes = sanitizeMetadataChanges({
      title: 'New title',
      description: 'New description',
      tags: [' one ', 'one', 'two'],
      categoryId: '99',
      privacyStatus: 'private',
      status: { privacyStatus: 'private' },
    });

    expect(changes).toEqual({
      title: 'New title',
      description: 'New description',
      tags: ['one', 'two'],
    });
    expect(changes).not.toHaveProperty('categoryId');
    expect(changes).not.toHaveProperty('privacyStatus');
  });
});
