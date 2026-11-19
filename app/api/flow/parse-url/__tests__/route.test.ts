/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => undefined),
}));

jest.mock('@/lib/flow/parseUrl', () => ({
  parseUrl: jest.fn(),
}));

const { GET, POST } = require('../route') as {
  GET: (req: Request) => Promise<Response>;
  POST: (req: Request) => Promise<Response>;
};
const { parseUrl } = require('@/lib/flow/parseUrl') as {
  parseUrl: jest.Mock;
};

const englishUrl =
  'https://www.theartnewspaper.com/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling';
const russianUrl = 'https://www.theartnewspaper.ru/posts/20230112-vrlc/';

describe('/api/flow/parse-url', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the full encoded URL, including query parameters, to the parser', async () => {
    parseUrl.mockResolvedValue({
      url: englishUrl,
      domain: 'theartnewspaper.com',
      site_name: 'The Art Newspaper',
      title: 'Pussy Riot article',
      isYouTube: false,
    });

    const response = await GET(
      new Request(
        `http://localhost/api/flow/parse-url?url=${encodeURIComponent(
          `${englishUrl}?utm_source=telegram`
        )}`
      ) as any
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(parseUrl).toHaveBeenCalledWith(`${englishUrl}?utm_source=telegram`);
    expect(json.site_name).toBe('The Art Newspaper');
    expect(json.domain).toBe('theartnewspaper.com');
  });

  it('returns the canonical preview for a POSTed Russian edition URL', async () => {
    parseUrl.mockResolvedValue({
      url: russianUrl,
      domain: 'theartnewspaper.ru',
      site_name: 'The Art Newspaper Russia',
      title: 'Барельефы Сергея Меркурова остались на «Динамо»',
      isYouTube: false,
    });

    const response = await POST(
      new Request('http://localhost/api/flow/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ` ${russianUrl}?utm_source=telegram ` }),
      }) as any
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(parseUrl).toHaveBeenCalledWith(`${russianUrl}?utm_source=telegram`);
    expect(json.url).toBe(russianUrl);
    expect(json.site_name).toBe('The Art Newspaper Russia');
  });

  it('rejects a request without a URL', async () => {
    const response = await GET(
      new Request('http://localhost/api/flow/parse-url') as any
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain('url');
    expect(parseUrl).not.toHaveBeenCalled();
  });
});
