/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import { publishToThreads } from '../threads';

const ENV = {
  META_THREADS_USER_ID: 'threads-user',
  META_THREADS_ACCESS_TOKEN: 'threads-secret-token',
  META_THREADS_API_VERSION: 'v1.0',
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    slug: 'threads-flow',
    title: 'Threads Flow',
    body_md: 'A natural short post.',
    type: 'note',
    lang: 'ru',
    metadata: {},
    ...overrides,
  };
}

function callBody(call: [unknown, RequestInit]): URLSearchParams {
  return new URLSearchParams(String(call[1].body));
}

describe('Threads adapter', () => {
  it('creates a container, confirms publication and stores the real URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-1' }))
      .mockResolvedValueOnce(response({ id: 'container-1', status: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'post-1' }))
      .mockResolvedValueOnce(
        response({
          id: 'post-1',
          permalink: 'https://www.threads.net/@merkurov/post/AbC123',
        })
      );

    const result = await publishToThreads(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('post-1');
    expect(result.externalUri).toBe('https://www.threads.net/@merkurov/post/AbC123');
    expect(result.phase).toBe('published');

    const create = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(create[0]).toBe('https://graph.threads.net/v1.0/threads-user/threads');
    const createBody = callBody(create);
    expect(createBody.get('media_type')).toBe('TEXT');
    expect(createBody.get('text')).toContain('https://www.merkurov.love/flow/threads-flow');
    expect(String(create[1].body)).not.toContain('threads-secret-token');

    const publish = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(publish[0]).toBe('https://graph.threads.net/v1.0/threads-user/threads_publish');
    expect(callBody(publish).get('creation_id')).toBe('container-1');
  });

  it('uses the Threads host and its own version, not the Facebook Graph version', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-8' }))
      .mockResolvedValueOnce(response({ id: 'container-8', status: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'post-8' }))
      .mockResolvedValueOnce(
        response({
          id: 'post-8',
          permalink: 'https://www.threads.net/@m/post/8',
        })
      );

    await publishToThreads(payload(), {
      env: {
        ...ENV,
        META_THREADS_API_VERSION: 'v1.1',
        META_GRAPH_API_VERSION: 'v26.0',
      },
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    const urls = (fetchMock.mock.calls as unknown as Array<[string]>).map((call) => call[0]);

    expect(urls).toEqual([
      'https://graph.threads.net/v1.1/threads-user/threads',
      'https://graph.threads.net/v1.1/container-8?fields=status,error_message,permalink',
      'https://graph.threads.net/v1.1/threads-user/threads_publish',
      'https://graph.threads.net/v1.1/post-8?fields=id,permalink',
    ]);
    expect(urls.some((url) => url.includes('graph.facebook.com'))).toBe(false);
  });

  it('defaults to Threads v1.0 even when the Facebook Graph version is set', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'container-9' }));

    await publishToThreads(payload(), {
      env: {
        META_THREADS_USER_ID: 'threads-user',
        META_THREADS_ACCESS_TOKEN: 'threads-secret-token',
        META_GRAPH_API_VERSION: 'v26.0',
      },
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
      'https://graph.threads.net/v1.0/threads-user/threads'
    );
  });

  it('uses the Flow image and a public image URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-2' }))
      .mockResolvedValueOnce(response({ id: 'container-2', status: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'post-2' }))
      .mockResolvedValueOnce(
        response({ id: 'post-2', permalink: 'https://www.threads.net/@m/post/2' })
      );

    const result = await publishToThreads(
      payload({ metadata: { images: ['https://cdn.example.com/image.jpg'] } }),
      { env: ENV, fetch: fetchMock as unknown as typeof fetch, sleep: async () => undefined }
    );

    expect(result.ok).toBe(true);
    const create = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = callBody(create);
    expect(body.get('media_type')).toBe('IMAGE');
    expect(body.get('image_url')).toBe('https://cdn.example.com/image.jpg');
  });

  it('does not treat a container as a published post when publish times out', async () => {
    const timeout = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-3' }))
      .mockResolvedValueOnce(response({ id: 'container-3', status: 'FINISHED' }))
      .mockRejectedValueOnce(timeout);

    const result = await publishToThreads(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.externalId).toBe('container-3');
    expect(result.externalUri).toBeNull();
    expect(result.phase).toBe('container_created');
    expect(result.error).toBe('Threads publish request timed out.');
  });

  it('publishes a stored container only after checking its status', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-4', status: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'post-4' }))
      .mockResolvedValueOnce(
        response({ id: 'post-4', permalink: 'https://www.threads.net/@m/post/4' })
      );

    const result = await publishToThreads(payload(), {
      env: ENV,
      resume: { externalId: 'container-4', phase: 'container_created' },
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('post-4');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({
      method: 'GET',
    });
  });

  it('does not create a duplicate when a stored container cannot be inspected', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    });

    const result = await publishToThreads(payload(), {
      env: ENV,
      resume: { externalId: 'container-5', phase: 'container_created' },
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.externalId).toBe('container-5');
    expect(result.phase).toBe('container_created');
    // Only status checks; no new container and no threads_publish call.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const call of fetchMock.mock.calls as unknown as Array<[string]>) {
      expect(call[0]).toContain('container-5');
    }
  });

  it('returns skipped when credentials are missing', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'unused' }));
    const result = await publishToThreads(payload(), {
      env: {},
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a Meta API error as a readable failure', async () => {
    const fetchMock = jest.fn(async () =>
      response(
        {
          error: {
            message: 'Invalid access token threads-secret-token',
            code: 190,
          },
        },
        400
      )
    );

    const result = await publishToThreads(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(false);
    expect(result.error).toContain('Invalid access token');
    expect(result.error).not.toContain('threads-secret-token');
  });

  it('marks a failed publish request as uncertain and keeps the container', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-6' }))
      .mockResolvedValueOnce(response({ id: 'container-6', status: 'FINISHED' }))
      .mockResolvedValueOnce(response({ error: { message: 'temporary' } }, 500));

    const result = await publishToThreads(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.externalId).toBe('container-6');
    expect(result.phase).toBe('container_created');
  });

  it('keeps a confirmed post published when the permalink request fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ id: 'container-7' }))
      .mockResolvedValueOnce(response({ id: 'container-7', status: 'FINISHED' }))
      .mockResolvedValueOnce(response({ id: 'post-7' }))
      .mockResolvedValueOnce(response({ error: { message: 'nope' } }, 500));

    const result = await publishToThreads(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('post-7');
    expect(result.externalUri).toBeNull();
  });
});
