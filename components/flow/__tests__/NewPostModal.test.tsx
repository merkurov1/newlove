import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

import { LinkPreviewCard } from '../new-post/Previews';
import { useNewPostModal } from '../new-post/useNewPostModal';
import {
  extractUrlsFromText,
  normalizeExtractedUrl,
  trimUrlPunctuation,
  urlDedupeKey,
} from '../new-post/utils';

const englishUrl =
  'https://www.theartnewspaper.com/2021/03/19/pussy-riots-weekly-nft-drop-is-just-one-instance-of-russian-and-ukrainian-artists-embracing-new-modes-of-online-selling';
const russianUrl = 'https://www.theartnewspaper.ru/posts/20230112-vrlc/';

function apiResponse(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe('Flow composer URL handling', () => {
  it('removes only the URL and preserves adjacent punctuation in pasted prose', () => {
    const result = extractUrlsFromText(
      'Read https://example.com/article, then (https://example.com/other).'
    );

    expect(result.urls).toEqual([
      'https://example.com/article',
      'https://example.com/other',
    ]);
    expect(result.textWithoutUrls).toBe('Read , then ().');
  });

  it('leaves email addresses untouched', () => {
    const text = 'Write to user@example.com.';
    const result = extractUrlsFromText(text);

    expect(result.urls).toEqual([]);
    expect(result.textWithoutUrls).toBe(text);
  });

  it('keeps balanced parentheses that belong to the destination', () => {
    expect(
      normalizeExtractedUrl(
        'https://en.wikipedia.org/wiki/Function_(mathematics).'
      )
    ).toBe('https://en.wikipedia.org/wiki/Function_(mathematics)');
    expect(trimUrlPunctuation('https://example.com/path).')).toBe(
      'https://example.com/path'
    );
  });

  it('deduplicates destinations that differ only by a trailing slash or www', () => {
    expect(urlDedupeKey('https://example.com/')).toBe(
      urlDedupeKey('https://example.com')
    );
    expect(urlDedupeKey('https://www.example.com/article')).toBe(
      urlDedupeKey('https://example.com/article')
    );
  });

  it('normalizes bare hosts with ports without treating them as schemes', () => {
    expect(normalizeExtractedUrl('example.com:8080/path')).toBe(
      'https://example.com:8080/path'
    );
  });

  it('rejects unsafe link schemes', () => {
    expect(normalizeExtractedUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExtractedUrl('data:text/html,hello')).toBeNull();
    expect(normalizeExtractedUrl('mailto:hello@example.com')).toBeNull();
  });

  it('never renders an unsafe destination as a clickable link', () => {
    render(
      <LinkPreviewCard
        url="javascript:alert(1)"
        preview={{ url: 'javascript:alert(1)', title: 'Unsafe link' }}
      />
    );

    expect(screen.getByText('Open link').closest('a')).not.toHaveAttribute(
      'href'
    );
  });
});

describe('Flow link preview', () => {
  it('shows the recognised publication instead of only the hostname', () => {
    render(
      <LinkPreviewCard
        url={englishUrl}
        preview={{
          url: englishUrl,
          title: 'Pussy Riot article',
          site_name: 'The Art Newspaper',
          domain: 'theartnewspaper.com',
        }}
      />
    );

    expect(screen.getByText('The Art Newspaper')).toBeInTheDocument();
  });

  it('falls back to the domain for previews without a site name', () => {
    render(
      <LinkPreviewCard
        url="https://example.com/article"
        preview={{
          url: 'https://example.com/article',
          title: 'Example article',
          domain: 'example.com',
        }}
      />
    );

    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  describe('useNewPostModal link parsing', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it.each([
      {
        label: 'English edition',
        input: `https://theartnewspaper.com${new URL(englishUrl).pathname}`,
        response: {
          url: englishUrl,
          domain: 'theartnewspaper.com',
          site_name: 'The Art Newspaper',
          title: 'Pussy Riot article',
          description: 'Description',
        },
      },
      {
        label: 'Russian edition',
        input: `https://theartnewspaper.ru${new URL(russianUrl).pathname}?utm_source=telegram`,
        response: {
          url: russianUrl,
          domain: 'theartnewspaper.ru',
          site_name: 'The Art Newspaper Russia',
          title: 'Барельефы Сергея Меркурова остались на «Динамо»',
          description: 'Описание',
        },
      },
    ])('keeps the parsed source for the $label', async ({ input, response }) => {
      const fetchMock = jest.fn().mockResolvedValue(apiResponse(response));
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn() })
      );

      await act(async () => {
        await result.current.parseLink(input);
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/flow/parse-url?url=${encodeURIComponent(
          new URL(input).toString()
        )}`
      );
      expect(result.current.links[0].url).toBe(response.url);
      expect(result.current.links[0].preview.site_name).toBe(
        response.site_name
      );
      expect(result.current.links[0].preview.domain).toBe(response.domain);
    });

    it('deduplicates the same article with and without tracking parameters', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        apiResponse({
          url: englishUrl,
          domain: 'theartnewspaper.com',
          site_name: 'The Art Newspaper',
          title: 'Pussy Riot article',
        })
      );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn() })
      );

      await act(async () => {
        await result.current.parseLink(englishUrl);
        await result.current.parseLink(`${englishUrl}?utm_source=telegram`);
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(result.current.links[0].url).toBe(englishUrl);
    });

    it('falls back to the author URL when a preview returns an unsafe destination', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        apiResponse({
          url: 'javascript:alert(1)',
          title: 'Unsafe preview',
        })
      );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn() })
      );

      await act(async () => {
        await result.current.parseLink('https://example.com/article');
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(result.current.links[0].url).toBe('https://example.com/article');
      expect(result.current.links[0].preview.url).toBe(
        'https://example.com/article'
      );
    });

    it('keeps pasted punctuation in the composer and attaches the URL once', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        apiResponse({
          url: 'https://example.com/article',
          domain: 'example.com',
          title: 'Example article',
        })
      );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn() })
      );
      const textarea = document.createElement('textarea');
      textarea.value = '';
      result.current.textareaRef.current = textarea;

      const preventDefault = jest.fn();
      const event = {
        clipboardData: {
          items: [],
          getData: () => 'Read https://example.com/article,',
        },
        preventDefault,
      } as unknown as Parameters<typeof result.current.handlePaste>[0];

      await act(async () => {
        await result.current.handlePaste(event);
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(preventDefault).toHaveBeenCalled();
      expect(result.current.bodyMd).toBe('Read ,');
      expect(result.current.links[0].url).toBe('https://example.com/article');
    });

    it.each([
      { label: 'English edition', lang: 'en' as const, image: 'https://cdn.example.com/en-photo.jpg' },
      { label: 'Russian edition', lang: 'ru' as const, image: 'https://cdn.example.com/ru-photo.jpg' },
    ])('sends the $label language for a photo post', async ({ lang, image }) => {
      let savedPayload: Record<string, any> | null = null;
      const fetchMock = jest.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);

          if (url === '/api/flow/items' && init?.method === 'POST') {
            savedPayload = JSON.parse(String(init.body));

            return apiResponse({ success: true, item: { id: 'photo-item' } });
          }

          return apiResponse({});
        }
      );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn(), lang })
      );

      await act(async () => {
        await result.current.parseLink(image);
      });

      await waitFor(() => {
        expect(result.current.canPost).toBe(true);
      });

      await act(async () => {
        await result.current.finish();
      });

      await waitFor(() => {
        expect(savedPayload).not.toBeNull();
      });

      expect(savedPayload?.type).toBe('photo');
      expect(savedPayload?.lang).toBe(lang);
      expect(savedPayload?.metadata.images).toEqual([image]);
    });

    it('does not send a language when editing an existing item', async () => {
      let savedPayload: Record<string, any> | null = null;
      const fetchMock = jest.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);

          if (url === '/api/flow/items/item-1' && init?.method === 'PATCH') {
            savedPayload = JSON.parse(String(init.body));

            return apiResponse({ success: true, item: { id: 'item-1' } });
          }

          return apiResponse({
            item: {
              id: 'item-1',
              title: 'Existing photo',
              body_md: '',
              lang: 'en',
              type: 'photo',
              metadata: { images: ['https://cdn.example.com/existing.jpg'] },
            },
          });
        }
      );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({
          open: true,
          onClose: jest.fn(),
          itemId: 'item-1',
          lang: 'ru',
        })
      );

      await waitFor(() => {
        expect(result.current.item?.id).toBe('item-1');
      });

      await act(async () => {
        await result.current.finish();
      });

      await waitFor(() => {
        expect(savedPayload).not.toBeNull();
      });

      // Editing must never rewrite the stored language to the composer
      // context, so the PATCH simply omits `lang`.
      expect(savedPayload).not.toHaveProperty('lang');
    });

    it('restores and re-serializes legacy metadata.links without duplication', async () => {
      let savedPayload: Record<string, any> | null = null;
      const fetchMock = jest.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);

          if (url === '/api/flow/items/item-1' && init?.method === 'PATCH') {
            savedPayload = JSON.parse(String(init.body));

            return apiResponse({ success: true, item: { id: 'item-1' } });
          }

          return apiResponse({
            item: {
              id: 'item-1',
              title: 'Legacy link',
              body_md: 'Body',
              source_url: 'https://example.com/legacy',
              metadata: {
                links: ['https://example.com/legacy'],
              },
            },
          });
        }
      );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({
          open: true,
          onClose: jest.fn(),
          itemId: 'item-1',
        })
      );

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(result.current.links[0].url).toBe('https://example.com/legacy');

      await act(async () => {
        await result.current.finish();
      });

      await waitFor(() => {
        expect(savedPayload).not.toBeNull();
      });

      expect(savedPayload?.source_url).toBe('https://example.com/legacy');
      expect(savedPayload?.metadata.link_previews).toHaveLength(1);
      expect(savedPayload?.metadata.links).toBeUndefined();
    });
  });
});
