
import { useState, useRef, useEffect, useCallback } from "react";
import { telegramAuthHeaders } from "@/lib/telegram/clientAuth";
import type {
  FlowImageAttachment,
  FlowLinkAttachment,
  YouTubeMetadata,
} from "./types";
import {
  extractUrlsFromText,
  isYouTubeVideo,
  isProbablyImageUrl,
  normalizeExtractedUrl,
  normalizePastedUrl,
  urlDedupeKey,
} from "./utils";
import { resolveFlowComposerLanguage } from "@/lib/flow/language";

interface UseNewPostModalParams {
  open: boolean;
  onClose: () => void;
  onCreated?: (item?: any, crosspost?: unknown) => void;
  itemId?: string | null;
  lang?: string | null;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function readResponse(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function readStoredLanguageChoice(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem("merkurov.language-choice");
  } catch {
    return null;
  }
}

export function useNewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
  lang,
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
  const [isProofreading, setIsProofreading] = useState(false);
  const [proofreadStatus, setProofreadStatus] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef(bodyMd);
  const proofreadEpochRef = useRef(0);
  const proofreadInFlightRef = useRef(false);

  // Async results must never be written back after the composer was closed,
  // cleared or the attachment they belong to was removed. The counters also
  // keep the existing loading states truthful when requests overlap.
  const linkEpochRef = useRef(0);
  const linkRequestSeqRef = useRef(0);
  const linkRequestsRef = useRef<Map<string, number>>(new Map());
  const suppressedLinkKeysRef = useRef<Set<string>>(new Set());
  const pendingLinkParsesRef = useRef<Set<number>>(new Set());
  const youtubeRequestSeqRef = useRef(0);
  const pendingYouTubeParsesRef = useRef<Set<number>>(new Set());
  const uploadEpochRef = useRef(0);
  const uploadSeqRef = useRef(0);
  const pendingUploadsRef = useRef<Set<number>>(new Set());

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

  const canProofread = Boolean(bodyMd.trim()) && !busy && !isProofreading;

  // Keep a synchronous copy of the draft so a proofread response can be
  // compared with the latest author edits without waiting for a render.
  useEffect(() => {
    bodyRef.current = bodyMd;
  }, [bodyMd]);

  // The status is deliberately quiet and transient; it disappears on its own
  // and never locks or reflows the composer.
  useEffect(() => {
    if (!proofreadStatus) return;

    const timer = window.setTimeout(() => setProofreadStatus(null), 5_000);

    return () => window.clearTimeout(timer);
  }, [proofreadStatus]);

