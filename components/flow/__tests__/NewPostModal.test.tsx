import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import NewPostModal from '../NewPostModal';
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

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
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

  it('keeps a visible keyboard focus state on the preview destination', () => {
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

    expect(screen.getByText('example.com').className).toContain(
      'focus-visible:underline'
    );
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

    it('ignores a superseded link parse for the same destination', async () => {
      const stale = deferredResponse();
      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() => stale.promise)
        .mockResolvedValueOnce(
          apiResponse({
            url: 'https://example.com/article',
            domain: 'example.com',
            title: 'Fresh preview',
          })
        );
      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() => useNewPostModal({ open: true, onClose: jest.fn() }));

      let firstCall!: Promise<void>;

      act(() => {
        firstCall = result.current.parseLink('https://example.com/article');
      });

      await act(async () => {
        await result.current.parseLink('https://example.com/article');
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(result.current.links[0].preview.title).toBe('Fresh preview');

      stale.resolve(
        apiResponse({
          url: 'https://example.com/article',
          title: 'Stale preview',
        })
      );

      await act(async () => {
        await firstCall;
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].preview.title).toBe('Fresh preview');
    });

    it('does not restore a link whose parse finishes after removal', async () => {
      const fetchMock = jest.fn().mockResolvedValueOnce(
        apiResponse({
          url: 'https://example.com/article',
          domain: 'example.com',
          title: 'Original preview',
        })
      );

      global.fetch = fetchMock as typeof fetch;

      const { result } = renderHook(() => useNewPostModal({ open: true, onClose: jest.fn() }));

      await act(async () => {
        await result.current.parseLink('https://example.com/article');
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      const pending = deferredResponse();

      fetchMock.mockImplementationOnce(() => pending.promise);

      let repeatedParse!: Promise<void>;

      act(() => {
        repeatedParse = result.current.parseLink('https://example.com/article');
      });

      act(() => {
        result.current.removeLink(result.current.links[0].id);
      });

      pending.resolve(
        apiResponse({
          url: 'https://example.com/article',
          title: 'Should not return',
        })
      );

      await act(async () => {
        await repeatedParse;
      });

      expect(result.current.links).toHaveLength(0);
    });

    it('keeps the most recently requested YouTube video', async () => {
      const firstVideo = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
      const secondVideo = 'https://www.youtube.com/watch?v=bbbbbbbbbbb';
      const stale = deferredResponse();

      global.fetch = jest
        .fn()
        .mockImplementationOnce(() => stale.promise)
        .mockResolvedValueOnce(
          apiResponse({
            url: secondVideo,
            youtube: { video_id: 'bbbbbbbbbbb', title: 'Second' },
          })
        ) as typeof fetch;

      const { result } = renderHook(() => useNewPostModal({ open: true, onClose: jest.fn() }));

      let firstCall!: Promise<void>;

      act(() => {
        firstCall = result.current.parseYouTube(firstVideo);
      });

      await act(async () => {
        await result.current.parseYouTube(secondVideo);
      });

      await waitFor(() => {
        expect(result.current.youtubeMetadata?.video_id).toBe('bbbbbbbbbbb');
      });

      stale.resolve(
        apiResponse({
          url: firstVideo,
          youtube: { video_id: 'aaaaaaaaaaa', title: 'First' },
        })
      );

      await act(async () => {
        await firstCall;
      });

      expect(result.current.youtubeMetadata?.video_id).toBe('bbbbbbbbbbb');
      expect(result.current.youtubeUrl).toBe(secondVideo);
    });

    it('keeps Escape from closing the composer while a parse is busy', async () => {
      const pending = deferredResponse();

      global.fetch = jest
        .fn()
        .mockImplementationOnce(() => pending.promise) as typeof fetch;

      const onClose = jest.fn();
      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose })
      );

      let parseCall!: Promise<void>;

      act(() => {
        parseCall = result.current.parseLink('https://example.com/slow');
      });

      await waitFor(() => {
        expect(result.current.busy).toBe(true);
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();

      pending.resolve(
        apiResponse({
          url: 'https://example.com/slow',
          title: 'Late preview',
        })
      );

      await act(async () => {
        await parseCall;
      });

      await waitFor(() => {
        expect(result.current.busy).toBe(false);
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('drops a link parse that finishes after the composer closed', async () => {
      const pending = deferredResponse();

      global.fetch = jest.fn().mockImplementationOnce(() => pending.promise) as typeof fetch;

      const onClose = jest.fn();
      const { result, rerender } = renderHook(
        (props: { open: boolean }) => useNewPostModal({ open: props.open, onClose }),
        { initialProps: { open: true } }
      );

      let parseCall!: Promise<void>;

      act(() => {
        parseCall = result.current.parseLink('https://example.com/slow');
      });

      await act(async () => {
        rerender({ open: false });
      });

      pending.resolve(
        apiResponse({
          url: 'https://example.com/slow',
          title: 'Late preview',
        })
      );

      await act(async () => {
        await parseCall;
      });

      expect(result.current.links).toHaveLength(0);
      expect(result.current.isParsingLink).toBe(false);
    });

    it('keeps successful images when another upload fails', async () => {
      const successful = new File(['ok'], 'one.png', {
        type: 'image/png',
      });
      const failed = new File(['nope'], 'two.png', {
        type: 'image/png',
      });

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          apiResponse({
            success: true,
            file: { url: 'https://cdn.example.com/one.png' },
          })
        )
        .mockResolvedValueOnce(
          apiResponse({ success: false, error: 'two.png is too large' })
        ) as typeof fetch;

      const { result } = renderHook(() => useNewPostModal({ open: true, onClose: jest.fn() }));

      const input = document.createElement('input');

      Object.defineProperty(input, 'files', {
        value: [successful, failed],
        configurable: true,
      });

      await act(async () => {
        await result.current.handleImageUpload({
          target: input,
        } as unknown as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.images).toHaveLength(1);
      expect(result.current.images[0].url).toBe('https://cdn.example.com/one.png');
      expect(result.current.error).toBe('1 image(s) uploaded. two.png is too large');
      expect(result.current.isUploadingImage).toBe(false);
    });

    it('clears every composer field through the existing Clear action', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        apiResponse({
          url: 'https://example.com/article',
          domain: 'example.com',
          title: 'Example article',
        })
      ) as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn() })
      );

      act(() => {
        result.current.setTitle('Draft title');
        result.current.setBodyMd('Draft body');
      });

      await act(async () => {
        await result.current.parseLink('https://example.com/article');
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      expect(result.current.canClear).toBe(true);

      await act(async () => {
        await result.current.clearDraft();
      });

      expect(result.current.title).toBe('');
      expect(result.current.bodyMd).toBe('');
      expect(result.current.links).toHaveLength(0);
      expect(result.current.youtubeMetadata).toBeNull();
      expect(result.current.images).toHaveLength(0);
      expect(result.current.error).toBeNull();
      expect(result.current.canClear).toBe(false);
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

    it('does not send a link preview title as the title of a new article', async () => {
      let savedPayload: Record<string, any> | null = null;
      const body = `Журнал. История вопроса.\n\n${'Авторский текст о проекте. '.repeat(20)}`;

      global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === '/api/flow/items' && init?.method === 'POST') {
          savedPayload = JSON.parse(String(init.body));
          return apiResponse({ success: true, item: { id: 'new-article' } });
        }

        if (url.startsWith('/api/flow/parse-url')) {
          return apiResponse({
            url: 'https://t.me/PierrotAi_bot',
            domain: 't.me',
            site_name: 'Telegram',
            title: 'Pierrot',
            description: 'Open Graph description',
          });
        }

        return apiResponse({});
      }) as typeof fetch;

      const { result } = renderHook(() =>
        useNewPostModal({ open: true, onClose: jest.fn() })
      );

      await act(async () => {
        await result.current.parseLink('https://t.me/PierrotAi_bot');
      });

      await waitFor(() => {
        expect(result.current.links).toHaveLength(1);
      });

      act(() => {
        result.current.setBodyMd(body);
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

      expect(savedPayload?.type).toBe('article');
      expect(savedPayload?.title).toBeNull();
      expect(savedPayload?.body_md).toBe(body);
      expect(savedPayload?.source_url).toBe('https://t.me/PierrotAi_bot');
      expect(savedPayload?.metadata.link_previews[0]).toMatchObject({
        url: 'https://t.me/PierrotAi_bot',
        title: 'Pierrot',
      });
    });
  });
});

describe('Flow composer dialog accessibility', () => {
  it('keeps a visible keyboard focus state on attachment removal', async () => {
    const originalFetch = global.fetch;

    global.fetch = jest.fn().mockResolvedValue(
      apiResponse({
        item: {
          id: 'item-1',
          title: 'Existing photo',
          body_md: '',
          metadata: { images: ['https://cdn.example.com/existing.jpg'] },
        },
      })
    ) as typeof fetch;

    try {
      render(<NewPostModal open itemId="item-1" onClose={jest.fn()} />);

      const removeButton = await screen.findByRole('button', {
        name: 'Remove image',
      });

      expect(removeButton.className).toContain('focus-visible:opacity-100');
      expect(removeButton.className).toContain('focus-visible:ring-2');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('exposes a modal dialog, traps Tab inside it and restores focus', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open composer';
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = jest.fn();
    const { rerender } = render(<NewPostModal open onClose={onClose} />);

    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'New Flow post');
    expect(dialog.style.getPropertyValue('--pi-composer-height')).toBe(
      `${window.innerHeight}px`
    );
    expect(dialog.style.getPropertyValue('--pi-composer-offset')).toBe('0px');

    await waitFor(() => {
      expect(screen.getByLabelText('Post text')).toHaveFocus();
    });

    const closeButton = screen.getByRole('button', {
      name: 'Close composer',
    });
    const attachButton = screen.getByRole('button', {
      name: 'Attach images',
    });

    await waitFor(() => {
      expect(attachButton).toBeEnabled();
    });

    attachButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, {
      key: 'Tab',
      shiftKey: true,
    });

    expect(attachButton).toHaveFocus();

    rerender(<NewPostModal open={false} onClose={onClose} />);

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });

    trigger.remove();
  });

  it('closes on Escape when the composer is idle', async () => {
    const onClose = jest.fn();

    render(<NewPostModal open onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Post text')).toHaveFocus();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores the non-pixel --tg-viewport-height CSS default instead of collapsing to 100px', () => {
    document.documentElement.style.setProperty('--tg-viewport-height', '100dvh');

    try {
      render(<NewPostModal open onClose={jest.fn()} />);

      const dialog = screen.getByRole('dialog');

      expect(dialog.style.getPropertyValue('--pi-composer-height')).toBe(
        `${window.innerHeight}px`
      );
      expect(dialog.style.getPropertyValue('--pi-composer-height')).not.toBe('100px');
    } finally {
      document.documentElement.style.removeProperty('--tg-viewport-height');
    }
  });

  it('follows a real Telegram pixel viewport height', () => {
    const telegramHeight = Math.max(1, Math.floor(window.innerHeight / 2));

    document.documentElement.style.setProperty(
      '--tg-viewport-height',
      `${telegramHeight}px`
    );

    try {
      render(<NewPostModal open onClose={jest.fn()} />);

      expect(
        screen.getByRole('dialog').style.getPropertyValue('--pi-composer-height')
      ).toBe(`${telegramHeight}px`);
    } finally {
      document.documentElement.style.removeProperty('--tg-viewport-height');
    }
  });

  it('tracks visual viewport resizes and keyboard pans', () => {
    const listeners = new Map<string, Set<() => void>>();
    const viewport = {
      height: 600,
      offsetTop: 0,
      addEventListener: (type: string, listener: () => void) => {
        const bucket = listeners.get(type) ?? new Set<() => void>();

        bucket.add(listener);
        listeners.set(type, bucket);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    };

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });

    try {
      render(<NewPostModal open onClose={jest.fn()} />);

      const dialog = screen.getByRole('dialog');

      expect(dialog.style.getPropertyValue('--pi-composer-height')).toBe('600px');
      expect(dialog.style.getPropertyValue('--pi-composer-offset')).toBe('0px');

      viewport.height = 420;
      viewport.offsetTop = 48;

      act(() => {
        listeners.get('resize')?.forEach((listener) => listener());
        listeners.get('scroll')?.forEach((listener) => listener());
      });

      expect(dialog.style.getPropertyValue('--pi-composer-height')).toBe('420px');
      expect(dialog.style.getPropertyValue('--pi-composer-offset')).toBe('48px');
    } finally {
      delete (window as { visualViewport?: unknown }).visualViewport;
    }
  });
});
