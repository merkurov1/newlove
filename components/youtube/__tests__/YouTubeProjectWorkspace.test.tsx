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

describe('YouTube project workspace state refresh', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a visible loading state, disables duplicate clicks and confirms success', async () => {
    let resolveRefresh: ((value: Response) => void) | undefined;
    let statusCalls = 0;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/youtube/channels?project=art-engine') {
        statusCalls += 1;
        if (statusCalls === 1) return response(statusPayload('art-engine'));
        return new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        });
      }
      return response({ error: 'not_found' }, false, 404);
    }) as unknown as typeof fetch;

    render(<YouTubeProjectWorkspace project="art-engine" />);

    const refresh = await screen.findByRole('button', { name: 'Обновить состояние' });
    fireEvent.click(refresh);

    const loading = await screen.findByRole('button', { name: 'Обновление…' });
    expect(loading).toBeDisabled();
    expect(screen.getByText('Читаю состояние YouTube…')).toBeInTheDocument();

    resolveRefresh?.(response(statusPayload('art-engine')));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Обновить состояние' })).toBeEnabled();
    });
    expect(screen.getByText(/Состояние обновлено:/)).toBeInTheDocument();
  });

  it('surfaces the HTTP status and safe error code when the state fetch fails, with retry', async () => {
    let statusCalls = 0;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/admin/youtube/channels?project=art-engine') {
        statusCalls += 1;
        if (statusCalls === 1) return response(statusPayload('art-engine'));
        return response(
          {
            error: 'state_read_failed',
            code: '42501',
            message: 'Не удалось прочитать состояние YouTube из базы.',
            retryable: true,
          },
          false,
          500
        );
      }
      return response({ error: 'not_found' }, false, 404);
    }) as unknown as typeof fetch;

    render(<YouTubeProjectWorkspace project="art-engine" />);

    const refresh = await screen.findByRole('button', { name: 'Обновить состояние' });
    fireEvent.click(refresh);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось прочитать состояние YouTube из базы.');
    expect(alert).toHaveTextContent('HTTP 500');
    expect(alert).toHaveTextContent('код: state_read_failed');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled();
  });

  it('keeps connect actionable when the initial state fetch fails', async () => {
    global.fetch = jest.fn(async () =>
      response({ error: 'Unauthorized' }, false, 401)
    ) as unknown as typeof fetch;

    render(<YouTubeProjectWorkspace project="art-engine" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('HTTP 401');
    expect(alert).toHaveTextContent('код: Unauthorized');
    expect(screen.getByRole('link', { name: 'Подключить Google-аккаунт' })).toHaveAttribute(
      'href',
      '/api/admin/youtube/channels/connect?project=art-engine'
    );
  });
});

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

    expect(connect).toHaveAttribute('href', `/api/admin/youtube/channels/connect?project=${slug}`);
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/youtube/channels?project=${slug}`, {
      cache: 'no-store',
    });

    // Discovery result: the signed-in account and its channel are visible.
    expect(await screen.findByRole('option', { name: 'owner@example.com' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /Merkurov Art/ })).toBeInTheDocument();

    const bind = await screen.findByRole('button', { name: 'Привязать канал к проекту' });
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
