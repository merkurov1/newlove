"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Loader2, Wand2, X } from "lucide-react";
import {
  ImagePreview,
  LinkPreviewCard,
  ProcessingStatus,
  YouTubePreview,
} from "./new-post/Previews";
import { useNewPostModal } from "./new-post/useNewPostModal";
import type { NewPostModalProps, SaveState } from "./new-post/types";

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
  notice,
}: {
  state: SaveState;
  notice?: string | null;
}) {
  if (notice) {
    return (
      <span
        role="status"
        aria-live="polite"
        title={notice}
        className="block truncate text-[11px] leading-none text-[#9A9388]"
      >
        {notice}
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
    <span role="status" aria-live="polite" className="truncate text-[11px] leading-none text-[#9A9388]">
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
    isProofreading,
    isEditing,
    canPost,
    canProofread,
    busy,
    fileRef,
    textareaRef,
    handlePaste,
    finish,
    proofread,
    proofreadStatus,
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
  const loading = isInitializing || !item;

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

  // An edited item is disabled while it loads. Focus the writing area once it
  // becomes editable so the composer always opens as a writing surface.
  useEffect(() => {
    if (!open || loading) return;

    if (document.activeElement === textareaRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, loading, textareaRef]);

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

  // One truthful line belongs to the fixed bottom row, never to the writing
  // column: parsing or uploading must not push the text or attachments around.
  const processingLabel = isUploadingImage
    ? "Uploading image…"
    : isParsingYouTube
      ? "Loading video…"
      : isParsingLink
        ? "Loading link…"
        : null;

  const hasAttachments =
    Boolean(youtubeMetadata) || links.length > 0 || images.length > 0;

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
          sm:h-[min(88dvh,820px,var(--pi-composer-height,var(--tg-viewport-height,100dvh)))]
          sm:max-h-[calc(100dvh-2rem)] sm:w-[min(92vw,54rem)]
          sm:max-w-[54rem] sm:rounded-2xl
        "
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* The only permanent control in the top row. */}
        <header className="flex shrink-0 items-center justify-end pl-[max(22px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] pr-[max(22px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] pt-[max(12px,env(safe-area-inset-top),var(--tg-safe-area-top,0px))] sm:pl-[max(40px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] sm:pr-[max(40px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] sm:pt-[max(16px,env(safe-area-inset-top),var(--tg-safe-area-top,0px))]">
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

        {/* Writing area: no field borders, no inner card, no focus frame. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pl-[max(22px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] pr-[max(22px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] pb-4 pt-1 sm:pl-[max(40px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))] sm:pr-[max(40px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))] sm:pb-6 sm:pt-2">
          <div className="flex min-h-full flex-col">
            <div
              data-composer-writing
              className="group flex min-h-0 flex-1 flex-col"
            >
              <span
                aria-hidden="true"
                data-composer-focus-rule
                className="
                  mb-1 mt-0.5 block h-0.5 w-8 rounded-full bg-transparent
                  group-focus-within:bg-[#8A8378]
                "
              />
              <textarea
                ref={textareaRef}
                value={bodyMd}
                onChange={(event) => setBodyMd(event.target.value)}
                onPaste={handlePaste}
                disabled={loading || isPublishing}
                rows={8}
                aria-label="Post text"
                className="
                  min-h-[9rem] w-full flex-1 resize-none appearance-none
                  border-0 bg-transparent p-0 font-serif text-lg
                  leading-[1.7] tracking-[-0.01em] text-[#49443C]
                  caret-[#37332D] outline-none ring-0
                  focus:outline-none focus:ring-0
                  focus-visible:outline-none focus-visible:ring-0
                  sm:min-h-[16rem] sm:text-xl sm:leading-[1.68]
                "
              />
            </div>

            {hasAttachments && (
              <div className="mt-4 space-y-1.5" aria-label="Attachments">
                {youtubeMetadata && (
                  <YouTubePreview
                    metadata={youtubeMetadata}
                    url={
                      youtubeMetadata.video_id
                        ? `https://www.youtube.com/watch?v=${youtubeMetadata.video_id}`
                        : ""
                    }
                    onRemove={removeYouTube}
                  />
                )}

                {links.map((link) => (
                  <LinkPreviewCard
                    key={link.id}
                    preview={link.preview}
                    url={link.url}
                    onRemove={() => removeLink(link.id)}
                  />
                ))}

                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {images.map((image) => (
                      <ImagePreview
                        key={image.id}
                        src={image.url}
                        alt={image.name || "Flow image"}
                        onRemove={() => removeImage(image.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p
                className="mt-3 text-xs leading-relaxed text-[#A45E50]"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Four permanent controls in total: close above, attach, proofread
            and post/save here. Parsing, proofread and save feedback share
            this fixed row. */}
        <footer
          className="
            flex shrink-0 items-center gap-2
            pl-[max(22px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))]
            pr-[max(22px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))]
            pb-[max(12px,env(safe-area-inset-bottom),var(--tg-safe-area-bottom,0px))]
            pt-2
            sm:pl-[max(40px,env(safe-area-inset-left),var(--tg-safe-area-left,0px))]
            sm:pr-[max(40px,env(safe-area-inset-right),var(--tg-safe-area-right,0px))]
            sm:pb-[max(20px,env(safe-area-inset-bottom),var(--tg-safe-area-bottom,0px))]
          "
        >
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
              ${images.length > 0 ? "text-[#37332D]" : "text-[#898277]"}
            `}
          >
            <ImageIcon size={19} strokeWidth={1.6} />
          </button>

          <div className="flex min-w-0 flex-1 items-center">
            {processingLabel ? (
              <ProcessingStatus text={processingLabel} />
            ) : (
              <SaveStatus state={saveState} notice={proofreadStatus} />
            )}
          </div>

          <button
            type="button"
            onClick={() => void proofread()}
            disabled={!canProofread}
            aria-label="Proofread text"
            aria-busy={isProofreading}
            className="
              flex h-11 w-11 shrink-0 items-center justify-center
              rounded-full text-[#898277] transition-colors
              hover:bg-black/[0.05] hover:text-[#37332D]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[#37332D]/45 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#FAF8F4]
              disabled:cursor-not-allowed disabled:opacity-40
            "
          >
            {isProofreading ? (
              <Loader2
                size={18}
                strokeWidth={1.6}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Wand2 size={18} strokeWidth={1.6} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void finish()}
            disabled={!canPost || busy}
            className="
              min-h-11 shrink-0 rounded-full bg-[#37332D] px-6 py-2.5
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
