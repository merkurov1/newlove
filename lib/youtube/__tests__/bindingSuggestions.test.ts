/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  normalizeYouTubeHandle,
  suggestProjectBindings,
  type YouTubeChannelRecord,
  type YouTubeProjectBinding,
} from '@/lib/youtube/channels';

function channel(
  id: string,
  channelId: string,
  handle: string | null,
  title: string,
  status = 'active'
): YouTubeChannelRecord {
  return {
    id,
    connectionId: 'connection-a',
    channelId,
    title,
    handle,
    uploadsPlaylistId: null,
    thumbnailUrl: null,
    status,
    hiddenSubscriberCount: false,
    subscriberCount: null,
    viewCount: null,
    videoCount: null,
    lastSyncedAt: null,
  };
}

function binding(projectSlug: string, channelRecordId: string): YouTubeProjectBinding {
  return {
    id: `binding-${projectSlug}`,
    projectSlug,
    channelRecordId,
    channelId: 'UC',
    isActive: true,
    updatedAt: null,
  };
}

const CHANNELS = [
  channel('record-art', 'UC_art', '@merkurov-art', 'Merkurov Art'),
  channel('record-unframed', 'UC_unframed', '@unframed-tv', 'UNFRAMED'),
  channel('record-heart', 'UC_heart', '@heartandangel', 'Heart & Angel'),
];

describe('YouTube project binding suggestions', () => {
  it('normalises handles so @Name, @name and name match', () => {
    expect(normalizeYouTubeHandle('@Merkurov-Art')).toBe('@merkurov-art');
    expect(normalizeYouTubeHandle('merkurov-art')).toBe('@merkurov-art');
    expect(normalizeYouTubeHandle('  @UNFRAMED-TV/ ')).toBe('@unframed-tv');
    expect(normalizeYouTubeHandle('')).toBeNull();
    expect(normalizeYouTubeHandle(null)).toBeNull();
  });

  it('maps the three owner-approved handles to the exact projects', () => {
    const suggestions = suggestProjectBindings(CHANNELS, []);

    expect(suggestions).toEqual([
      expect.objectContaining({
        projectSlug: 'art-engine',
        handle: '@merkurov-art',
        state: 'available',
        channelRecordId: 'record-art',
      }),
      expect.objectContaining({
        projectSlug: 'unframed',
        handle: '@unframed-tv',
        state: 'available',
        channelRecordId: 'record-unframed',
      }),
      expect.objectContaining({
        projectSlug: 'pierrot',
        handle: '@unframed-tv',
        state: 'available',
        channelRecordId: 'record-unframed',
      }),
      expect.objectContaining({
        projectSlug: 'heart-and-angel',
        handle: '@heartandangel',
        state: 'available',
        channelRecordId: 'record-heart',
      }),
    ]);
  });

  it('lets one channel serve both UNFRAMED and Pierrot and reports bound state', () => {
    const suggestions = suggestProjectBindings(CHANNELS, [
      binding('art-engine', 'record-art'),
      binding('unframed', 'record-unframed'),
      binding('pierrot', 'record-unframed'),
      binding('heart-and-angel', 'record-heart'),
    ]);

    expect(suggestions.map((item) => [item.projectSlug, item.state])).toEqual([
      ['art-engine', 'bound'],
      ['unframed', 'bound'],
      ['pierrot', 'bound'],
      ['heart-and-angel', 'bound'],
    ]);
    expect(suggestions.filter((item) => item.channelRecordId === 'record-unframed')).toHaveLength(
      2
    );
  });

  it('never suggests an inactive channel or one owned by another account', () => {
    const suggestions = suggestProjectBindings(
      [
        channel('record-art', 'UC_art', '@merkurov-art', 'Merkurov Art', 'disconnected'),
        channel('record-heart', 'UC_heart', '@heartandangel', 'Heart & Angel'),
      ],
      []
    );

    expect(suggestions[0]).toMatchObject({ projectSlug: 'art-engine', state: 'missing' });
    expect(suggestions[3]).toMatchObject({
      projectSlug: 'heart-and-angel',
      state: 'available',
      channelRecordId: 'record-heart',
    });
  });

  it('refuses to guess when two connected channels share the same handle', () => {
    const suggestions = suggestProjectBindings(
      [
        channel('record-art-a', 'UC_art_a', '@merkurov-art', 'Merkurov Art A'),
        channel('record-art-b', 'UC_art_b', '@Merkurov-Art', 'Merkurov Art B'),
      ],
      []
    );

    expect(suggestions[0]).toMatchObject({
      projectSlug: 'art-engine',
      state: 'ambiguous',
      channelRecordId: null,
      candidateCount: 2,
    });
  });
});
