/** @jest-environment node */

import {
  fetchUploadsPage,
  mergeEditableVideoSnippet,
  type YouTubeVideoDetails,
} from '../api';

function details(overrides: Partial<YouTubeVideoDetails> = {}): YouTubeVideoDetails {
  return {
    videoId: 'TmC6Lr5K4R8',
    channelId: 'UC_shared',
    title: 'Original title',
    description: 'Original description with enough detail for the test fixture.',
    tags: ['art', 'process'],
    categoryId: '27',
    defaultLanguage: 'ru',
    defaultAudioLanguage: 'ru',
    localized: { ru: 'Локализованный заголовок', en: 'Localized title' },
    publishedAt: '2026-01-01T00:00:00.000Z',
    thumbnailUrl: null,
    privacyStatus: 'public',
    uploadStatus: 'processed',
    publishAt: null,
    madeForKids: false,
    embeddable: true,
    license: 'youtube',
    publicStatsViewable: true,
    durationSeconds: 600,
    views: 100,
    likes: 10,
    comments: 2,
    ...overrides,
  };
}

describe('videos.update snippet preservation', () => {
  it('changes only requested fields and re-sends every untouched snippet field', () => {
    const merged = mergeEditableVideoSnippet(details(), { title: 'New title' });

    expect(merged.changedFields).toEqual(['title']);
    expect(merged.snippet).toMatchObject({
      title: 'New title',
      description: 'Original description with enough detail for the test fixture.',
      tags: ['art', 'process'],
      categoryId: '27',
      defaultLanguage: 'ru',
      defaultAudioLanguage: 'ru',
    });
    // localized is read-only in videos.update and must not be sent.
    expect(merged.snippet).not.toHaveProperty('localized');
    expect(merged.snippet).not.toHaveProperty('status');
    expect(merged.preservedFields).toEqual(
      expect.arrayContaining([
        'categoryId',
        'defaultLanguage',
        'defaultAudioLanguage',
        'localized',
      ])
    );
  });

  it('preserves tags when the owner did not request a tag change', () => {
    const merged = mergeEditableVideoSnippet(details(), { description: 'Updated description' });

    expect(merged.changedFields).toEqual(['description']);
    expect(merged.snippet.tags).toEqual(['art', 'process']);
  });

  it('can clear tags only when the owner explicitly sends an empty list', () => {
    const merged = mergeEditableVideoSnippet(details(), { tags: [] });

    expect(merged.changedFields).toEqual(['tags']);
    expect(merged.snippet.tags).toEqual([]);
    expect(merged.snippet.categoryId).toBe('27');
    expect(merged.snippet.defaultLanguage).toBe('ru');
  });

  it('does not request status, so privacy is untouched', () => {
    const merged = mergeEditableVideoSnippet(details(), { title: 'Changed' });
    expect(Object.keys(merged.snippet)).not.toContain('privacyStatus');
    expect(Object.keys(merged.snippet)).not.toContain('status');
  });
});

describe('paginated uploads catalog', () => {
  it('passes the opaque page token and returns the next page', async () => {
    const calls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          items: [{ contentDetails: { videoId: 'video_1' } }],
          nextPageToken: 'next-token',
          pageInfo: { totalResults: 120 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const page = await fetchUploadsPage(
      { accessToken: 'access-token' },
      'UU_channel',
      { pageToken: 'page-1', maxResults: 50, fetchImpl: fetchImpl as never }
    );

    expect(page.videoIds).toEqual(['video_1']);
    expect(page.nextPageToken).toBe('next-token');
    expect(page.totalResults).toBe(120);
    expect(calls[0]).toContain('pageToken=page-1');
    expect(calls[0]).toContain('maxResults=50');
  });
});
