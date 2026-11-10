import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';

import { sanitizeMetadata } from '@/lib/metadataSanitize';
import {
  type FlowContent,
  type FlowImage,
  type FlowLink,
  type FlowVideo,
  normalizeFlowItem,
} from '@/lib/flow/content';
import {
  resolveFlowMetadataFromContent,
  type FlowSocialMetadata,
} from '@/lib/flow/metadata';
import { getCachedFlowItem } from '@/lib/flow/items-cash';
import { readDistributionUrl } from '@/lib/flow/distribution';
import PierrotContextBlock from '@/components/flow/PierrotContextBlock';
import FlowImageComponent from '@/components/flow/FlowImage';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, flowContentJsonLd } from '@/lib/structuredData';

// Publication data and its ready AI context share one tagged cache entry.
// Edits, deletes and AI context generation invalidate the same tag.
export const revalidate = 3600;

type PageProps = {
  params: Promise<{ slug: string }>;
};

type AIContext = {
  id: string;
  item_id: string;
  content: string | null;
  model: string | null;
  provider: string;
  status: string;
  generated_at: string | null;
};

const SITE_URL = 'https://www.merkurov.love';

async function loadContent(slug: string): Promise<FlowContent | null> {
  const bundle = await getCachedFlowItem(slug);
  if (!bundle) return null;

  return normalizeFlowItem(bundle.item as any, {
    media: bundle.media as any,
  });
}

