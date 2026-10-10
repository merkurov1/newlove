
"use client";

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
        className="max-w-[280px] truncate text-[12px] font-medium leading-none text-red-500"
        title={error}
      >
        Error
      </span>
    );
  }

  switch (state) {
    case "creating":
    case "loading":
      return (
        <span className="text-[12px] font-medium leading-none text-neutral-500">
          Loading
        </span>
      );

    case "saving":
      return (
        <span className="text-[12px] font-medium leading-none text-neutral-500">
          Saving
        </span>
      );

    case "publishing":
      return (
        <span className="text-[12px] font-medium leading-none text-neutral-500">
          Publishing
        </span>
      );

    case "clearing":
      return (
        <span className="text-[12px] font-medium leading-none text-neutral-500">
          Clearing
        </span>
      );

    case "saved":
      return (
        <span className="flex items-center gap-2 text-[12px] font-medium leading-none text-neutral-500">
          <span>SAVED</span>
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400"
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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/30 p-0 backdrop-blur-[8px]"
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
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border-0 bg-[#fffefa]/95 shadow-none outline-none backdrop-blur-2xl sm:h-[100dvh] sm:max-w-none sm:rounded-none"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (!busy) void handleClose();
          }}
          disabled={busy}
          aria-label="Close"
          className="absolute right-5 top-5 z-30 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent text-[21px] font-light leading-none text-neutral-400 outline-none transition-colors hover:bg-transparent hover:text-neutral-900 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 sm:right-8 sm:top-7"
        >
          ×
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-20 sm:px-12 sm:pt-[76px] md:px-[max(48px,calc((100vw-850px)/2))]">
          {loading ? (
            <div className="pt-2">
              <ShimmerPreview text="Preparing…" />
            </div>
          ) : (
            <div className="flex min-h-full flex-col">
              <textarea
                ref={textareaRef}
                value={bodyMd}
                onChange={(event) => {
                  setBodyMd(event.target.value);
                }}
                onPaste={handlePaste}
                placeholder="Write something…"
                disabled={busy}
                autoFocus
                rows={1}
                className="min-h-[180px] w-full flex-1 resize-none border-0 bg-transparent p-0 font-serif text-[25px] font-light leading-[1.5] tracking-[-0.01em] text-neutral-900 outline-none ring-0 placeholder:text-neutral-300 focus:border-0 focus:outline-none focus:ring-0 sm:min-h-[360px] sm:text-[27px]"
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
                        placeholder="URL"
                        disabled={busy || isParsing}
                        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-sm text-neutral-800 outline-none ring-0 placeholder:text-neutral-300 focus:border-0 focus:outline-none focus:ring-0"
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
                        className="min-h-0 min-w-0 rounded-full border-0 bg-black px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white outline-none transition-opacity hover:bg-black hover:opacity-80 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-20"
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
                  className="mt-5 text-[12px] font-medium leading-relaxed text-red-500"
                  role="alert"
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 sm:px-12 sm:pb-7">
          <div className="flex min-w-0 items-center gap-3">
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
              className="flex h-12 w-12 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full border-0 bg-white/80 text-[25px] font-light leading-none text-neutral-400 outline-none transition-colors hover:bg-white hover:text-black focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
            >
              +
            </button>

            {!loading && (
              <SaveStatus state={saveState} error={error} />
            )}

            {canClear && hasContent && (
              <button
                type="button"
                onClick={() => {
                  void clearDraft();
                }}
                disabled={busy || isClearing}
                className="ml-1 min-h-0 min-w-0 rounded-full border-0 bg-neutral-100 px-4 py-2 text-[11px] font-medium leading-none uppercase tracking-[0.12em] text-neutral-600 outline-none transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 sm:px-4.5 sm:py-2.5 sm:text-[12px]"
              >
                {isClearing ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              void finish();
            }}
            disabled={!canPost || busy}
            className="min-h-0 min-w-0 shrink-0 rounded-full border-0 bg-black px-5 py-3 text-[10px] font-medium uppercase tracking-[0.12em] text-white outline-none transition-opacity hover:bg-black hover:opacity-80 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-[0.14] sm:px-6"
          >
            {isPublishing ? "…" : "POST"}
          </button>
        </div>
      </div>
    </div>
  );
}
