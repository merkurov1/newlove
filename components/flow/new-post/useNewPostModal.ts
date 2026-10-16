
import { useState, useRef, useEffect, useCallback } from "react";
import type {
  FlowImageAttachment,
  FlowLinkAttachment,
  YouTubeMetadata,
} from "./types";
import {
  isYouTubeVideo,
  isProbablyImageUrl,
  normalizePastedUrl,
} from "./utils";

interface UseNewPostModalParams {
  open: boolean;
  onClose: () => void;
  onCreated?: (item?: any) => void;
  itemId?: string | null;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function extractUrls(text: string): string[] {
  const matches =
    text.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    // Remove common punctuation around pasted URLs.
    const cleaned = match.replace(/[),.;!?}\]]+$/g, "");
    const normalized = normalizePastedUrl(cleaned);

    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

async function readResponse(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function useNewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
}: UseNewPostModalParams) {
  const [item, setItem] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");

  const [links, setLinks] = useState<FlowLinkAttachment[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeMetadata, setYoutubeMetadata] =
    useState<YouTubeMetadata | null>(null);
  const [images, setImages] = useState<FlowImageAttachment[]>([]);

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showYouTubeInput, setShowYouTubeInput] = useState(false);

  const [saveState, setSaveState] = useState<any>("idle");
  const [error, setError] = useState<string | null>(null);

  const [isInitializing, setIsInitializing] = useState(false);
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [isParsingYouTube, setIsParsingYouTube] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = Boolean(itemId);

  const canClear = Boolean(
    title.trim() ||
      bodyMd.trim() ||
      links.length > 0 ||
      youtubeUrl ||
      youtubeMetadata ||
      images.length > 0,
  );

  const canPost = Boolean(
    bodyMd.trim() ||
      links.length > 0 ||
      youtubeUrl ||
      youtubeMetadata ||
      images.length > 0,
  );

  const busy =
    isInitializing ||
    isParsingLink ||
    isParsingYouTube ||
    isUploadingImage ||
    isPublishing ||
    isClearing;

  // Reset the composer when it closes.
  useEffect(() => {
    if (!open) {
      setItem(null);
      setTitle("");
      setBodyMd("");
      setLinks([]);
      setYoutubeUrl("");
      setYoutubeMetadata(null);
      setImages([]);
      setShowLinkInput(false);
      setShowYouTubeInput(false);
      setError(null);
      setSaveState("idle");
      return;
    }

    if (!itemId) {
      setItem({ id: "new" });
      return;
    }

    let cancelled = false;

    async function loadItem() {
      setIsInitializing(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/flow/items/${encodeURIComponent(itemId!)}`,
          { cache: "no-store" },
        );

        const data = await readResponse(res);

        if (!res.ok) {
          throw new Error(data.error || "Failed to load item.");
        }

        const found = data.item;

        if (!found || cancelled) return;

        setItem(found);
        setTitle(found.title || "");
        setBodyMd(found.body_md || "");

        const meta =
          found.metadata && typeof found.metadata === "object"
            ? found.metadata
            : {};

        const youtube = meta.youtube as
          | YouTubeMetadata
          | undefined;

        if (youtube) {
          setYoutubeMetadata(youtube);

          if (youtube.video_id) {
            setYoutubeUrl(
              `https://www.youtube.com/watch?v=${youtube.video_id}`,
            );
          }
        } else if (
          found.source_url &&
          isYouTubeVideo(found.source_url)
        ) {
          setYoutubeUrl(found.source_url);
        } else {
          setYoutubeUrl("");
          setYoutubeMetadata(null);
        }

        // Restore multiple link previews and older single-link records.
        const restoredLinks: FlowLinkAttachment[] = [];
        const rawLinks = Array.isArray(meta.link_previews)
          ? meta.link_previews
          : meta.link_preview
            ? [meta.link_preview]
            : [];

        for (const raw of rawLinks) {
          if (!raw || typeof raw !== "object") continue;

          const preview = raw as Record<string, any>;
          const url =
            typeof preview.url === "string"
              ? preview.url
              : "";

          if (!url) continue;

          restoredLinks.push({
            id: makeId("link"),
            url,
            preview: {
              url,
              title: preview.title || url,
              description: preview.description,
              image: preview.image,
              site_name: preview.site_name,
              favicon: preview.favicon,
              domain: preview.domain,
            },
          });
        }

        if (
          restoredLinks.length === 0 &&
          found.source_url &&
          !isYouTubeVideo(found.source_url)
        ) {
          restoredLinks.push({
            id: makeId("link"),
            url: found.source_url,
            preview: {
              url: found.source_url,
              title: found.source_url,
            },
          });
        }

        setLinks(restoredLinks);

        // Support both the current array format and legacy image fields.
        const rawImages = Array.isArray(meta.images)
          ? meta.images
          : [
              meta.public_url,
              meta.image,
              meta.image_url,
              meta.og_image,
            ].filter(Boolean);

        const restoredImages: FlowImageAttachment[] = [];

        for (const raw of rawImages) {
          let url = "";
          let name = "";

          if (typeof raw === "string") {
            url = raw.trim();
          } else if (raw && typeof raw === "object") {
            const value = raw as Record<string, unknown>;

            if (typeof value.url === "string") {
              url = value.url.trim();
            }

            if (typeof value.name === "string") {
              name = value.name;
            }
          }

          if (!url) continue;

          if (
            !restoredImages.some((image) => image.url === url)
          ) {
            restoredImages.push({
              id: makeId("image"),
              url,
              name: name || `Image ${restoredImages.length + 1}`,
            });
          }
        }

        if (!cancelled) {
          setImages(restoredImages);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            "[useNewPostModal] Failed to load item:",
            err,
          );
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load post for editing.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    }

    void loadItem();

    return () => {
      cancelled = true;
    };
  }, [open, itemId]);

  const uploadImageFile = useCallback(
    async (file: File): Promise<FlowImageAttachment> => {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await readResponse(res);

      if (!res.ok || !data.success || !data.file?.url) {
        throw new Error(
          data.error || `Failed to upload ${file.name}.`,
        );
      }

      return {
        id: makeId("image"),
        url: data.file.url,
        name: file.name || "Uploaded image",
        file,
      };
    },
    [],
  );

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) return;

    setIsUploadingImage(true);
    setError(null);

    const uploaded: FlowImageAttachment[] = [];
    const failures: string[] = [];

    try {
      // Upload sequentially to avoid overloading the upload endpoint.
      for (const file of selectedFiles) {
        try {
          const attachment = await uploadImageFile(file);
          uploaded.push(attachment);
        } catch (err) {
          failures.push(
            err instanceof Error
              ? err.message
              : `Failed to upload ${file.name}.`,
          );
        }
      }

      // Keep successful uploads even when another file fails.
      if (uploaded.length > 0) {
        setImages((prev) => {
          const existingUrls = new Set(
            prev.map((image) => image.url),
          );

          return [
            ...prev,
            ...uploaded.filter(
              (image) => !existingUrls.has(image.url),
            ),
          ];
        });
      }

      if (failures.length > 0) {
        setError(
          `${uploaded.length} image(s) uploaded. ${failures.join(" ")}`,
        );
      }
    } finally {
      setIsUploadingImage(false);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id));
  };

  const removeYouTube = () => {
    setYoutubeUrl("");
    setYoutubeMetadata(null);
    setShowYouTubeInput(false);
  };

  const removeLink = (id: string) => {
    setLinks((prev) => prev.filter((link) => link.id !== id));
  };

  const parseLink = useCallback(async (url: string) => {
    const normalized = normalizePastedUrl(url);

    if (!normalized) {
      setError("Please enter a valid http or https URL.");
      return;
    }

    if (isProbablyImageUrl(normalized)) {
      setImages((prev) =>
        prev.some((image) => image.url === normalized)
          ? prev
          : [
              ...prev,
              {
                id: makeId("image-url"),
                url: normalized,
                name: "Linked image",
              },
            ],
      );
      setShowLinkInput(false);
      return;
    }

    if (isYouTubeVideo(normalized)) {
      await parseYouTube(normalized);
      return;
    }

    setIsParsingLink(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/flow/parse-url?url=${encodeURIComponent(normalized)}`,
      );
      const data = await readResponse(res);

      if (!res.ok) {
        throw new Error(data.error || "Could not fetch link preview.");
      }

      const finalUrl = data.url || normalized;

      setLinks((prev) => {
        if (prev.some((link) => link.url === finalUrl)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: makeId("link"),
            url: finalUrl,
            preview: {
              url: finalUrl,
              title: data.title || finalUrl,
              description: data.description,
              image: data.image,
              site_name: data.site_name,
              favicon: data.favicon,
              domain: data.domain,
            },
          },
        ];
      });

      setShowLinkInput(false);
    } catch (err) {
      // Keep the URL as an attachment even if preview parsing fails.
      console.warn("[useNewPostModal] Link preview failed:", err);

      setLinks((prev) =>
        prev.some((link) => link.url === normalized)
          ? prev
          : [
              ...prev,
              {
                id: makeId("link"),
                url: normalized,
                preview: {
                  url: normalized,
                  title: normalized,
                },
              },
            ],
      );

      setShowLinkInput(false);
    } finally {
      setIsParsingLink(false);
    }
  }, []);

  const parseYouTube = useCallback(async (url: string) => {
    const normalized = normalizePastedUrl(url);

    if (!normalized || !isYouTubeVideo(normalized)) {
      setError("Please enter a valid YouTube video URL.");
      return;
    }

    setIsParsingYouTube(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/flow/parse-url?url=${encodeURIComponent(normalized)}`,
      );
      const data = await readResponse(res);

      if (!res.ok || !data.youtube) {
        throw new Error(
          data.error || "Could not load YouTube video information.",
        );
      }

      setYoutubeMetadata(data.youtube);
      setYoutubeUrl(data.url || normalized);
      setShowYouTubeInput(false);
    } catch (err) {
      console.warn("[useNewPostModal] YouTube parse failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load YouTube video. Check the URL.",
      );
    } finally {
      setIsParsingYouTube(false);
    }
  }, []);

  const handlePaste = async (event: React.ClipboardEvent) => {
    const clipboardItems = Array.from(
      event.clipboardData?.items || [],
    );

    const imageFiles: File[] = [];

    for (const clipboardItem of clipboardItems) {
      if (!clipboardItem.type.startsWith("image/")) continue;

      const file = clipboardItem.getAsFile();

      if (file) imageFiles.push(file);
    }

    if (imageFiles.length > 0) {
      event.preventDefault();
      setIsUploadingImage(true);
      setError(null);

      const uploaded: FlowImageAttachment[] = [];
      const failures: string[] = [];

      try {
        // Process every image in the clipboard, not just the first.
        for (const file of imageFiles) {
          try {
            uploaded.push(await uploadImageFile(file));
          } catch (err) {
            failures.push(
              err instanceof Error
                ? err.message
                : "Failed to upload a pasted image.",
            );
          }
        }

        if (uploaded.length > 0) {
          setImages((prev) => {
            const existingUrls = new Set(
              prev.map((image) => image.url),
            );

            return [
              ...prev,
              ...uploaded.filter(
                (image) => !existingUrls.has(image.url),
              ),
            ];
          });
        }

        if (failures.length > 0) {
          setError(
            `${uploaded.length} image(s) uploaded. ${failures.join(" ")}`,
          );
        }
      } finally {
        setIsUploadingImage(false);
      }

      return;
    }

    const pastedText =
      event.clipboardData?.getData("text/plain")?.trim() || "";

    const urls = extractUrls(pastedText);

    if (urls.length === 0) return;

    // Prevent URLs from being inserted as plain text when they are
    // being interpreted as attachments. Preserve ordinary prose.
    const textContainsOnlyUrls = pastedText
      .replace(/https?:\/\/[^\s<>"'`]+/gi, "")
      .replace(/[\s),.;!?}\]]+/g, "")
      .length === 0;

    if (!textContainsOnlyUrls) return;

    event.preventDefault();

    for (const url of urls) {
      if (isProbablyImageUrl(url)) {
        setImages((prev) =>
          prev.some((image) => image.url === url)
            ? prev
            : [
                ...prev,
                {
                  id: makeId("image-url"),
                  url,
                  name: "Linked image",
                },
              ],
        );
      } else if (isYouTubeVideo(url)) {
        // The composer supports one YouTube attachment at a time.
        // Keep the first video and process other URLs as links.
        if (!youtubeUrl && !youtubeMetadata) {
          await parseYouTube(url);
        } else {
          await parseLink(url);
        }
      } else {
        await parseLink(url);
      }
    }
  };

  const finish = useCallback(async () => {
    if (!canPost || busy) return;

    setIsPublishing(true);
    setError(null);
    setSaveState("publishing");

    try {
      const imageUrls = Array.from(
        new Set(
          images
            .map((image) => image.url.trim())
            .filter(Boolean),
        ),
      );

      const metadata: Record<string, unknown> = {
        ...(item?.metadata &&
        typeof item.metadata === "object"
          ? item.metadata
          : {}),
      };

      if (imageUrls.length > 0) {
        metadata.images = imageUrls;
        // Legacy fields keep older renderers working.
        metadata.image = imageUrls[0];
        metadata.public_url = imageUrls[0];
      } else {
        delete metadata.images;
        delete metadata.image;
        delete metadata.public_url;
        delete metadata.image_url;
      }

      if (youtubeMetadata) {
        metadata.youtube = youtubeMetadata;
      } else {
        delete metadata.youtube;
      }

      const linkPreviews = links.map((link) => ({
        ...link.preview,
        url: link.url,
      }));

      if (linkPreviews.length > 0) {
        metadata.link_previews = linkPreviews;
        metadata.link_preview = linkPreviews[0];
      } else {
        delete metadata.link_previews;
        delete metadata.link_preview;
      }

      const primarySourceUrl =
        links[0]?.url ||
        (youtubeMetadata?.video_id
          ? `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`
          : youtubeUrl || null);

      const determinedType =
        bodyMd.trim().length > 180
          ? "article"
          : youtubeMetadata || youtubeUrl
            ? "video"
            : imageUrls.length > 0
              ? "photo"
              : links.length > 0
                ? "link"
                : "note";

      const postTitle =
        (isEditing && title.trim() ? title.trim() : null) ||
        linkPreviews[0]?.title ||
        youtubeMetadata?.title ||
        null;

      const payload = {
        title: postTitle,
        body_md: bodyMd,
        source_url: primarySourceUrl,
        type: determinedType,
        status: "published",
        visibility: "public",
        metadata,
      };

      const endpoint =
        isEditing && itemId
          ? `/api/flow/items/${encodeURIComponent(itemId)}`
          : "/api/flow/items";

      const res = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await readResponse(res);

      if (!res.ok || data.error) {
        throw new Error(
          data.error ||
            data.details ||
            "Failed to save Flow post.",
        );
      }

      setSaveState("saved");
      onCreated?.(data.item);
      onClose();
    } catch (err) {
      console.error("[useNewPostModal] Save error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to publish Flow post.",
      );

      setSaveState("idle");
    } finally {
      setIsPublishing(false);
    }
  }, [
    canPost,
    busy,
    images,
    item,
    youtubeMetadata,
    youtubeUrl,
    links,
    bodyMd,
    title,
    isEditing,
    itemId,
    onCreated,
    onClose,
  ]);

  const clearDraft = async () => {
    setIsClearing(true);

    try {
      setTitle("");
      setBodyMd("");
      setLinks([]);
      setYoutubeUrl("");
      setYoutubeMetadata(null);
      setImages([]);
      setShowLinkInput(false);
      setShowYouTubeInput(false);
      setError(null);
    } finally {
      setIsClearing(false);
    }
  };

  const handleClose = useCallback(async () => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busy) return;

        event.preventDefault();
        void handleClose();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        if (busy || isClearing) return;

        event.preventDefault();
        void finish();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, finish, handleClose, isClearing, open]);

  return {
    item,
    title,
    setTitle,
    bodyMd,
    setBodyMd,
    links,
    parseLink,
    removeLink,
    showLinkInput,
    setShowLinkInput,
    youtubeUrl,
    setYoutubeUrl,
    youtubeMetadata,
    parseYouTube,
    removeYouTube,
    showYouTubeInput,
    setShowYouTubeInput,
    images,
    removeImage,
    handleImageUpload,
    saveState,
    error,
    isInitializing,
    isParsingLink,
    isParsingYouTube,
    isUploadingImage,
    isPublishing,
    isClearing,
    isEditing,
    canClear,
    canPost,
    busy,
    fileRef,
    textareaRef,
    handlePaste,
    finish,
    clearDraft,
    handleClose,
  };
}
