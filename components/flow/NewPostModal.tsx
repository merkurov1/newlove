'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

type Item = {
  id: string;
  title: string | null;
  slug: string | null;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  body_md: string | null;
  source_url?: string | null;
  metadata?: Record<string, unknown> | null;
  published_at?: string | null;
};

type NewPostModalProps = {
  onClose: () => void;
  onCreated?: () => void;
};

type SaveState =
  | 'creating'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'publishing'
  | 'error';

const LAST_DRAFT_KEY = 'flow:last-draft-id';

function firstLine(body: string) {
  return (
    body
      .split(/\r?\n/)
      .map((line) =>
        line.replace(/^#{1,6}\s+/, '').trim(),
      )
      .find(Boolean)
      ?.slice(0, 160) || 'Untitled post'
  );
}

function slugify(value: string, id: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return slug || `post-${id.slice(0, 8)}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function NewPostModal({
  onClose,
  onCreated,
}: NewPostModalProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [bodyMd, setBodyMd] = useState('');
  const [lang, setLang] = useState('ru');

  const [saveState, setSaveState] =
    useState<SaveState>('creating');

  const [error, setError] =
    useState<string | null>(null);

  const [linkMode, setLinkMode] =
    useState(false);

  const [linkUrl, setLinkUrl] =
    useState('');

  const [linkPreview, setLinkPreview] =
    useState<Record<string, unknown> | null>(null);

  const [imageName, setImageName] =
    useState<string | null>(null);

  const fileRef =
    useRef<HTMLInputElement | null>(null);

  const saveTimer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const latestRef =
    useRef({
      bodyMd: '',
      lang: 'ru',
    });

  const closingRef =
    useRef(false);

  useEffect(() => {
    latestRef.current = {
      bodyMd,
      lang,
    };
  }, [bodyMd, lang]);

  useEffect(() => {
    let cancelled = false;

    async function initializeDraft() {
      try {
        setError(null);

        const existingDraftId =
          window.localStorage.getItem(
            LAST_DRAFT_KEY,
          );

        if (existingDraftId) {
          setSaveState('loading');

          const response =
            await fetch(
              `/api/admin/items/${existingDraftId}`,
              {
                method: 'GET',
                cache: 'no-store',
              },
            );

          const json =
            await readJson(response);

          if (
            response.ok &&
            json.item &&
            json.item.status === 'draft'
          ) {
            if (cancelled) {
              return;
            }

            const loaded =
              json.item as Item;

            setItem(loaded);

            setBodyMd(
              loaded.body_md ?? '',
            );

            setLang(
              loaded.lang ?? 'ru',
            );

            latestRef.current = {
              bodyMd:
                loaded.body_md ?? '',
              lang:
                loaded.lang ?? 'ru',
            };

            if (
              loaded.type === 'link'
            ) {
              setLinkMode(true);

              setLinkUrl(
                loaded.source_url ?? '',
              );

              setLinkPreview(
                loaded.metadata ??
                  null,
              );
            }

            setSaveState('saved');

            return;
          }

          window.localStorage.removeItem(
            LAST_DRAFT_KEY,
          );
        }

        setSaveState('creating');

        const response =
          await fetch(
            '/api/admin/items/new',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                type: 'note',
                title: '',
                body_md: '',
                lang: 'ru',
              }),
            },
          );

        const json =
          await readJson(response);

        if (
          !response.ok ||
          !json.item
        ) {
          throw new Error(
            json.error ??
              'Failed to create draft.',
          );
        }

        if (cancelled) {
          return;
        }

        const created =
          json.item as Item;

        setItem(created);

        setBodyMd(
          created.body_md ?? '',
        );

        setLang(
          created.lang ?? 'ru',
        );

        latestRef.current = {
          bodyMd:
            created.body_md ?? '',
          lang:
            created.lang ?? 'ru',
        };

        window.localStorage.setItem(
          LAST_DRAFT_KEY,
          created.id,
        );

        setSaveState('saved');
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          '[new-post] initialization failed:',
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to initialize draft.',
        );

        setSaveState('error');
      }
    }

    void initializeDraft();

    return () => {
      cancelled = true;

      if (saveTimer.current) {
        clearTimeout(
          saveTimer.current,
        );

        saveTimer.current = null;
      }
    };
  }, []);

  const saveDraft =
    useCallback(
      async (
        changes: Record<string, unknown>,
      ) => {
        if (!item) {
          return true;
        }

        try {
          setSaveState('saving');
          setError(null);

          const response =
            await fetch(
              `/api/admin/items/${item.id}`,
              {
                method: 'PATCH',
                headers: {
                  'Content-Type':
                    'application/json',
                },
                body: JSON.stringify(
                  changes,
                ),
              },
            );

          const json =
            await readJson(response);

          if (!response.ok) {
            throw new Error(
              json.error ??
                'Failed to save draft.',
            );
          }

          if (json.item) {
            setItem(
              json.item as Item,
            );
          }

          setSaveState('saved');

          return true;
        } catch (err) {
          console.error(
            '[new-post] save failed:',
            err,
          );

          setError(
            err instanceof Error
              ? err.message
              : 'Failed to save draft.',
          );

          setSaveState('error');

          return false;
        }
      },
      [item],
    );

  const scheduleSave =
    useCallback(
      (
        changes: Record<string, unknown>,
      ) => {
        if (!item) {
          return;
        }

        if (saveTimer.current) {
          clearTimeout(
            saveTimer.current,
          );
        }

        saveTimer.current =
          setTimeout(() => {
            saveTimer.current = null;

            void saveDraft(
              changes,
            );
          }, 700);
      },
      [item, saveDraft],
    );

  function handleBodyChange(
    value: string,
  ) {
    setBodyMd(value);

    latestRef.current.bodyMd =
      value;

    scheduleSave({
      body_md: value,
      lang:
        latestRef.current.lang,
    });
  }

  const flushSave =
    useCallback(async () => {
      if (!item) {
        return true;
      }

      if (saveTimer.current) {
        clearTimeout(
          saveTimer.current,
        );

        saveTimer.current = null;
      }

      return saveDraft({
        body_md:
          latestRef.current.bodyMd,
        lang:
          latestRef.current.lang,
      });
    }, [item, saveDraft]);

  async function parseLink() {
    if (
      !item ||
      !linkUrl.trim()
    ) {
      return;
    }

    try {
      setSaveState('saving');
      setError(null);

      const response =
        await fetch(
          '/api/admin/items/parse-link',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              item_id: item.id,
              url: linkUrl.trim(),
              lang,
            }),
          },
        );

      const json =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          json.error ??
            'Failed to parse link.',
        );
      }

      setItem(
        json.item as Item,
      );

      setLinkUrl(
        json.item.source_url ??
          linkUrl.trim(),
      );

      setLinkPreview(
        json.metadata ??
          null,
      );

      setBodyMd(
        json.item.body_md ??
          '',
      );

      latestRef.current.bodyMd =
        json.item.body_md ?? '';

      setSaveState('saved');
    } catch (err) {
      console.error(
        '[new-post] link parsing failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to parse link.',
      );

      setSaveState('error');
    }
  }

  async function uploadImage(
    file: File,
  ) {
    if (!item) {
      return;
    }

    try {
      setSaveState('saving');
      setError(null);

      const form =
        new FormData();

      form.append(
        'file',
        file,
      );

      form.append(
        'item_id',
        item.id,
      );

      form.append(
        'lang',
        lang,
      );

      const response =
        await fetch(
          '/api/admin/items/media',
          {
            method: 'POST',
            body: form,
          },
        );

      const json =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          json.error ??
            'Failed to upload image.',
        );
      }

      setItem(
        json.item as Item,
      );

      setImageName(
        file.name,
      );

      setBodyMd(
        json.item.body_md ??
          '',
      );

      latestRef.current.bodyMd =
        json.item.body_md ?? '';

      setSaveState('saved');
    } catch (err) {
      console.error(
        '[new-post] image upload failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to upload image.',
      );

      setSaveState('error');
    }
  }

  async function handlePublish() {
    if (!item) {
      return;
    }

    const current =
      latestRef.current;

    if (
      item.type === 'link'
    ) {
      if (!item.source_url) {
        setError(
          'Add a link first.',
        );

        return;
      }
    } else if (
      item.type === 'photo'
    ) {
      if (!item.metadata) {
        setError(
          'Add an image first.',
        );

        return;
      }
    } else if (
      !current.bodyMd.trim()
    ) {
      setError(
        'Write something before publishing.',
      );

      return;
    }

    if (saveTimer.current) {
      clearTimeout(
        saveTimer.current,
      );

      saveTimer.current = null;
    }

    try {
      setSaveState('publishing');
      setError(null);

      const metadata =
        item.metadata ?? {};

      const title =
        item.type === 'link'
          ? String(
              linkPreview?.title ||
                item.title ||
                item.source_url ||
                'Link',
            ).slice(0, 160)
          : item.type === 'photo'
            ? String(
                metadata.alt ||
                  item.title ||
                  'Image',
              ).slice(0, 160)
            : firstLine(
                current.bodyMd,
              );

      const slug =
        slugify(
          title,
          item.id,
        );

      const response =
        await fetch(
          `/api/admin/items/${item.id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              title,
              body_md:
                current.bodyMd,
              lang:
                current.lang,
              slug,
              status:
                'published',
              visibility:
                'public',
            }),
          },
        );

      const json =
        await readJson(response);

      if (
        !response.ok ||
        !json.item
      ) {
        throw new Error(
          json.error ??
            `Failed to publish item (${response.status}).`,
        );
      }

      window.localStorage.removeItem(
        LAST_DRAFT_KEY,
      );

      setSaveState('saved');

      onCreated?.();
      onClose();
    } catch (err) {
      console.error(
        '[new-post] publish failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to publish.',
      );

      setSaveState('error');
    }
  }

  async function handleClose() {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;

    if (!item) {
      onClose();
      return;
    }

    const saved =
      await flushSave();

    if (!saved) {
      closingRef.current = false;
      return;
    }

    onClose();
  }

  function statusLabel() {
    switch (saveState) {
      case 'creating':
        return 'Creating draft…';

      case 'loading':
        return 'Opening draft…';

      case 'saving':
        return 'Saving…';

      case 'saved':
        return 'Saved';

      case 'publishing':
        return 'Publishing…';

      case 'error':
        return 'Save failed';

      default:
        return '';
    }
  }

  const busy =
    saveState === 'creating' ||
    saveState === 'loading' ||
    saveState === 'publishing';

  const isImage =
    item?.type === 'photo';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          void handleClose();
        }
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-post-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
              Flow
            </div>

            <h2
              id="new-post-title"
              className="mt-1 text-xl font-semibold"
            >
              New item
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              void handleClose()
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-2xl text-zinc-400 transition hover:bg-zinc-100 hover:text-black"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {linkMode ? (
            <div className="space-y-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                Link
              </div>

              <div className="flex gap-2">
                <input
                  autoFocus
                  value={linkUrl}
                  onChange={(event) =>
                    setLinkUrl(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      'Enter'
                    ) {
                      void parseLink();
                    }
                  }}
                  placeholder="https://…"
                  disabled={
                    !item || busy
                  }
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-black disabled:bg-zinc-50"
                />

                <button
                  type="button"
                  onClick={() =>
                    void parseLink()
                  }
                  disabled={
                    !item ||
                    !linkUrl.trim() ||
                    busy
                  }
                  className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:bg-zinc-300"
                >
                  Parse
                </button>
              </div>

              {linkPreview && (
                <div className="rounded-2xl border border-zinc-200 p-5">
                  <div className="text-xl font-semibold">
                    {String(
                      linkPreview.title ??
                        linkUrl,
                    )}
                  </div>

                  {typeof linkPreview.description ===
                    'string' && (
                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                      {linkPreview.description}
                    </p>
                  )}

                  {typeof linkPreview.image ===
                    'string' && (
                    <img
                      src={linkPreview.image}
                      alt=""
                      className="mt-4 max-h-72 w-full rounded-xl object-cover"
                    />
                  )}

                  <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-400">
                    {String(
                      linkPreview.domain ??
                        '',
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : isImage ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-zinc-200">
              {imageName ? (
                <div className="text-center">
                  <div className="text-lg font-medium">
                    {imageName}
                  </div>

                  <div className="mt-2 text-sm text-zinc-400">
                    Image stored in Flow
                  </div>
                </div>
              ) : (
                <div className="text-zinc-400">
                  Select an image below.
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={bodyMd}
              onChange={(event) =>
                handleBodyChange(
                  event.target.value,
                )
              }
              disabled={
                !item || busy
              }
              placeholder="Write something…"
              autoFocus
              className="min-h-[420px] w-full resize-none border-0 px-0 text-lg leading-8 outline-none placeholder:text-zinc-300"
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {statusLabel()}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file =
                  event.target.files?.[0];

                if (file) {
                  setLinkMode(false);
                  void uploadImage(file);
                }

                event.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => {
                setLinkMode(false);
                setError(null);
                fileRef.current?.click();
              }}
              disabled={
                !item || busy
              }
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm transition hover:border-black disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              + Image
            </button>

            <button
              type="button"
              onClick={() => {
                setLinkMode(true);
                setError(null);
              }}
              disabled={
                !item || busy
              }
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm transition hover:border-black disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              + Link
            </button>

            <button
              type="button"
              disabled
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-400"
            >
              {lang.toUpperCase()}
            </button>

            <button
              type="button"
              disabled
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-400"
            >
              Analyse
            </button>

            <button
              type="button"
              onClick={() =>
                void handlePublish()
              }
              disabled={
                !item ||
                busy ||
                saveState === 'saving' ||
                (item.type === 'link' &&
                  !item.source_url) ||
                (item.type === 'photo' &&
                  !item.metadata) ||
                (item.type !== 'link' &&
                  item.type !== 'photo' &&
                  !bodyMd.trim())
              }
              className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {saveState ===
              'publishing'
                ? 'Posting…'
                : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}