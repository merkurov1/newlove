"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useState } from "react";
import { getDomain, isHttpUrl } from "./utils";
import type { LinkPreview, YouTubeMetadata } from "./types";

function safeImageSource(value?: string | null): string | null {
  const candidate = value?.trim();

  if (!candidate) return null;

  if (candidate.startsWith("/")) return candidate;

  return isHttpUrl(candidate) ? candidate : null;
}

function firstLetter(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "•";
}

function Favicon({ src, label }: { src: string | null; label: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="
          flex h-4 w-4 shrink-0 items-center justify-center
          rounded-[3px] bg-black/[0.06] text-[9px] font-medium
          uppercase leading-none text-[#8A8378]
        "
      >
        {firstLetter(label)}
      </span>
    );
  }

  return (
    <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-[3px]">
      <Image
        src={src}
        alt=""
        fill
        sizes="16px"
        className="object-contain"
        unoptimized
        onError={() => setFailed(true)}
      />
    </span>
  );
}

type RemoveButtonProps = {
  label: string;
  onClick: () => void;
  tone?: "light" | "dark";
  size?: "small" | "medium";
};

function RemoveButton({
  label,
  onClick,
  tone = "light",
  size = "medium",
}: RemoveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`
        flex min-h-0 min-w-0 shrink-0 items-center justify-center
        rounded-full opacity-100 transition-colors
        focus-visible:opacity-100 focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-offset-1
        ${
          size === "small"
            ? "h-6 w-6"
            : "h-7 w-7"
        }
        ${
          tone === "dark"
            ? "bg-black/55 text-white hover:bg-black/75 focus-visible:ring-white focus-visible:ring-offset-black/40"
            : "text-[#A39A8D] hover:bg-black/[0.06] hover:text-[#37332D] focus-visible:ring-[#37332D]/35 focus-visible:ring-offset-[#FAF8F4]"
        }
      `}
    >
      <X size={size === "small" ? 11 : 13} strokeWidth={1.8} />
    </button>
  );
}

type ProcessingStatusProps = {
  text: string;
};

/**
 * A single quiet line for parsing/uploading. It lives in the fixed bottom row,
 * so it never inserts a block into the writing column or shifts attachments.
 */
export function ProcessingStatus({ text }: ProcessingStatusProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 text-[11px] leading-none text-[#9A9388]"
    >
      <span
        aria-hidden="true"
        className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-[#B8B0A4]"
      />
      <span className="truncate">{text}</span>
    </span>
  );
}

type YouTubePreviewProps = {
  metadata: YouTubeMetadata;
  url: string;
  onRemove?: () => void;
  removeLabel?: string;
};

export function YouTubePreview({
  metadata,
  url,
  onRemove,
  removeLabel = "Remove video",
}: YouTubePreviewProps) {
  const thumbnail = safeImageSource(metadata.thumbnail_url);
  const title = metadata.title?.trim() || "YouTube video";
  const author = metadata.author_name?.trim();
  const safeUrl = isHttpUrl(url) ? url : undefined;
  const identity = author ? `${author} · YouTube` : "YouTube";

  return (
    <div
      data-attachment="youtube"
      className="
        flex min-h-9 w-full items-center gap-2 rounded-md
        bg-black/[0.035] py-1 pl-1 pr-1 sm:max-w-[36rem]
      "
    >
      <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-[4px] bg-black/[0.06]">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-full w-full items-center justify-center"
          >
            <span className="ml-0.5 border-y-[5px] border-y-transparent border-l-[8px] border-l-[#A39A8D]" />
          </span>
        )}
      </span>

      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="
          min-w-0 flex-1 rounded-sm py-0.5
          focus-visible:underline focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-inset
          focus-visible:ring-[#37332D]/30
        "
      >
        <span className="block truncate text-xs leading-tight text-[#4B463E]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[10px] uppercase leading-none tracking-[0.12em] text-[#A39A8D]">
          {identity}
        </span>
      </a>

      {onRemove ? (
        <RemoveButton label={removeLabel} onClick={onRemove} />
      ) : null}
    </div>
  );
}

