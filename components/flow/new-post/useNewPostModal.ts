import { useState, useRef, useEffect } from "react";

interface UseNewPostModalParams {
  open: boolean;
  onClose: () => void;
  onCreated?: (item?: any) => void;
  itemId?: string | null; // Разрешаем null
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

  const handleClose = async () => {
    onClose();
  };

  const finish = async () => {
    setIsPublishing(true);
    try {
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to post");
    } finally {
      setIsPublishing(false);
    }
  };

  const clearDraft = async () => {
    setIsClearing(true);
    setBodyMd("");
    setLinkUrl("");
    setImagePreview(null);
    setImageName(null);
    setIsClearing(false);
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    // Логика вставки
  };

  const parseLink = async (url: string) => {
    setIsParsing(true);
    // Логика парсинга
    setIsParsing(false);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageName(file.name);
      setImagePreview(URL.createObjectURL(file));
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
        if (
          busy ||
          saveState === "saving" ||
          saveState === "creating" ||
          saveState === "loading" ||
          isClearing
        ) {
          return;
        }

        event.preventDefault();
        void finish();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, finish, handleClose, isClearing, open, saveState]);

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
