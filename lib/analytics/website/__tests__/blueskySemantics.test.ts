/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { blueskySnapshot } from '../dataset';
import type { MetricRow, StoredConnection } from '../store';
import type { AnalyticsPeriod } from '../types';

const period: AnalyticsPeriod = {
  key: 'last_7_days',
  label: '4 — 10 Nov 2026',
  timezone: 'Europe/London',
  start: '2026-11-04',
  end: '2026-11-10',
  previousStart: '2026-10-28',
  previousEnd: '2026-11-03',
  previousLabel: 'previous 7 days',
  comparisonRequested: true,
};

function row(input: {
  date: string;
  type: 'profile' | 'post';
  uri: string;
  metric: string;
  value: number;
  createdAt?: string;
  text?: string;
  syncedAt?: string;
  kind?: 'post' | 'reply' | 'repost';
  authorDid?: string;
}): MetricRow {
  return {
    provider: 'bluesky',
    report_type: input.type,
    metric_date: input.date,
    dimension_key: input.type,
    dimension_value: input.uri,
    metric: input.metric,
    value: input.value,
    unit: 'count',
    metadata: {
      ...(input.createdAt ? { post_created_at: input.createdAt } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.kind ? { post_kind: input.kind } : {}),
      ...(input.authorDid ? { author_did: input.authorDid } : {}),
    },
    synced_at: input.syncedAt ?? `${input.date}T03:15:00.000Z`,
  };
}

const connection = {
  provider: 'bluesky',
  status: 'connected',
  account_label: 'merkurov.bsky.social',
  external_id: 'did:plc:test',
  external_meta: { handle: 'merkurov.bsky.social' },
  scopes: [],
  token_ciphertext: null,
  token_iv: null,
  token_tag: null,
  connected_by: null,
  last_sync_at: '2026-11-10T03:15:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-11-10T03:15:00.000Z',
} as unknown as StoredConnection;

function archiveRows(): MetricRow[] {
  return [
    // Lifetime profile snapshots: the latest one must win.
    row({ date: '2026-10-01', type: 'profile', uri: '', metric: 'followers', value: 40 }),
    row({ date: '2026-11-10', type: 'profile', uri: '', metric: 'followers', value: 42 }),
    row({ date: '2026-11-10', type: 'profile', uri: '', metric: 'posts', value: 99 }),
    // Post from inside the period.
    row({
      date: '2026-11-05',
      type: 'post',
      uri: 'at://inside',
      metric: 'likes',
      value: 10,
      createdAt: '2026-11-05T12:00:00.000Z',
      text: 'Inside the period',
      kind: 'post',
    }),
    row({
      date: '2026-11-05',
      type: 'post',
      uri: 'at://inside',
      metric: 'reposts',
      value: 2,
      createdAt: '2026-11-05T12:00:00.000Z',
    }),
    row({
      date: '2026-11-05',
      type: 'post',
      uri: 'at://inside',
      metric: 'replies',
      value: 1,
      createdAt: '2026-11-05T12:00:00.000Z',
    }),
    // A later observation of the same post, still inside the archive.
    row({
      date: '2026-11-10',
      type: 'post',
      uri: 'at://inside',
      metric: 'likes',
      value: 12,
      createdAt: '2026-11-05T12:00:00.000Z',
    }),
    // Post outside the period.
    row({
      date: '2026-10-20',
      type: 'post',
      uri: 'at://outside',
      metric: 'likes',
      value: 100,
      createdAt: '2026-10-20T12:00:00.000Z',
      text: 'Outside the period',
      kind: 'post',
    }),
    // Duplicate URI row from a previous sync, must not double count.
    row({
      date: '2026-10-21',
      type: 'post',
      uri: 'at://outside',
      metric: 'likes',
      value: 100,
      createdAt: '2026-10-20T12:00:00.000Z',
    }),
  ];
}

