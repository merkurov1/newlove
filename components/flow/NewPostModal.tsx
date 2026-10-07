"use client";

import { useRef } from "react";

import {
  ImagePreview,
  LinkPreviewCard,
  ShimmerPreview,
  YouTubePreview,
} from "./new-post/Previews";
import { useNewPostModal } from "./new-post/useNewPostModal";
import type { NewPostModalProps, SaveState } from "./new-post/types";

function SaveStatus({ state }: { state: SaveState }) {
  switch (state) {
    case "creating":
      return <span className="text-xs text-neutral-400">Creating…</span>;

    case "loading":
      return <span className="text-xs text-neutral-400">Loading…</span>;

    case "saving":
      return <span className="text-xs text-neutral-400">Saving…</span>;

    case "publishing":
      return <span className="text-xs text-neutral-400">Publishing…</span>;

    case "clearing":
      return <span className="text-xs text-neutral-400">Clearing…</span>;

    case "saved":
      return <span className="text-xs text-neutral-400">Saved</span>;

    case "error":
      return <span className="text-xs text-red-500">Error</span>;

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    item,

    bodyMd,
    setBodyMd,

    title,
    setTitle,

    linkUrl,
    setLinkUrl,

    linkPreview,
    youtubeMetadata,

    imagePreview,
    imageName,

    mode,

    saveState,

    isInitializing,
    isParsing,
    isPublishing,
    isClearing,
    isEditing,

    canClear,
    canPost,
    busy,

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

  if (!open) return null;

  const showLinkInput =
    mode === "link" ||
    mode === "video" ||
    Boolean(linkUrl);

  const showYouTube =
    mode === "video" && Boolean(youtubeMetadata);

  const showLinkPreview =
    mode === "link" && Boolean(linkPreview);

  const showImage =
    mode === "photo" && Boolean(imagePreview);

  const loading =
    isInitializing ||
    !item;

  const primaryLabel = isEditing ? "Save" : "Post";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit post" : "New post"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        className="relative flex w-full max-w-[560px] flex-col overflow-hidden bg-white"
        style={{
          maxHeight: "calc(100dvh - 32px)",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
            Flow
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center text-2xl leading-none text-neutral-400 transition-colors hover:text-black"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {loading ? (
            <div className="space-y-4 py-4">
              <ShimmerPreview />
              <div className="h-4 w-2/3 animate-pulse bg-neutral-100" />
              <div className="h-24 w-full animate-pulse bg-neutral-100" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Title"
                disabled={busy}
                className="w-full border-0 bg-transparent px-0 py-1 text-xl font-medium text-black outline-none placeholder:text-neutral-300"
              />

              {/* Body */}
              <textarea
                ref={textareaRef}
                value={bodyMd}
                onChange={(event) => setBodyMd(event.target.value)}
                onPaste={handlePaste}
                placeholder="Write something…"
                disabled={busy}
                rows={7}
                className="w-full resize-none border-0 bg-transparent px-0 py-1 text-[15px] leading-6 text-black outline-none placeholder:text-neutral-300"
              />

              {/* Link / video URL */}
              {showLinkInput && (
                <div className="border-t border-neutral-100 pt-3">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(event) => setLinkUrl(event.target.value)}
                      placeholder="Paste a URL"
                      disabled={busy || isParsing}
                      className="min-w-0 flex-1 border-0 bg-neutral-50 px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-400"
                    />

                    <button
                      type="button"
                      onClick={parseLink}
                      disabled={
                        busy ||
                        isParsing ||
                        !linkUrl.trim()
                      }
                      className="shrink-0 bg-black px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {isParsing ? "…" : "Preview"}
                    </button>
                  </div>
                </div>
              )}

              {/* YouTube preview */}
              {showYouTube && youtubeMetadata && (
                <YouTubePreview metadata={youtubeMetadata} />
              )}

              {/* Generic link preview */}
              {showLinkPreview && linkPreview && (
                <LinkPreviewCard preview={linkPreview} />
              )}

              {/* Image preview */}
              {showImage && imagePreview && (
                <ImagePreview
                  src={imagePreview}
                  name={imageName}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            {/* Image */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="Add image"
              className="flex h-9 w-9 items-center justify-center text-lg text-neutral-500 transition-colors hover:text-black disabled:opacity-30"
            >
              +
            </button>

            {canClear && (
              <button
                type="button"
                onClick={clearDraft}
                disabled={busy || isClearing}
                className="text-xs text-neutral-400 transition-colors hover:text-black disabled:opacity-30"
              >
                Clear
              </button>
            )}

            <SaveStatus state={saveState} />
          </div>

          <button
            type="button"
            onClick={finish}
            disabled={!canPost || busy}
            className="min-w-[88px] bg-black px-5 py-2.5 text-sm font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            {isPublishing ? "…" : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}