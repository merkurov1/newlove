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

function makeSlug(
  title: string,
  id: string,
) {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(
      /[^\p{L}\p{N}\s-]/gu,
      '',
    )
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return (
    slug ||
    `post-${id.slice(0, 8)}`
  );
}

async function readJson(
  response: Response,
) {
  return response.json().catch(() => ({}));
}

export default function NewPostModal({
  onClose,
  onCreated,
}: NewPostModalProps) {
  const [item, setItem] =
    useState<Item | null>(null);

  const [title, setTitle] =
    useState('');

  const [bodyMd, setBodyMd] =
    useState('');

  const [lang, setLang] =
    useState('ru');

  const [saveState, setSaveState] =
    useState<SaveState>('creating');

  const [error, setError] =
    useState<string | null>(null);

  const saveTimer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const latestRef =
    useRef({
      title: '',
      bodyMd: '',
      lang: 'ru',
    });

  const closingRef =
    useRef(false);

  useEffect(() => {
    latestRef.current = {
      title,
      bodyMd,
      lang,
    };
  }, [
    title,
    bodyMd,
    lang,
  ]);

  /*
   * Initialize / restore draft.
   */
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
            json.item
          ) {
            const loaded =
              json.item as Item;

            /*
             * Only drafts are restored.
             * Published/archived items must never
             * silently become a new draft.
             */
            if (
              loaded.status === 'draft'
            ) {
              if (cancelled) {
                return;
              }

              setItem(loaded);
              setTitle(
                loaded.title ?? '',
              );
              setBodyMd(
                loaded.body_md ?? '',
              );
              setLang(
                loaded.lang ?? 'ru',
              );

              latestRef.current = {
                title:
                  loaded.title ?? '',
                bodyMd:
                  loaded.body_md ?? '',
                lang:
                  loaded.lang ?? 'ru',
              };

              setSaveState('saved');

              return;
            }
          }

          /*
           * Stale localStorage ID.
           */
          window.localStorage.removeItem(
            LAST_DRAFT_KEY,
          );
        }

        /*
         * Create a fresh draft.
         */
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
                title: '',
                body_md: '',
                lang: 'ru',
                type: 'note',
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

        setTitle(
          created.title ?? '',
        );

        setBodyMd(
          created.body_md ?? '',
        );

        setLang(
          created.lang ?? 'ru',
        );

        latestRef.current = {
          title:
            created.title ?? '',
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

  /*
   * Save current draft.
   */
  const saveDraft =
    useCallback(
      async (
        changes: {
          title?: string;
          body_md?: string;
          lang?: string;
        },
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

  /*
   * Debounced autosave.
   */
  const scheduleSave =
    useCallback(
      (
        changes: {
          title?: string;
          body_md?: string;
          lang?: string;
        },
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
          }, 800);
      },
      [item, saveDraft],
    );

  function handleTitleChange(
    value: string,
  ) {
    setTitle(value);

    latestRef.current.title =
      value;

    scheduleSave({
      title: value,
      body_md:
        latestRef.current.bodyMd,
      lang:
        latestRef.current.lang,
    });
  }

  function handleBodyChange(
    value: string,
  ) {
    setBodyMd(value);

    latestRef.current.bodyMd =
      value;

    scheduleSave({
      title:
        latestRef.current.title,
      body_md: value,
      lang:
        latestRef.current.lang,
    });
  }

  function handleLangChange(
    value: string,
  ) {
    setLang(value);

    latestRef.current.lang =
      value;

    scheduleSave({
      title:
        latestRef.current.title,
      body_md:
        latestRef.current.bodyMd,
      lang: value,
    });
  }

  /*
   * Flush pending autosave immediately.
   */
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

      const current =
        latestRef.current;

      return saveDraft({
        title:
          current.title,
        body_md:
          current.bodyMd,
        lang:
          current.lang,
      });
    }, [item, saveDraft]);

  /*
   * Publish.
   */
  async function handlePublish() {
    if (!item) {
      return;
    }

    const current =
      latestRef.current;

    const cleanTitle =
      current.title.trim();

    if (!cleanTitle) {
      setError(
        'Title is required before publishing.',
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

      const slug =
        makeSlug(
          cleanTitle,
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
              title: cleanTitle,
              body_md:
                current.bodyMd,
              lang:
                current.lang,
              slug,
              status: 'published',
              visibility: 'public',
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
            `Failed to publish post (${response.status}).`,
        );
      }

      setItem(
        json.item as Item,
      );

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
          : 'Failed to publish post.',
      );

      setSaveState('error');
    }
  }

  /*
   * Close only after the latest text has
   * successfully reached the server.
   */
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
              New post
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

          <div className="mb-5 flex items-center gap-3">
            <select
              value={lang}
              onChange={(event) =>
                handleLangChange(
                  event.target.value,
                )
              }
              disabled={!item || busy}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-black disabled:cursor-not-allowed disabled:bg-zinc-50"
            >
              <option value="ru">
                RU
              </option>

              <option value="en">
                EN
              </option>
            </select>

            <div className="rounded-lg bg-zinc-100 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
              {item?.status ??
                'draft'}
            </div>
          </div>

          <input
            type="text"
            value={title}
            onChange={(event) =>
              handleTitleChange(
                event.target.value,
              )
            }
            disabled={!item || busy}
            placeholder="Title"
            className="mb-5 w-full border-0 px-0 text-3xl font-semibold tracking-tight outline-none placeholder:text-zinc-300 disabled:cursor-not-allowed"
          />

          <textarea
            value={bodyMd}
            onChange={(event) =>
              handleBodyChange(
                event.target.value,
              )
            }
            disabled={!item || busy}
            placeholder="Write something…"
            className="min-h-[320px] w-full resize-none border-0 px-0 text-lg leading-8 outline-none placeholder:text-zinc-300 disabled:cursor-not-allowed"
          />

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              disabled
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400"
            >
              + Image
            </button>

            <button
              type="button"
              disabled
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400"
            >
              + Link
            </button>

            <button
              type="button"
              disabled
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-400"
            >
              + File
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {statusLabel()}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void handleClose()
              }
              disabled={
                saveState ===
                'publishing'
              }
              className="rounded-lg px-4 py-2 text-sm text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>

            <button
              type="button"
              disabled
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-400"
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
                !title.trim() ||
                busy ||
                saveState === 'saving'
              }
              className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {saveState ===
              'publishing'
                ? 'Publishing…'
                : 'Publish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}