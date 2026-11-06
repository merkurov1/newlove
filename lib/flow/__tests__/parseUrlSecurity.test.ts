import { describe, expect, it, jest } from '@jest/globals';

import { parseUrl } from '../parseUrl';

describe('parseUrl redirect safety', () => {
  it('does not follow a redirect into a private address', async () => {
    const previousFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: {
        get: (name: string) => (name === 'location' ? 'http://127.0.0.1/admin' : null),
      },
    } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;

    const preview = await parseUrl('https://example.com/article');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url === 'https://example.com/article')).toBe(true);
    expect(preview.url).toBe('https://example.com/article');
    global.fetch = previousFetch;
  });
});
