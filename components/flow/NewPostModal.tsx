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

type FlowMode =
  | 'direct'
  | 'ai'
  | 'later';

const LAST_DRAFT_KEY = 'flow:last-draft-id';

function firstLine(body: string) {
  return (
    body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, '')
          .trim(),
      )
      .find(Boolean)
      ?.slice(0, 160) || 'Flow post'
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

function withFlowMetadata(
  metadata: Record<string, unknown> | null | undefined,
  mode: FlowMode,
) {
  return {
    ...(metadata ?? {}),
    flow: {
      mode,
      queued_at: new Date().toISOString(),
    },
  };
}

export default function NewPostModal({
  onClose,
  onCreated,
}: NewPostModalProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [bodyMd, setBodyMd] = useState('');

  const [saveState, setSaveState] =
    useState<SaveState>('creating');

  const [error, setError] =
    useState<string | null>(null);

  const [linkMode, setLinkMode] =
    useState(false);

  const [linkUrl, setLinkUrl] =
    useState('');

  const [linkPreview, setLinkPreview] =
    useState<Record<string, unknown> | null>(
      null,
    );

  const [imageName, setImageName] =
    useState<string | null>(null);

  const [imagePreview, setImagePreview] =
    useState<string | null>(null);

  const fileRef =
    useRef<HTMLInputElement | null>(null);

  const saveTimer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const savePromiseRef =
    useRef<Promise<boolean> | null>(null);

  const latestRef =
    useRef({
      bodyMd: '',
    });

  const closingRef =
    useRef(false);

  useEffect(() => {
    latestRef.current = {
      bodyMd,
    };
  }, [bodyMd]);

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

          const response = await fetch(
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

            latestRef.current = {
              bodyMd:
                loaded.body_md ?? '',
            };

            if (loaded.type === 'link') {
              setLinkMode(true);
              setLinkUrl(
                loaded.source_url ?? '',
              );
              setLinkPreview(
                loaded.metadata ?? null,
              );
            }

            if (loaded.type === 'photo') {
              const publicUrl =
                loaded.metadata &&
                typeof loaded.metadata
                  .public_url === 'string'
                  ? loaded.metadata.public_url
                  : null;

              setImagePreview(publicUrl);

              setImageName(
                loaded.metadata &&
                typeof loaded.metadata
                  .filename === 'string'
                  ? loaded.metadata.filename
                  : null,
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

        const response = await fetch(
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
              metadata: {
                flow: {
                  mode: 'direct',
                },
              },
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
              'Failed to create Flow item.',
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

        latestRef.current = {
          bodyMd:
            created.body_md ?? '',
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
          '[flow] initialization failed:',
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to initialize Flow.',
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
      }

      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview,
        );
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

          const response = await fetch(
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
                'Failed to save Flow item.',
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
            '[flow] save failed:',
            err,
          );

          setError(
            err instanceof Error
              ? err.message
              : 'Failed to save.',
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

            const promise =
              saveDraft(changes);

            savePromiseRef.current =
              promise;

            void promise.finally(() => {
              if (
                savePromiseRef.current ===
                promise
              ) {
                savePromiseRef.current =
                  null;
              }
            });
          }, 700);
      },
      [item, saveDraft],
    );

  function handleBodyChange(
    value: string,
  ) {
    setBodyMd(value);
    latestRef.current.bodyMd = value;

    scheduleSave({
      body_md: value,
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

      if (savePromiseRef.current) {
        await savePromiseRef.current;
      }

      return saveDraft({
        body_md:
          latestRef.current.bodyMd,
      });
    }, [item, saveDraft]);

  async function parseLink() {
    if (!item || !linkUrl.trim()) {
      return;
    }

    try {
      setSaveState('saving');
      setError(null);

      const response = await fetch(
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

      const parsedItem =
        json.item as Item;

      setItem(parsedItem);

      setLinkUrl(
        parsedItem.source_url ??
          linkUrl.trim(),
      );

      setLinkPreview(
        json.metadata ??
          parsedItem.metadata ??
          null,
      );

      setBodyMd(
        parsedItem.body_md ?? '',
      );

      latestRef.current.bodyMd =
        parsedItem.body_md ?? '';

      setSaveState('saved');
    } catch (err) {
      console.error(
        '[flow] link parsing failed:',
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

      if (imagePreview) {
        URL.revokeObjectURL(
          imagePreview,
        );
      }

      const localPreview =
        URL.createObjectURL(file);

      setImagePreview(localPreview);
      setImageName(file.name);

      const form = new FormData();

      form.append('file', file);
      form.append(
        'item_id',
        item.id,
      );

      const response = await fetch(
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

      const uploadedItem =
        json.item as Item;

      setItem(uploadedItem);

      setBodyMd(
        uploadedItem.body_md ?? '',
      );

      latestRef.current.bodyMd =
        uploadedItem.body_md ?? '';

      const publicUrl =
        typeof json.url === 'string'
          ? json.url
          : uploadedItem.metadata &&
              typeof uploadedItem.metadata
                .public_url === 'string'
            ? uploadedItem.metadata.public_url
            : null;

      if (publicUrl) {
        setImagePreview(publicUrl);
      }

      setSaveState('saved');
    } catch (err) {
      console.error(
        '[flow] image upload failed:',
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

  async function finish(
    mode: FlowMode,
  ) {
    if (!item) {
      return;
    }

    if (
      saveState === 'publishing' ||
      saveState === 'saving'
    ) {
      return;
    }

    try {
      setError(null);
      setSaveState('publishing');

      const saved =
        await flushSave();

      if (!saved) {
        return;
      }

      const current =
        latestRef.current;

      const freshItem =
        item;

      if (
        freshItem.type === 'link' &&
        !freshItem.source_url
      ) {
        throw new Error(
          'Add a link first.',
        );
      }

      if (
        freshItem.type === 'photo' &&
        !freshItem.metadata &&
        !imagePreview
      ) {
        throw new Error(
          'Add an image first.',
        );
      }

      if (
        freshItem.type !== 'link' &&
        freshItem.type !== 'photo' &&
        !current.bodyMd.trim()
      ) {
        throw new Error(
          'Write something first.',
        );
      }

      const metadata =
        withFlowMetadata(
          freshItem.metadata,
          mode,
        );

      const title =
        freshItem.type === 'link'
          ? String(
              linkPreview?.title ||
                freshItem.title ||
                freshItem.source_url ||
                'Link',
            ).slice(0, 160)
          : freshItem.type === 'photo'
            ? String(
                (
                  freshItem.metadata &&
                  typeof freshItem.metadata.alt ===
                    'string'
                    ? freshItem.metadata.alt
                    : null
                ) ||
                  freshItem.title ||
                  'Image',
              ).slice(0, 160)
            : firstLine(
                current.bodyMd,
              );

      const slug =
        slugify(
          title,
          freshItem.id,
        );

      const isDirect =
        mode === 'direct';

      const response = await fetch(
        `/api/admin/items/${freshItem.id}`,
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
            slug,
            metadata,
            status: isDirect
              ? 'published'
              : 'draft',
            visibility: isDirect
              ? 'public'
              : 'private',
            ...(isDirect
              ? {
                  published_at:
                    new Date().toISOString(),
                }
              : {}),
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
            `Failed to save Flow item (${response.status}).`,
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
        '[flow] action failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save Flow item.',
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
        return 'Creating…';

      case 'loading':
        return 'Opening…';

      case 'saving':
        return 'Saving…';

      case 'saved':
        return 'Saved';

      case 'publishing':
        return 'Working…';

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/35 p-4 backdrop-blur-sm"
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
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-stone-200 bg-[#FAF8F5] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-composer-title"
      >
        <div className="flex items-center justify-between border-b border-stone-200/80 px-6 py-5 sm:px-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-stone-400">
            Flow
          </div>

          <button
            type="button"
            onClick={() =>
              void handleClose()
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-2xl font-light text-stone-400 transition hover:bg-stone-200/60 hover:text-stone-900"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <h2
          id="flow-composer-title"
          className="sr-only"
        >
          Flow
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8 sm:py-9">
          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-mono text-[11px] leading-5 text-red-700">
              {error}
            </div>
          )}

          {linkMode ? (
            <div className="space-y-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                Link
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
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
                      event.key === 'Enter'
                    ) {
                      void parseLink();
                    }
                  }}
                  placeholder="Paste a URL…"
                  disabled={!item || busy}
                  className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-5 py-4 font-serif text-lg outline-none transition focus:border-stone-500 disabled:bg-stone-100"
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
                  className="rounded-2xl bg-stone-900 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition hover:bg-stone-700 disabled:bg-stone-300"
                >
                  Parse
                </button>
              </div>

              {linkPreview && (
                <div className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white">
                  {typeof linkPreview.image ===
                    'string' && (
                    <img
                      src={
                        linkPreview.image
                      }
                      alt=""
                      className="max-h-80 w-full object-cover"
                    />
                  )}

                  <div className="p-6 sm:p-7">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                      {String(
                        linkPreview.site_name ??
                          linkPreview.domain ??
                          '',
                      )}
                    </div>

                    <div className="mt-3 font-serif text-2xl font-light leading-tight text-stone-900">
                      {String(
                        linkPreview.title ??
                          linkUrl,
                      )}
                    </div>

                    {typeof linkPreview.description ===
                      'string' && (
                      <p className="mt-3 font-serif text-base leading-7 text-stone-600">
                        {
                          linkPreview.description
                        }
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : isImage ? (
            <div className="space-y-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                Image
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt=""
                    className="max-h-[65vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex min-h-[420px] items-center justify-center font-serif text-lg text-stone-400">
                    Select an image below.
                  </div>
                )}
              </div>

              {imageName && (
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
                  {imageName}
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
              disabled={!item || busy}
              placeholder="Write something…"
              autoFocus
              className="min-h-[460px] w-full resize-none border-0 bg-transparent font-serif text-[21px] font-light leading-[1.8] text-stone-800 outline-none placeholder:text-stone-300"
            />
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-stone-200/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
            {statusLabel()}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
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
                  setError(null);
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
              disabled={!item || busy}
              className="rounded-full border border-stone-200 bg-white px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              + Image
            </button>

            <button
              type="button"
              onClick={() => {
                setLinkMode(true);
                setError(null);
              }}
              disabled={!item || busy}
              className="rounded-full border border-stone-200 bg-white px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              + Link
            </button>

            <button
              type="button"
              onClick={() =>
                void finish('later')
              }
              disabled={
                !item ||
                busy ||
                saveState === 'saving'
              }
              className="rounded-full border border-stone-200 bg-white px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              Later
            </button>

            <button
              type="button"
              onClick={() =>
                void finish('ai')
              }
              disabled={
                !item ||
                busy ||
                saveState === 'saving'
              }
              className="rounded-full border border-stone-200 bg-white px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-700 transition hover:border-stone-500 disabled:cursor-not-allowed disabled:text-stone-300"
            >
              AI
            </button>

            <button
              type="button"
              onClick={() =>
                void finish('direct')
              }
              disabled={
                !item ||
                busy ||
                saveState === 'saving' ||
                (item.type === 'link' &&
                  !item.source_url) ||
                (item.type === 'photo' &&
                  !item.metadata &&
                  !imagePreview) ||
                (item.type !== 'link' &&
                  item.type !== 'photo' &&
                  !bodyMd.trim())
              }
              className="rounded-full bg-stone-900 px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {saveState === 'publishing'
                ? 'Working…'
                : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}