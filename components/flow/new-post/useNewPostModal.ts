
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

export const LAST_DRAFT_KEY = "flow:last-draft-id";
export const AUTOSAVE_INTERVAL = 10_000;

function readJson(response: Response): Promise<Record<string, any>> {
  return response.json().catch(() => ({}));
}

function firstLine(value: string): string {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
      .find(Boolean)
      ?.slice(0, 160) || "Flow post"
  );
}

function slugify(value: string, id: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return slug || `post-${id.slice(0, 8)}`;
}

function withFlowMetadata(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> {
  const current =
    metadata && typeof metadata === "object" ? metadata : {};

  const flow =
    current.flow && typeof current.flow === "object"
      ? current.flow as Record<string, unknown>
      : {};

  return {
    ...current,
    flow: {
      ...flow,
      queued_at: new Date().toISOString(),
    },
  };
}

export function normalizePastedUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed || /\s/.test(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname.includes(".")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function getYouTubeMetadata(
  metadata?: Record<string, unknown> | null,
): YouTubeMetadata | null {
  const youtube = metadata?.youtube;

  if (!youtube || typeof youtube !== "object") return null;

  return youtube as YouTubeMetadata;
}

export function isYouTubeVideo(item: Item | null): boolean {
  return (
    item?.type === "video" &&
    Boolean(getYouTubeMetadata(item.metadata))
  );
}

function isDraft(item: Item | null): boolean {
  return item?.status === "draft";
}

function extractUrlFromText(value: string): string | null {
  const match = value.match(
    /(?:https?:\/\/|www\.)[^\s<>"']+/i,
  );

  if (!match) return null;

  // Remove common punctuation accidentally included at the end.
  const candidate = match[0].replace(/[),.;!?]+$/, "");

  return normalizePastedUrl(candidate);
}

export function useNewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
}: NewPostModalProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [bodyMd, setBodyMdState] = useState("");
  const [title, setTitleState] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("creating");
  const [error, setError] = useState<string | null>(null);

  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreview, setLinkPreview] =
    useState<Record<string, unknown> | null>(null);

  const [imageName, setImageName] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(Boolean(itemId));
  const [isClearing, setIsClearing] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const latestRef = useRef({ bodyMd: "", title: "" });
  const itemRef = useRef<Item | null>(null);
  const mountedRef = useRef(false);
  const closingRef = useRef(false);
  const initializingRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const operationPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastSavedRef = useRef({ bodyMd: "", title: "" });

  const setCurrentItem = useCallback((next: Item | null) => {
    itemRef.current = next;
    setItem(next);
  }, []);

  const setBodyMd = useCallback((value: string) => {
    latestRef.current.bodyMd = value;
    setBodyMdState(value);
  }, []);

  const setTitle = useCallback((value: string) => {
    latestRef.current.title = value;
    setTitleState(value);
  }, []);

  const busy =
    saveState === "creating" ||
    saveState === "loading" ||
    saveState === "publishing" ||
    isClearing;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetLocalState = useCallback(
    (next: Item | null) => {
      const nextBody = next?.body_md ?? "";
      const nextTitle = next?.title ?? "";

      setCurrentItem(next);
      setBodyMdState(nextBody);
      setTitleState(nextTitle);

      latestRef.current = {
        bodyMd: nextBody,
        title: nextTitle,
      };

      lastSavedRef.current = {
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
    [setCurrentItem],
  );

  const createFreshDraft = useCallback(async (): Promise<boolean> => {
    setSaveState("creating");
    setError(null);

    const response = await fetch("/api/admin/items/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        title: "",
        body_md: "",
        lang: "ru",
        metadata: { flow: { mode: "direct" } },
      }),
    });

    const json = await readJson(response);

    if (!response.ok || !json.item) {
      throw new Error(json.error || "Could not create draft.");
    }

    const fresh = json.item as Item;

    window.localStorage.setItem(LAST_DRAFT_KEY, fresh.id);

    if (!mountedRef.current) return false;

    resetLocalState(fresh);

    requestAnimationFrame(() => textareaRef.current?.focus());

    return true;
  }, [resetLocalState]);

  const initialize = useCallback(async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;

    try {
      let loaded: Item | null = null;

      if (itemId) {
        setIsEditing(true);
        setSaveState("loading");

        const response = await fetch(`/api/admin/items/${itemId}`, {
          cache: "no-store",
        });

        const json = await readJson(response);

        if (!response.ok || !json.item) {
          throw new Error(json.error || "Could not load item.");
        }

        loaded = json.item as Item;
      } else {
        setIsEditing(false);

        const draftId = window.localStorage.getItem(LAST_DRAFT_KEY);

        if (draftId) {
          setSaveState("loading");

          const response = await fetch(`/api/admin/items/${draftId}`, {
            cache: "no-store",
          });

          const json = await readJson(response);

          if (response.ok && json.item?.status === "draft") {
            loaded = json.item as Item;
          } else {
            window.localStorage.removeItem(LAST_DRAFT_KEY);
          }
        }

        if (!loaded) {
          await createFreshDraft();
          return;
        }
      }

      if (!loaded || !mountedRef.current) return;

      resetLocalState(loaded);

      if (loaded.type === "link" || loaded.type === "video") {
        setLinkMode(true);
        setLinkUrl(loaded.source_url ?? "");
        setLinkPreview(loaded.metadata ?? null);
      }

      if (loaded.type === "photo") {
        const metadata = loaded.metadata ?? {};

        setImagePreview(
          typeof metadata.public_url === "string"
            ? metadata.public_url
            : null,
        );

        setImageName(
          typeof metadata.filename === "string"
            ? metadata.filename
            : null,
        );
      }

      requestAnimationFrame(() => textareaRef.current?.focus());
    } finally {
      initializingRef.current = false;
    }
  }, [createFreshDraft, itemId, resetLocalState]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void initialize().catch((cause: unknown) => {
      if (cancelled || !mountedRef.current) return;

      setError(
        cause instanceof Error ? cause.message : "Initialization failed.",
      );
      setSaveState("error");
    });

    return () => {
      cancelled = true;

      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
    // One initialization per modal opening/item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId]);

  const saveDraft = useCallback(
    async (changes: Record<string, unknown>): Promise<boolean> => {
      const current = itemRef.current;

      if (!current) return false;
      if (current.status !== "draft" || isClearing) return false;

      try {
        const response = await fetch(`/api/admin/items/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });

        const json = await readJson(response);

        if (!response.ok) {
          throw new Error(json.error || "Could not save draft.");
        }

        if (!mountedRef.current) return true;

        if (json.item) setCurrentItem(json.item as Item);

        lastSavedRef.current = {
          bodyMd:
            typeof changes.body_md === "string"
              ? changes.body_md
              : latestRef.current.bodyMd,
          title:
            typeof changes.title === "string"
              ? changes.title
              : latestRef.current.title,
        };

        setSaveState("saved");
        setError(null);
        return true;
      } catch (cause) {
        if (mountedRef.current) {
          setError(
            cause instanceof Error ? cause.message : "Could not save draft.",
          );
          setSaveState("error");
        }

        return false;
      }
    },
    [isClearing, setCurrentItem],
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    const current = itemRef.current;

    if (!current || current.status !== "draft") return true;
    if (isClearing) return false;

    if (savePromiseRef.current) {
      await savePromiseRef.current;
    }

    const latest = latestRef.current;
    const saved = lastSavedRef.current;

    if (
      latest.bodyMd === saved.bodyMd &&
      latest.title === saved.title
    ) {
      return true;
    }

    const promise = saveDraft({
      body_md: latest.bodyMd,
      title: latest.title,
    });

    savePromiseRef.current = promise;

    try {
      return await promise;
    } finally {
      if (savePromiseRef.current === promise) {
        savePromiseRef.current = null;
      }
    }
  }, [isClearing, saveDraft]);

  useEffect(() => {
    if (!open || !item || item.status !== "draft") return;

    const timer = window.setInterval(() => {
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

      const latest = latestRef.current;
      const saved = lastSavedRef.current;

      if (
        latest.bodyMd === saved.bodyMd &&
        latest.title === saved.title
      ) {
        return;
      }

      const promise = saveDraft({
        body_md: latest.bodyMd,
        title: latest.title,
      });

      savePromiseRef.current = promise;

      void promise.finally(() => {
        if (savePromiseRef.current === promise) {
          savePromiseRef.current = null;
        }
      });
    }, AUTOSAVE_INTERVAL);

    return () => window.clearInterval(timer);
  }, [item, isClearing, open, saveDraft, saveState]);

  const trackOperation = useCallback(
    async (operation: Promise<boolean>): Promise<boolean> => {
      operationPromiseRef.current = operation;

      try {
        return await operation;
      } finally {
        if (operationPromiseRef.current === operation) {
          operationPromiseRef.current = null;
        }
      }
    },
    [],
  );

  const parseLink = useCallback(
    async (urlOverride?: string): Promise<boolean> => {
      const current = itemRef.current;
      const url = normalizePastedUrl(urlOverride ?? linkUrl);

      if (!current || !url || isClearing) return false;

      setLinkMode(true);
      setLinkUrl(url);
      setError(null);

      const operation = (async (): Promise<boolean> => {
        try {
          setSaveState("saving");

          const response = await fetch("/api/admin/items/parse-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              item_id: current.id,
              url,
            }),
          });

          const json = await readJson(response);

          if (!response.ok || !json.item) {
            throw new Error(json.error || "Could not read link preview.");
          }

          if (!mountedRef.current) return false;

          const parsed = json.item as Item;
          const oldBody = latestRef.current.bodyMd;

          setCurrentItem(parsed);
          setLinkUrl(parsed.source_url ?? url);
          setLinkPreview(json.metadata ?? parsed.metadata ?? null);

          // Preserve the author's existing text if the parser returns
          // metadata or a generated description for the linked page.
          const nextBody =
            oldBody.trim() || parsed.body_md || "";

          setBodyMdState(nextBody);
          setTitleState(parsed.title ?? latestRef.current.title);

          latestRef.current = {
            bodyMd: nextBody,
            title: parsed.title ?? latestRef.current.title,
          };

          setSaveState("saved");
          return true;
        } catch (cause) {
          // Preview is optional. Keep the URL and allow publication.
          if (mountedRef.current) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Preview unavailable. The link can still be posted.",
            );
            setSaveState("error");
          }

          return false;
        }
      })();

      return trackOperation(operation);
    },
    [isClearing, linkUrl, setBodyMd, setCurrentItem, trackOperation],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = event.clipboardData.getData("text");
      const exactUrl = normalizePastedUrl(pasted);

      if (!exactUrl || isClearing) {
        // If the paste includes prose and a URL, keep the entire text
        // in the editor and discover the URL without replacing the prose.
        const embeddedUrl = extractUrlFromText(pasted);

        if (embeddedUrl) {
          setLinkMode(true);
          setLinkUrl(embeddedUrl);
          setLinkPreview(null);
          setError(null);

          window.setTimeout(() => {
            void parseLink(embeddedUrl);
          }, 0);
        }

        return;
      }

      event.preventDefault();

      setLinkMode(true);
      setLinkUrl(exactUrl);
      setLinkPreview(null);
      setError(null);

      void parseLink(exactUrl);
    },
    [isClearing, parseLink],
  );

  const uploadImage = useCallback(
    async (file: File): Promise<boolean> => {
      const current = itemRef.current;

      if (!current || isClearing) return false;

      const operation = (async (): Promise<boolean> => {
        let localPreview: string | null = null;

        try {
          setSaveState("saving");
          setError(null);

          localPreview = URL.createObjectURL(file);
          setImagePreview(localPreview);
          setImageName(file.name);

          const form = new FormData();
          form.append("file", file);
          form.append("item_id", current.id);

          const response = await fetch("/api/admin/items/media", {
            method: "POST",
            body: form,
          });

          const json = await readJson(response);

          if (!response.ok || !json.item) {
            throw new Error(json.error || "Image upload failed.");
          }

          if (!mountedRef.current) return false;

          const uploaded = json.item as Item;
          setCurrentItem(uploaded);

          const publicUrl =
            typeof json.url === "string"
              ? json.url
              : typeof uploaded.metadata?.public_url === "string"
                ? uploaded.metadata.public_url
                : null;

          if (publicUrl) {
            setImagePreview(publicUrl);
            URL.revokeObjectURL(localPreview);
          }

          setBodyMdState(uploaded.body_md ?? latestRef.current.bodyMd);
          setTitleState(uploaded.title ?? latestRef.current.title);

          latestRef.current = {
            bodyMd: uploaded.body_md ?? latestRef.current.bodyMd,
            title: uploaded.title ?? latestRef.current.title,
          };

          setSaveState("saved");
          return true;
        } catch (cause) {
          if (mountedRef.current) {
            setError(
              cause instanceof Error ? cause.message : "Image upload failed.",
            );
            setSaveState("error");
          }

          return false;
        }
      })();

      return trackOperation(operation);
    },
    [isClearing, setCurrentItem, trackOperation],
  );

  const handleImageUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void uploadImage(file);
      event.target.value = "";
    },
    [uploadImage],
  );

  const finish = useCallback(async () => {
    let current = itemRef.current;

    if (
      !current ||
      isClearing ||
      saveState === "publishing"
    ) {
      return;
    }

    try {
      setError(null);
      setSaveState("publishing");

      if (operationPromiseRef.current) {
        await operationPromiseRef.current;
      }

      current = itemRef.current;

      if (!current || isClearing) return;

      // Saving text is required; parsing a URL preview is not.
      if (current.status === "draft") {
        const saved = await flushSave();

        if (!saved) {
          throw new Error("Draft could not be saved.");
        }
      }

      const body = latestRef.current.bodyMd;
      const isVideo = current.type === "video";
      const isPhoto = current.type === "photo";
      const isLink = current.type === "link";

      const youtube = getYouTubeMetadata(current.metadata);
      const sourceUrl =
        current.source_url ||
        normalizePastedUrl(linkUrl) ||
        extractUrlFromText(body);

      if (isPhoto && !current.metadata && !imagePreview) {
        throw new Error("Add an image first.");
      }

      if (
        !isPhoto &&
        !isVideo &&
        !isLink &&
        !body.trim() &&
        !sourceUrl
      ) {
        throw new Error("Write something first.");
      }

      // If the user pasted a URL but metadata lookup failed, still publish
      // the URL as a link rather than making preview availability mandatory.
      const resolvedType =
        isVideo
          ? "video"
          : isPhoto
            ? "photo"
            : isLink || (sourceUrl && !body.trim())
              ? "link"
              : current.type || "note";

      const generatedTitle =
        isVideo
          ? String(youtube?.title || current.title || "YouTube video").slice(0, 160)
          : isPhoto
            ? String(
                (typeof current.metadata?.alt === "string"
                  ? current.metadata.alt
                  : null) ||
                  current.title ||
                  "Image",
              ).slice(0, 160)
            : isLink || (sourceUrl && !body.trim())
              ? String(
                  linkPreview?.title ||
                    current.title ||
                    getDomain(sourceUrl || linkUrl) ||
                    "Link",
                ).slice(0, 160)
              : (current.title?.trim() || firstLine(body)).slice(0, 160);

      const slug =
        current.status === "published" && current.slug
          ? current.slug
          : slugify(generatedTitle || body, current.id);

      const metadata = withFlowMetadata(current.metadata);

      const payload: Record<string, unknown> = {
        title: generatedTitle,
        body_md: body,
        slug,
        metadata,
        status: "published",
        visibility: "public",
      };

      if (sourceUrl) payload.source_url = sourceUrl;
      if (resolvedType) payload.type = resolvedType;

      const response = await fetch(`/api/admin/items/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await readJson(response);

      if (!response.ok || !json.item) {
        throw new Error(
          json.error || `Publishing failed (${response.status}).`,
        );
      }

      window.localStorage.removeItem(LAST_DRAFT_KEY);

      // AI runs after publishing and never blocks the POST flow.
      void fetch(`/api/admin/items/${current.id}/ai`, {
        method: "POST",
      }).catch((cause) => {
        console.warn("[flow] AI context request failed:", cause);
      });

      if (mountedRef.current) setSaveState("saved");

      onCreated?.(json.item as Item);
      onClose();
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error ? cause.message : "Publishing failed.",
        );
        setSaveState("error");
      }
    }
  }, [
    flushSave,
    isClearing,
    linkPreview,
    linkUrl,
    onClose,
    onCreated,
    saveState,
  ]);

  const clearDraft = useCallback(async () => {
    const current = itemRef.current;

    if (!current || !isDraft(current) || isClearing) return;

    setIsClearing(true);
    setSaveState("clearing");
    setError(null);

    try {
      if (operationPromiseRef.current) {
        await operationPromiseRef.current;
      }

      if (savePromiseRef.current) {
        await savePromiseRef.current;
      }

      const response = await fetch(`/api/admin/items/${current.id}`, {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 404) {
        const json = await readJson(response);
        throw new Error(json.error || "Could not clear draft.");
      }

      window.localStorage.removeItem(LAST_DRAFT_KEY);

      if (imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }

      setCurrentItem(null);
      setBodyMdState("");
      setTitleState("");
      latestRef.current = { bodyMd: "", title: "" };
      lastSavedRef.current = { bodyMd: "", title: "" };

      setLinkMode(false);
      setLinkUrl("");
      setLinkPreview(null);
      setImageName(null);
      setImagePreview(null);
      setIsEditing(false);

      await createFreshDraft();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not clear draft.",
      );
      setSaveState("error");
    } finally {
      setIsClearing(false);
    }
  }, [
    createFreshDraft,
    imagePreview,
    isClearing,
    setCurrentItem,
  ]);

  const handleClose = useCallback(async () => {
    if (closingRef.current || isClearing) return;

    closingRef.current = true;

    try {
      const saved = await flushSave();

      if (!saved) {
        closingRef.current = false;
        return;
      }

      onClose();
    } finally {
      closingRef.current = false;
    }
  }, [flushSave, isClearing, onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void handleClose();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (!busy && saveState !== "saving" && !isClearing) {
          void finish();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, finish, handleClose, isClearing, open, saveState]);

  const youtubeMetadata = getYouTubeMetadata(item?.metadata);

  const isImage = item?.type === "photo";
  const isVideo = item?.type === "video";
  const isLink =
    item?.type === "link" ||
    item?.type === "video" ||
    linkMode;

  const isParsing =
    saveState === "saving" &&
    isLink &&
    !linkPreview;

  const isPublishing = saveState === "publishing";

  const canPost =
    Boolean(item) &&
    !busy &&
    saveState !== "saving" &&
    !isClearing &&
    (
      item?.type === "photo"
        ? Boolean(item.metadata || imagePreview)
        : item?.type === "video"
          ? Boolean(item.source_url || linkUrl)
          : item?.type === "link"
            ? Boolean(item.source_url || linkUrl)
            : Boolean(bodyMd.trim() || extractUrlFromText(bodyMd))
    );

  const canClear =
    Boolean(item) &&
    item?.status === "draft" &&
    !isClearing &&
    saveState !== "creating" &&
    saveState !== "loading" &&
    saveState !== "publishing";

  const mode =
    item?.type === "photo"
      ? "photo"
      : item?.type === "video"
        ? "video"
        : item?.type === "link" || linkMode
          ? "link"
          : "text";

  const isInitializing =
    saveState === "creating" || saveState === "loading";

  return {
    item,

    bodyMd,
    setBodyMd,

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

    handleBodyChange: setBodyMd,
    handlePaste,

    parseLink,

    uploadImage,
    handleImageUpload,

    finish,
    clearDraft,
    handleClose,
  };
}
