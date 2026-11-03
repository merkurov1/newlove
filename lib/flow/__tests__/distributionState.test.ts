/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { readDistributionState, readDistributionUrl } from '../distribution';

describe('Flow distribution state reader', () => {
  const metadata = {
    crosspost: {
      channels: {
        telegram: {
          status: 'published',
          externalId: '42',
          externalUri: null,
          attempts: 1,
        },
        facebook: {
          status: 'published',
          externalId: 'page_1',
          externalUri: 'https://www.facebook.com/page_1/posts/1',
          attempts: 2,
        },
        threads: {
          status: 'failed',
          externalId: 'container-1',
          externalUri: null,
          lastError: 'Request timed out.',
          uncertain: true,
          phase: 'container_created',
        },
      },
    },
  };

  it('reads each channel independently', () => {
    expect(readDistributionState(metadata, 'telegram')).toMatchObject({
      status: 'published',
      externalId: '42',
    });
    expect(readDistributionState(metadata, 'threads')).toMatchObject({
      status: 'failed',
      uncertain: true,
      phase: 'container_created',
    });
    expect(readDistributionState(metadata, 'bluesky')).toBeNull();
  });

  it('exposes only real external URLs', () => {
    expect(readDistributionUrl(metadata, 'facebook')).toBe(
      'https://www.facebook.com/page_1/posts/1'
    );
    expect(readDistributionUrl(metadata, 'threads')).toBeNull();
    expect(readDistributionUrl(metadata, 'telegram')).toBeNull();
  });

  it('is tolerant of legacy or malformed metadata', () => {
    expect(readDistributionState(null, 'facebook')).toBeNull();
    expect(readDistributionState({ crosspost: 'broken' }, 'threads')).toBeNull();
    expect(readDistributionState({ crosspost: { channels: [] } }, 'threads')).toBeNull();
  });
});
