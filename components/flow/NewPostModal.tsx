"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Image as ImageIcon, Video, Link2 } from "lucide-react";
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
          Publishing & Crossposting…
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
  } = useNewPostModal({
    open,
    onClose,
    onCreated,
    itemId,
  });

  const [tempLinkInput, setTempLinkInput] = useState("");
  const [tempYouTubeInput, setTempYouTubeInput] = useState("");

  // Lock background scrolling without moving the modal with the header.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Focus the editor
  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, textareaRef]);

  if (!open) return null;

  const loading = isInitializing || !item;
  const hasContent = canClear;

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
          relative flex h-[min(90dvh,840px)]
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
            border-b border-[#EAE2D7] px-5 py-3.5
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
              {isEditing ? "Edit Flow Post" : "Compose Flow Post"}
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
            px-5 py-5 sm:px-10 sm:py-7
          "
        >
          <div className="flex min-h-full flex-col">
            {/* Optional Title input for structured posts */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              disabled={busy}
              className="
                mb-3 w-full border-0 bg-transparent p-0
                font-serif text-[20px] font-medium
                text-[#2D2A26] outline-none ring-0
                placeholder:text-[#C4B9AA]
                focus:border-0 focus:outline-none focus:ring-0
                sm:text-[23px]
              "
            />

            {/* Main Text Content */}
            <textarea
              ref={textareaRef}
              value={bodyMd}
              onChange={(event) => setBodyMd(event.target.value)}
              onPaste={handlePaste}
              placeholder="Write a thought, insight, or drop links and media…"
              disabled={busy}
              rows={4}
              className="
                w-full flex-1 resize-none border-0 bg-transparent p-0
                font-serif text-[18px] font-normal
                leading-[1.65] tracking-[-0.01em]
                text-[#49443C] outline-none ring-0
                placeholder:text-[#B0A697]
                focus:border-0 focus:outline-none focus:ring-0
                sm:text-[20px]
              "
            />

            {/* ATTACHED MEDIA CONTAINER - Text, Link, Image, YouTube can all coexist */}
            <div className="mt-6 space-y-4">
              {/* YouTube Input Box */}
              {showYouTubeInput && !youtubeMetadata && (
                <div className="rounded-2xl border border-[#E4DCCF] bg-[#FCFAF6] p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={tempYouTubeInput}
                      onChange={(e) => setTempYouTubeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tempYouTubeInput.trim()) {
                          e.preventDefault();
                          void parseYouTube(tempYouTubeInput);
                          setTempYouTubeInput("");
                        }
                      }}
                      placeholder="Paste YouTube video or Shorts URL"
                      disabled={isParsingYouTube}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-[#49443C] outline-none placeholder:text-[#A69C8E]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tempYouTubeInput.trim()) {
                          void parseYouTube(tempYouTubeInput);
                          setTempYouTubeInput("");
                        }
                      }}
                      disabled={isParsingYouTube || !tempYouTubeInput.trim()}
                      className="rounded-full bg-[#6C6559] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white hover:bg-[#575145] disabled:opacity-40"
                    >
                      {isParsingYouTube ? "…" : "Embed"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowYouTubeInput(false)}
                      className="p-1 text-[#928779] hover:text-[#49443C]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* YouTube Shimmer */}
              {isParsingYouTube && (
                <ShimmerPreview text="Resolving YouTube video…" />
              )}

              {/* YouTube Attached Preview */}
              {youtubeMetadata && (
                <div className="relative group rounded-2xl border border-[#E4DCCF] bg-[#FCFAF6] overflow-hidden p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={removeYouTube}
                    title="Remove video"
                    className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                  <YouTubePreview
                    metadata={youtubeMetadata}
                    url={youtubeUrl || `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`}
                  />
                </div>
              )}

              {/* Web Link Input Box */}
              {showLinkInput && !linkPreview && (
                <div className="rounded-2xl border border-[#E4DCCF] bg-[#FCFAF6] p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={tempLinkInput}
                      onChange={(e) => setTempLinkInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tempLinkInput.trim()) {
                          e.preventDefault();
                          void parseLink(tempLinkInput);
                          setTempLinkInput("");
                        }
                      }}
                      placeholder="Paste web link URL (https://…)"
                      disabled={isParsingLink}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-[#49443C] outline-none placeholder:text-[#A69C8E]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tempLinkInput.trim()) {
                          void parseLink(tempLinkInput);
                          setTempLinkInput("");
                        }
                      }}
                      disabled={isParsingLink || !tempLinkInput.trim()}
                      className="rounded-full bg-[#6C6559] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white hover:bg-[#575145] disabled:opacity-40"
                    >
                      {isParsingLink ? "…" : "Preview"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLinkInput(false)}
                      className="p-1 text-[#928779] hover:text-[#49443C]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Link Shimmer */}
              {isParsingLink && (
                <ShimmerPreview text="Reading link preview…" />
              )}

              {/* Link Attached Preview */}
              {linkPreview && (
                <div className="relative group rounded-2xl border border-[#E4DCCF] bg-[#FCFAF6] overflow-hidden p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={removeLink}
                    title="Remove link"
                    className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                  <LinkPreviewCard
                    preview={linkPreview}
                    url={linkUrl || linkPreview.url || ""}
                  />
                </div>
              )}

              {/* Image Attached Preview */}
              {imagePreview && (
                <div className="relative group rounded-2xl border border-[#E4DCCF] bg-[#FCFAF6] overflow-hidden p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={removeImage}
                    title="Remove image"
                    className="absolute top-3 right-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
                  >
                    <X size={14} />
                  </button>
                  <ImagePreview
                    src={imagePreview}
                    alt={imageName || "Flow image"}
                  />
                </div>
              )}
            </div>

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
            px-5 py-3.5
            pb-[max(16px,env(safe-area-inset-bottom))]
            sm:px-8 sm:py-4
          "
        >
          {/* Quick Media Attach Buttons */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Attach Image */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || loading}
              aria-label="Add image"
              title="Attach image"
              className={`
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-full border transition-colors disabled:opacity-40
                ${imagePreview
                  ? "border-[#6C6559] bg-[#EAE2D7] text-[#49443C]"
                  : "border-[#E4DCCF] bg-[#FCFAF6] text-[#71685C] hover:border-[#CFC3B1] hover:bg-white hover:text-[#49443C]"
                }
              `}
            >
              <ImageIcon size={16} />
            </button>

            {/* Attach YouTube */}
            <button
              type="button"
              onClick={() => setShowYouTubeInput((prev) => !prev)}
              disabled={busy || loading}
              aria-label="Add YouTube video"
              title="Attach YouTube video"
              className={`
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-full border transition-colors disabled:opacity-40
                ${youtubeMetadata || showYouTubeInput
                  ? "border-[#6C6559] bg-[#EAE2D7] text-[#49443C]"
                  : "border-[#E4DCCF] bg-[#FCFAF6] text-[#71685C] hover:border-[#CFC3B1] hover:bg-white hover:text-[#49443C]"
                }
              `}
            >
              <Video size={16} />
            </button>

            {/* Attach Link */}
            <button
              type="button"
              onClick={() => setShowLinkInput((prev) => !prev)}
              disabled={busy || loading}
              aria-label="Add link"
              title="Attach web link"
              className={`
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-full border transition-colors disabled:opacity-40
                ${linkPreview || showLinkInput
                  ? "border-[#6C6559] bg-[#EAE2D7] text-[#49443C]"
                  : "border-[#E4DCCF] bg-[#FCFAF6] text-[#71685C] hover:border-[#CFC3B1] hover:bg-white hover:text-[#49443C]"
                }
              `}
            >
              <Link2 size={16} />
            </button>

            {canClear && hasContent && (
              <button
                type="button"
                onClick={() => void clearDraft()}
                disabled={busy || isClearing}
                className="
                  ml-1 rounded-full border border-[#E4DCCF]
                  bg-[#FCFAF6] px-3 py-1.5
                  font-mono text-[9px] uppercase
                  tracking-[0.1em] text-[#71685C]
                  transition-colors hover:border-[#CFC3B1]
                  hover:bg-white hover:text-[#49443C]
                  disabled:opacity-40
                "
              >
                {isClearing ? "…" : "Clear"}
              </button>
            )}
          </div>

          {/* Right Action: Crosspost Status & Post Button */}
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="
                hidden font-mono text-[9px]
                tracking-wider text-[#A49A8C] sm:inline
              "
              title="Post will be synced to Telegram (Pierrot) and Bluesky"
            >
              ✦ Telegram & Bluesky
            </span>

            <button
              type="button"
              onClick={() => void finish()}
              disabled={!canPost || busy}
              className="
                rounded-full bg-[#6C6559] px-5 py-2.5
                font-mono text-[11px] font-medium
                uppercase tracking-[0.14em] text-white
                transition-colors hover:bg-[#575145]
                active:scale-[0.98]
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              {isPublishing ? "Posting…" : isEditing ? "Save" : "Post"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
