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
import { resolveFlowMetadataFromContent, type FlowSocialMetadata } from '@/lib/flow/metadata';
import { getCachedFlowItem, getCachedFlowNeighbors } from '@/lib/flow/items-cash';
import { readDistributionUrl } from '@/lib/flow/distribution';
import PierrotContextBlock from '@/components/flow/PierrotContextBlock';
import FlowImageComponent from '@/components/flow/FlowImage';
import FlowHomeScreenPrompt from '@/components/flow/FlowHomeScreenPrompt';
import FlowReaderShell from '@/components/flow/FlowReaderShell';
import FlowShare from '@/components/flow/FlowShare';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, flowContentJsonLd } from '@/lib/structuredData';
import { extractHeadings, headingIdsByLine } from '@/lib/reader/headings';

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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

function MarkdownBody({ body, headingIds }: { body: string; headingIds: Map<number, string> }) {
  const headingId = (line: number | undefined) => (line ? headingIds.get(line) : undefined);

  return (
    <div className="flow-item__body min-w-0 max-w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children, node }) => (
            <h2
              id={headingId(node?.position?.start.line)}
              tabIndex={-1}
              className="mb-4 mt-10 break-words [overflow-wrap:anywhere] font-serif text-3xl font-light leading-tight text-stone-900 first:mt-0 sm:text-4xl"
            >
              {children}
            </h2>
          ),
          h2: ({ children, node }) => (
            <h2
              id={headingId(node?.position?.start.line)}
              tabIndex={-1}
              className="mb-3.5 mt-9 break-words [overflow-wrap:anywhere] font-serif text-2xl font-light leading-tight text-stone-900 first:mt-0 sm:text-3xl"
            >
              {children}
            </h2>
          ),
          h3: ({ children, node }) => (
            <h3
              id={headingId(node?.position?.start.line)}
              tabIndex={-1}
              className="mb-3 mt-8 break-words [overflow-wrap:anywhere] font-serif text-xl font-light leading-tight text-stone-900 first:mt-0 sm:text-2xl"
            >
              {children}
            </h3>
          ),
          h4: ({ children, node }) => (
            <h4
              id={headingId(node?.position?.start.line)}
              tabIndex={-1}
              className="mb-2.5 mt-7 break-words [overflow-wrap:anywhere] font-serif text-lg font-medium leading-snug text-stone-900 first:mt-0 sm:text-xl"
            >
              {children}
            </h4>
          ),
          p: ({ children, node }) => {
            const onlyChild = node?.children?.length === 1 ? node.children[0] : null;

            // A standalone image is already a <figure>; wrapping it in <p>
            // would produce invalid HTML and a hydration mismatch.
            if (onlyChild?.type === 'element' && onlyChild.tagName === 'img') {
              return <>{children}</>;
            }

            return (
              <p className="mb-5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-serif text-[18px] font-normal leading-[1.75] text-stone-800 sm:text-[20px]">
                {children}
              </p>
            );
          },
          strong: ({ children }) => (
            <strong className="font-medium text-stone-950">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-8 max-w-full break-words border-l border-stone-400 pl-5 font-serif text-xl font-light leading-relaxed text-stone-600 [overflow-wrap:anywhere] sm:text-2xl">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            const isInternal = href?.startsWith('/') || href?.includes('merkurov.love');

            if (isInternal && href) {
              return (
                <Link
                  href={href}
                  className="break-words [overflow-wrap:anywhere] underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
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
                className="break-words [overflow-wrap:anywhere] underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const imageSrc = typeof src === 'string' ? src : '';

            return (
              <figure className="my-8 max-w-full">
                <a
                  href={imageSrc || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-full overflow-hidden rounded-2xl bg-stone-100"
                  data-flow-image
                  data-flow-image-src={imageSrc}
                  data-flow-image-alt={alt ?? ''}
                  data-flow-image-caption={alt ?? ''}
                  aria-label={alt ? `Open image: ${alt}` : 'Open image'}
                >
                  <FlowImageComponent
                    src={imageSrc || undefined}
                    alt={alt ?? ''}
                    aspectRatio="4 / 3"
                    objectFit="contain"
                    natural
                    sizes="(max-width: 768px) 100vw, 720px"
                    style={{ maxHeight: '76vh' }}
                  />
                </a>
                {alt && (
                  <figcaption className="mt-2 break-words [overflow-wrap:anywhere] font-serif text-sm italic text-stone-500">
                    {alt}
                  </figcaption>
                )}
              </figure>
            );
          },
          ul: ({ children }) => (
            <ul className="mb-6 max-w-full list-disc space-y-2 pl-6 font-serif text-[18px] font-normal leading-8 text-stone-800 marker:text-stone-400 sm:text-[20px]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-6 max-w-full list-decimal space-y-2 pl-6 font-serif text-[18px] font-normal leading-8 text-stone-800 marker:text-stone-400 sm:text-[20px]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="min-w-0 break-words [overflow-wrap:anywhere]">{children}</li>
          ),
          hr: () => <hr className="my-9 border-0 border-t border-stone-200" />,
          pre: ({ children }) => (
            <pre className="my-7 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-2xl bg-stone-950 p-4 font-mono text-sm leading-relaxed text-stone-100">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className) || String(children).includes('\n');

            if (isBlock) {
              return <code className="whitespace-pre font-mono text-[0.85em]">{children}</code>;
            }

            return (
              <code className="break-words bg-stone-100 px-1 py-0.5 font-mono text-[0.85em] [overflow-wrap:anywhere]">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-7 w-full max-w-full overflow-x-auto overscroll-x-contain">
              <table className="w-full border-collapse text-left font-serif text-[16px] leading-relaxed text-inherit">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-stone-300 px-3 py-2 font-medium text-stone-900 break-words [overflow-wrap:anywhere]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-stone-200 px-3 py-2 align-top break-words [overflow-wrap:anywhere]">
              {children}
            </td>
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
  objectFit = 'contain',
  priority = false,
  natural = false,
  maxHeight,
}: {
  image: FlowImage;
  index: number;
  className?: string;
  imageClassName?: string;
  aspectRatio?: string;
  objectFit?: 'cover' | 'contain';
  priority?: boolean;
  natural?: boolean;
  maxHeight?: string;
}) {
  const caption = image.caption ?? image.alt;

  return (
    <figure className={className}>
      <a
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-2xl bg-stone-100"
        data-flow-image
        data-flow-image-src={image.url}
        data-flow-image-alt={caption || `Image ${index + 1}`}
        data-flow-image-caption={caption || ''}
        aria-label={caption ? `Open image: ${caption}` : `Open image ${index + 1}`}
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
          style={natural && maxHeight ? { maxHeight } : undefined}
        />
      </a>
      {caption && (
        <figcaption className="mt-2 break-words text-center font-serif text-xs italic text-stone-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function SmartGallery({ images }: { images: FlowImage[] }) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return <ImageFigure image={images[0]} index={0} priority natural maxHeight="76vh" />;
  }

  if (images.length === 2) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        {images.map((image, index) => (
          <ImageFigure
            key={`${image.url}-${index}`}
            image={image}
            index={index}
            natural
            maxHeight="72vh"
          />
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="space-y-4">
        <ImageFigure image={images[0]} index={0} priority natural maxHeight="70vh" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
          {images.slice(1, 3).map((image, index) => (
            <ImageFigure
              key={`${image.url}-${index}`}
              image={image}
              index={index + 1}
              natural
              maxHeight="60vh"
            />
          ))}
        </div>
      </div>
    );
  }

  // Longer sets keep their natural proportions in a compact two-column flow,
  // so a portrait photograph is never forced into a square crop.
  return (
    <div className="columns-1 gap-4 sm:columns-2">
      {images.map((image, index) => (
        <ImageFigure
          key={`${image.url}-${index}`}
          image={image}
          index={index}
          className="mb-4 break-inside-avoid last:mb-0"
          natural
          maxHeight="60vh"
        />
      ))}
    </div>
  );
}

function VideoBlock({ videos }: { videos: FlowVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <div className="space-y-4">
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
              <span className="font-serif text-lg text-stone-900">{video.title ?? video.url}</span>
            </a>
          )}
          {video.embedUrl && (
            <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center font-serif text-sm text-stone-600">
              {video.title && <span>{video.title}</span>}
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-900"
              >
                Watch on {video.provider === 'youtube' ? 'YouTube' : 'source'} ↗
              </a>
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
    <div className="divide-y divide-stone-200/70 overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-50/40">
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
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-200/60 font-mono text-sm text-stone-500">
                ↗
              </div>
            )}

            <div className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-stone-500">
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
            className="shrink-0 p-1 font-mono text-sm text-stone-500 transition group-hover:text-stone-900"
          >
            ↗
          </span>
        </a>
      ))}
    </div>
  );
}

function FlowHero({
  content,
  headingIds,
}: {
  content: FlowContent;
  headingIds: Map<number, string>;
}) {
  const links = content.links.filter((link) => !link.inBody);
  const videosFirst = content.contentType === 'video' && content.videos.length > 0;
  const imagesFirst = content.contentType === 'photo' && content.images.length > 0;

  return (
    <div className="flow-item__hero">
      {videosFirst && <VideoBlock videos={content.videos} />}
      {imagesFirst && <SmartGallery images={content.images} />}

      {content.showTitle && (
        <h1 className="break-words text-balance font-serif text-3xl font-light leading-[1.22] tracking-[-0.01em] text-stone-900 sm:text-4xl lg:text-[2.85rem]">
          {content.title}
        </h1>
      )}

      {content.body && <MarkdownBody body={content.body} headingIds={headingIds} />}

      {!imagesFirst && <SmartGallery images={content.images} />}
      {!videosFirst && <VideoBlock videos={content.videos} />}

      <SmartLinks links={links} />

      {!content.body &&
        content.images.length === 0 &&
        content.videos.length === 0 &&
        links.length === 0 &&
        !content.showTitle && <p className="text-sm text-stone-400">No content.</p>}
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
  const headings = content.body ? extractHeadings(content.body) : [];
  const headingIds = headingIdsByLine(headings);

  const typeLabels: Record<string, string> = {
    note: 'Note',
    article: 'Article',
    photo: 'Photo',
    video: 'Video',
    link: 'Link',
    quote: 'Quote',
    mixed: 'Post',
  };

  const readingTime = content.bodyText.length > 350 ? estimateReadingTime(content.bodyText) : null;

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

  // Neighbours come from the same public ordering as the feed. If the query is
  // unavailable the reader simply ends without pager links.
  const neighbors = await getCachedFlowNeighbors(content.publishedAt);

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

      <div className="flow-post-page flow-post-page--reader min-h-screen bg-white px-5 pb-24 pt-20 text-stone-900 sm:px-8 sm:pt-24">
        <article className="flow-item mx-auto max-w-[44rem]">
          <header className="flow-reader__bar">
            <Link href="/flow" className="flow-reader__back">
              ← Flow
            </Link>

            <div className="flow-reader__bar-end">
              <FlowReaderShell slug={decodedSlug} title={metadata.title} headings={headings} />
            </div>
          </header>

          <div className="flow-reader__meta">
            <span>{typeLabels[content.contentType] ?? 'Post'}</span>

            {content.publishedAt && (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={content.publishedAt}>{formatDate(content.publishedAt)}</time>
              </>
            )}

            <span aria-hidden="true">·</span>
            <span>{content.language.toUpperCase()}</span>

            {readingTime && (
              <>
                <span aria-hidden="true">·</span>
                <span>{readingTime}</span>
              </>
            )}
          </div>

          <FlowHero content={content} headingIds={headingIds} />

          <footer className="flow-reader__footer">
            <div className="flow-reader__share">
              <FlowShare
                title={metadata.title}
                url={metadata.canonicalUrl}
                imageUrl={metadata.previewImage}
                excerpt={metadata.description}
                slug={decodedSlug}
              />
            </div>

            <div className="flow-reader__sources" aria-label="This publication elsewhere">
              <a
                href={bskyUrl || 'https://bsky.app/profile/merkurov.love'}
                target="_blank"
                rel="noopener noreferrer"
              >
                Bluesky ↗
              </a>
              <a
                href={tgUrl || 'https://t.me/unframed_am'}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram ↗
              </a>
              {threadsUrl && (
                <a href={threadsUrl} target="_blank" rel="noopener noreferrer">
                  Threads ↗
                </a>
              )}
              <Link href="/journal">Journal ↗</Link>
            </div>

            {(neighbors.newer || neighbors.older) && (
              <nav className="flow-reader__pager" aria-label="More from Flow">
                {neighbors.newer?.slug && (
                  <Link
                    href={`/flow/${encodeURIComponent(neighbors.newer.slug)}`}
                    className="flow-reader__step"
                  >
                    <span className="flow-reader__step-label">Newer</span>
                    <span className="flow-reader__step-title">
                      {neighbors.newer.title || 'Next publication'}
                    </span>
                  </Link>
                )}

                {neighbors.older?.slug && (
                  <Link
                    href={`/flow/${encodeURIComponent(neighbors.older.slug)}`}
                    className="flow-reader__step flow-reader__step--older"
                  >
                    <span className="flow-reader__step-label">Older</span>
                    <span className="flow-reader__step-title">
                      {neighbors.older.title || 'Earlier publication'}
                    </span>
                  </Link>
                )}
              </nav>
            )}

            <FlowHomeScreenPrompt className="flow-home-screen--reader" />
          </footer>

          {content.contentType !== 'photo' && (
            <PierrotContextBlock context={context} defaultLang={content.language} />
          )}
        </article>
      </div>
    </>
  );
}
