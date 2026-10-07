"use client";

import Image from "next/image";
import type {
  LinkPreview,
  YouTubeMetadata,
} from "./types";

type ShimmerPreviewProps = {
  text?: string;
};

export function ShimmerPreview({
  text = "Loading preview…",
}: ShimmerPreviewProps) {
  return (
    <div className="mt-3 overflow-hidden border border-black/10 bg-black/[0.02]">
      <div className="animate-pulse">
        <div className="h-32 bg-black/[0.06]" />

        <div className="space-y-2 p-3">
          <div className="h-3 w-2/3 bg-black/[0.08]" />
          <div className="h-3 w-1/2 bg-black/[0.06]" />

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

  return (
    <div className="mt-3 overflow-hidden border border-black/10 bg-black/[0.02]">
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

      <div className="p-3">
        <div className="line-clamp-2 text-sm font-medium leading-5 text-black">
          {title}
        </div>

        {author ? (
          <div className="mt-1 text-xs text-black/50">
            {author}
          </div>
        ) : null}

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-[10px] uppercase tracking-[0.12em] text-black/35 transition-colors hover:text-black/60"
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

  return (
    <div className="mt-3 overflow-hidden border border-black/10 bg-black/[0.02]">
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

      <div className="p-3">
        <div className="line-clamp-2 text-sm font-medium leading-5 text-black">
          {title}
        </div>

        {description ? (
          <div className="mt-1 line-clamp-2 text-xs leading-4 text-black/50">
            {description}
          </div>
        ) : null}

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-[10px] uppercase tracking-[0.12em] text-black/35 transition-colors hover:text-black/60"
        >
          {preview.domain ||
            "Open link"}
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
    <div className="mt-3 overflow-hidden border border-black/10 bg-black/[0.02]">
      <div className="relative aspect-[4/3] w-full overflow-hidden">
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