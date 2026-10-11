"use client";

import { useEffect } from "react";
import { X, Plus, Image as ImageIcon } from "lucide-react";
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
        className="max-w-[280px] truncate text-[11px] font-mono uppercase tracking-wider text-red-500"
        title={error}
      >
        {error}
      </span>
    );
  }

  switch (state) {
    case "creating":
    case "loading":
      return (
        <span className="text-[11px] font-mono uppercase tracking-widest text-stone-400">
          Loading…
        </span>
      );

    case "saving":
      return (
        <span className="text-[11px] font-mono uppercase tracking-widest text-stone-400">
          Saving…
        </span>
      );

    case "publishing":
      return (
        <span className="text-[11px] font-mono uppercase tracking-widest text-stone-700 animate-pulse">
          Publishing…
        </span>
      );

    case "clearing":
      return (
        <span className="text-[11px] font-mono uppercase tracking-widest text-stone-400">
          Clearing…
        </span>
      );

    case "saved":
      return (
        <span className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-stone-400">
          <span>Saved</span>
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/80"
          />
        </span>
      );

    default:
      return null;
  }
}

export default function NewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
}: NewPostModalProps) {
  const {
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
  } = useNewPostModal({
    open,
    onClose,
    onCreated,
    itemId,
  });

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [open]);

  // Keyboard shortcut: Escape to close, Cmd/Ctrl+Enter to post
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        void handleClose();
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canPost && !busy) {
        event.preventDefault();
        void finish();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, canPost, handleClose, finish]);

  if (!open) return null;

  const loading = isInitializing || !item;

  const hasContent =
    Boolean(bodyMd.trim()) ||
    Boolean(linkUrl) ||
    Boolean(imagePreview);

  const showLink = mode === "link" && Boolean(linkUrl);
  const showVideo = mode === "video" && Boolean(linkUrl);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/60 p-3 sm:p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit post" : "New post"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          void handleClose();
        }
      }}
    >
      <div
        className="relative flex h-[88dvh] max-h-[780px] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-stone-200/90 bg-[#FAF8F5]/98 text-stone-900 shadow-2xl backdrop-blur-2xl"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {/* TOP STATUS BAR */}
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200/60 px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
              {isEditing ? "Edit Post" : "Compose Thought"}
            </span>

            {!loading && <SaveStatus state={saveState} error={error} />}
          </div>

          <button
            type="button"
            onClick={() => {
              if (!busy) void handleClose();
            }}
            disabled={busy}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-200/60 hover:text-stone-900 disabled:opacity-30"
          >
            <X size={18} />
          </button>
        </header>

        {/* MAIN EDITING AREA */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-10 sm:py-8">
          <div className="flex min-h-full flex-col">
            <textarea
              ref={textareaRef}
              value={bodyMd}
              onChange={(event) => {
                setBodyMd(event.target.value);
              }}
              onPaste={handlePaste}
              placeholder="Write a thought, insight, or drop a link…"
              disabled={busy}
              autoFocus
              rows={4}
              className="w-full flex-1 resize-none border-0 bg-transparent p-0 font-serif text-[22px] sm:text-[25px] font-light leading-[1.6] tracking-[-0.01em] text-stone-900 outline-none ring-0 placeholder:text-stone-300 focus:border-0 focus:outline-none focus:ring-0"
            />

            {showLink && (
              <div className="mt-6 max-w-[720px]">
                {isParsing ? (
                  <ShimmerPreview text="Reading link…" />
                ) : linkPreview ? (
                  <LinkPreviewCard
                    preview={linkPreview}
                    url={linkUrl}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(event) => {
                        setLinkUrl(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          linkUrl.trim()
                        ) {
                          event.preventDefault();
                          void parseLink(linkUrl);
                        }
                      }}
                      placeholder="Paste URL and press Enter"
                      disabled={busy || isParsing}
                      className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none ring-0 placeholder:text-neutral-400 focus:border-stone-400"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        void parseLink(linkUrl);
                      }}
                      disabled={
                        busy ||
                        isParsing ||
                        !linkUrl.trim()
                      }
                      className="rounded-full bg-stone-900 px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-white transition hover:bg-stone-700 disabled:opacity-20"
                    >
                      {isParsing ? "…" : "Preview"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {showVideo && (
              <div className="mt-6 max-w-[720px]">
                {isParsing ? (
                  <ShimmerPreview text="Reading YouTube…" />
                ) : youtubeMetadata ? (
                  <YouTubePreview
                    metadata={youtubeMetadata}
                    url={linkUrl}
                  />
                ) : null}
              </div>
            )}

            {imagePreview && (
              <div className="mt-6 max-w-[720px]">
                <ImagePreview
                  src={imagePreview}
                  alt={imageName || "Flow image"}
                />
              </div>
            )}

            {error && (
              <div
                className="mt-5 rounded-xl border border-red-200 bg-red-50/80 p-3 font-mono text-[12px] text-red-600"
                role="alert"
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-stone-200/60 bg-[#FAF8F5] px-6 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            <button
              type="button"
              onClick={() => {
                fileRef.current?.click();
              }}
              disabled={busy || loading}
              aria-label="Add image"
              title="Attach image"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200/80 bg-white text-stone-600 transition hover:border-stone-400 hover:text-stone-950 disabled:opacity-30 shadow-sm"
            >
              <ImageIcon size={17} />
            </button>

            {canClear && hasContent && (
              <button
                type="button"
                onClick={() => {
                  void clearDraft();
                }}
                disabled={busy || isClearing}
                className="rounded-full border border-stone-200 bg-white px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 transition hover:border-stone-400 hover:text-stone-900 disabled:opacity-30"
              >
                {isClearing ? "Clearing…" : "Clear Draft"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-widest text-stone-400">
              Cmd + Enter to post
            </span>

            <button
              type="button"
              onClick={() => {
                void finish();
              }}
              disabled={!canPost || busy}
              className="rounded-full bg-stone-900 px-6 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-stone-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-20"
            >
              {isPublishing ? "Publishing…" : "POST"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
