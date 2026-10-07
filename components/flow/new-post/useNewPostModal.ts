"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  Item,
  NewPostModalProps,
  SaveState,
  YouTubeMetadata,
} from "./types";

export type {
  Item,
  NewPostModalProps,
  SaveState,
  YouTubeMetadata,
};

export const LAST_DRAFT_KEY =
  "flow:last-draft-id";

export const AUTOSAVE_INTERVAL =
  10_000;

function firstLine(body: string) {
  return (
    body
      .split(/\r?\n/)
      .map((line) =>
        line
          .replace(/^#{1,6}\s+/, "")
          .trim(),
      )
      .find(Boolean)
      ?.slice(0, 160) ||
    "Flow post"
  );
}

function slugify(
  value: string,
  id: string,
) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(
      /[^\p{L}\p{N}\s-]/gu,
      "",
    )
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return (
    slug ||
    `post-${id.slice(0, 8)}`
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
    | Record<string, unknown>
    | null
    | undefined,
) {
  return {
    ...(metadata ?? {}),
    flow: {
      ...(metadata &&
      typeof metadata.flow ===
        "object" &&
      metadata.flow !== null
        ? metadata.flow
        : {}),
      queued_at:
        new Date().toISOString(),
    },
  };
}

export function normalizePastedUrl(
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
      !url.hostname.includes(".")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getDomain(
  value: string,
) {
  try {
    return new URL(
      value,
    ).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return value;
  }
}

export function getYouTubeMetadata(
  metadata:
    | Record<string, unknown>
    | null
    | undefined,
): YouTubeMetadata | null {
  if (
    !metadata ||
    typeof metadata.youtube !==
      "object" ||
    metadata.youtube === null
  ) {
    return null;
  }

  return metadata.youtube as YouTubeMetadata;
}

export function isYouTubeVideo(
  item: Item | null,
) {
  return (
    item?.type === "video" &&
    Boolean(
      getYouTubeMetadata(
        item.metadata,
      ),
    )
  );
}

function isDraft(item: Item | null) {
  return (
    Boolean(item) &&
    item?.status === "draft"
  );
}

export function useNewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
}: NewPostModalProps) {
  const [
    item,
    setItem,
  ] = useState<Item | null>(null);

  const [
    bodyMd,
    setBodyMd,
  ] = useState("");

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    saveState,
    setSaveState,
  ] = useState<SaveState>(
    "creating",
  );

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    linkMode,
    setLinkMode,
  ] = useState(false);

  const [
    linkUrl,
    setLinkUrl,
  ] = useState("");

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
  ] = useState<string | null>(
    null,
  );

  const [
    imagePreview,
    setImagePreview,
  ] = useState<string | null>(
    null,
  );

  const [
    isEditing,
    setIsEditing,
  ] = useState(
    Boolean(itemId),
  );

  const [
    isClearing,
    setIsClearing,
  ] = useState(false);

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

  const operationPromiseRef =
    useRef<Promise<boolean> | null>(
      null,
    );

  const latestRef =
    useRef({
      bodyMd: "",
      title: "",
    });

  const closingRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  const busy =
    saveState === "creating" ||
    saveState === "loading" ||
    saveState === "publishing" ||
    isClearing;

  useEffect(() => {
    latestRef.current = {
      bodyMd,
      title,
    };
  }, [bodyMd, title]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetLocalState =
    useCallback(
      (nextItem: Item | null) => {
        const nextBody =
          nextItem?.body_md ?? "";

        const nextTitle =
          nextItem?.title ?? "";

        setItem(nextItem);
        setBodyMd(nextBody);
        setTitle(nextTitle);

        latestRef.current = {
          bodyMd: nextBody,
          title: nextTitle,
        };

        setError(null);
        setLinkMode(false);
        setLinkUrl("");
        setLinkPreview(null);
        setImageName(null);
        setImagePreview(null);
        setSaveState("saved");
      },
      [],
    );

  const createFreshDraft =
    useCallback(
      async () => {
        setSaveState("creating");
        setError(null);

        const response =
          await fetch(
            "/api/admin/items/new",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                type: "note",
                title: "",
                body_md: "",
                lang: "ru",
                metadata: {
                  flow: {
                    mode: "direct",
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
              "Failed to create Flow item.",
          );
        }

        const fresh =
          json.item as Item;

        window.localStorage.setItem(
          LAST_DRAFT_KEY,
          fresh.id,
        );

        if (!mountedRef.current) {
          return false;
        }

        resetLocalState(fresh);

        requestAnimationFrame(
          () => {
            textareaRef.current?.focus();
          },
        );

        return true;
      },
      [resetLocalState],
    );

  const initialize =
    useCallback(
      async () => {
        let loaded: Item | null =
          null;

        if (itemId) {
          setIsEditing(true);
          setSaveState("loading");

          const response =
            await fetch(
              `/api/admin/items/${itemId}`,
              {
                cache: "no-store",
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
                "Failed to load item.",
            );
          }

          loaded =
            json.item as Item;
        } else {
          setIsEditing(false);

          const existingDraftId =
            window.localStorage.getItem(
              LAST_DRAFT_KEY,
            );

          if (existingDraftId) {
            setSaveState("loading");

            const response =
              await fetch(
                `/api/admin/items/${existingDraftId}`,
                {
                  cache: "no-store",
                },
              );

            const json =
              await readJson(response);

            if (
              response.ok &&
              json.item &&
              json.item.status ===
                "draft"
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
            await createFreshDraft();
            return;
          }
        }

        if (!loaded) {
          return;
        }

        if (!mountedRef.current) {
          return;
        }

        setItem(loaded);

        setBodyMd(
          loaded.body_md ?? "",
        );

        setTitle(
          loaded.title ?? "",
        );

        latestRef.current = {
          bodyMd:
            loaded.body_md ?? "",
          title:
            loaded.title ?? "",
        };

        if (
          loaded.type === "link" ||
          loaded.type === "video"
        ) {
          setLinkMode(true);

          setLinkUrl(
            loaded.source_url ?? "",
          );

          setLinkPreview(
            loaded.metadata ?? null,
          );
        }

        if (
          loaded.type === "photo"
        ) {
          const publicUrl =
            loaded.metadata &&
            typeof loaded.metadata
              .public_url ===
              "string"
              ? loaded.metadata
                  .public_url
              : null;

          setImagePreview(
            publicUrl,
          );

          setImageName(
            loaded.metadata &&
            typeof loaded.metadata
              .filename ===
              "string"
              ? loaded.metadata
                  .filename
              : null,
          );
        }

        setSaveState("saved");

        requestAnimationFrame(
          () => {
            textareaRef.current?.focus();
          },
        );
      },
      [createFreshDraft, itemId],
    );

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setError(null);

        await initialize();
      } catch (err) {
        if (
          cancelled ||
          !mountedRef.current
        ) {
          return;
        }

        console.error(
          "[flow] initialization failed:",
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize.",
        );

        setSaveState("error");
      }
    }

    void run();

    return () => {
      cancelled = true;

      if (
        imagePreview?.startsWith(
          "blob:",
        )
      ) {
        URL.revokeObjectURL(
          imagePreview,
        );
      }
    };
    // initialize intentionally represents one modal session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId]);

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

        if (
          isClearing ||
          item.status !== "draft"
        ) {
          return false;
        }

        try {
          setSaveState("saving");
          setError(null);

          const response =
            await fetch(
              `/api/admin/items/${item.id}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type":
                    "application/json",
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
                "Failed to save.",
            );
          }

          if (
            json.item &&
            mountedRef.current
          ) {
            setItem(
              json.item as Item,
            );
          }

          if (mountedRef.current) {
            setSaveState("saved");
          }

          return true;
        } catch (err) {
          console.error(
            "[flow] save failed:",
            err,
          );

          if (mountedRef.current) {
            setError(
              err instanceof Error
                ? err.message
                : "Failed to save.",
            );

            setSaveState("error");
          }

          return false;
        }
      },
      [isClearing, item],
    );

  useEffect(() => {
    if (
      !item ||
      item.status !== "draft"
    ) {
      return;
    }

    const autosave = () => {
      if (
        isClearing ||
        savePromiseRef.current ||
        operationPromiseRef.current ||
        saveState === "publishing" ||
        saveState === "creating" ||
        saveState === "loading"
      ) {
        return;
      }

      const promise =
        saveDraft({
          body_md:
            latestRef.current.bodyMd,
          title:
            latestRef.current.title,
        });

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
    isClearing,
    item,
    saveDraft,
    saveState,
  ]);

  const trackOperation =
    useCallback(
      (
        operation: Promise<boolean>,
      ) => {
        operationPromiseRef.current =
          operation;

        void operation.finally(
          () => {
            if (
              operationPromiseRef.current ===
              operation
            ) {
              operationPromiseRef.current =
                null;
            }
          },
        );

        return operation;
      },
      [],
    );

  const handleBodyChange =
    useCallback(
      (value: string) => {
        setBodyMd(value);

        latestRef.current.bodyMd =
          value;
      },
      [],
    );

  const flushSave =
    useCallback(
      async () => {
        if (!item) {
          return true;
        }

        if (
          item.status !== "draft"
        ) {
          return true;
        }

        if (
          savePromiseRef.current
        ) {
          await savePromiseRef.current;
        }

        if (isClearing) {
          return false;
        }

        return saveDraft({
          body_md:
            latestRef.current.bodyMd,
          title:
            latestRef.current.title,
        });
      },
      [isClearing, item, saveDraft],
    );

  const parseLink =
    useCallback(
      async (urlOverride?: string) => {
        if (
          !item ||
          isClearing
        ) {
          return;
        }

        const url = (
          urlOverride ?? linkUrl
        ).trim();

        if (!url) {
          return;
        }

        const operation =
          (async () => {
            try {
              setSaveState("saving");
              setError(null);

              const response =
                await fetch(
                  "/api/admin/items/parse-link",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type":
                        "application/json",
                    },
                    body: JSON.stringify({
                      item_id: item.id,
                      url,
                    }),
                  },
                );

              const json =
                await readJson(
                  response,
                );

              if (!response.ok) {
                throw new Error(
                  json.error ??
                    "Failed to parse link.",
                );
              }

              const parsedItem =
                json.item as Item;

              if (
                !mountedRef.current ||
                isClearing
              ) {
                return false;
              }

              setItem(parsedItem);
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
                parsedItem.body_md ?? "",
              );

              setTitle(
                parsedItem.title ?? "",
              );

              latestRef.current = {
                bodyMd:
                  parsedItem.body_md ??
                  "",
                title:
                  parsedItem.title ??
                  "",
              };

              setSaveState("saved");

              requestAnimationFrame(
                () => {
                  if (
                    parsedItem.type !==
                    "video"
                  ) {
                    textareaRef.current?.focus();
                  }
                },
              );

              return true;
            } catch (err) {
              console.error(
                "[flow] link parsing failed:",
                err,
              );

              if (
                mountedRef.current
              ) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not read this link.",
                );

                setSaveState("error");
              }

              return false;
            }
          })();

        return trackOperation(
          operation,
        );
      },
      [
        isClearing,
        item,
        linkUrl,
        trackOperation,
      ],
    );

  const handlePaste =
    useCallback(
      (
        event: React.ClipboardEvent<HTMLTextAreaElement>,
      ) => {
        const pasted =
          event.clipboardData
            .getData("text")
            .trim();

        const url =
          normalizePastedUrl(
            pasted,
          );

        if (
          !url ||
          bodyMd.trim() ||
          isClearing
        ) {
          return;
        }

        event.preventDefault();

        setError(null);
        setLinkMode(true);
        setLinkUrl(url);
        setLinkPreview(null);

        void parseLink(url);
      },
      [
        bodyMd,
        isClearing,
        parseLink,
      ],
    );

  const uploadImage =
    useCallback(
      async (file: File) => {
        if (
          !item ||
          isClearing
        ) {
          return;
        }

        const operation =
          (async () => {
            try {
              setSaveState("saving");
              setError(null);

              setLinkMode(false);
              setLinkPreview(null);

              if (
                imagePreview?.startsWith(
                  "blob:",
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
                "file",
                file,
              );

              form.append(
                "item_id",
                item.id,
              );

              const response =
                await fetch(
                  "/api/admin/items/media",
                  {
                    method: "POST",
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
                    "Failed to upload image.",
                );
              }

              const uploadedItem =
                json.item as Item;

              if (
                !mountedRef.current ||
                isClearing
              ) {
                return false;
              }

              setItem(uploadedItem);

              setBodyMd(
                uploadedItem.body_md ??
                  "",
              );

              setTitle(
                uploadedItem.title ??
                  "",
              );

              latestRef.current = {
                bodyMd:
                  uploadedItem.body_md ??
                  "",
                title:
                  uploadedItem.title ??
                  "",
              };

              const publicUrl =
                typeof json.url ===
                "string"
                  ? json.url
                  : uploadedItem.metadata &&
                      typeof uploadedItem
                        .metadata
                        .public_url ===
                        "string"
                    ? uploadedItem
                        .metadata
                        .public_url
                    : null;

              if (publicUrl) {
                setImagePreview(
                  publicUrl,
                );
              }

              setSaveState("saved");

              return true;
            } catch (err) {
              console.error(
                "[flow] image upload failed:",
                err,
              );

              if (
                mountedRef.current
              ) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to upload image.",
                );

                setSaveState("error");
              }

              return false;
            }
          })();

        return trackOperation(
          operation,
        );
      },
      [
        imagePreview,
        isClearing,
        item,
        trackOperation,
      ],
    );

  const handleImageUpload =
    useCallback(
      (
        event: React.ChangeEvent<HTMLInputElement>,
      ) => {
        const file =
          event.target.files?.[0];

        if (!file) {
          return;
        }

        void uploadImage(file);

        event.target.value = "";
      },
      [uploadImage],
    );

  const finish =
    useCallback(async () => {
      if (
        !item ||
        isClearing
      ) {
        return;
      }

      if (
        saveState === "publishing"
      ) {
        return;
      }

      try {
        setError(null);
        setSaveState("publishing");

        if (
          operationPromiseRef.current
        ) {
          await operationPromiseRef.current;
        }

        if (isClearing) {
          return;
        }

        const saved =
          await flushSave();

        if (!saved) {
          setSaveState("error");
          return;
        }

        const current =
          latestRef.current;

        const isVideo =
          item.type === "video";

        if (
          item.type === "link" &&
          !item.source_url
        ) {
          throw new Error(
            "The link is not ready yet.",
          );
        }

        if (
          isVideo &&
          !item.source_url
        ) {
          throw new Error(
            "The YouTube video is not ready yet.",
          );
        }

        if (
          isVideo &&
          !getYouTubeMetadata(
            item.metadata,
          )
        ) {
          throw new Error(
            "The YouTube video metadata is not ready yet.",
          );
        }

        if (
          item.type === "photo" &&
          !item.metadata &&
          !imagePreview
        ) {
          throw new Error(
            "Add an image first.",
          );
        }

        if (
          item.type !== "link" &&
          item.type !== "video" &&
          item.type !== "photo" &&
          !current.bodyMd.trim()
        ) {
          throw new Error(
            "Write something first.",
          );
        }

        const metadata =
          withFlowMetadata(
            item.metadata,
          );

        const generatedTitle =
          item.type === "video"
            ? String(
                getYouTubeMetadata(
                  item.metadata,
                )?.title ||
                  item.title ||
                  "YouTube video",
              ).slice(0, 160)
            : item.type === "link"
              ? String(
                  linkPreview?.title ||
                    item.title ||
                    item.source_url ||
                    "Link",
                ).slice(0, 160)
              : item.type === "photo"
                ? String(
                    (
                      item.metadata &&
                      typeof item.metadata
                        .alt ===
                        "string"
                        ? item.metadata
                            .alt
                        : null
                    ) ||
                      item.title ||
                      "Image",
                  ).slice(0, 160)
                : (
                    current.title.trim() ||
                    firstLine(
                      current.bodyMd,
                    )
                  ).slice(0, 160);

        const slug =
          item.status === "published" &&
          item.slug
            ? item.slug
            : slugify(
                generatedTitle,
                item.id,
              );

        const response =
          await fetch(
            `/api/admin/items/${item.id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                title:
                  generatedTitle,
                body_md:
                  current.bodyMd,
                slug,
                metadata,
                status: "published",
                visibility: "public",
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
              `Failed to publish (${response.status}).`,
          );
        }

        window.localStorage.removeItem(
          LAST_DRAFT_KEY,
        );

        void fetch(
          `/api/admin/items/${item.id}/ai`,
          {
            method: "POST",
          },
        ).catch((aiError) => {
          console.warn(
            "[flow] AI context request failed:",
            aiError,
          );
        });

        setSaveState("saved");

        onCreated?.(
          json.item as Item,
        );

        onClose();
      } catch (err) {
        console.error(
          "[flow] publish failed:",
          err,
        );

        if (mountedRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to publish.",
          );

          setSaveState("error");
        }
      }
    }, [
      flushSave,
      imagePreview,
      isClearing,
      item,
      linkPreview,
      onClose,
      onCreated,
      saveState,
    ]);

  const clearDraft =
    useCallback(async () => {
      if (
        !item ||
        !isDraft(item) ||
        isClearing
      ) {
        return;
      }

      setIsClearing(true);
      setSaveState("clearing");
      setError(null);

      try {
        if (
          operationPromiseRef.current
        ) {
          await operationPromiseRef.current;
        }

        if (
          savePromiseRef.current
        ) {
          await savePromiseRef.current;
        }

        const currentItem =
          item;

        if (
          !currentItem ||
          !isDraft(currentItem)
        ) {
          return;
        }

        const response =
          await fetch(
            `/api/admin/items/${currentItem.id}`,
            {
              method: "DELETE",
            },
          );

        if (
          !response.ok &&
          response.status !== 404
        ) {
          const json =
            await readJson(response);

          throw new Error(
            json.error ??
              "Failed to clear draft.",
          );
        }

        window.localStorage.removeItem(
          LAST_DRAFT_KEY,
        );

        if (
          imagePreview?.startsWith(
            "blob:",
          )
        ) {
          URL.revokeObjectURL(
            imagePreview,
          );
        }

        setIsEditing(false);

        setItem(null);
        setBodyMd("");
        setTitle("");

        latestRef.current = {
          bodyMd: "",
          title: "",
        };

        setLinkMode(false);
        setLinkUrl("");
        setLinkPreview(null);
        setImageName(null);
        setImagePreview(null);

        await createFreshDraft();
      } catch (err) {
        console.error(
          "[flow] clear failed:",
          err,
        );

        if (mountedRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to clear draft.",
          );

          setSaveState("error");
        }
      } finally {
        if (mountedRef.current) {
          setIsClearing(false);
        }
      }
    }, [
      createFreshDraft,
      imagePreview,
      isClearing,
      item,
    ]);

  const handleClose =
    useCallback(async () => {
      if (closingRef.current) {
        return;
      }

      if (isClearing) {
        return;
      }

      closingRef.current = true;

      if (
        saveState === "saved" ||
        saveState === "error"
      ) {
        onClose();
        return;
      }

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
    }, [
      flushSave,
      isClearing,
      item,
      onClose,
      saveState,
    ]);

  useEffect(() => {
    function handleKeyboard(
      event: KeyboardEvent,
    ) {
      if (!open) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        void handleClose();
        return;
      }

      if (
        (event.metaKey ||
          event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (
          !busy &&
          saveState !== "saving" &&
          !isClearing
        ) {
          void finish();
        }
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyboard,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyboard,
      );
    };
  }, [
    busy,
    finish,
    handleClose,
    isClearing,
    open,
    saveState,
  ]);

  const isImage =
    item?.type === "photo";

  const isVideo =
    isYouTubeVideo(item);

  const isLink =
    item?.type === "link" ||
    item?.type === "video" ||
    linkMode;

  const isParsing =
    saveState === "saving" &&
    isLink &&
    !linkPreview;

  const youtubeMetadata =
    getYouTubeMetadata(
      item?.metadata,
    );

  const isPublishing =
    saveState === "publishing";

  const canPost =
    Boolean(item) &&
    !busy &&
    saveState !== "saving" &&
    !isClearing &&
    (
      item?.type === "video"
        ? Boolean(
            item.source_url &&
              getYouTubeMetadata(
                item.metadata,
              ),
          )
        : item?.type === "link"
          ? Boolean(item.source_url)
          : item?.type === "photo"
            ? Boolean(
                item.metadata ||
                  imagePreview,
              )
            : Boolean(
                bodyMd.trim(),
              )
    );

  const canClear =
    item !== null &&
    item.status === "draft" &&
    !isClearing &&
    saveState !== "creating" &&
    saveState !== "loading" &&
    saveState !== "publishing";

  const mode =
    item?.type === "photo"
      ? "photo"
      : item?.type === "video"
        ? "video"
        : item?.type === "link" ||
            linkMode
          ? "link"
          : "text";

  const isInitializing =
    saveState === "creating" ||
    saveState === "loading";

  return {
    item,

    bodyMd,
    setBodyMd: handleBodyChange,

    title,
    setTitle,

    saveState,
    error,

    linkMode,
    linkUrl,
    setLinkUrl,
    linkPreview,

    imageName,
    imagePreview,

    youtubeMetadata,

    fileRef,
    textareaRef,

    isEditing,
    busy,

    mode,
    isInitializing,

    isImage,
    isVideo,
    isLink,
    isParsing,

    isPublishing,
    isClearing,

    canPost,
    canClear,
    clearDisabled: !canClear,

    setError,

    handleBodyChange,
    handlePaste,

    parseLink,

    uploadImage,
    handleImageUpload,

    finish,
    clearDraft,
    handleClose,
  };
}