describe('Bluesky metric semantics', () => {
  it('separates lifetime profile, selected-period activity and archive', () => {
    const snapshot = blueskySnapshot(archiveRows(), [], connection, period);

    expect(snapshot.profile.followers).toBe(42);
    expect(snapshot.profile.posts).toBe(99);
    expect(snapshot.period.totals.posts).toBe(1);
    expect(snapshot.period.totals.likes).toBe(12);
    expect(snapshot.period.totals.reposts).toBe(2);
    expect(snapshot.period.totals.replies).toBe(1);
    expect(snapshot.archive.total).toBe(2);
  });

  it('uses the latest observation per post and never double counts', () => {
    const snapshot = blueskySnapshot(archiveRows(), [], connection, period);
    const outside = snapshot.posts.find((post) => post.uri === 'at://outside');

    expect(snapshot.posts).toHaveLength(2);
    expect(outside?.likes).toBe(100);
    expect(snapshot.totals.likes.value).toBe(112);
  });

  it('labels period counters as current observed values, not period events', () => {
    const snapshot = blueskySnapshot(archiveRows(), [], connection, period);

    expect(snapshot.period.limitation).toContain('могли накопиться');
    expect(snapshot.totals.likes.label).toContain('архив');
    expect(snapshot.period.totals.posts).not.toBe(snapshot.profile.posts);
  });

  it('marks incomplete coverage instead of presenting a partial period as complete', () => {
    const incomplete = archiveRows().filter((item) => item.metric_date <= '2026-11-06');
    const snapshot = blueskySnapshot(incomplete, [], connection, period);

    expect(snapshot.period.coverageComplete).toBe(false);
    expect(snapshot.period.limitation).toContain('неполными');
    expect(snapshot.limitations.join(' ')).toContain('неполными');
  });

  it('keeps replies and reposts in the archive but out of publication counts', () => {
    const rows = [
      ...archiveRows(),
      row({
        date: '2026-11-06',
        type: 'post',
        uri: 'at://reply',
        metric: 'likes',
        value: 1,
        createdAt: '2026-11-06T12:00:00.000Z',
        kind: 'reply',
      }),
      row({
        date: '2026-11-07',
        type: 'post',
        uri: 'at://repost',
        metric: 'likes',
        value: 2,
        createdAt: '2026-11-07T12:00:00.000Z',
        kind: 'repost',
      }),
    ];
    const snapshot = blueskySnapshot(rows, [], connection, period);

    expect(snapshot.period.totals.posts).toBe(1);
    expect(snapshot.archive.total).toBe(4);
    expect(snapshot.posts.find((post) => post.uri === 'at://reply')?.kind).toBe('reply');
    expect(snapshot.topPosts.some((post) => post.uri === 'at://reply')).toBe(false);
  });

  it('exposes the latest observation time and resolves Flow links by URI', () => {
    const snapshot = blueskySnapshot(
      archiveRows(),
      [],
      connection,
      period,
      new Map([
        [
          'at://inside',
          { id: 'flow-1', url: '/flow/inside', title: 'Inside the period' },
        ],
      ])
    );
    const inside = snapshot.posts.find((post) => post.uri === 'at://inside');

    expect(inside?.flowItemId).toBe('flow-1');
    expect(inside?.flowUrl).toBe('/flow/inside');
    expect(inside?.observedAt).toBe('2026-11-10T03:15:00.000Z');
  });

  it('does not present an empty feed as a confirmed zero when the profile reports posts', () => {
    const rows = [
      row({ date: '2026-11-10', type: 'profile', uri: '', metric: 'followers', value: 42 }),
      row({ date: '2026-11-10', type: 'profile', uri: '', metric: 'posts', value: 99 }),
    ];
    const snapshot = blueskySnapshot(rows, [], connection, period);

    expect(snapshot.archive.total).toBe(0);
    expect(snapshot.period.coverageComplete).toBe(false);
    expect(snapshot.limitations.join(' ')).toContain('лента вернула 0 постов');
  });

  it('keeps a post by another author in the archive but out of publication counts', () => {
    const rows = [
      ...archiveRows(),
      row({
        date: '2026-11-07',
        type: 'post',
        uri: 'at://other',
        metric: 'likes',
        value: 9,
        createdAt: '2026-11-07T12:00:00.000Z',
        kind: 'post',
        authorDid: 'did:plc:other',
      }),
    ];
    const snapshot = blueskySnapshot(rows, [], connection, period);

    expect(snapshot.period.totals.posts).toBe(1);
    expect(snapshot.posts.find((post) => post.uri === 'at://other')?.authorship).toBe('other');
  });

  it('counts posts in the comparison window independently', () => {
    const previous = [
      row({
        date: '2026-10-30',
        type: 'post',
        uri: 'at://previous',
        metric: 'likes',
        value: 5,
        createdAt: '2026-10-30T12:00:00.000Z',
      }),
    ];
    const snapshot = blueskySnapshot([...archiveRows(), ...previous], [], connection, period);

    expect(snapshot.period.previousPosts).toBe(1);
    expect(snapshot.period.totals.posts).toBe(1);
  });
});
