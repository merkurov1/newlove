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
        className="max-w-[220px] truncate text-[9px] uppercase tracking-[0.18em] text-red-400"
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
        <span className="text-[9px] uppercase tracking-[0.2em] text-neutral-300">
          Loading
        </span>
      );

    case "saving":
      return (
        <span className="text-[9px] uppercase tracking-[0.2em] text-neutral-400">
          Saving
        </span>
      );

    case "publishing":
      return (
        <span className="text-[9px] uppercase tracking-[0.2em] text-neutral-400">
          Publishing
        </span>
      );

    case "clearing":
      return (
        <span className="text-[9px] uppercase tracking-[0.2em] text-neutral-400">
          Clearing
        </span>
      );

    case "saved":
      return (
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-neutral-400">
          SAVED
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-neutral-300"
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

  if (!open) {
    return null;
  }

  const loading = isInitializing || !item;

  const hasContent =
    Boolean(bodyMd.trim()) ||
    Boolean(linkUrl) ||
    Boolean(imagePreview);

  const showLink =
    mode === "link" && Boolean(linkUrl);

  const showVideo =
    mode === "video" && Boolean(linkUrl);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-3 backdrop-blur-[6px] sm:p-6"
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
        className="
          relative
          flex
          h-[calc(100dvh-24px)]
          w-full
          flex-col
          overflow-hidden
          rounded-[28px]
          bg-[#fffefa]
          shadow-[0_30px_90px_rgba(0,0,0,0.18)]
          sm:h-[min(700px,calc(100dvh-48px))]
          sm:max-w-[990px]
          sm:rounded-[34px]
        "
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={() => {
            if (!busy) {
              void handleClose();
            }
          }}
          disabled={busy}
          aria-label="Close"
          className="
            absolute
            right-5
            top-5
            z-30
            flex
            h-7
            w-7
            items-center
            justify-center
            text-[22px]
            font-light
            leading-none
            text-neutral-300
            transition-colors
            hover:text-neutral-800
            disabled:cursor-not-allowed
            disabled:opacity-30
            sm:right-7
            sm:top-7
          "
        >
          ×
        </button>

        {/* Writing area */}
        <div
          className="
            min-h-0
            flex-1
            overflow-y-auto
            overscroll-contain
            px-8
            pb-4
            pt-20
            sm:px-9
            sm:pt-[72px]
          "
        >
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
                className="
                  min-h-[180px]
                  w-full
                  flex-1
                  resize-none
                  border-0
                  bg-transparent
                  p-0
                  font-serif
                  text-[25px]
                  font-light
                  leading-[1.5]
                  tracking-[-0.01em]
                  text-neutral-900
                  outline-none
                  placeholder:text-neutral-300
                  sm:min-h-[360px]
                  sm:text-[27px]
                "
              />

              {/* Link preview */}
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
                          setLinkUrl(
                            event.target.value,
                          );
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key ===
                              "Enter" &&
                            linkUrl.trim()
                          ) {
                            event.preventDefault();
                            void parseLink(
                              linkUrl,
                            );
                          }
                        }}
                        placeholder="URL"
                        disabled={
                          busy ||
                          isParsing
                        }
                        className="
                          min-w-0
                          flex-1
                          border-0
                          bg-transparent
                          px-0
                          py-2
                          text-sm
                          text-neutral-800
                          outline-none
                          placeholder:text-neutral-300
                        "
                      />

                      <button
                        type="button"
                        onClick={() => {
                          void parseLink(
                            linkUrl,
                          );
                        }}
                        disabled={
                          busy ||
                          isParsing ||
                          !linkUrl.trim()
                        }
                        className="
                          rounded-full
                          bg-black
                          px-4
                          py-2
                          text-[10px]
                          uppercase
                          tracking-[0.16em]
                          text-white
                          transition-opacity
                          hover:opacity-80
                          disabled:cursor-not-allowed
                          disabled:opacity-20
                        "
                      >
                        {isParsing
                          ? "…"
                          : "Preview"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* YouTube preview */}
              {showVideo && (
                <div className="mt-6 max-w-[720px]">
                  {isParsing ? (
                    <ShimmerPreview text="Reading YouTube…" />
                  ) : youtubeMetadata ? (
                    <YouTubePreview
                      metadata={
                        youtubeMetadata
                      }
                      url={linkUrl}
                    />
                  ) : null}
                </div>
              )}

              {/* Image preview */}
              {imagePreview && (
                <div className="mt-6 max-w-[720px]">
                  <ImagePreview
                    src={imagePreview}
                    alt={
                      imageName ||
                      "Flow image"
                    }
                  />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 text-[11px] text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div
          className="
            flex
            shrink-0
            items-center
            justify-between
            gap-4
            px-8
            pb-5
            pt-3
            sm:px-9
            sm:pb-6
          "
        >
          {/* Left side */}
          <div className="flex min-w-0 items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Add */}
            <button
              type="button"
              onClick={() => {
                fileRef.current?.click();
              }}
              disabled={
                busy || loading
              }
              aria-label="Add image"
              className="
                flex
                h-12
                w-12
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-white
                text-[25px]
                font-light
                leading-none
                text-neutral-400
                shadow-[0_4px_18px_rgba(0,0,0,0.06)]
                transition-all
                hover:text-black
                hover:shadow-[0_5px_22px_rgba(0,0,0,0.10)]
                disabled:cursor-not-allowed
                disabled:opacity-30
              "
            >
              +
            </button>

            {/* Save state */}
            {!loading && (
              <SaveStatus
                state={saveState}
                error={error}
              />
            )}

            {/* Clear — only when there is actually something to clear */}
            {canClear && hasContent && (
              <button
                type="button"
                onClick={() => {
                  void clearDraft();
                }}
                disabled={
                  busy ||
                  isClearing
                }
                className="
                  ml-1
                  rounded-full
                  px-1.5
                  py-1
                  text-[9px]
                  uppercase
                  tracking-[0.16em]
                  text-neutral-300
                  transition-colors
                  hover:text-neutral-700
                  disabled:cursor-not-allowed
                  disabled:opacity-30
                "
              >
                Clear
              </button>
            )}
          </div>

          {/* Post */}
          <button
            type="button"
            onClick={() => {
              void finish();
            }}
            disabled={
              !canPost ||
              busy
            }
            className="
              shrink-0
              rounded-full
              bg-black
              px-7
              py-3.5
              text-[10px]
              font-medium
              uppercase
              tracking-[0.2em]
              text-white
              transition-all
              hover:opacity-85
              disabled:cursor-not-allowed
              disabled:opacity-[0.14]
              sm:px-8
            "
          >
            {isPublishing
              ? "…"
              : "POST"}
          </button>
        </div>
      </div>
    </div>
  );
}