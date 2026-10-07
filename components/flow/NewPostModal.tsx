"use client";

import { useEffect, useRef } from "react";

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
  if (state === "saving") {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-black/40">
        Saving…
      </span>
    );
  }

  if (state === "clearing") {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-black/40">
        Clearing…
      </span>
    );
  }

  if (state === "saved") {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-black/35">
        Saved
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="text-[10px] uppercase tracking-[0.14em] text-red-500/70">
        Error
      </span>
    );
  }

  return null;
}

export default function NewPostModal({
  open,
  onClose,
  onCreated,
  itemId,
}: NewPostModalProps) {
  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(null);

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
    busy,

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

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();

        if (!busy) {
          void handleClose();
        }

        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (!busy) {
          void finish();
        }
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    busy,
    finish,
    handleClose,
    open,
  ]);

  useEffect(() => {
    if (!open) return;

    const timer =
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const isLoading =
    isInitializing || !item;

  const isVideo =
    mode === "video" &&
    Boolean(linkUrl);

  const isLink =
    mode === "link" &&
    Boolean(linkUrl);

  const isPhoto =
    mode === "photo" &&
    Boolean(imagePreview);

  const hasBody =
    bodyMd.trim().length > 0;

  const hasTitle =
    title.trim().length > 0;

  const canPublish =
    !busy &&
    !isLoading &&
    (
      hasBody ||
      hasTitle ||
      Boolean(linkUrl) ||
      Boolean(imagePreview)
    );

  const primaryLabel = isEditing
    ? "Save"
    : "Post";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={
        isEditing
          ? "Edit Flow post"
          : "New Flow post"
      }
    >
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden bg-white"
        style={{
          maxHeight:
            "calc(100dvh - 48px)",
        }}
      >
        {/* Header */}

        <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-black/70">
            Flow
          </div>

          <button
            type="button"
            onClick={() => {
              if (!busy) {
                void handleClose();
              }
            }}
            disabled={busy}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center text-xl leading-none text-black/45 transition-colors hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
          >
            ×
          </button>
        </div>

        {/* Content */}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-8">
              <ShimmerPreview text="Preparing Flow…" />
            </div>
          ) : (
            <div className="px-4 py-4">
              {/* Title */}

              <input
                type="text"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                placeholder="Title"
                disabled={busy}
                className="mb-3 w-full border-0 bg-transparent p-0 text-xl font-medium leading-7 text-black outline-none placeholder:text-black/25 disabled:opacity-50"
              />

              {/* Body */}

              <textarea
                ref={textareaRef}
                value={bodyMd}
                onChange={(event) => {
                  setBodyMd(event.target.value);
                }}
                onPaste={handlePaste}
                disabled={busy}
                placeholder="What do you want to say?"
                rows={8}
                className="min-h-[180px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-6 text-black outline-none placeholder:text-black/25 disabled:opacity-50"
              />

              {/* Link URL */}

              {linkUrl &&
              !isVideo &&
              !isPhoto ? (
                <div className="mt-3">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(event) => {
                      setLinkUrl(
                        event.target.value,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter"
                      ) {
                        event.preventDefault();

                        void parseLink(
                          linkUrl,
                        );
                      }
                    }}
                    disabled={busy}
                    placeholder="URL"
                    className="w-full border-0 border-b border-black/10 bg-transparent px-0 py-2 text-xs text-black outline-none placeholder:text-black/30 disabled:opacity-50"
                  />

                  {isParsing ? (
                    <ShimmerPreview
                      text="Parsing link…"
                    />
                  ) : linkPreview ? (
                    <LinkPreviewCard
                      preview={linkPreview}
                      url={linkUrl}
                    />
                  ) : null}
                </div>
              ) : null}

              {/* YouTube */}

              {isVideo &&
              linkUrl ? (
                <>
                  {isParsing ? (
                    <ShimmerPreview
                      text="Parsing YouTube…"
                    />
                  ) : youtubeMetadata ? (
                    <YouTubePreview
                      metadata={
                        youtubeMetadata
                      }
                      url={linkUrl}
                    />
                  ) : null}
                </>
              ) : null}

              {/* Generic link preview */}

              {isLink &&
              linkUrl &&
              !isParsing &&
              linkPreview ? (
                <LinkPreviewCard
                  preview={linkPreview}
                  url={linkUrl}
                />
              ) : null}

              {/* Photo */}

              {isPhoto &&
              imagePreview ? (
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

        {/* Footer */}

        <div className="flex shrink-0 items-center justify-between border-t border-black/10 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Image */}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={
                handleImageUpload
              }
              className="hidden"
            />

            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              disabled={
                busy || isLoading
              }
              aria-label="Add image"
              className="flex h-8 w-8 items-center justify-center text-black/45 transition-colors hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-[18px] w-[18px]"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                />
                <circle
                  cx="8.5"
                  cy="8.5"
                  r="1.5"
                />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </button>

            {/* CLEAR */}

            {canClear ? (
              <button
                type="button"
                onClick={() => {
                  void clearDraft();
                }}
                disabled={
                  isClearing ||
                  busy
                }
                className="text-[10px] uppercase tracking-[0.14em] text-black/35 transition-colors hover:text-black disabled:cursor-not-allowed disabled:opacity-30"
              >
                Clear
              </button>
            ) : null}

            <SaveStatus
              state={saveState}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              void finish();
            }}
            disabled={!canPublish}
            className="bg-black px-5 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-25"
          >
            {isPublishing
              ? "Posting…"
              : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}