import { useState, useRef, useEffect, useCallback } from "react";
import type { LinkPreview, YouTubeMetadata } from "./types";
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

  // Attached media states - ALL can coexist!
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  // UI inputs visibility
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showYouTubeInput, setShowYouTubeInput] = useState(false);

  const [saveState, setSaveState] = useState<any>("idle");
  const [error, setError] = useState<string | null>(null);

  const [isInitializing, setIsInitializing] = useState(false);
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [isParsingYouTube, setIsParsingYouTube] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = Boolean(itemId);
  const canClear = Boolean(bodyMd.trim() || linkUrl || youtubeUrl || imagePreview);
  const canPost = Boolean(bodyMd.trim() || linkUrl || youtubeUrl || imagePreview);
  const busy =
    isInitializing ||
    isParsingLink ||
    isParsingYouTube ||
    isPublishing ||
    isClearing;

  // Load existing post on edit
  useEffect(() => {
    if (!open) {
      setItem(null);
      setTitle("");
      setBodyMd("");
      setLinkUrl("");
      setLinkPreview(null);
      setYoutubeUrl("");
      setYoutubeMetadata(null);
      setImagePreview(null);
      setImageFile(null);
      setImageName(null);
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

            if (meta.link_preview) {
              setLinkPreview(meta.link_preview);
              setLinkUrl(meta.link_preview.url || found.source_url || "");
            } else if (found.source_url && !isYouTubeVideo(found.source_url)) {
              setLinkUrl(found.source_url);
            }

            const img = meta.public_url || meta.image || (meta.images && meta.images[0]);
            if (img) {
              setImagePreview(img);
            }
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
        // Clear link input if it was redirected to youtube
        setLinkUrl("");
        setShowLinkInput(false);
      } else {
        setLinkPreview({
          url: data.url,
          title: data.title,
          description: data.description,
          image: data.image,
          site_name: data.site_name,
          favicon: data.favicon,
          domain: data.domain,
        });
        setLinkUrl(data.url);
        setShowLinkInput(false);
      }
    } catch (e: any) {
      console.warn("Link preview failed:", e);
      // Still keep URL even if preview failed
      setLinkPreview({
        url: trimmed,
        title: trimmed,
      });
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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImageName(file.name);
      const objectUrl = URL.createObjectURL(file);
      setImagePreview(objectUrl);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFile(null);
    setImageName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeYouTube = () => {
    setYoutubeUrl("");
    setYoutubeMetadata(null);
    setShowYouTubeInput(false);
  };

  const removeLink = () => {
    setLinkUrl("");
    setLinkPreview(null);
    setShowLinkInput(false);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    // Check if an image was pasted from clipboard
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            event.preventDefault();
            setImageFile(file);
            setImageName("pasted-image.png");
            setImagePreview(URL.createObjectURL(file));
            return;
          }
        }
      }
    }

    // Check if a URL was pasted
    const pastedText = event.clipboardData?.getData("text")?.trim();
    if (pastedText && /^https?:\/\//i.test(pastedText)) {
      if (isYouTubeVideo(pastedText) && !youtubeMetadata) {
        void parseYouTube(pastedText);
      } else if (isProbablyImageUrl(pastedText) && !imagePreview) {
        setImagePreview(pastedText);
      } else if (!linkPreview && !linkUrl) {
        void parseLink(pastedText);
      }
    }
  };

  // Upload image to server if file is present
  const uploadImageFile = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.file?.url) {
          return data.file.url;
        }
      }
    } catch (err) {
      console.warn("Upload to /api/upload failed, trying fallback reader:", err);
    }

    // Fallback: convert to base64 DataURL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  // Submit and save post
  const finish = useCallback(async () => {
    if (!canPost || busy) return;

    setIsPublishing(true);
    setError(null);
    setSaveState("publishing");

    try {
      let finalImageUrl: string | null = imagePreview;

      // Upload image file if user selected a local file
      if (imageFile) {
        const uploadedUrl = await uploadImageFile(imageFile);
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        }
      }

      // Prepare metadata with ALL rich media elements
      const metadata: Record<string, unknown> = {
        ...(item?.metadata || {}),
      };

      if (finalImageUrl) {
        metadata.image = finalImageUrl;
        metadata.public_url = finalImageUrl;
      } else {
        delete metadata.image;
        delete metadata.public_url;
      }

      if (youtubeMetadata) {
        metadata.youtube = youtubeMetadata;
      } else {
        delete metadata.youtube;
      }

      if (linkPreview) {
        metadata.link_preview = linkPreview;
      } else {
        delete metadata.link_preview;
      }

      // Determine primary source url
      const primarySourceUrl =
        linkUrl ||
        (youtubeMetadata?.video_id
          ? `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`
          : null);

      // Determine type for DB
      const determinedType =
        bodyMd.trim().length > 180
          ? "article"
          : youtubeMetadata
            ? "video"
            : finalImageUrl
              ? "photo"
              : linkUrl
                ? "link"
                : "note";

      const postTitle =
        title.trim() ||
        (bodyMd.trim() ? bodyMd.slice(0, 80).split("\n")[0].trim() : null) ||
        linkPreview?.title ||
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
    imagePreview,
    imageFile,
    item,
    youtubeMetadata,
    linkPreview,
    linkUrl,
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
    setLinkUrl("");
    setLinkPreview(null);
    setYoutubeUrl("");
    setYoutubeMetadata(null);
    setImagePreview(null);
    setImageFile(null);
    setImageName(null);
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
    linkUrl,
    setLinkUrl,
    linkPreview,
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
    imagePreview,
    imageName,
    removeImage,
    handleImageUpload,
    saveState,
    error,
    isInitializing,
    isParsingLink,
    isParsingYouTube,
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
