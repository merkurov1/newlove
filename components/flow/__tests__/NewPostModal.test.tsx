import { act, render, renderHook, screen, waitFor } from '@testing-library/react';

import { LinkPreviewCard } from '../new-post/Previews';
import { useNewPostModal } from '../new-post/useNewPostModal';

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
  });
});
