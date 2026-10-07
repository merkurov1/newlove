"use client";

import { useRef } from "react";

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
}: {
  state: SaveState;
}) {
  switch (state) {
    case "creating":
      return (
        <span className="text-[11px] text-neutral-400">
          Creating…
        </span>
      );

    case "loading":
      return (
        <span className="text-[11px] text-neutral-400">
          Loading…
        </span>
      );

    case "saving":
      return (
        <span className="text-[11px] text-neutral-400">
          Saving…
        </span>
      );

    case "publishing":
      return (
        <span className="text-[11px] text-neutral-400">
          Publishing…
        </span>
      );

    case "clearing":
      return (
        <span className="text-[11px] text-neutral-400">
          Clearing…
        </span>
      );

    case "saved":
      return (
        <span className="text-[11px] text-neutral-400">
          Saved
        </span>
      );

    case "error":
      return (
        <span className="text-[11px] text-red-500">
          Error
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
  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

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

  if (!open) {
    return null;
  }

  const loading =
    isInitializing || !item;

  const showLink =
    mode === "link" &&
    Boolean(linkUrl);

  const showVideo =
    mode === "video" &&
    Boolean(linkUrl);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={
        isEditing
          ? "Edit post"
          : "New post"
      }
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !busy
        ) {
          void handleClose();
        }
      }}
    >
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[min(760px,calc(100dvh-48px))] sm:max-w-[680px] sm:rounded-[28px]"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (!busy) {
              void handleClose();
            }
          }}
          disabled={busy}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[25px] font-light leading-none text-neutral-400 backdrop-blur-md transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
        >
          ×
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5 pt-16 sm:px-8 sm:pb-6 sm:pt-14">
          {loading ? (
            <div className="py-6">
              <ShimmerPreview text="Preparing Flow…" />
            </div>
          ) : (
            <div className="space-y-5">
              <textarea
                ref={textareaRef}
                value={bodyMd}
                onChange={(event) =>
                  setBodyMd(
                    event.target.value,
                  )
                }
                onPaste={handlePaste}
                placeholder="Write something…"
                disabled={busy}
                autoFocus
                rows={10}
                className="block min-h-[240px] w-full resize-none border-0 bg-transparent p-0 text-[18px] font-normal leading-[1.65] text-neutral-900 outline-none placeholder:text-neutral-300 sm:min-h-[300px] sm:text-[19px]"
              />

              {showLink && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(event) =>
                        setLinkUrl(
                          event.target.value,
                        )
                      }
                      placeholder="URL"
                      disabled={
                        busy ||
                        isParsing
                      }
                      className="min-w-0 flex-1 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:bg-neutral-100"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        void parseLink(
                          linkUrl,
                        )
                      }
                      disabled={
                        busy ||
                        isParsing ||
                        !linkUrl.trim()
                      }
                      className="shrink-0 rounded-xl bg-neutral-900 px-3.5 py-2.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {isParsing
                        ? "…"
                        : "Preview"}
                    </button>
                  </div>

                  {!isParsing &&
                    linkPreview && (
                      <LinkPreviewCard
                        preview={
                          linkPreview
                        }
                        url={linkUrl}
                      />
                    )}
                </div>
              )}

              {showVideo && (
                <>
                  {isParsing ? (
                    <ShimmerPreview text="Parsing YouTube…" />
                  ) : youtubeMetadata ? (
                    <YouTubePreview
                      metadata={
                        youtubeMetadata
                      }
                      url={linkUrl}
                    />
                  ) : null}
                </>
              )}

              {imagePreview ? (
                <ImagePreview
                  src={imagePreview}
                  alt={
                    imageName ||
                    "Flow image"
                  }
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-5 pt-3 sm:px-8 sm:pb-6">
          <div className="flex min-w-0 items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={
                handleImageUpload
              }
            />

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={
                busy || loading
              }
              aria-label="Add image"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] font-light text-neutral-400 transition hover:bg-neutral-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
            >
              +
            </button>

            {canClear && (
              <button
                type="button"
                onClick={() =>
                  void clearDraft()
                }
                disabled={
                  busy || isClearing
                }
                className="rounded-full px-2 py-1 text-[11px] text-neutral-400 transition hover:text-black disabled:opacity-30"
              >
                Clear
              </button>
            )}

            <SaveStatus
              state={saveState}
            />
          </div>

          <button
            type="button"
            onClick={() =>
              void finish()
            }
            disabled={
              !canPost || busy
            }
            className="shrink-0 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
          >
            {isPublishing
              ? "…"
              : isEditing
                ? "Save"
                : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}