  // Reset the composer when it closes.
  useEffect(() => {
    if (!open) {
      // Invalidate every request that may still be running so its result
      // cannot repopulate the next composer session.
      linkEpochRef.current += 1;
      youtubeRequestSeqRef.current += 1;
      uploadEpochRef.current += 1;
      proofreadEpochRef.current += 1;
      proofreadInFlightRef.current = false;
      linkRequestsRef.current.clear();
      suppressedLinkKeysRef.current.clear();
      pendingLinkParsesRef.current.clear();
      pendingYouTubeParsesRef.current.clear();
      pendingUploadsRef.current.clear();

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
      setIsInitializing(false);
      setIsParsingLink(false);
      setIsParsingYouTube(false);
      setIsUploadingImage(false);
      setIsPublishing(false);
      setIsClearing(false);
      setIsProofreading(false);
      setProofreadStatus(null);
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
          { cache: "no-store", ...(Object.keys(telegramAuthHeaders()).length
            ? { headers: telegramAuthHeaders() }
            : {}) },
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

        // Restore current and legacy link records. `metadata.links` is still
        // produced by older Flow versions and must survive an edit instead of
        // being dropped when the composer writes its complete metadata object.
        const restoredLinks: FlowLinkAttachment[] = [];
        const restoredLinkKeys = new Set<string>();
        const rawLinks = Array.isArray(meta.link_previews)
          ? meta.link_previews
          : Array.isArray(meta.linkPreviews)
            ? meta.linkPreviews
            : meta.link_preview
              ? [meta.link_preview]
              : meta.linkPreview
                ? [meta.linkPreview]
                : [];
        const legacyLinks = Array.isArray(meta.links) ? meta.links : [];

        const addRestoredLink = (raw: unknown) => {
          let preview: Record<string, any> = {};
          let urlInput = "";

          if (typeof raw === "string") {
            urlInput = raw;
          } else if (raw && typeof raw === "object") {
            preview = raw as Record<string, any>;
            urlInput =
              typeof preview.url === "string" ? preview.url : "";
          }

          const url = normalizeExtractedUrl(urlInput);

          if (!url) return;

          const key = urlDedupeKey(url);

          if (restoredLinkKeys.has(key)) return;

          restoredLinkKeys.add(key);
          restoredLinks.push({
            id: makeId("link"),
            url,
            preview: {
              ...preview,
              url,
              title:
                typeof preview.title === "string" && preview.title.trim()
                  ? preview.title
                  : url,
            },
          });
        };

        for (const raw of rawLinks) addRestoredLink(raw);
        for (const raw of legacyLinks) addRestoredLink(raw);

        if (
          found.source_url &&
          !isYouTubeVideo(found.source_url)
        ) {
          const sourceUrl = normalizeExtractedUrl(found.source_url);

          if (
            sourceUrl &&
            !restoredLinkKeys.has(urlDedupeKey(sourceUrl))
          ) {
            restoredLinks.push({
              id: makeId("link"),
              url: sourceUrl,
              preview: {
                url: sourceUrl,
                title: sourceUrl,
              },
            });
          }
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
        ...(Object.keys(telegramAuthHeaders()).length
          ? { headers: telegramAuthHeaders() }
          : {}),
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

  const beginImageUpload = () => {
    const uploadId = ++uploadSeqRef.current;

    pendingUploadsRef.current.add(uploadId);
    setIsUploadingImage(true);

    return uploadId;
  };

  const endImageUpload = (uploadId: number) => {
    pendingUploadsRef.current.delete(uploadId);
    setIsUploadingImage(pendingUploadsRef.current.size > 0);
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files || []);

    if (selectedFiles.length === 0) return;

    const epoch = uploadEpochRef.current;
    const uploadId = beginImageUpload();
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

      if (epoch !== uploadEpochRef.current) return;

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
      endImageUpload(uploadId);

      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id));
  };

  const removeYouTube = () => {
    // A parse that is still in flight belongs to the attachment being removed.
    youtubeRequestSeqRef.current += 1;
    pendingYouTubeParsesRef.current.clear();
    setIsParsingYouTube(false);
    setYoutubeUrl("");
    setYoutubeMetadata(null);
    setShowYouTubeInput(false);
  };

  const removeLink = (id: string) => {
    const removed = links.find((link) => link.id === id);

    if (removed) {
      // Remember the destination so an older parse response cannot restore an
      // attachment the author has just deleted.
      suppressedLinkKeysRef.current.add(urlDedupeKey(removed.url));
    }

    setLinks((prev) => prev.filter((link) => link.id !== id));
  };

  const parseLink = useCallback(async (url: string, options?: { forceLink?: boolean }) => {
    const normalized = normalizeExtractedUrl(url) ?? normalizePastedUrl(url);

    if (!normalized) {
      setError('Please enter a valid http or https URL.');
      return;
    }

    if (isProbablyImageUrl(normalized)) {
      setImages((prev) =>
        prev.some((image) => image.url === normalized)
          ? prev
          : [
              ...prev,
              {
                id: makeId('image-url'),
                url: normalized,
                name: 'Linked image',
              },
            ]
      );
      setShowLinkInput(false);
      return;
    }

    if (!options?.forceLink && isYouTubeVideo(normalized)) {
      await parseYouTube(normalized);
      return;
    }

    const epoch = linkEpochRef.current;
    const requestKey = urlDedupeKey(normalized);
    const requestId = ++linkRequestSeqRef.current;

    // A repeated parse of the same destination supersedes the previous one,
    // while parses of different destinations may still settle independently.
    linkRequestsRef.current.set(requestKey, requestId);
    suppressedLinkKeysRef.current.delete(requestKey);

    const isCurrent = () =>
      epoch === linkEpochRef.current && linkRequestsRef.current.get(requestKey) === requestId;

    pendingLinkParsesRef.current.add(requestId);
    setIsParsingLink(true);
    setError(null);

    try {
      const parseUrl = `/api/flow/parse-url?url=${encodeURIComponent(normalized)}`;
      const authHeaders = telegramAuthHeaders();
      const res = Object.keys(authHeaders).length
        ? await fetch(parseUrl, { headers: authHeaders })
        : await fetch(parseUrl);
      const data = await readResponse(res);

      if (!isCurrent()) return;

      if (!res.ok) {
        throw new Error(data.error || 'Could not fetch link preview.');
      }

      // The parser may return a canonical destination. Keep it only when it
      // is still a safe HTTP(S) URL; otherwise retain the author's URL.
      const finalUrl =
        normalizeExtractedUrl(typeof data.url === 'string' ? data.url : '') ?? normalized;
      const finalKey = urlDedupeKey(finalUrl);

      if (
        suppressedLinkKeysRef.current.has(requestKey) ||
        suppressedLinkKeysRef.current.has(finalKey)
      ) {
        return;
      }

      setLinks((prev) => {
        if (prev.some((link) => urlDedupeKey(link.url) === finalKey)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: makeId('link'),
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
      if (!isCurrent()) return;

      // Keep the URL as an attachment even if preview parsing fails.
      console.warn('[useNewPostModal] Link preview failed:', err);

      if (suppressedLinkKeysRef.current.has(requestKey)) return;

      const fallbackKey = urlDedupeKey(normalized);

      setLinks((prev) =>
        prev.some((link) => urlDedupeKey(link.url) === fallbackKey)
          ? prev
          : [
              ...prev,
              {
                id: makeId('link'),
                url: normalized,
                preview: {
                  url: normalized,
                  title: normalized,
                },
              },
            ]
      );

      setShowLinkInput(false);
    } finally {
      if (linkRequestsRef.current.get(requestKey) === requestId) {
        linkRequestsRef.current.delete(requestKey);
      }

      pendingLinkParsesRef.current.delete(requestId);
      setIsParsingLink(pendingLinkParsesRef.current.size > 0);
    }
  }, []);

  const parseYouTube = useCallback(async (url: string) => {
    const normalized = normalizeExtractedUrl(url) ?? normalizePastedUrl(url);

    if (!normalized || !isYouTubeVideo(normalized)) {
      setError('Please enter a valid YouTube video URL.');
      return;
    }

    // Only the most recently started video request may update the composer.
    const requestId = ++youtubeRequestSeqRef.current;

    pendingYouTubeParsesRef.current.add(requestId);
    setIsParsingYouTube(true);
    setError(null);

    try {
      const parseUrl = `/api/flow/parse-url?url=${encodeURIComponent(normalized)}`;
      const authHeaders = telegramAuthHeaders();
      const res = Object.keys(authHeaders).length
        ? await fetch(parseUrl, { headers: authHeaders })
        : await fetch(parseUrl);
      const data = await readResponse(res);

      if (requestId !== youtubeRequestSeqRef.current) return;

      if (!res.ok || !data.youtube) {
        throw new Error(data.error || 'Could not load YouTube video information.');
      }

      setYoutubeMetadata(data.youtube);
      setYoutubeUrl(data.url || normalized);
      setShowYouTubeInput(false);
    } catch (err) {
      if (requestId !== youtubeRequestSeqRef.current) return;

      console.warn('[useNewPostModal] YouTube parse failed:', err);

      setError(err instanceof Error ? err.message : 'Failed to load YouTube video. Check the URL.');
    } finally {
      pendingYouTubeParsesRef.current.delete(requestId);
      setIsParsingYouTube(pendingYouTubeParsesRef.current.size > 0);
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
      const epoch = uploadEpochRef.current;
      const uploadId = beginImageUpload();
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

        if (epoch !== uploadEpochRef.current) return;

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
        endImageUpload(uploadId);
      }

      return;
    }

    const pastedText =
      event.clipboardData?.getData("text/plain") || "";

    const { urls, textWithoutUrls: extractedText } =
      extractUrlsFromText(pastedText);

    if (urls.length === 0) return;

    // We have found one or more URLs. Handle them as attachments while
    // preserving the author's surrounding prose and punctuation.
    event.preventDefault();

    const textWithoutUrls = extractedText.replace(/[ \t]{2,}/g, " ");

    const textarea = textareaRef.current;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = textarea.value;

      const nextText =
        currentText.slice(0, start) +
        textWithoutUrls +
        currentText.slice(end);

      setBodyMd(nextText);

      // Restore the caret after React updates the controlled textarea.
      const nextCaret = start + textWithoutUrls.length;

      requestAnimationFrame(() => {
        const currentTextarea = textareaRef.current;

        if (currentTextarea) {
          currentTextarea.focus();
          currentTextarea.setSelectionRange(nextCaret, nextCaret);
        }
      });
    } else if (textWithoutUrls) {
      setBodyMd((prev) => prev + textWithoutUrls);
    }

    // Capture the current attachment once: state updates inside this loop do
    // not refresh the closure, so a local flag keeps the first video.
    let hasYouTubeAttachment = Boolean(youtubeUrl || youtubeMetadata);

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
        if (!hasYouTubeAttachment) {
          hasYouTubeAttachment = true;
          await parseYouTube(url);
        } else {
          await parseLink(url, { forceLink: true });
        }
      } else {
        await parseLink(url);
      }
    }
  };

  const finish = useCallback(async () => {
    if (!canPost || busy) return;

    // Publishing takes the body snapshot below. Cancel an in-flight proofread
    // so its late result cannot land in a composer that is already posting.
    proofreadEpochRef.current += 1;
    proofreadInFlightRef.current = false;
    setIsProofreading(false);
    setProofreadStatus(null);

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
        delete metadata.imageUrl;
        delete metadata.og_image;
        delete metadata.ogImage;
        delete metadata.thumbnail_url;
        delete metadata.thumbnailUrl;
      }

      if (youtubeMetadata) {
        metadata.youtube = youtubeMetadata;
      } else {
        delete metadata.youtube;
      }

      // Normalize once more at the serialization boundary. Unsafe or invalid
      // links are dropped, and the same destination cannot be written twice
      // because of a trailing slash or surrounding punctuation.
      const serializedLinks: FlowLinkAttachment[] = [];
      const serializedLinkKeys = new Set<string>();

      for (const link of links) {
        const url = normalizeExtractedUrl(link.url);

        if (!url) continue;

        const key = urlDedupeKey(url);

        if (serializedLinkKeys.has(key)) continue;

        serializedLinkKeys.add(key);
        serializedLinks.push({
          ...link,
          url,
          preview: {
            ...link.preview,
            url,
          },
        });
      }

      const linkPreviews = serializedLinks.map((link) => ({
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

      // The composer now owns the complete link list. Clear legacy aliases so
      // a removed link cannot reappear from an older metadata shape.
      delete metadata.linkPreviews;
      delete metadata.linkPreview;
      delete metadata.links;

      const primarySourceUrl =
        serializedLinks[0]?.url ||
        (youtubeMetadata?.video_id
          ? `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`
          : normalizeExtractedUrl(youtubeUrl) || null);

      const determinedType =
        bodyMd.trim().length > 180
          ? "article"
          : youtubeMetadata || youtubeUrl
            ? "video"
            : imageUrls.length > 0
              ? "photo"
              : serializedLinks.length > 0
                ? "link"
                : "note";

      // The composer has no separate title field. A stored title is kept when
      // it was authored manually; generated titles are recalculated by the
      // server from the edited content instead of becoming stale.
      const titleSource =
        item?.metadata && typeof item.metadata === 'object'
          ? item.metadata.title_source
          : null;
      const titleWasGenerated =
        titleSource === 'body' ||
        titleSource === 'generated' ||
        titleSource === 'fallback' ||
        titleSource === 'link' ||
        titleSource === 'youtube' ||
        titleSource === 'image';

      const postTitle = isEditing
        ? titleWasGenerated
          ? null
          : title.trim() || null
        : linkPreviews[0]?.title || youtubeMetadata?.title || null;

      // A new post carries the language of the edition that opened the
      // composer. Photos have no body text to detect from, so this context is
      // the only reliable signal for them. Edits deliberately omit `lang` so
      // opening an older publication never changes its stored language.
      const composerLanguage = resolveFlowComposerLanguage({
        explicit: lang,
        text: bodyMd,
        pathname:
          typeof window !== "undefined"
            ? window.location.pathname
            : null,
        storedChoice: readStoredLanguageChoice(),
        browserLanguage:
          typeof navigator !== "undefined"
            ? navigator.language
            : null,
      });

      const payload = {
        title: postTitle,
        body_md: bodyMd,
        source_url: primarySourceUrl,
        type: determinedType,
        status: "published",
        visibility: "public",
        ...(isEditing ? {} : { lang: composerLanguage }),
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
          ...telegramAuthHeaders(),
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

      // Creation returns before external channels finish. Publish the item and
      // the (possibly pending) channel state so the owner gets one truthful
      // receipt without adding a step to the composer. Drafts and private
      // items are not distributed, so they produce no channel receipt.
      if (
        !isEditing &&
        typeof window !== "undefined" &&
        (data.crosspostPending === true || Boolean(data.crosspost))
      ) {
        window.dispatchEvent(
          new CustomEvent("flow:published", {
            detail: {
              item: data.item,
              crosspost: data.crosspost ?? null,
              pending: data.crosspostPending === true,
            },
          }),
        );
      }

      onCreated?.(data.item, data.crosspost);
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
    lang,
    onCreated,
    onClose,
  ]);

  const proofread = useCallback(async () => {
    if (proofreadInFlightRef.current || busy) return;

    // Capture the exact source text. The author may keep typing while the
    // request is in flight; the response is applied only when the draft still
    // matches this snapshot.
    const source = bodyRef.current;

    if (!source.trim()) return;

    proofreadInFlightRef.current = true;
    setIsProofreading(true);
    setProofreadStatus(null);
    setError(null);

    const epoch = proofreadEpochRef.current;

    try {
      const res = await fetch("/api/flow/proofread", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...telegramAuthHeaders(),
        },
        body: JSON.stringify({ text: source }),
      });

      if (epoch !== proofreadEpochRef.current) return;

      const data = await readResponse(res);

      if (epoch !== proofreadEpochRef.current) return;

      if (!res.ok) {
        const status =
          data?.error === "provider_rate_limited" || res.status === 429
            ? "Too many requests. Try again shortly."
            : data?.error === "provider_timeout"
              ? "Proofreading timed out. Your text is unchanged."
              : data?.error === "input_too_long" ||
                  data?.error === "payload_too_large"
                ? "This post is too long to proofread."
                : "Couldn't proofread. Your text is unchanged.";

        setProofreadStatus(status);
        return;
      }

      const corrected = typeof data?.text === "string" ? data.text : "";

      if (!corrected.trim()) {
        setProofreadStatus(
          "Proofreading returned no text. Your draft is unchanged.",
        );
        return;
      }

      if (epoch !== proofreadEpochRef.current) return;

      // A stale result must never replace newer author edits.
      if (bodyRef.current !== source) {
        setProofreadStatus("Text changed; kept your edits.");
        return;
      }

      setBodyMd(corrected);
      setProofreadStatus(
        corrected === source ? "No changes needed." : null,
      );
    } catch {
      if (epoch === proofreadEpochRef.current) {
        setProofreadStatus(
          "Couldn't proofread. Your text is unchanged.",
        );
      }
    } finally {
      if (epoch === proofreadEpochRef.current) {
        proofreadInFlightRef.current = false;
        setIsProofreading(false);
      }
    }
  }, [busy]);

  const clearDraft = async () => {
    setIsClearing(true);

    try {
      // Clearing is terminal for any request started before it.
      linkEpochRef.current += 1;
      youtubeRequestSeqRef.current += 1;
      uploadEpochRef.current += 1;
      proofreadEpochRef.current += 1;
      proofreadInFlightRef.current = false;
      linkRequestsRef.current.clear();
      suppressedLinkKeysRef.current.clear();
      pendingLinkParsesRef.current.clear();
      pendingYouTubeParsesRef.current.clear();
      pendingUploadsRef.current.clear();

      setTitle("");
      setBodyMd("");
      setLinks([]);
      setYoutubeUrl("");
      setYoutubeMetadata(null);
      setImages([]);
      setShowLinkInput(false);
      setShowYouTubeInput(false);
      setError(null);
      setIsParsingLink(false);
      setIsParsingYouTube(false);
      setIsUploadingImage(false);
      setIsProofreading(false);
      setProofreadStatus(null);
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
    isProofreading,
    isEditing,
    canClear,
    canPost,
    canProofread,
    busy,
    fileRef,
    textareaRef,
    handlePaste,
    finish,
    proofread,
    proofreadStatus,
    clearDraft,
    handleClose,
  };
}
