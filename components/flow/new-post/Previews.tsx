"use client";

import Image from "next/image";
import { isHttpUrl } from "./utils";
import type {
  LinkPreview,
  YouTubeMetadata,
} from "./types";

type ShimmerVariant = "link" | "youtube" | "image";

type ShimmerPreviewProps = {
  text?: string;
  /** Match the media box of the preview this shimmer is standing in for. */
  variant?: ShimmerVariant;
};

const SHIMMER_MEDIA: Record<ShimmerVariant, string> = {
  link: "aspect-[1.91/1]",
  youtube: "aspect-video",
  image: "aspect-[4/3]",
};

export function ShimmerPreview({
  text = "Loading preview…",
  variant = "link",
}: ShimmerPreviewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.02]">
      <div className="animate-pulse">
        <div
          className={`w-full bg-black/[0.06] ${SHIMMER_MEDIA[variant]}`}
        />

        <div className="space-y-2 p-4">
          <div className="h-3 w-2/3 rounded-sm bg-black/[0.08]" />
          <div className="h-3 w-1/2 rounded-sm bg-black/[0.06]" />

          <div className="pt-1 text-[10px] uppercase tracking-[0.16em] text-black/35">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

type YouTubePreviewProps = {
  metadata: YouTubeMetadata;
  url: string;
};

export function YouTubePreview({
  metadata,
  url,
}: YouTubePreviewProps) {
  const thumbnail =
    metadata.thumbnail_url;

  const title =
    metadata.title ||
    "YouTube video";

  const author =
    metadata.author_name;
  const safeUrl = isHttpUrl(url) ? url : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.02]">
      <div className="relative aspect-video w-full overflow-hidden bg-black/[0.06]">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.16em] text-black/35">
            YouTube
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-16 items-center justify-center rounded-[10px] bg-black/75">
            <span
              aria-hidden="true"
              className="ml-1 border-y-[8px] border-y-transparent border-l-[12px] border-l-white"
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="line-clamp-2 text-sm font-medium leading-[1.4] text-black">
          {title}
        </div>

        {author ? (
          <div className="mt-1.5 line-clamp-1 text-xs leading-[1.45] text-black/50">
            {author}
          </div>
        ) : null}

        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 block truncate rounded-sm text-[10px] uppercase tracking-[0.12em] text-black/35 underline-offset-4 transition-colors hover:text-black/60 focus-visible:text-black/60 focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#37332D]/45"
        >
          youtube.com
        </a>
      </div>
    </div>
  );
}

type LinkPreviewCardProps = {
  preview: LinkPreview;
  url: string;
};

export function LinkPreviewCard({
  preview,
  url,
}: LinkPreviewCardProps) {
  const title =
    preview.title ||
    preview.domain ||
    url;

  const description =
    preview.description;

  const sourceLabel =
    preview.site_name?.trim() ||
    preview.domain ||
    "Open link";
  const safeUrl = isHttpUrl(url) ? url : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.02]">
      {preview.image ? (
        <div className="relative aspect-[1.91/1] w-full overflow-hidden bg-black/[0.06]">
          <Image
            src={preview.image}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : null}

      <div className="p-4">
        <div className="line-clamp-2 text-sm font-medium leading-[1.4] text-black">
          {title}
        </div>

        {description ? (
          <div className="mt-1.5 line-clamp-2 text-xs leading-[1.45] text-black/50">
            {description}
          </div>
        ) : null}

        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 block truncate rounded-sm text-[10px] uppercase tracking-[0.12em] text-black/35 underline-offset-4 transition-colors hover:text-black/60 focus-visible:text-black/60 focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#37332D]/45"
        >
          {sourceLabel}
        </a>
      </div>
    </div>
  );
}

type ImagePreviewProps = {
  src: string;
  alt?: string;
};

export function ImagePreview({
  src,
  alt = "Selected image",
}: ImagePreviewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.02]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F4F1EB]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 640px"
          className="object-contain"
          unoptimized
        />
      </div>
    </div>
  );
}