type LinkPreviewCardProps = {
  preview: LinkPreview;
  url: string;
  onRemove?: () => void;
  removeLabel?: string;
};

function hasPreviewMetadata(preview: LinkPreview, url: string): boolean {
  const title = preview.title?.trim();

  return Boolean(
    preview.site_name?.trim() ||
      preview.domain?.trim() ||
      preview.description?.trim() ||
      preview.image?.trim() ||
      preview.favicon?.trim() ||
      (title && title !== url.trim()),
  );
}

/**
 * A compact receipt that proves the destination is attached. The full preview
 * image and description stay out of the composer; the serialized metadata is
 * untouched and still carries them to the published post.
 */
export function LinkPreviewCard({
  preview,
  url,
  onRemove,
  removeLabel = "Remove link",
}: LinkPreviewCardProps) {
  const domain = preview.domain?.trim() || getDomain(url) || "";
  const rawTitle = preview.title?.trim();
  const title = (rawTitle && rawTitle !== url.trim() ? rawTitle : "") || domain || url;
  const sourceLabel = preview.site_name?.trim() || domain || "Open link";
  const previewUnavailable = !hasPreviewMetadata(preview, url);
  const showSource =
    previewUnavailable || sourceLabel.toLowerCase() !== title.toLowerCase();
  const favicon = safeImageSource(preview.favicon);
  const safeUrl = isHttpUrl(url) ? url : undefined;

  return (
    <div
      data-attachment="link"
      data-preview-state={previewUnavailable ? "fallback" : "complete"}
      className="
        flex min-h-9 w-full items-center gap-2 rounded-md
        bg-black/[0.035] py-1 pl-2 pr-1 sm:max-w-[36rem]
      "
    >
      <Favicon src={favicon} label={sourceLabel} />

      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="
          flex min-w-0 flex-1 items-baseline gap-2 rounded-sm py-0.5
          transition-colors hover:text-[#37332D]
          focus-visible:underline focus-visible:outline-none
          focus-visible:ring-2 focus-visible:ring-inset
          focus-visible:ring-[#37332D]/30
        "
      >
        <span className="min-w-0 truncate text-xs leading-tight text-[#4B463E]">
          {title}
        </span>
        {showSource ? (
          <span
            className={`
              truncate text-[10px] uppercase leading-none tracking-[0.12em] text-[#A39A8D]
              ${previewUnavailable ? "shrink-0" : "max-w-[45%] shrink-0"}
            `}
          >
            {previewUnavailable ? "Preview unavailable" : sourceLabel}
          </span>
        ) : null}
      </a>

      {onRemove ? (
        <RemoveButton label={removeLabel} onClick={onRemove} />
      ) : null}
    </div>
  );
}

type ImagePreviewProps = {
  src: string;
  alt?: string;
  onRemove?: () => void;
  removeLabel?: string;
};

/**
 * A 64px thumbnail strip keeps photos identifiable without displacing the
 * writing surface. The remove affordance sits on the thumbnail itself, so no
 * permanent toolbar is required.
 */
export function ImagePreview({
  src,
  alt = "Selected image",
  onRemove,
  removeLabel = "Remove image",
}: ImagePreviewProps) {
  return (
    <div
      data-attachment="image"
      title={alt}
      className="
        relative h-16 w-16 shrink-0 overflow-hidden rounded-md
        bg-[#F4F1EB]
      "
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="64px"
        className="object-cover"
        unoptimized
      />

      {onRemove ? (
        <div className="absolute right-0.5 top-0.5">
          <RemoveButton
            label={removeLabel}
            onClick={onRemove}
            tone="dark"
            size="small"
          />
        </div>
      ) : null}
    </div>
  );
}
