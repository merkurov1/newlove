import { parseUrl } from '../parseUrl';

function htmlResponse(input: {
  url: string;
  html: string;
  status?: number;
  headers?: Record<string, string>;
}): Response {
  const status = input.status ?? 200;
  const headers = new Map(
    Object.entries(input.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ])
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    url: input.url,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
    text: async () => input.html,
  } as unknown as Response;
}

function artNewspaperHtml(input: {
  canonical?: string;
  siteName: string;
  title: string;
  description: string;
  image?: string;
}): string {
  return `
    <html>
      <head>
        ${input.canonical ? `<link rel="canonical" href="${input.canonical}" />` : ''}
        <meta property="og:site_name" content="${input.siteName}" />
        <meta property="og:title" content="${input.title}" />
        <meta property="og:description" content="${input.description}" />
        ${
          input.image
            ? `<meta property="og:image" content="${input.image}" />`
            : ''
        }
      </head>
      <body><article><h1>${input.title}</h1></article></body>
    </html>
  `;
}

describe('parseUrl publication recognition', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const englishPath =
    '/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling';
  const russianPath = '/posts/20230112-vrlc/';

  it.each([
    `https://theartnewspaper.com${englishPath}`,
    `https://www.theartnewspaper.com${englishPath}`,
  ])('recognises the English edition for %s', async (inputUrl) => {
    const canonical = `https://www.theartnewspaper.com${englishPath}`;
    global.fetch = jest.fn().mockResolvedValue(
      htmlResponse({
        url: canonical,
        html: artNewspaperHtml({
          canonical,
          siteName:
            'The Art Newspaper - International art news and events',
          title:
            "Pussy Riot's weekly NFT drop is just one instance of Russian and Ukrainian artists embracing new modes of online selling",
          description:
            'Other creators have been selling works on Clubhouse and dedicated Facebook groups',
          image:
            'https://cdn.sanity.io/images/cxgd3urn/production/article-1200x720.jpg',
        }),
      })
    ) as typeof fetch;

    const result = await parseUrl(inputUrl);

    expect(result.domain).toBe('theartnewspaper.com');
    expect(result.site_name).toBe('The Art Newspaper');
    expect(result.title).toContain('Pussy Riot');
    expect(result.url).toBe(canonical);
    expect(result.favicon).toContain('theartnewspaper.com');
  });

  it.each([
    `https://theartnewspaper.ru${russianPath}`,
    `https://www.theartnewspaper.ru${russianPath}`,
  ])('recognises the Russian edition for %s', async (inputUrl) => {
    const canonical = `https://www.theartnewspaper.ru${russianPath}`;
    global.fetch = jest.fn().mockResolvedValue(
      htmlResponse({
        url: inputUrl,
        html: artNewspaperHtml({
          canonical,
          siteName: 'The Art Newspaper Russia',
          title: 'Барельефы Сергея Меркурова остались на «Динамо»',
          description:
            'Монументальные панно с исторического здания 1930-х годов сделали центром публичного арт-пространства',
          image:
            'https://www.theartnewspaper.ru/media/original_images/1_6oREKMn.jpg',
        }),
      })
    ) as typeof fetch;

    const result = await parseUrl(inputUrl);

    expect(result.domain).toBe('theartnewspaper.ru');
    expect(result.site_name).toBe('The Art Newspaper Russia');
    expect(result.title).toContain('Барельефы Сергея Меркурова');
    expect(result.url).toBe(canonical);
    expect(result.favicon).toContain('theartnewspaper.ru');
  });

  it('follows a redirect and uses the canonical URL as the preview identity', async () => {
    const redirectTarget = `https://www.theartnewspaper.ru${russianPath}`;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        htmlResponse({
          url: `https://theartnewspaper.ru${russianPath}`,
          status: 302,
          headers: { location: redirectTarget },
        })
      )
      .mockResolvedValueOnce(
        htmlResponse({
          url: redirectTarget,
          html: artNewspaperHtml({
            canonical: redirectTarget,
            siteName: 'The Art Newspaper Russia',
            title: 'Барельефы Сергея Меркурова остались на «Динамо»',
            description: 'Описание',
          }),
        })
      );
    global.fetch = fetchMock as typeof fetch;

    const result = await parseUrl(
      `https://theartnewspaper.ru${russianPath}?utm_source=telegram`
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('?utm_source=telegram');
    expect(fetchMock.mock.calls[1][0]).toBe(redirectTarget);
    expect(result.url).toBe(redirectTarget);
    expect(result.domain).toBe('theartnewspaper.ru');
    expect(result.site_name).toBe('The Art Newspaper Russia');
  });

  it('drops tracking parameters when the page declares a canonical URL', async () => {
    const canonical = `https://www.theartnewspaper.com${englishPath}`;
    global.fetch = jest.fn().mockResolvedValue(
      htmlResponse({
        url: `${canonical}?utm_source=telegram&utm_medium=social`,
        html: artNewspaperHtml({
          canonical,
          siteName: 'The Art Newspaper',
          title: 'Article',
          description: 'Description',
        }),
      })
    ) as typeof fetch;

    const result = await parseUrl(
      `${canonical}?utm_source=telegram&utm_medium=social`
    );

    expect(result.url).toBe(canonical);
  });

  it('keeps unknown publishers on their own Open Graph name and domain', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      htmlResponse({
        url: 'https://example.com/article',
        html: `
          <html><head>
            <link rel="canonical" href="https://example.com/article" />
            <meta property="og:site_name" content="ExampleSite" />
            <meta property="og:title" content="Example article" />
          </head></html>
        `,
      })
    ) as typeof fetch;

    const result = await parseUrl('https://www.example.com/article?ref=home');

    expect(result.url).toBe('https://example.com/article');
    expect(result.domain).toBe('example.com');
    expect(result.site_name).toBe('ExampleSite');
    expect(result.title).toBe('Example article');
  });

  it('does not turn a lookalike host into a known publication', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('blocked')) as typeof fetch;

    const result = await parseUrl(
      'https://theartnewspaper.com.example.net/article'
    );

    expect(result.domain).toBe('theartnewspaper.com.example.net');
    expect(result.site_name).toBe('theartnewspaper.com.example.net');
    expect(result.title).toBe('theartnewspaper.com.example.net');
  });

  it('keeps the known publication label when the source blocks fetching', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(htmlResponse({ url: '', status: 403, html: '' })) as typeof fetch;

    const result = await parseUrl(`https://www.theartnewspaper.com${englishPath}`);

    expect(result.domain).toBe('theartnewspaper.com');
    expect(result.site_name).toBe('The Art Newspaper');
    expect(result.title).toBe('The Art Newspaper');
  });

  it('keeps the plain-domain fallback for unknown blocked sources', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(htmlResponse({ url: '', status: 403, html: '' })) as typeof fetch;

    const result = await parseUrl('https://unknown.example.org/story');

    expect(result.domain).toBe('unknown.example.org');
    expect(result.site_name).toBe('unknown.example.org');
    expect(result.title).toBe('unknown.example.org');
  });
});
