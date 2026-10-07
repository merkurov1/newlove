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
  itemId?: string | null;
};

type SaveState =
  | 'creating'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'publishing'
  | 'error';

const LAST_DRAFT_KEY =
  'flow:last-draft-id';

const AUTOSAVE_INTERVAL =
  10_000;

function firstLine(
  body: string,
) {
  return (
    body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(
            /^#{1,6}\s+/,
            '',
          )
          .trim(),
      )
      .find(Boolean)
      ?.slice(0, 160) ||
    'Flow post'
  );
}

function slugify(
  value: string,
  id: string,
) {
  const slug =
    value
      .toLowerCase()
      .trim()
      .replace(
        /[^\p{L}\p{N}\s-]/gu,
        '',
      )
      .replace(
        /\s+/g,
        '-',
      )
      .replace(
        /-+/g,
        '-',
      )
      .replace(
        /^-|-$/g,
        '',
      )
      .slice(0, 80);

  return (
    slug ||
    `post-${id.slice(
      0,
      8,
    )}`
  );
}

async function readJson(
  response: Response,
) {
  return response
    .json()
    .catch(() => ({}));
}

function withFlowMetadata(
  metadata:
    | Record<
        string,
        unknown
      >
    | null
    | undefined,
) {
  return {
    ...(metadata ?? {}),
    flow: {
      ...(metadata &&
      typeof metadata.flow ===
        'object' &&
      metadata.flow !== null
        ? metadata.flow
        : {}),
      queued_at:
        new Date().toISOString(),
    },
  };
}

