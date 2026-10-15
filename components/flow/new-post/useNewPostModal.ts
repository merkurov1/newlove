import { useState, useRef, useEffect, useCallback } from "react";

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
  const [bodyMd, setBodyMd] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkPreview, setLinkPreview] = useState<any>(null);
  const [youtubeMetadata, setYoutubeMetadata] = useState<any>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "link" | "video" | "image">("text");
  const [saveState, setSaveState] = useState<any>("idle");
  const [error, setError] = useState<string | null>(null);

  const [isInitializing, setIsInitializing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = Boolean(itemId);
  const canClear = Boolean(bodyMd.trim() || linkUrl || imagePreview);
  const canPost = Boolean(bodyMd.trim() || linkUrl || imagePreview);
  const busy = isInitializing || isParsing || isPublishing || isClearing;

  // Загрузка данных поста при редактировании
  useEffect(() => {
    if (!open) {
      // Сброс при закрытии
      setBodyMd("");
      setLinkUrl("");
      setImagePreview(null);
      setImageName(null);
      setLinkPreview(null);
      setYoutubeMetadata(null);
      setError(null);
      setItem(null);
      return;
    }

    if (itemId) {
      setIsInitializing(true);
      fetch(`/api/flow/items`)
        .then((res) => res.json())
        .then((data) => {
          const found = (data.items || []).find((i: any) => i.id === itemId);
          if (found) {
            setItem(found);
            setBodyMd(found.body_md || found.content || "");
            setLinkUrl(found.source_url || "");
          }
        })
        .catch((err) => console.error("Failed to load item for edit:", err))
        .finally(() => setIsInitializing(false));
    } else {
      setItem({ id: 'new' });
    }
  }, [open, itemId]);

  const handleClose = useCallback(async () => {
    onClose();
  }, [onClose]);

  // Реальная отправка и сохранение/создание поста
  const finish = useCallback(async () => {
    if (!canPost || busy) return;

    setIsPublishing(true);
    setError(null);
    setSaveState("publishing");

    try {
      const payload = {
        title: bodyMd.slice(0, 80).trim() || "Flow post",
        body_md: bodyMd,
        source_url: linkUrl || null,
        type: linkUrl ? "link" : "article",
        status: "published",
        visibility: "public",
        metadata: {
          image: imagePreview,
        },
      };

      let res;
      if (isEditing && itemId) {
        // Редактирование существующего
        res = await fetch(`/api/flow/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Создание нового (срабатывает кросспостинг в Bluesky и Telegram)
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
      console.error("[NewPostModal] Save error:", err);
      setError(err.message || "Failed to post");
      setSaveState("idle");
    } finally {
      setIsPublishing(false);
    }
  }, [bodyMd, canPost, busy, isEditing, itemId, linkUrl, imagePreview, onCreated, onClose]);

  const clearDraft = async () => {
    setIsClearing(true);
    setBodyMd("");
    setLinkUrl("");
    setImagePreview(null);
    setImageName(null);
    setIsClearing(false);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    // Вставка из буфера обмена (опционально)
  };

  const parseLink = async (url: string) => {
    if (!url.trim()) return;
    setIsParsing(true);
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const preview = await res.json();
        setLinkPreview(preview);
      }
    } catch (e) {
      console.error("Link preview failed", e);
    } finally {
      setIsParsing(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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
    bodyMd,
    setBodyMd,
    linkUrl,
    setLinkUrl,
    linkPreview,
    youtubeMetadata,
    imagePreview,
    imageName,
    mode,
    saveState,
    error,
    isInitializing,
    isParsing,
    isPublishing,
    isClearing,
    isEditing,
    canClear,
    canPost,
    busy,
    fileRef,
    textareaRef,
    handlePaste,
    parseLink,
    handleImageUpload,
    finish,
    clearDraft,
    handleClose,
  };
}
