import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import YouTubeProjectWorkspace from '../YouTubeProjectWorkspace';

const PROJECTS = [
  { slug: 'art-engine', name: 'Art Engine', defaultChannelHandle: '@merkurov-art' },
  { slug: 'unframed', name: 'UNFRAMED', defaultChannelHandle: '@unframed-tv' },
  { slug: 'pierrot', name: 'Pierrot', defaultChannelHandle: '@unframed-tv' },
  { slug: 'heart-and-angel', name: 'Heart & Angel', defaultChannelHandle: '@heartandangel' },
] as const;

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function statusPayload(project: string) {
  return {
    schemaReady: true,
    project,
    projects: PROJECTS,
    connections: [
      {
        id: 'connection-1',
        googleAccountEmail: 'owner@example.com',
        googleAccountName: 'Owner',
        status: 'connected',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        connectedAt: '2026-01-01T00:00:00.000Z',
        lastErrorCode: null,
        lastErrorMessage: null,
        hasRefreshToken: true,
      },
    ],
    channels: [
      {
        id: 'channel-record-1',
        connectionId: 'connection-1',
        channelId: 'UC_art',
        title: 'Merkurov Art',
        handle: '@merkurov-art',
        thumbnailUrl: null,
        status: 'active',
        subscriberCount: 10,
        viewCount: 100,
        videoCount: 5,
      },
    ],
    bindings: [],
    activeByProject: {},
    active: null,
    config: {
      connectUrl: `/api/admin/youtube/channels/connect?project=${project}`,
      redirectUri: 'https://example.test/api/auth/youtube-channels/callback',
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    },
  };
}

function installFetch(project: string) {
  const fetchMock = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);

      if (url === `/api/admin/youtube/channels?project=${project}`) {
        return response(statusPayload(project));
      }

      if (url === '/api/admin/youtube/channels' && init?.method === 'POST') {
        return response({ ok: true, action: 'bind' });
      }

      return response({ error: 'not_found' }, false, 404);
    }
  );

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe.each(PROJECTS)('YouTube project workspace · $slug', ({ slug }) => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = installFetch(slug) as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps connect, discovery and bind workflow', async () => {
    render(<YouTubeProjectWorkspace project={slug} />);

    const connect = await screen.findByRole('link', {
      name: 'Подключить Google-аккаунт',
    });

    expect(connect).toHaveAttribute(
      'href',
      `/api/admin/youtube/channels/connect?project=${slug}`
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/youtube/channels?project=${slug}`,
      { cache: 'no-store' }
    );

    // Discovery result: the signed-in account and its channel are visible.
    expect(screen.getByRole('option', { name: 'owner@example.com' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Merkurov Art/ })).toBeInTheDocument();

    const bind = screen.getByRole('button', { name: 'Привязать канал к проекту' });
    expect(bind).toBeEnabled();

    fireEvent.click(bind);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/youtube/channels',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const calls = fetchMock.mock.calls as unknown as FetchCall[];
    const bindCall = calls.find(
      ([url, init]) => String(url) === '/api/admin/youtube/channels' && init?.method === 'POST'
    );

    expect(JSON.parse(String(bindCall?.[1]?.body))).toMatchObject({
      action: 'bind',
      project: slug,
      channelRecordId: 'channel-record-1',
    });
  });
});
