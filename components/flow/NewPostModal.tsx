"use client";

import { useEffect, useRef } from "react";
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

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Read a numeric CSS variable only when it is a real pixel length.
 * `--tg-viewport-height` defaults to `100dvh` in `app/main.css`, and
 * `parseFloat('100dvh')` silently yields `100`, which would clamp the
 * composer to a 100px strip outside Telegram. Non-px values must be ignored.
 */
function readPixelVariable(name: string): number {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(value);

  return match ? Number.parseFloat(match[1]) : 0;
}

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
  lang,
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
    lang,
  });

  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Remember the trigger before moving focus into the composer.
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    // Safari does not shrink `dvh` for the on-screen keyboard. Follow the
    // visual viewport while open so the composer stays inside the visible area.
    // Telegram Mini Apps publish their own viewport height; use the smaller of
    // the two so neither a keyboard nor collapsing chrome can cover the panel.
    const syncViewportHeight = () => {
      const panel = dialogRef.current;

      if (!panel) return;

      const viewportHeight =
        window.visualViewport?.height || window.innerHeight;
      const telegramHeight = readPixelVariable('--tg-viewport-height');
      const height = Math.round(
        telegramHeight > 0
          ? Math.min(telegramHeight, viewportHeight)
          : viewportHeight,
      );

      if (!Number.isFinite(height) || height <= 0) return;

      panel.style.setProperty('--pi-composer-height', `${height}px`);
      panel.style.setProperty(
        '--pi-composer-offset',
        `${Math.round(window.visualViewport?.offsetTop || 0)}px`,
      );
    };

    syncViewportHeight();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', syncViewportHeight);
    // Safari pans the visual viewport while the keyboard animates without
    // always firing `resize`; the offset must follow that pan as well.
    visualViewport?.addEventListener('scroll', syncViewportHeight);
    window.addEventListener('resize', syncViewportHeight);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
      visualViewport?.removeEventListener('resize', syncViewportHeight);
      visualViewport?.removeEventListener('scroll', syncViewportHeight);
      window.removeEventListener('resize', syncViewportHeight);

      const restoreTarget = restoreFocusRef.current;
      restoreFocusRef.current = null;

      if (restoreTarget && restoreTarget.isConnected) {
        restoreTarget.focus({ preventScroll: true });
      }
    };
  }, [open, textareaRef]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;

      if (!dialog) return;

      const focusable = getFocusableElements(dialog);

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  const loading = isInitializing || !item;

  return createPortal(
    <div
      className="
        fixed inset-0 z-[9999] flex items-start justify-center
        bg-[#24211D]/25 p-0 backdrop-blur-[3px]
        sm:items-center sm:p-4
      "
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          void handleClose();
        }
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? "Edit Flow post" : "New Flow post"}
        aria-busy={busy}
        tabIndex={-1}
        className="
          flex w-full flex-col overflow-hidden
          h-[var(--pi-composer-height,var(--tg-viewport-height,100dvh))]
          max-h-[var(--pi-composer-height,var(--tg-viewport-height,100dvh))]
          translate-y-[var(--pi-composer-offset,0px)] sm:translate-y-0
          bg-[#FAF8F4] text-[#37332D] outline-none
          sm:h-[min(86dvh,760px,var(--pi-composer-height,var(--tg-viewport-height,100dvh)))] sm:max-h-[calc(100dvh-2rem)]
          sm:max-w-[40rem] sm:rounded-2xl
        "
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Minimal top row */}
        <header className="flex shrink-0 items-center justify-between pl-[max(20px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] pr-[max(20px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] pt-[max(16px,env(safe-area-inset-top),var(--tg-safe-area-top,0px))] sm:pl-[max(28px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] sm:pr-[max(28px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] sm:pt-[max(20px,env(safe-area-inset-top),var(--tg-safe-area-top,0px))]">
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
              -mr-2 flex h-10 w-10 shrink-0 items-center justify-center
              rounded-full text-[#898277] transition
              hover:bg-black/[0.04] hover:text-[#37332D]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#37332D]/45 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#FAF8F4] disabled:opacity-40
            "
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </header>

        {/* Writing area: no field borders or inner card */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pl-[max(20px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] pr-[max(20px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] pb-5 pt-3 sm:pl-[max(28px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] sm:pr-[max(28px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] sm:pt-4">
          <div className="flex min-h-full flex-col">
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
                focus:ring-0 focus-visible:rounded-[2px]
                focus-visible:outline focus-visible:outline-2
                focus-visible:outline-offset-[6px]
                focus-visible:outline-[#8A8378]
                sm:text-xl
              "
            />

            {/* Automatic URL / YouTube previews */}
            {(isParsingLink || isParsingYouTube) && (
              <div className="mt-4">
                <ShimmerPreview
                  variant={
                    isParsingYouTube ? "youtube" : "link"
                  }
                  text={
                    isParsingYouTube
                      ? "Loading video…"
                      : "Loading link…"
                  }
                />
              </div>
            )}

            {isUploadingImage && (
              <div className="mt-4">
                <ShimmerPreview
                  variant="image"
                  text="Uploading image…"
                />
              </div>
            )}

            {youtubeMetadata && (
              <div className="group relative mt-4">
                <button
                  type="button"
                  onClick={removeYouTube}
                  aria-label="Remove video"
                  title="Remove video"
                  className="
                    absolute right-2 top-2 z-10 flex h-8 w-8
                    items-center justify-center rounded-full
                    bg-black/55 text-white opacity-100 transition
                    hover:bg-black/75 focus-visible:opacity-100
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-white focus-visible:ring-offset-2
                    focus-visible:ring-offset-black/40
                    sm:opacity-0 sm:group-hover:opacity-100
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
              <div className="mt-4 space-y-4">
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
                        hover:bg-black/75 focus-visible:opacity-100
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-white focus-visible:ring-offset-2
                        focus-visible:ring-offset-black/40
                        sm:opacity-0 sm:group-hover:opacity-100
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
              <div
                className={
                  images.length === 1
                    ? "mt-4"
                    : "mt-4 grid grid-cols-2 gap-3 sm:gap-4"
                }
              >
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
                        hover:bg-black/75 focus-visible:opacity-100
                        focus-visible:outline-none focus-visible:ring-2
                        focus-visible:ring-white focus-visible:ring-offset-2
                        focus-visible:ring-offset-black/40
                        sm:opacity-0 sm:group-hover:opacity-100
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
            pl-[max(20px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))]
            pr-[max(20px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))]
            pb-[max(16px,env(safe-area-inset-bottom),var(--tg-safe-area-bottom,0px))]
            pt-3 sm:pl-[max(28px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] sm:pr-[max(28px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] sm:pb-[max(20px,env(safe-area-inset-bottom),var(--tg-safe-area-bottom,0px))]
          "
        >
          <div className="flex min-w-0 items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
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
                flex h-11 w-11 shrink-0 items-center justify-center
                rounded-full transition-colors
                hover:bg-black/[0.05]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[#37332D]/45 focus-visible:ring-offset-2
                focus-visible:ring-offset-[#FAF8F4] disabled:opacity-40
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
                  rounded-sm text-xs text-[#92897D] transition-colors
                  hover:text-[#37332D] focus-visible:text-[#37332D]
                  focus-visible:underline focus-visible:underline-offset-4
                  focus-visible:outline-none disabled:opacity-40
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
              min-h-11 rounded-full bg-[#37332D] px-6 py-2.5
              text-sm text-white transition-colors
              hover:bg-[#514B42] active:scale-[0.98]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#37332D] focus-visible:ring-offset-2
              focus-visible:ring-offset-[#FAF8F4]
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
