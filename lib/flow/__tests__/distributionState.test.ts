/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  readDistributionState,
  readDistributionUrl,
  summarizeCrosspostResult,
} from '../distribution';

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

describe('Flow publication receipt', () => {
  it('reports Telegram and Bluesky independently', () => {
    const receipt = summarizeCrosspostResult(
      {
        channels: {
          telegram: { status: 'published', messageIds: [42] },
          bluesky: {
            status: 'failed',
            uncertain: true,
            lastError: 'Request timed out.',
          },
        },
        attemptedChannels: ['telegram', 'bluesky'],
      },
      'item-1'
    );

    expect(receipt.itemId).toBe('item-1');
    expect(receipt.channels).toEqual([
      { key: 'telegram', label: 'Telegram', status: 'published', detail: null },
      {
        key: 'bluesky',
        label: 'Bluesky',
        status: 'uncertain',
        detail: 'Request timed out.',
      },
    ]);
    expect(receipt.hasProblem).toBe(true);
  });

  it('never presents a missing result as delivered', () => {
    const receipt = summarizeCrosspostResult(null, 'item-1');

    expect(receipt.channels.map((channel) => channel.status)).toEqual([
      'unknown',
      'unknown',
    ]);
    expect(receipt.hasProblem).toBe(true);
  });

  it('distinguishes a channel that was not requested from a success', () => {
    const receipt = summarizeCrosspostResult({
      channels: {
        telegram: { status: 'skipped' },
      },
    });

    expect(receipt.channels[0].status).toBe('skipped');
    expect(receipt.channels[1].status).toBe('not_requested');
    expect(receipt.hasProblem).toBe(false);
  });

  it('treats a hard failure as a problem and a pending state as in progress', () => {
    const receipt = summarizeCrosspostResult({
      channels: {
        telegram: { status: 'failed' },
        bluesky: { status: 'publishing' },
      },
    });

    expect(receipt.channels[0].status).toBe('failed');
    expect(receipt.channels[1].status).toBe('publishing');
    expect(receipt.hasProblem).toBe(true);
  });
});