function normalizePastedUrl(
  value: string,
) {
  const trimmed =
    value.trim();

  if (
    !trimmed ||
    /\s/.test(trimmed)
  ) {
    return null;
  }

  const candidate =
    /^https?:\/\//i.test(
      trimmed,
    )
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url =
      new URL(candidate);

    if (
      !url.hostname ||
      !url.hostname.includes(
        '.',
      )
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getDomain(
  value: string,
) {
  try {
    return new URL(
      value,
    ).hostname.replace(
      /^www\./,
      '',
    );
  } catch {
    return value;
  }
}

function ShimmerPreview() {
  return (
    <div className="space-y-4">
      <div className="h-3 w-24 animate-pulse rounded bg-stone-200" />
      <div className="h-8 w-4/5 animate-pulse rounded bg-stone-200" />
      <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-stone-100" />
    </div>
  );
}

export default function NewPostModal({
  onClose,
  onCreated,
  itemId,
}: NewPostModalProps) {
  const [
    item,
    setItem,
  ] =
    useState<Item | null>(
      null,
    );

  const [
    bodyMd,
    setBodyMd,
  ] =
    useState('');

  const [
    saveState,
    setSaveState,
  ] =
    useState<SaveState>(
      'creating',
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    linkMode,
    setLinkMode,
  ] =
    useState(false);

  const [
    linkUrl,
    setLinkUrl,
  ] =
    useState('');

  const [
    linkPreview,
    setLinkPreview,
  ] =
    useState<Record<
      string,
      unknown
    > | null>(null);

  const [
    imageName,
    setImageName,
  ] =
    useState<string | null>(
      null,
    );

  const [
    imagePreview,
    setImagePreview,
  ] =
    useState<string | null>(
      null,
    );

  const fileRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null,
    );

  const savePromiseRef =
    useRef<Promise<boolean> | null>(
      null,
    );

  const latestRef =
    useRef({
      bodyMd: '',
    });

  const closingRef =
    useRef(false);

  const isEditing =
    Boolean(itemId);

  useEffect(() => {
    latestRef.current = {
      bodyMd,
    };
  }, [bodyMd]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setError(null);

        let loaded: Item | null =
          null;

        if (itemId) {
          setSaveState(
            'loading',
          );

          const response =
            await fetch(
              `/api/admin/items/${itemId}`,
              {
                cache:
                  'no-store',
              },
            );

          const json =
            await readJson(
              response,
            );

          if (
            !response.ok ||
            !json.item
          ) {
            throw new Error(
              json.error ??
                'Failed to load item.',
            );
          }

          loaded =
            json.item as Item;
        } else {
          const existingDraftId =
            window.localStorage.getItem(
              LAST_DRAFT_KEY,
            );

          if (
            existingDraftId
          ) {
            setSaveState(
              'loading',
            );

            const response =
              await fetch(
                `/api/admin/items/${existingDraftId}`,
                {
                  cache:
                    'no-store',
                },
              );

            const json =
              await readJson(
                response,
              );

            if (
              response.ok &&
              json.item &&
              json.item.status ===
                'draft'
            ) {
              loaded =
                json.item as Item;
            } else {
              window.localStorage.removeItem(
                LAST_DRAFT_KEY,
              );
            }
          }

          if (!loaded) {
            setSaveState(
              'creating',
            );

            const response =
              await fetch(
                '/api/admin/items/new',
                {
                  method:
                    'POST',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify(
                    {
                      type: 'note',
                      title: '',
                      body_md: '',
                      lang: 'ru',
                      metadata: {
                        flow: {
                          mode: 'direct',
                        },
                      },
                    },
                  ),
                },
              );

            const json =
              await readJson(
                response,
              );

            if (
              !response.ok ||
              !json.item
            ) {
              throw new Error(
                json.error ??
                  'Failed to create Flow item.',
              );
            }

            loaded =
              json.item as Item;

            window.localStorage.setItem(
              LAST_DRAFT_KEY,
              loaded.id,
            );
          }
        }

        if (
          cancelled ||
          !loaded
        ) {
          return;
        }

        setItem(loaded);

        setBodyMd(
          loaded.body_md ??
            '',
        );

        latestRef.current = {
          bodyMd:
            loaded.body_md ??
            '',
        };

        if (
          loaded.type ===
          'link'
        ) {
          setLinkMode(true);

          setLinkUrl(
            loaded.source_url ??
              '',
          );

          setLinkPreview(
            loaded.metadata ??
              null,
          );
        }

        if (
          loaded.type ===
          'photo'
        ) {
          const publicUrl =
            loaded.metadata &&
            typeof loaded
              .metadata
              .public_url ===
              'string'
              ? loaded.metadata
                  .public_url
              : null;

          setImagePreview(
            publicUrl,
          );

          setImageName(
            loaded.metadata &&
            typeof loaded
              .metadata
              .filename ===
              'string'
              ? loaded.metadata
                  .filename
              : null,
          );
        }

        setSaveState(
          'saved',
        );

        requestAnimationFrame(
          () => {
            textareaRef.current?.focus();
          },
        );
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
            : 'Failed to initialize.',
        );

        setSaveState(
          'error',
        );
      }
    }

    void initialize();

    return () => {
      cancelled = true;

      if (
        imagePreview &&
        imagePreview.startsWith(
          'blob:',
        )
      ) {
        URL.revokeObjectURL(
          imagePreview,
        );
      }
    };
  }, [itemId]);

  const saveDraft =
    useCallback(
      async (
        changes: Record<
          string,
          unknown
        >,
      ) => {
        if (!item) {
          return true;
        }

        try {
          setSaveState(
            'saving',
          );

          setError(null);

          const response =
            await fetch(
              `/api/admin/items/${item.id}`,
              {
                method:
                  'PATCH',
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
            await readJson(
              response,
            );

          if (!response.ok) {
            throw new Error(
              json.error ??
                'Failed to save.',
            );
          }

          if (json.item) {
            setItem(
              json.item as Item,
            );
          }

          setSaveState(
            'saved',
          );

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

          setSaveState(
            'error',
          );

          return false;
        }
      },
      [item],
    );

  useEffect(() => {
    if (!item) {
      return;
    }

    const autosave =
      () => {
        if (
          savePromiseRef.current ||
          saveState ===
            'publishing' ||
          saveState ===
            'creating' ||
          saveState ===
            'loading'
        ) {
          return;
        }

        const promise =
          saveDraft({
            body_md:
              latestRef.current
                .bodyMd,
          });

        savePromiseRef.current =
          promise;

        void promise.finally(
          () => {
            if (
              savePromiseRef.current ===
              promise
            ) {
              savePromiseRef.current =
                null;
            }
          },
        );
      };

    const interval =
      window.setInterval(
        autosave,
        AUTOSAVE_INTERVAL,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [
    item,
    saveDraft,
    saveState,
  ]);

  function handleBodyChange(
    value: string,
  ) {
    setBodyMd(value);
    latestRef.current.bodyMd =
      value;
  }

  const flushSave =
    useCallback(
      async () => {
        if (!item) {
          return true;
        }

        if (
          savePromiseRef.current
        ) {
          await savePromiseRef.current;
        }

        return saveDraft({
          body_md:
            latestRef.current
              .bodyMd,
        });
      },
      [item, saveDraft],
    );

  async function parseLink(
    urlOverride?: string,
  ) {
    if (!item) {
      return;
    }

    const url =
      (
        urlOverride ??
        linkUrl
      ).trim();

    if (!url) {
      return;
    }

    try {
      setSaveState(
        'saving',
      );

      setError(null);

      const response =
        await fetch(
          '/api/admin/items/parse-link',
          {
            method:
              'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify(
              {
                item_id:
                  item.id,
                url,
              },
            ),
          },
        );

      const json =
        await readJson(
          response,
        );

      if (!response.ok) {
        throw new Error(
          json.error ??
            'Failed to parse link.',
        );
      }

      const parsedItem =
        json.item as Item;

      setItem(
        parsedItem,
      );

      setLinkMode(true);

      setLinkUrl(
        parsedItem.source_url ??
          url,
      );

      setLinkPreview(
        json.metadata ??
          parsedItem.metadata ??
          null,
      );

      setBodyMd(
        parsedItem.body_md ??
          '',
      );

      latestRef.current.bodyMd =
        parsedItem.body_md ??
        '';

      setSaveState(
        'saved',
      );

      requestAnimationFrame(
        () => {
          textareaRef.current?.focus();
        },
      );
    } catch (err) {
      console.error(
        '[flow] link parsing failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Could not read this link.',
      );

      setSaveState(
        'error',
      );
    }
  }

  function handlePaste(
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const pasted =
      event.clipboardData
        .getData('text')
        .trim();

    const url =
      normalizePastedUrl(
        pasted,
      );

    if (
      !url ||
      bodyMd.trim()
    ) {
      return;
    }

    event.preventDefault();

    setError(null);
    setLinkMode(true);
    setLinkUrl(url);
    setLinkPreview(null);

    void parseLink(url);
  }

  async function uploadImage(
    file: File,
  ) {
    if (!item) {
      return;
    }

    try {
      setSaveState(
        'saving',
      );

      setError(null);

      setLinkMode(false);
      setLinkPreview(null);

      if (
        imagePreview &&
        imagePreview.startsWith(
          'blob:',
        )
      ) {
        URL.revokeObjectURL(
          imagePreview,
        );
      }

      const localPreview =
        URL.createObjectURL(
          file,
        );

      setImagePreview(
        localPreview,
      );

      setImageName(
        file.name,
      );

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

      const response =
        await fetch(
          '/api/admin/items/media',
          {
            method:
              'POST',
            body: form,
          },
        );

      const json =
        await readJson(
          response,
        );

      if (!response.ok) {
        throw new Error(
          json.error ??
            'Failed to upload image.',
        );
      }

      const uploadedItem =
        json.item as Item;

      setItem(
        uploadedItem,
      );

      setBodyMd(
        uploadedItem.body_md ??
          '',
      );

      latestRef.current.bodyMd =
        uploadedItem.body_md ??
        '';

      const publicUrl =
        typeof json.url ===
        'string'
          ? json.url
          : uploadedItem
                .metadata &&
            typeof uploadedItem
              .metadata
              .public_url ===
              'string'
          ? uploadedItem
              .metadata
              .public_url
          : null;

      if (publicUrl) {
        setImagePreview(
          publicUrl,
        );
      }

      setSaveState(
        'saved',
      );
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

      setSaveState(
        'error',
      );
    }
  }

  async function finish() {
    if (!item) {
      return;
    }

    if (
      saveState ===
      'publishing'
    ) {
      return;
    }

    try {
      setError(null);
      setSaveState(
        'publishing',
      );

      const saved =
        await flushSave();

      if (!saved) {
        setSaveState(
          'error',
        );
        return;
      }

      const current =
        latestRef.current;

      if (
        item.type ===
          'link' &&
        !item.source_url
      ) {
        throw new Error(
          'The link is not ready yet.',
        );
      }

      if (
        item.type ===
          'photo' &&
        !item.metadata &&
        !imagePreview
      ) {
        throw new Error(
          'Add an image first.',
        );
      }

      if (
        item.type !==
          'link' &&
        item.type !==
          'photo' &&
        !current.bodyMd.trim()
      ) {
        throw new Error(
          'Write something first.',
        );
      }

      const metadata =
        withFlowMetadata(
          item.metadata,
        );

      const title =
        item.type ===
        'link'
          ? String(
              linkPreview?.title ||
                item.title ||
                item.source_url ||
                'Link',
            ).slice(0, 160)
          : item.type ===
            'photo'
          ? String(
              (
                item.metadata &&
                typeof item
                  .metadata
                  .alt ===
                  'string'
                  ? item
                      .metadata
                      .alt
                  : null
              ) ||
                item.title ||
                'Image',
            ).slice(0, 160)
          : firstLine(
              current.bodyMd,
            );

      /*
       * New items get a slug once.
       * Existing published items keep their URL.
       */
      const slug =
        isEditing &&
        item.slug
          ? item.slug
          : slugify(
              title,
              item.id,
            );

      const response =
        await fetch(
          `/api/admin/items/${item.id}`,
          {
            method:
              'PATCH',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify(
              {
                title,
                body_md:
                  current.bodyMd,
                slug,
                metadata,
                status:
                  'published',
                visibility:
                  'public',
              },
            ),
          },
        );

      const json =
        await readJson(
          response,
        );

      if (
        !response.ok ||
        !json.item
      ) {
        throw new Error(
          json.error ??
            `Failed to publish (${response.status}).`,
        );
      }

      window.localStorage.removeItem(
        LAST_DRAFT_KEY,
      );

      /*
       * Publishing must not wait for the model.
       * The AI request continues independently.
       */
      void fetch(
        `/api/admin/items/${item.id}/ai`,
        {
          method:
            'POST',
        },
      ).catch((aiError) => {
        console.warn(
          '[flow] AI context request failed:',
          aiError,
        );
      });

      setSaveState(
        'saved',
      );

      onCreated?.();
      onClose();
    } catch (err) {
      console.error(
        '[flow] publish failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to publish.',
      );

      setSaveState(
        'error',
      );
    }
  }

  async function handleClose() {
    if (
      closingRef.current
    ) {
      return;
    }

    closingRef.current =
      true;

    if (!item) {
      onClose();
      return;
    }

    const saved =
      await flushSave();

    if (!saved) {
      closingRef.current =
        false;
      return;
    }

    onClose();
  }

  useEffect(() => {
    function handleKeyboard(
      event: KeyboardEvent,
    ) {
      if (
        event.key ===
        'Escape'
      ) {
        event.preventDefault();

        void handleClose();

        return;
      }

      if (
        (event.metaKey ||
          event.ctrlKey) &&
        event.key ===
          'Enter'
      ) {
        event.preventDefault();

        if (
          !busy &&
          saveState !==
            'saving'
        ) {
          void finish();
        }
      }
    }

    document.addEventListener(
      'keydown',
      handleKeyboard,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyboard,
      );
    };
  });

  const busy =
    saveState ===
      'creating' ||
    saveState ===
      'loading' ||
    saveState ===
      'publishing';

  const isImage =
    item?.type ===
    'photo';

  const isLink =
    item?.type ===
      'link' ||
    linkMode;

  const isParsing =
    saveState ===
      'saving' &&
    isLink &&
    !linkPreview;

  const canPost =
    Boolean(item) &&
    !busy &&
    saveState !==
      'saving' &&
    (
      item?.type ===
      'link'
        ? Boolean(
            item.source_url,
          )
        : item?.type ===
          'photo'
        ? Boolean(
            item.metadata ||
              imagePreview,
          )
        : Boolean(
            bodyMd.trim(),
          )
    );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/35 p-0 backdrop-blur-sm sm:p-4"
      onMouseDown={(
        event,
      ) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          void handleClose();
        }
      }}
    >
      <div
        className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-[#FAF8F5] shadow-2xl sm:h-auto sm:rounded-[2rem]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-composer-title"
      >
        <div className="flex shrink-0 items-center justify-end px-4 py-3 sm:px-6">
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
          {isEditing
            ? 'Edit'
            : 'Create'}
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-6 sm:pb-7">
          {error && (
            <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 font-mono text-[11px] leading-5 text-red-700">
              {error}
            </div>
          )}

          {isParsing ? (
            <ShimmerPreview />
          ) : isLink ? (
            <div>
              {linkPreview ? (
                <div>
                  {typeof linkPreview.image ===
                    'string' && (
                    <img
                      src={
                        linkPreview.image
                      }
                      alt=""
                      className="mb-5 max-h-[420px] w-full object-cover"
                    />
                  )}

                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
                    {String(
                      linkPreview.site_name ??
                        linkPreview.domain ??
                        getDomain(
                          linkUrl,
                        ),
                    )}
                  </div>

                  <div className="mt-3 font-serif text-2xl font-light leading-tight text-stone-900 sm:text-3xl">
                    {String(
                      linkPreview.title ??
                        linkUrl,
                    )}
                  </div>

                  {typeof linkPreview.description ===
                    'string' && (
                    <p className="mt-3 max-w-2xl font-serif text-base leading-7 text-stone-600">
                      {
                        linkPreview.description
                      }
                    </p>
                  )}

                  <a
                    href={
                      linkUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400 hover:text-stone-900"
                  >
                    Open original ↗
                  </a>

                  <textarea
                    ref={
                      textareaRef
                    }
                    value={
                      bodyMd
                    }
                    onChange={(
                      event,
                    ) =>
                      handleBodyChange(
                        event.target
                          .value,
                      )
                    }
                    disabled={
                      !item ||
                      busy
                    }
                    placeholder="Add your text…"
                    className="mt-8 min-h-[180px] w-full resize-none border-0 bg-transparent p-0 font-serif text-[19px] font-light leading-[1.75] text-stone-800 outline-none ring-0 placeholder:text-stone-300 focus:border-0 focus:outline-none focus:ring-0"
                  />
                </div>
              ) : (
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-400">
                    Link
                  </div>

                  <div className="mt-3 break-all font-serif text-lg leading-7 text-stone-800">
                    {linkUrl}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void parseLink()
                    }
                    disabled={
                      !item ||
                      busy
                    }
                    className="mt-5 rounded-full bg-stone-900 px-5 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-stone-700 disabled:bg-stone-300"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          ) : isImage ? (
            <div>
              {imagePreview ? (
                <img
                  src={
                    imagePreview
                  }
                  alt=""
                  className="max-h-[70vh] w-full object-contain"
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center font-serif text-lg text-stone-400">
                  Select an image below.
                </div>
              )}
            </div>
          ) : (
            <textarea
              ref={
                textareaRef
              }
              value={
                bodyMd
              }
              onChange={(
                event,
              ) =>
                handleBodyChange(
                  event.target
                    .value,
                )
              }
              onPaste={
                handlePaste
              }
              disabled={
                !item ||
                busy
              }
              placeholder="Write something…"
              autoFocus
              className="min-h-[55vh] w-full resize-none border-0 bg-transparent p-0 font-serif text-[21px] font-light leading-[1.8] text-stone-800 outline-none ring-0 placeholder:text-stone-300 focus:border-0 focus:outline-none focus:ring-0 sm:min-h-[460px]"
            />
          )}

          {imageName &&
            isImage && (
              <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-400">
                {imageName}
              </div>
            )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(
                event,
              ) => {
                const file =
                  event.target
                    .files?.[0];

                if (file) {
                  void uploadImage(
                    file,
                  );
                }

                event.target.value =
                  '';
              }}
            />

            <button
              type="button"
              onClick={() => {
                setError(null);
                fileRef.current?.click();
              }}
              disabled={
                !item ||
                busy
              }
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-stone-400 hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
              aria-label="Add image"
              title="Add image"
            >
              +
            </button>

            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-400">
              {saveState ===
              'saving'
                ? 'Saving'
                : saveState ===
                    'error'
                ? 'Error'
                : 'Saved'}
            </span>

            <span
              className={`h-1.5 w-1.5 rounded-full ${
                saveState ===
                'error'
                  ? 'bg-red-400'
                  : saveState ===
                        'saving' ||
                      saveState ===
                        'publishing'
                  ? 'animate-pulse bg-stone-500'
                  : 'bg-stone-300'
              }`}
              aria-hidden="true"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              void finish()
            }
            disabled={
              !canPost
            }
            className="rounded-full bg-stone-900 px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {saveState ===
            'publishing'
              ? '…'
              : isEditing
              ? 'Save'
              : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}