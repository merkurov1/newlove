/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import { publishToFacebook } from '../facebook';

const ENV = {
  META_FACEBOOK_PAGE_ID: 'page-1',
  META_FACEBOOK_PAGE_ACCESS_TOKEN: 'facebook-secret-token',
  META_GRAPH_API_VERSION: 'v26.0',
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
    slug: 'hello-flow',
    title: 'Hello Flow',
    body_md: 'Full **Facebook** text.',
    type: 'note',
    lang: 'ru',
    metadata: {},
    ...overrides,
  };
}

function bodyOf(call: [unknown, RequestInit]): URLSearchParams {
  return new URLSearchParams(String(call[1].body));
}

describe('Facebook Page adapter', () => {
  it('publishes full text with the canonical Flow link', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'page-1_111' }));
    const result = await publishToFacebook(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('page-1_111');
    expect(result.externalUri).toBe('https://www.facebook.com/page-1/posts/111');
    expect(result.phase).toBe('published');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://graph.facebook.com/v26.0/page-1/feed');

    const body = bodyOf(call);
    expect(body.get('message')).toContain('Full Facebook text.');
    expect(body.get('link')).toBe('https://www.merkurov.love/flow/hello-flow');
    expect(String(call[1].body)).not.toContain('facebook-secret-token');
    expect((call[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer facebook-secret-token'
    );
  });

  it('publishes an image using a public URL and keeps the Flow link in the caption', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'page-1_222' }));
    const result = await publishToFacebook(
      payload({
        metadata: { images: ['https://cdn.example.com/photo.jpg'] },
      }),
      { env: ENV, fetch: fetchMock as unknown as typeof fetch }
    );

    expect(result.ok).toBe(true);
    expect(result.externalUri).toBe('https://www.facebook.com/page-1/photos/222');

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://graph.facebook.com/v26.0/page-1/photos');

    const body = bodyOf(call);
    expect(body.get('url')).toBe('https://cdn.example.com/photo.jpg');
    expect(body.get('caption')).toContain('https://www.merkurov.love/flow/hello-flow');
  });

  it('uses the configured Graph version for the feed endpoint', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'page-1_555' }));

    await publishToFacebook(payload(), {
      env: { ...ENV, META_GRAPH_API_VERSION: 'v25.0' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
      'https://graph.facebook.com/v25.0/page-1/feed'
    );
  });

  it('uses the configured Graph version for the photos endpoint', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'page-1_666' }));

    await publishToFacebook(
      payload({
        metadata: { images: ['https://cdn.example.com/photo.jpg'] },
      }),
      {
        env: { ...ENV, META_GRAPH_API_VERSION: 'v25.0' },
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
      'https://graph.facebook.com/v25.0/page-1/photos'
    );
  });

  it('uses the configured Graph version for the verification endpoint', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'page-1_777' }));

    await publishToFacebook(payload(), {
      env: { ...ENV, META_GRAPH_API_VERSION: 'v25.0' },
      resume: { externalId: 'page-1_777', phase: 'published' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe(
      'https://graph.facebook.com/v25.0/page-1_777?fields=id,permalink_url,created_time'
    );
  });

  it('defaults to v26.0 when the version is missing or invalid', async () => {
    const missingVersion = jest.fn(async () => response({ id: 'page-1_888' }));
    const invalidVersion = jest.fn(async () => response({ id: 'page-1_999' }));

    await publishToFacebook(payload(), {
      env: {
        META_FACEBOOK_PAGE_ID: 'page-1',
        META_FACEBOOK_PAGE_ACCESS_TOKEN: 'facebook-secret-token',
      },
      fetch: missingVersion as unknown as typeof fetch,
    });

    await publishToFacebook(payload(), {
      env: { ...ENV, META_GRAPH_API_VERSION: 'not-a-version' },
      fetch: invalidVersion as unknown as typeof fetch,
    });

    expect((missingVersion.mock.calls[0] as unknown[])[0]).toBe(
      'https://graph.facebook.com/v26.0/page-1/feed'
    );
    expect((invalidVersion.mock.calls[0] as unknown[])[0]).toBe(
      'https://graph.facebook.com/v26.0/page-1/feed'
    );
  });

  it('returns skipped without calling the API when credentials are missing', async () => {
    const fetchMock = jest.fn(async () => response({ id: 'unused' }));
    const result = await publishToFacebook(payload(), {
      env: {},
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.externalId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a readable API error without the token', async () => {
    const fetchMock = jest.fn(async () =>
      response(
        {
          error: {
            message: 'Invalid OAuth access token facebook-secret-token.',
            code: 190,
          },
        },
        400
      )
    );

    const result = await publishToFacebook(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(false);
    expect(result.externalId).toBeNull();
    expect(result.error).toContain('Invalid OAuth access token');
    expect(result.error).not.toContain('facebook-secret-token');
    expect(result.error).toContain('[redacted]');
  });

  it('marks a timeout as uncertain', async () => {
    const timeout = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    const fetchMock = jest.fn(async () => {
      throw timeout;
    });

    const result = await publishToFacebook(payload(), {
      env: ENV,
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.error).toBe('Facebook request timed out.');
  });

  it('verifies a stored post ID instead of publishing it twice', async () => {
    const fetchMock = jest.fn(async () =>
      response({
        id: 'page-1_333',
        permalink_url: 'https://www.facebook.com/page-1/posts/333',
      })
    );

    const result = await publishToFacebook(payload(), {
      env: ENV,
      resume: { externalId: 'page-1_333', phase: 'published' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('page-1_333');
    expect(result.externalUri).toBe('https://www.facebook.com/page-1/posts/333');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({
      method: 'GET',
    });
  });

  it('publishes only after a stored ID is confirmed missing', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response({ error: { code: 100 } }, 404))
      .mockResolvedValueOnce(response({ id: 'page-1_444' }));

    const result = await publishToFacebook(payload(), {
      env: ENV,
      resume: { externalId: 'page-1_old', phase: 'published' },
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.externalId).toBe('page-1_444');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as unknown[])[1]).toMatchObject({
      method: 'POST',
    });
  });
});