function imageDimensions(metadata: FlowSocialMetadata) {
  return metadata.imageWidth && metadata.imageHeight
    ? {
        width: metadata.imageWidth,
        height: metadata.imageHeight,
      }
    : {};
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  try {
    const content = await loadContent(decodedSlug);

    if (!content) {
      return sanitizeMetadata({
        title: 'Flow | Anton Merkurov',
        metadataBase: new URL(SITE_URL),
      });
    }

    const metadata = resolveFlowMetadataFromContent(content);
    const type =
      content.contentType === 'article' ||
      content.contentType === 'note' ||
      content.contentType === 'quote'
        ? 'article'
        : 'website';

    return sanitizeMetadata({
      metadataBase: new URL(SITE_URL),
      title: metadata.title,
      description: metadata.description,
      alternates: {
        canonical: metadata.canonicalUrl,
        types: {
          'application/rss+xml': `${SITE_URL}/flow/rss`,
          'application/feed+json': `${SITE_URL}/flow/feed.json`,
        },
      },
      openGraph: {
        title: metadata.title,
        description: metadata.description,
        url: metadata.canonicalUrl,
        siteName: 'Anton Merkurov',
        locale: metadata.language === 'ru' ? 'ru_RU' : 'en_US',
        type,
        ...(type === 'article'
          ? {
              publishedTime: metadata.publishedAt ?? undefined,
              modifiedTime: metadata.updatedAt ?? metadata.publishedAt ?? undefined,
              authors: ['Anton Merkurov'],
            }
          : {}),
        images: [
          {
            url: metadata.previewImage,
            alt: metadata.imageAlt,
            ...(metadata.imageType ? { type: metadata.imageType } : {}),
            ...imageDimensions(metadata),
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: metadata.title,
        description: metadata.description,
        images: [metadata.previewImage],
        site: '@merkurov',
        creator: '@merkurov',
      },
      robots: {
        index: true,
        follow: true,
      },
    });
  } catch (error) {
    console.error('[flow/metadata] Failed:', error);

    return sanitizeMetadata({
      title: 'Flow | Anton Merkurov',
      metadataBase: new URL(SITE_URL),
    });
  }
}

function formatDate(value: string | null): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function estimateReadingTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 170))} min read`;
}

function MarkdownBody({ body }: { body: string }) {
  return (
    <div className="min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mb-5 mt-10 font-serif text-3xl font-light leading-tight text-stone-900 first:mt-0 sm:text-4xl">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h2 className="mb-4 mt-8 font-serif text-2xl font-light leading-tight text-stone-900 sm:text-3xl">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-3 mt-7 font-serif text-xl font-light leading-tight text-stone-900 sm:text-2xl">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-5 whitespace-pre-wrap font-serif text-[18px] font-light leading-[1.8] text-stone-800 sm:text-[20px]">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-medium text-stone-950">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-7 border-l border-stone-400 pl-5 font-serif text-xl font-light leading-relaxed text-stone-600 sm:text-2xl">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            const isInternal = href?.startsWith('/') || href?.includes('merkurov.love');

            if (isInternal && href) {
              return (
                <Link
                  href={href}
                  className="underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
                >
                  {children}
                </Link>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => (
            <figure className="my-7">
              <FlowImageComponent
                src={src}
                alt={alt ?? ''}
                aspectRatio="4 / 3"
                objectFit="contain"
                sizes="(max-width: 768px) 100vw, 720px"
              />
              {alt && (
                <figcaption className="mt-2 font-serif text-sm italic text-stone-500">
                  {alt}
                </figcaption>
              )}
            </figure>
          ),
          ul: ({ children }) => (
            <ul className="mb-6 list-disc space-y-2 pl-6 font-serif text-[18px] leading-8 text-stone-800 sm:text-[20px]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-6 list-decimal space-y-2 pl-6 font-serif text-[18px] leading-8 text-stone-800 sm:text-[20px]">
              {children}
            </ol>
          ),
          hr: () => <hr className="my-9 border-0 border-t border-stone-200" />,
          code: ({ children }) => (
            <code className="bg-stone-100 px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function ImageFigure({
  image,
  index,
  className,
  imageClassName,
  aspectRatio,
  objectFit = 'cover',
  priority = false,
  natural = false,
}: {
  image: FlowImage;
  index: number;
  className?: string;
  imageClassName?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
  priority?: boolean;
  natural?: boolean;
}) {
  const caption = image.caption ?? image.alt;

  return (
    <figure className={className}>
      <a
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-2xl bg-stone-100"
      >
        <FlowImageComponent
          src={image.url}
          alt={caption || `Image ${index + 1}`}
          aspectRatio={
            aspectRatio ||
            (image.width && image.height ? `${image.width} / ${image.height}` : '4 / 3')
          }
          objectFit={objectFit}
          priority={priority || index === 0}
          sizes="(max-width: 768px) 100vw, 720px"
          imageClassName={imageClassName}
          natural={natural}
          style={natural ? { maxHeight: '76vh' } : undefined}
        />
      </a>
      {caption && (
        <figcaption className="mt-2 text-center font-serif text-xs italic text-stone-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function SmartGallery({ images }: { images: FlowImage[] }) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <ImageFigure
        image={images[0]}
        index={0}
        className="my-6"
        aspectRatio="4 / 3"
        objectFit="contain"
        priority
        natural
      />
    );
  }

  if (images.length === 2) {
    return (
      <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {images.map((image, index) => (
          <ImageFigure
            key={`${image.url}-${index}`}
            image={image}
            index={index}
            imageClassName="transition duration-300 hover:scale-[1.01]"
            aspectRatio="4 / 3"
            objectFit="cover"
          />
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="my-6 space-y-3 sm:space-y-4">
        <ImageFigure
          image={images[0]}
          index={0}
          imageClassName="transition duration-300 hover:scale-[1.01]"
          aspectRatio="16 / 10"
          objectFit="cover"
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {images.slice(1, 3).map((image, index) => (
            <ImageFigure
              key={`${image.url}-${index}`}
              image={image}
              index={index + 1}
              imageClassName="transition duration-300 hover:scale-[1.01]"
            aspectRatio="4 / 3"
            objectFit="cover"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {images.map((image, index) => (
        <ImageFigure
          key={`${image.url}-${index}`}
          image={image}
          index={index}
          imageClassName="transition duration-300 hover:scale-[1.01]"
          aspectRatio="1 / 1"
          objectFit="cover"
        />
      ))}
    </div>
  );
}

function VideoBlock({ videos }: { videos: FlowVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <div className="my-6 space-y-4">
      {videos.map((video, index) => (
        <figure key={`${video.url}-${index}`}>
          {video.embedUrl ? (
            <div className="overflow-hidden rounded-2xl bg-black">
              <div className="aspect-video">
                <iframe
                  src={video.embedUrl}
                  title={video.title || 'YouTube video'}
                  className="h-full w-full"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-stone-200 p-4 transition hover:bg-stone-50"
            >
              {video.thumbnail && (
                <FlowImageComponent
                  src={video.thumbnail}
                  alt={video.title ?? ''}
                  aspectRatio="16 / 9"
                  sizes="(max-width: 768px) 100vw, 720px"
                  priority={index === 0}
                  className="mb-3 rounded-xl"
                />
              )}
              <span className="font-serif text-lg text-stone-900">
                {video.title ?? video.url}
              </span>
            </a>
          )}
          {video.title && video.embedUrl && (
            <figcaption className="mt-2 text-center font-serif text-sm text-stone-600">
              {video.title}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function SmartLinks({ links }: { links: FlowLink[] }) {
  if (links.length === 0) return null;

  return (
    <div className="my-6 divide-y divide-stone-200/70 overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-50/40">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-w-0 items-center justify-between gap-4 p-4 transition hover:bg-stone-100/50"
        >
          <div className="flex min-w-0 items-center gap-4">
            {link.image ? (
              <FlowImageComponent
                src={link.image}
                alt=""
                aspectRatio="1 / 1"
                sizes="56px"
                transformWidth={160}
                className="shrink-0 rounded-xl"
                style={{ width: 56, height: 56 }}
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-200/50 font-mono text-sm text-stone-400">
                ↗
              </div>
            )}

            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-stone-400">
                {link.siteName || link.domain}
              </span>

              <span className="mt-0.5 block truncate font-serif text-[16px] font-medium leading-snug text-stone-900 transition group-hover:text-stone-600 sm:text-[17px]">
                {link.title || link.siteName || link.url}
              </span>

              {link.description && (
                <span className="mt-1 line-clamp-1 block text-xs leading-relaxed text-stone-500">
                  {link.description}
                </span>
              )}
            </div>
          </div>

          <span
            aria-hidden="true"
            className="shrink-0 p-1 font-mono text-sm text-stone-400 transition group-hover:text-stone-900"
          >
            ↗
          </span>
        </a>
      ))}
    </div>
  );
}

function FlowHero({ content }: { content: FlowContent }) {
  const links = content.links.filter((link) => !link.inBody);
  const videosFirst = content.contentType === 'video' && content.videos.length > 0;
  const imagesFirst = content.contentType === 'photo' && content.images.length > 0;

  return (
    <div className="space-y-6">
      {videosFirst && <VideoBlock videos={content.videos} />}
      {imagesFirst && <SmartGallery images={content.images} />}

      {content.showTitle && (
        <h1 className="font-serif text-3xl font-light leading-[1.25] text-stone-900 sm:text-4xl lg:text-5xl">
          {content.title}
        </h1>
      )}

      {content.body && <MarkdownBody body={content.body} />}

      {!imagesFirst && <SmartGallery images={content.images} />}
      {!videosFirst && <VideoBlock videos={content.videos} />}

      <SmartLinks links={links} />

      {!content.body &&
        content.images.length === 0 &&
        content.videos.length === 0 &&
        links.length === 0 &&
        !content.showTitle && (
          <p className="text-sm text-stone-400">No content.</p>
        )}
    </div>
  );
}

export default async function FlowItemPage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  const content = await loadContent(decodedSlug);
  if (!content) notFound();

  const bundle = await getCachedFlowItem(decodedSlug);
  const context = (bundle?.aiContext as AIContext | null) ?? null;
  const metadata = resolveFlowMetadataFromContent(content);

  const typeLabels: Record<string, string> = {
    note: 'Note',
    article: 'Article',
    photo: 'Photo',
    video: 'Video',
    link: 'Link',
    quote: 'Quote',
    mixed: 'Post',
  };

  const readingTime =
    content.bodyText.length > 350
      ? estimateReadingTime(content.bodyText)
      : null;

  const tgUrl =
    typeof bundle?.item.telegram_message_id === 'number' ||
    typeof bundle?.item.telegram_message_id === 'string'
      ? `https://t.me/unframed_am/${bundle.item.telegram_message_id}`
      : null;

  const blueskyUri =
    typeof bundle?.item.bluesky_uri === 'string'
      ? bundle.item.bluesky_uri
      : typeof content.metadata.bluesky_uri === 'string'
        ? content.metadata.bluesky_uri
        : null;
  const bskyUrl = blueskyUri
    ? `https://bsky.app/profile/merkurov.love/post/${encodeURIComponent(
        blueskyUri.split('/').pop() ?? ''
      )}`
    : null;

  const threadsUrl =
    readDistributionUrl(bundle?.item.metadata, 'threads') ??
    readDistributionUrl(content.metadata, 'threads');

  const newsFlag =
    /^(?:news|breaking)$/i.test(
      String((content.metadata as Record<string, unknown> | null)?.news_type || '')
    ) ||
    /^(?:news|breaking)$/i.test(
      String((content.metadata as Record<string, unknown> | null)?.schema_type || '')
    );

  return (
    <>
      <JsonLd
        data={flowContentJsonLd({
          path: metadata.canonicalUrl,
          name: metadata.title,
          description: metadata.description,
          contentType: content.contentType,
          datePublished: metadata.publishedAt,
          dateModified: metadata.updatedAt ?? metadata.publishedAt,
          image: metadata.previewImage,
          inLanguage: content.language,
          isNews: newsFlag,
          bodyText: content.bodyText,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Flow', path: '/flow' },
          { name: metadata.title, path: metadata.canonicalUrl },
        ])}
      />

      <div className="min-h-screen bg-white px-5 pb-24 pt-20 text-stone-900 sm:px-8 sm:pt-24">
        <article className="mx-auto max-w-3xl">
          <header className="mb-8 flex items-center justify-between gap-4 border-b border-stone-100 pb-5">
            <Link
              href="/flow"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400 transition hover:text-stone-950"
            >
              ← Flow
            </Link>

            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-stone-400">
              <a
                href={bskyUrl || 'https://bsky.app/profile/merkurov.love'}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-stone-900"
              >
                Bluesky ↗
              </a>
              <span className="text-stone-200">·</span>
              <a
                href={tgUrl || 'https://t.me/unframed_am'}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-stone-900"
              >
                Telegram ↗
              </a>
              <span className="text-stone-200">·</span>
              {threadsUrl && (
                <>
                  <a
                    href={threadsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition hover:text-stone-900"
                  >
                    Threads ↗
                  </a>
                  <span className="text-stone-200">·</span>
                </>
              )}
              <Link href="/journal" className="transition hover:text-stone-900">
                Journal ↗
              </Link>
            </div>
          </header>

          <div className="mb-6 flex flex-wrap items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
            <span>{typeLabels[content.contentType] ?? 'Post'}</span>

            {content.publishedAt && (
              <>
                <span>·</span>
                <span>{formatDate(content.publishedAt)}</span>
              </>
            )}

            <span>·</span>
            <span>{content.language.toUpperCase()}</span>

            {readingTime && (
              <>
                <span>·</span>
                <span>{readingTime}</span>
              </>
            )}
          </div>

          <FlowHero content={content} />

          {content.contentType !== 'photo' && (
            <PierrotContextBlock
              context={context}
              defaultLang={content.language}
            />
          )}
        </article>
      </div>
    </>
  );
}
