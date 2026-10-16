"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, X } from "lucide-react";
import {
  ImagePreview,
  LinkPreviewCard,
  ShimmerPreview,
  YouTubePreview,
} from "./new-post/Previews";
import { useNewPostModal } from "./new-post/useNewPostModal";
import type {
  NewPostModalProps,
  SaveState,
} from "./new-post/types";

function SaveStatus({
  state,
  error,
}: {
  state: SaveState;
  error?: string | null;
}) {
  if (error) {
    return (
      <span
        className="max-w-[220px] truncate text-xs text-[#A45E50]"
        title={error}
        role="status"
      >
        {error}
      </span>
    );
  }

  const labels: Partial<Record<SaveState, string>> = {
    creating: "Opening…",
    loading: "Loading…",
    saving: "Saving…",
    publishing: "Posting…",
    clearing: "Clearing…",
    saved: "Saved",
  };

  const label = labels[state];
  if (!label) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className="text-xs text-[#9A9388]"
    >
      {label}
    </span>
  );
}

export default function NewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
}: NewPostModalProps) {
  const {
    item,
    title,
    setTitle,
    bodyMd,
    setBodyMd,
    links,
    removeLink,
    youtubeMetadata,
    removeYouTube,
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
  } = useNewPostModal({
    open,
    onClose,
    onCreated,
    itemId,
  });

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
    };
  }, [open, textareaRef]);

  if (!open) return null;

  const loading = isInitializing || !item;

  return createPortal(
    <div
      className="
        fixed inset-0 z-[9999] flex items-center justify-center
        bg-[#24211D]/25 p-0 backdrop-blur-[3px]
        sm:p-4
      "
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit Flow post" : "New Flow post"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          void handleClose();
        }
      }}
    >
      <section
        className="
          flex h-[100dvh] max-h-[100dvh] w-full flex-col
          overflow-hidden bg-[#FAF8F4] text-[#37332D]
          sm:h-[min(88dvh,780px)] sm:max-h-[calc(100dvh-2rem)]
          sm:max-w-2xl sm:rounded-2xl
        "
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Minimal top row */}
        <header className="flex shrink-0 items-center justify-between px-5 pt-4 sm:px-7 sm:pt-5">
          <div className="min-w-0">
            <SaveStatus state={saveState} error={error} />
          </div>

          <button
            type="button"
            onClick={() => {
              if (!busy) void handleClose();
            }}
            disabled={busy}
            aria-label="Close composer"
            title="Close"
            className="
              -mr-2 flex h-9 w-9 shrink-0 items-center justify-center
              rounded-full text-[#898277] transition
              hover:bg-black/[0.04] hover:text-[#37332D]
              disabled:opacity-40
            "
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </header>

        {/* Writing area: no field borders or inner card */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-7 sm:pt-4">
          <div className="flex min-h-full flex-col">
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (optional)"
              disabled={busy}
              aria-label="Post title"
              className="
                mb-3 w-full border-0 bg-transparent p-0
                font-serif text-xl font-medium text-[#302C26]
                outline-none ring-0 placeholder:text-[#C0B8AC]
                focus:outline-none focus:ring-0
                sm:text-2xl
              "
            />

            <textarea
              ref={textareaRef}
              value={bodyMd}
              onChange={(event) => setBodyMd(event.target.value)}
              onPaste={handlePaste}
              placeholder="Write something…"
              disabled={busy}
              rows={5}
              aria-label="Post text"
              className="
                min-h-36 w-full flex-1 resize-none border-0
                bg-transparent p-0 font-serif text-lg
                leading-[1.7] tracking-[-0.01em] text-[#49443C]
                outline-none ring-0 placeholder:text-[#B8B0A4]
                focus:outline-none focus:ring-0
                sm:text-xl
              "
            />

            {/* Automatic URL / YouTube previews */}
            {(isParsingLink || isParsingYouTube) && (
              <div className="mt-5">
                <ShimmerPreview
                  text={
                    isParsingYouTube
                      ? "Loading video…"
                      : "Loading link…"
                  }
                />
              </div>
            )}

            {isUploadingImage && (
              <div className="mt-5">
                <ShimmerPreview text="Uploading image…" />
              </div>
            )}

            {youtubeMetadata && (
              <div className="group relative mt-5">
                <button
                  type="button"
                  onClick={removeYouTube}
                  aria-label="Remove video"
                  title="Remove video"
                  className="
                    absolute right-2 top-2 z-10 flex h-8 w-8
                    items-center justify-center rounded-full
                    bg-black/55 text-white opacity-100 transition
                    hover:bg-black/75 sm:opacity-0
                    sm:group-hover:opacity-100
                  "
                >
                  <X size={15} />
                </button>

                <YouTubePreview
                  metadata={youtubeMetadata}
                  url={
                    youtubeMetadata.video_id
                      ? `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`
                      : ""
                  }
                />
              </div>
            )}

            {links.length > 0 && (
              <div className="mt-5 space-y-5">
                {links.map((link) => (
                  <div key={link.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => removeLink(link.id)}
                      aria-label="Remove link"
                      title="Remove link"
                      className="
                        absolute right-2 top-2 z-10 flex h-8 w-8
                        items-center justify-center rounded-full
                        bg-black/55 text-white opacity-100 transition
                        hover:bg-black/75 sm:opacity-0
                        sm:group-hover:opacity-100
                      "
                    >
                      <X size={15} />
                    </button>

                    <LinkPreviewCard
                      preview={link.preview}
                      url={link.url}
                    />
                  </div>
                ))}
              </div>
            )}

            {images.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {images.map((image) => (
                  <div key={image.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      aria-label="Remove image"
                      title="Remove image"
                      className="
                        absolute right-2 top-2 z-10 flex h-8 w-8
                        items-center justify-center rounded-full
                        bg-black/55 text-white opacity-100 transition
                        hover:bg-black/75 sm:opacity-0
                        sm:group-hover:opacity-100
                      "
                    >
                      <X size={15} />
                    </button>

                    <ImagePreview
                      src={image.url}
                      alt={image.name || "Flow image"}
                    />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p
                className="mt-4 text-sm leading-relaxed text-[#A45E50]"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Quiet bottom toolbar */}
        <footer
          className="
            flex shrink-0 items-center justify-between gap-3
            px-5 pb-[max(16px,env(safe-area-inset-bottom))]
            pt-3 sm:px-7 sm:pb-5
          "
        >
          <div className="flex min-w-0 items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || loading}
              aria-label="Attach images"
              title="Attach images"
              className={`
                flex h-10 w-10 shrink-0 items-center justify-center
                rounded-full transition-colors
                hover:bg-black/[0.05] disabled:opacity-40
                ${
                  images.length > 0
                    ? "text-[#37332D]"
                    : "text-[#898277]"
                }
              `}
            >
              <ImageIcon size={19} strokeWidth={1.6} />
            </button>

            {canClear && (
              <button
                type="button"
                onClick={() => void clearDraft()}
                disabled={busy || isClearing}
                className="
                  text-xs text-[#92897D] transition-colors
                  hover:text-[#37332D] disabled:opacity-40
                "
              >
                {isClearing ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => void finish()}
            disabled={!canPost || busy}
            className="
              rounded-full bg-[#37332D] px-6 py-2.5
              text-sm text-white transition-colors
              hover:bg-[#514B42] active:scale-[0.98]
              disabled:cursor-not-allowed disabled:opacity-35
            "
          >
            {isPublishing ? "Posting…" : isEditing ? "Save" : "Post"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
