/** @jest-environment node */

import { listMyChannels } from '../api';

type Call = { url: string; init: RequestInit };

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function channel(id: string, title: string) {
  return {
    id,
    snippet: { title, customUrl: `@${title.toLowerCase()}` },
    statistics: { subscriberCount: '10', viewCount: '100', videoCount: '2' },
    contentDetails: { relatedPlaylists: { uploads: `UU_${id}` } },
  };
}

describe('listMyChannels', () => {
  it('returns every channel on one Google account across pages, including Brand Accounts', async () => {
    const calls: Call[] = [];
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      const parsed = new URL(url);

      if (!parsed.searchParams.get('pageToken')) {
        return jsonResponse({
          items: [channel('UC_art', 'Merkurov Art'), channel('UC_brand', 'UNFRAMED')],
          nextPageToken: 'page-2',
        });
      }

      return jsonResponse({ items: [channel('UC_heart', 'Heart and Angel')] });
    });

    const result = await listMyChannels(
      { accessToken: 'access-token' },
      { fetchImpl: fetchImpl as never }
    );

    expect(result.truncated).toBe(false);
    expect(result.channels.map((item) => item.channelId)).toEqual([
      'UC_art',
      'UC_brand',
      'UC_heart',
    ]);
    expect(calls[0].url).toContain('mine=true');
    expect(calls[1].url).toContain('pageToken=page-2');
    expect(JSON.stringify(result)).not.toContain('access-token');
  });

  it('refuses an unauthenticated channel listing', async () => {
    await expect(listMyChannels({ accessToken: null })).rejects.toMatchObject({
      code: 'needs_reauthorization',
    });
  });

  it('returns an explicit empty result for a grant with no channels', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ items: [] }));

    const result = await listMyChannels(
      { accessToken: 'access-token' },
      { fetchImpl: fetchImpl as never }
    );

    expect(result).toEqual({ channels: [], truncated: false });
  });

  it('reports truncation when the bounded page cap is reached', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      const page = new URL(url).searchParams.get('pageToken') || 'start';
      return jsonResponse({
        items: [channel(`UC_${page}`, `Channel ${page}`)],
        nextPageToken: `${page}-next`,
      });
    });

    const result = await listMyChannels(
      { accessToken: 'access-token' },
      { fetchImpl: fetchImpl as never, maxPages: 2 }
    );

    expect(result.truncated).toBe(true);
    expect(result.channels).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails atomically on a partial page failure instead of persisting half a grant', async () => {
    let call = 0;
    const fetchImpl = jest.fn(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse({
          items: [channel('UC_art', 'Merkurov Art')],
          nextPageToken: 'page-2',
        });
      }
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: 'The request cannot be completed because you have exceeded your quota.',
            errors: [{ reason: 'quotaExceeded' }],
          },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    });

    await expect(
      listMyChannels({ accessToken: 'access-token' }, { fetchImpl: fetchImpl as never })
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
  });

  it('classifies a revoked-grant response as needs_reauthorization', async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 401, message: 'Invalid Credentials' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
    );

    await expect(
      listMyChannels({ accessToken: 'expired-token' }, { fetchImpl: fetchImpl as never })
    ).rejects.toMatchObject({ code: 'needs_reauthorization' });
  });
});
