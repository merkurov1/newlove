import { useState, useRef, useEffect, useCallback } from "react";
import type { FlowImageAttachment, FlowLinkAttachment, YouTubeMetadata } from "./types";
import { isYouTubeVideo, isProbablyImageUrl } from "./utils";

interface UseNewPostModalParams {
  open: boolean;
  onClose: () => void;
  onCreated?: (item?: any) => void;
  itemId?: string | null;
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

  // Attached media states - supporting multiple arrays for images and links
  const [links, setLinks] = useState<FlowLinkAttachment[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);
  const [images, setImages] = useState<FlowImageAttachment[]>([]);

  // UI inputs visibility
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
  const canClear = Boolean(bodyMd.trim() || links.length > 0 || youtubeUrl || images.length > 0);
  const canPost = Boolean(bodyMd.trim() || links.length > 0 || youtubeUrl || images.length > 0);
  const busy =
    isInitializing ||
    isParsingLink ||
    isParsingYouTube ||
    isUploadingImage ||
    isPublishing ||
    isClearing;

  // Load existing post on edit
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
      return;
    }

    if (itemId) {
      setIsInitializing(true);
      fetch(`/api/flow/items/${itemId}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to load item");
          return res.json();
        })
        .then((data) => {
          const found = data.item;
          if (found) {
            setItem(found);
            setTitle(found.title || "");
            setBodyMd(found.body_md || "");

            // Restore attached media
            const meta = found.metadata || {};
            if (meta.youtube) {
              setYoutubeMetadata(meta.youtube);
              if (meta.youtube.video_id) {
                setYoutubeUrl(`https://www.youtube.com/watch?v=${meta.youtube.video_id}`);
              }
            } else if (found.source_url && isYouTubeVideo(found.source_url)) {
              setYoutubeUrl(found.source_url);
            }

            // Restore links (array or legacy single link_preview)
            const loadedLinks: FlowLinkAttachment[] = [];
            if (Array.isArray(meta.link_previews)) {
              meta.link_previews.forEach((lp: any, idx: number) => {
                if (lp && lp.url) {
                  loadedLinks.push({
                    id: `link-${idx}-${Date.now()}`,
                    url: lp.url,
                    preview: lp,
                  });
                }
              });
            } else if (meta.link_preview && typeof meta.link_preview === 'object') {
              loadedLinks.push({
                id: `link-legacy-${Date.now()}`,
                url: meta.link_preview.url || found.source_url || "",
                preview: meta.link_preview,
              });
            } else if (found.source_url && !isYouTubeVideo(found.source_url)) {
              loadedLinks.push({
                id: `link-source-${Date.now()}`,
                url: found.source_url,
                preview: { url: found.source_url, title: found.source_url },
              });
            }
            setLinks(loadedLinks);

            // Restore images (array or legacy single image/public_url)
            const loadedImages: FlowImageAttachment[] = [];
            const rawImages = Array.isArray(meta.images)
              ? meta.images
              : [meta.public_url, meta.image, meta.image_url, meta.og_image].filter(Boolean);

            rawImages.forEach((imgUrl: string, idx: number) => {
              if (typeof imgUrl === 'string' && imgUrl.trim()) {
                loadedImages.push({
                  id: `img-${idx}-${Date.now()}`,
                  url: imgUrl.trim(),
                  name: `Image ${idx + 1}`,
                });
              }
            });
            setImages(loadedImages);
          }
        })
        .catch((err) => {
          console.error("Failed to load item for edit:", err);
          setError("Failed to load post for editing");
        })
        .finally(() => setIsInitializing(false));
    } else {
      setItem({ id: "new" });
    }
  }, [open, itemId]);

  const parseLink = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setIsParsingLink(true);
    setError(null);

    try {
      const res = await fetch(`/api/flow/parse-url?url=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error("Could not fetch link preview");
      const data = await res.json();

      if (data.isYouTube && data.youtube) {
        setYoutubeMetadata(data.youtube);
        setYoutubeUrl(data.url);
        setShowYouTubeInput(false);
      } else {
        const newLink: FlowLinkAttachment = {
          id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: data.url || trimmed,
          preview: {
            url: data.url || trimmed,
            title: data.title || trimmed,
            description: data.description,
            image: data.image,
            site_name: data.site_name,
            favicon: data.favicon,
            domain: data.domain,
          },
        };
        setLinks((prev) => [...prev, newLink]);
        setShowLinkInput(false);
      }
    } catch (e: any) {
      console.warn("Link preview failed:", e);
      const fallbackLink: FlowLinkAttachment = {
        id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: trimmed,
        preview: { url: trimmed, title: trimmed },
      };
      setLinks((prev) => [...prev, fallbackLink]);
      setShowLinkInput(false);
    } finally {
      setIsParsingLink(false);
    }
  }, []);

  const parseYouTube = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setIsParsingYouTube(true);
    setError(null);

    try {
      const res = await fetch(`/api/flow/parse-url?url=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error("Could not fetch YouTube info");
      const data = await res.json();

      if (data.youtube) {
        setYoutubeMetadata(data.youtube);
        setYoutubeUrl(data.url);
        setShowYouTubeInput(false);
      } else {
        throw new Error("Not a valid YouTube video");
      }
    } catch (e: any) {
      console.warn("YouTube parse failed:", e);
      setError("Failed to load YouTube video. Check URL.");
    } finally {
      setIsParsingYouTube(false);
    }
  }, []);

  // Upload multiple image files to Supabase Storage via /api/upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    setError(null);

    try {
      const newAttachments: FlowImageAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("image", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to upload image ${file.name}`);
        }

        const data = await res.json();
        if (data.success && data.file?.url) {
          newAttachments.push({
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url: data.file.url,
            name: file.name,
            file,
          });
        }
      }

      setImages((prev) => [...prev, ...newAttachments]);
    } catch (err: any) {
      console.error("[useNewPostModal] Image upload error:", err);
      setError(err.message || "Image upload failed.");
    } finally {
      setIsUploadingImage(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removeYouTube = () => {
    setYoutubeUrl("");
    setYoutubeMetadata(null);
    setShowYouTubeInput(false);
  };

  const removeLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handlePaste = async (event: React.ClipboardEvent) => {
    // 1. Check if image(s) pasted from clipboard
    const clipboardItems = event.clipboardData?.items;
    if (clipboardItems) {
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith("image/")) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            event.preventDefault();
            setIsUploadingImage(true);
            try {
              const formData = new FormData();
              formData.append("image", file);
              const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
              });
              const data = await res.json();
              if (res.ok && data.success && data.file?.url) {
                setImages((prev) => [
                  ...prev,
                  {
                    id: `img-pasted-${Date.now()}`,
                    url: data.file.url,
                    name: "pasted-image.png",
                  },
                ]);
              }
            } catch (err) {
              console.error("Pasted image upload failed:", err);
              setError("Failed to upload pasted image.");
            } finally {
              setIsUploadingImage(false);
            }
            return;
          }
        }
      }
    }

    // 2. Check if a URL was pasted
    const pastedText = event.clipboardData?.getData("text")?.trim();
    if (pastedText && /^https?:\/\//i.test(pastedText)) {
      if (isYouTubeVideo(pastedText) && !youtubeMetadata) {
        event.preventDefault();
        void parseYouTube(pastedText);
      } else if (isProbablyImageUrl(pastedText)) {
        event.preventDefault();
        setImages((prev) => [
          ...prev,
          {
            id: `img-url-${Date.now()}`,
            url: pastedText,
            name: "image-url",
          },
        ]);
      } else {
        event.preventDefault();
        void parseLink(pastedText);
      }
    }
  };

  // Submit and save post
  const finish = useCallback(async () => {
    if (!canPost || busy) return;

    setIsPublishing(true);
    setError(null);
    setSaveState("publishing");

    try {
      // Gather all image URLs
      const imageUrls = images.map((img) => img.url).filter(Boolean);

      // Prepare metadata with arrays for multi-attachment support + legacy compatibility
      const metadata: Record<string, unknown> = {
        ...(item?.metadata || {}),
      };

      if (imageUrls.length > 0) {
        metadata.images = imageUrls;
        metadata.image = imageUrls[0];
        metadata.public_url = imageUrls[0];
      } else {
        delete metadata.images;
        delete metadata.image;
        delete metadata.public_url;
      }

      if (youtubeMetadata) {
        metadata.youtube = youtubeMetadata;
      } else {
        delete metadata.youtube;
      }

      const linkPreviewsList = links.map((l) => l.preview).filter(Boolean);
      if (linkPreviewsList.length > 0) {
        metadata.link_previews = linkPreviewsList;
        metadata.link_preview = linkPreviewsList[0];
      } else {
        delete metadata.link_previews;
        delete metadata.link_preview;
      }

      // Determine primary source url
      const primarySourceUrl =
        links[0]?.url ||
        (youtubeMetadata?.video_id
          ? `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`
          : null);

      // Determine type for DB
      const determinedType =
        bodyMd.trim().length > 180
          ? "article"
          : youtubeMetadata
            ? "video"
            : imageUrls.length > 0
              ? "photo"
              : links.length > 0
                ? "link"
                : "note";

      const postTitle =
        title.trim() ||
        (bodyMd.trim() ? bodyMd.slice(0, 80).split("\n")[0].trim() : null) ||
        linkPreviewsList[0]?.title ||
        youtubeMetadata?.title ||
        "Flow thought";

      const payload = {
        title: postTitle,
        body_md: bodyMd,
        source_url: primarySourceUrl,
        type: determinedType,
        status: "published",
        visibility: "public",
        metadata,
      };

      let res;
      if (isEditing && itemId) {
        res = await fetch(`/api/flow/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/flow/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || data.details || "Failed to save post");
      }

      setSaveState("saved");
      onCreated?.(data.item);
      onClose();
    } catch (err: any) {
      console.error("[useNewPostModal] Save error:", err);
      setError(err.message || "Failed to post");
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
    setTitle("");
    setBodyMd("");
    setLinks([]);
    setYoutubeUrl("");
    setYoutubeMetadata(null);
    setImages([]);
    setShowLinkInput(false);
    setShowYouTubeInput(false);
    setError(null);
    setIsClearing(false);
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

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
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
