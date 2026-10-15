"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon } from "lucide-react";
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
        className="max-w-[280px] truncate text-[11px] font-mono tracking-wide text-[#AD6B5E]"
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
        <span className="text-[11px] font-mono tracking-wide text-[#A49A8C]">
          Loading…
        </span>
      );

    case "saving":
      return (
        <span className="text-[11px] font-mono tracking-wide text-[#A49A8C]">
          Saving…
        </span>
      );

    case "publishing":
      return (
        <span className="text-[11px] font-mono tracking-wide text-[#756D60] animate-pulse">
          Publishing…
        </span>
      );

    case "clearing":
      return (
        <span className="text-[11px] font-mono tracking-wide text-[#A49A8C]">
          Clearing…
        </span>
      );

    case "saved":
      return (
        <span className="flex items-center gap-1.5 text-[11px] font-mono tracking-wide text-[#948A7C]">
          <span>Saved</span>
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#91A38B]"
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

  // Lock background scrolling without moving the modal with the header.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Focus the editor without asking the browser to scroll the page.
  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, textareaRef]);

  if (!open) return null;

  const loading = isInitializing || !item;

  const hasContent =
    Boolean(bodyMd.trim()) ||
    Boolean(linkUrl) ||
    Boolean(imagePreview);

  const showLink = mode === "link" && Boolean(linkUrl);
  const showVideo = mode === "video" && Boolean(linkUrl);

  return createPortal(
    <div
      className="
        fixed inset-0 z-[9999] flex items-center justify-center
        overflow-hidden bg-[#6B6255]/25 p-2 backdrop-blur-sm
        sm:p-5
      "
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
        className="
          relative flex h-[min(88dvh,780px)]
          max-h-[calc(100dvh-1rem)] w-full max-w-3xl
          flex-col overflow-hidden rounded-[28px]
          border border-[#E8E0D4] bg-[#F7F4EE]
          text-[#49443C]
          shadow-[0_24px_80px_rgba(64,52,38,0.18)]
        "
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* TOP STATUS BAR */}
        <header
          className="
            flex shrink-0 items-center justify-between gap-3
            border-b border-[#EAE2D7] px-5 py-4
            sm:px-8 sm:py-4
          "
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="
                font-mono text-[10px] uppercase
                tracking-[0.16em] text-[#82786A]
              "
            >
              {isEditing ? "Edit Post" : "Compose Thought"}
            </span>

            {!loading && (
              <SaveStatus state={saveState} error={error} />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (!busy) void handleClose();
            }}
            disabled={busy}
            aria-label="Close"
            className="
              flex h-9 w-9 shrink-0 items-center justify-center
              rounded-full text-[#928779]
              transition-colors hover:bg-[#EBE4D9]
              hover:text-[#49443C] disabled:opacity-40
            "
          >
            <X size={18} />
          </button>
        </header>

        {/* MAIN EDITING AREA */}
        <div
          className="
            min-h-0 flex-1 overflow-y-auto overscroll-contain
            px-5 py-6 sm:px-10 sm:py-8
          "
        >
          <div className="flex min-h-full flex-col">
            <textarea
              ref={textareaRef}
              value={bodyMd}
              onChange={(event) => setBodyMd(event.target.value)}
              onPaste={handlePaste}
              placeholder="Write a thought, insight, or drop a link…"
              disabled={busy}
              rows={4}
              className="
                w-full flex-1 resize-none border-0 bg-transparent p-0
                font-serif text-[22px] font-normal
                leading-[1.65] tracking-[-0.015em]
                text-[#49443C] outline-none ring-0
                placeholder:text-[#B0A697]
                focus:border-0 focus:outline-none focus:ring-0
                sm:text-[25px]
              "
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
                      onChange={(event) =>
                        setLinkUrl(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && linkUrl.trim()) {
                          event.preventDefault();
                          void parseLink(linkUrl);
                        }
                      }}
                      placeholder="Paste URL and press Enter"
                      disabled={busy || isParsing}
                      className="
                        min-w-0 flex-1 rounded-2xl
                        border border-[#E4DCCF] bg-[#FCFAF6]
                        px-4 py-3 text-[14px] text-[#49443C]
                        outline-none placeholder:text-[#A69C8E]
                        focus:border-[#CFC3B1]
                      "
                    />

                    <button
                      type="button"
                      onClick={() => void parseLink(linkUrl)}
                      disabled={
                        busy ||
                        isParsing ||
                        !linkUrl.trim()
                      }
                      className="
                        rounded-full bg-[#6C6559] px-4 py-3
                        font-mono text-[10px] uppercase
                        tracking-[0.12em] text-white
                        transition-colors hover:bg-[#575145]
                        disabled:opacity-40
                      "
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
                className="
                  mt-5 rounded-2xl border border-[#E8D3CB]
                  bg-[#F8ECE7] p-4 text-[13px]
                  leading-relaxed text-[#995E52]
                "
                role="alert"
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <footer
          className="
            flex shrink-0 items-center justify-between gap-3
            border-t border-[#EAE2D7] bg-[#F7F4EE]
            px-5 py-4
            pb-[max(16px,env(safe-area-inset-bottom))]
            sm:px-8
          "
        >
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
              onClick={() => fileRef.current?.click()}
              disabled={busy || loading}
              aria-label="Add image"
              title="Attach image"
              className="
                flex h-10 w-10 shrink-0 items-center justify-center
                rounded-full border border-[#E4DCCF]
                bg-[#FCFAF6] text-[#71685C]
                shadow-[0_1px_4px_rgba(75,62,45,0.03)]
                transition-colors hover:border-[#CFC3B1]
                hover:bg-white hover:text-[#49443C]
                disabled:opacity-40
              "
            >
              <ImageIcon size={17} />
            </button>

            {canClear && hasContent && (
              <button
                type="button"
                onClick={() => void clearDraft()}
                disabled={busy || isClearing}
                className="
                  rounded-full border border-[#E4DCCF]
                  bg-[#FCFAF6] px-3.5 py-2.5
                  font-mono text-[10px] uppercase
                  tracking-[0.1em] text-[#71685C]
                  transition-colors hover:border-[#CFC3B1]
                  hover:bg-white hover:text-[#49443C]
                  disabled:opacity-40
                "
              >
                {isClearing ? "Clearing…" : "Clear Draft"}
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span
              className="
                hidden font-mono text-[9px]
                tracking-wide text-[#A49A8C] sm:inline
              "
            >
              Cmd + Enter to post
            </span>

            <button
              type="button"
              onClick={() => void finish()}
              disabled={!canPost || busy}
              className="
                rounded-full bg-[#6C6559] px-6 py-3
                font-mono text-[11px] font-medium
                uppercase tracking-[0.14em] text-white
                transition-colors hover:bg-[#575145]
                active:scale-[0.98]
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              {isPublishing ? "Publishing…" : "Post"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
