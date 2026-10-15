
import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { generateFlowContext } from '@/lib/flow/ai';

type PageProps = {
  params: Promise<{ slug: string }>;
};

type YouTubeMetadata = {
  video_id?: string;
  title?: string;
  author_name?: string | null;
  author_url?: string | null;
  thumbnail_url?: string;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  provider_name?: string;
};

type FlowItem = {
  id: string;
  title: string | null;
  slug: string | null;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  body_md: string | null;
  source_url: string | null;
  ai_allowed: boolean;
  metadata: Record<string, unknown> | null;
  published_at: string | null;
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

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function getYouTubeMetadata(item: FlowItem): YouTubeMetadata | null {
  const value = item.metadata?.youtube;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as YouTubeMetadata;
}

function getYouTubeVideoId(item: FlowItem): string | null {
  const youtube = getYouTubeMetadata(item);

  if (
    youtube?.video_id &&
    /^[A-Za-z0-9_-]{6,20}$/.test(youtube.video_id)
  ) {
    return youtube.video_id;
  }

  if (item.source_url) {
    try {
      const url = new URL(item.source_url);

      if (
        url.hostname === 'youtu.be' ||
        url.hostname === 'www.youtu.be'
      ) {
        const id = url.pathname.split('/').filter(Boolean)[0];

        if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
          return id;
        }
      }

      const queryId = url.searchParams.get('v');

      if (queryId && /^[A-Za-z0-9_-]{6,20}$/.test(queryId)) {
        return queryId;
      }

      const pathMatch = url.pathname.match(
        /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,20})/,
      );

      if (pathMatch?.[1]) {
        return pathMatch[1];
      }
    } catch {
      // Ignore malformed URLs.
    }
  }

  return null;
}

function getDedicatedImages(item: FlowItem): string[] {
  const metadata = item.metadata ?? {};
  const youtube = getYouTubeMetadata(item);

  const candidates: unknown[] = [
    ...(Array.isArray(metadata.images) ? metadata.images : []),
    metadata.public_url,
    metadata.image,
    metadata.image_url,
    metadata.og_image,
  ];

  const urls = candidates
    .map((value) => {
      if (typeof value === 'string') return value.trim();

      if (
        value &&
        typeof value === 'object' &&
        'url' in value &&
        typeof value.url === 'string'
      ) {
        return value.url.trim();
      }

      return '';
    })
    .filter((url) => /^https?:\/\//i.test(url));

  // A YouTube thumbnail belongs to the video preview,
  // not to the attached-image gallery.
  const images = [...new Set(urls)];

  if (youtube?.thumbnail_url) {
    return images.filter((url) => url !== youtube.thumbnail_url);
  }

  return images;
}

function getMetadataImage(item: FlowItem): string | null {
  const images = getDedicatedImages(item);

  return (
    images[0] ||
    getYouTubeMetadata(item)?.thumbnail_url ||
    null
  );
}

function getDescription(item: FlowItem): string {
  const metadata = item.metadata ?? {};
  const metadataDescription = getMetadataString(
    metadata,
    'description',
  );

  if (metadataDescription) {
    return metadataDescription.slice(0, 160);
  }

  const body = (item.body_md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    body || 'A publication from Flow by Anton Merkurov.'
  ).slice(0, 160);
}

function getSiteName(item: FlowItem): string {
  const metadata = item.metadata ?? {};
  const explicit = getMetadataString(metadata, 'site_name');

  if (explicit) return explicit;

  if (item.source_url) {
    try {
      return new URL(item.source_url).hostname.replace(
        /^www\./,
        '',
      );
    } catch {
      // Ignore malformed URLs.
    }
  }

  return 'Flow';
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  try {
    const supabase = getSupabaseAdmin();

    const { data: item } = await supabase
      .from('items')
      .select(
        'id,title,slug,lang,type,status,visibility,body_md,source_url,ai_allowed,metadata,published_at',
      )
      .eq('slug', decodedSlug)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .maybeSingle();

    if (!item) {
      return { title: 'Flow | Anton Merkurov' };
    }

    const flowItem = item as FlowItem;
    const title =
      flowItem.title?.trim() ||
      getMetadataString(flowItem.metadata, 'title') ||
      getSiteName(flowItem);

    const description = getDescription(flowItem);
    const site = 'https://www.merkurov.love';
    const canonical =
      `${site}/flow/${encodeURIComponent(decodedSlug)}`;
    const image = getMetadataImage(flowItem);
    const ogImage =
      image ||
      `${site}/flow/${encodeURIComponent(decodedSlug)}/opengraph-image`;

    return sanitizeMetadata({
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        siteName: 'Anton Merkurov',
        type: flowItem.type === 'article' ? 'article' : 'website',
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
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
    });
  }
}

function formatDate(value: string | null) {
  if (!value) return '';

  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
            <strong className="font-medium text-stone-950">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="my-7 border-l border-stone-400 pl-5 font-serif text-xl font-light leading-relaxed text-stone-600 sm:text-2xl">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            const isInternal =
              href?.startsWith('/') ||
              href?.includes('merkurov.love');

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
              <img
                src={src}
                alt={alt ?? ''}
                loading="lazy"
                className="mx-auto max-h-[75vh] w-full object-contain"
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
          hr: () => (
            <hr className="my-9 border-0 border-t border-stone-200" />
          ),
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

function getLinkPreviewData(item: FlowItem) {
  const meta = item.metadata ?? {};

  const lp = (
    meta.link_preview && typeof meta.link_preview === 'object'
      ? meta.link_preview
      : null
  ) as Record<string, unknown> | null;

  const candidateUrl =
    (lp && getMetadataString(lp, 'url')) ||
    (item.source_url &&
    !item.source_url.includes('youtube.com') &&
    !item.source_url.includes('youtu.be')
      ? item.source_url
      : null);

  if (!candidateUrl) return null;

  let hostname = '';

  try {
    hostname = new URL(candidateUrl).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }

  const site =
    (lp && getMetadataString(lp, 'site_name')) ||
    hostname ||
    getSiteName(item);

  const title =
    (lp && getMetadataString(lp, 'title')) ||
    (item.title !== candidateUrl ? item.title : null) ||
    site;

  const description =
    (lp && getMetadataString(lp, 'description')) ||
    getMetadataString(meta, 'description');

  const image =
    (lp && getMetadataString(lp, 'image')) ||
    getMetadataString(meta, 'image');

  return {
    url: candidateUrl,
    site,
    title,
    description,
    image,
  };
}

function FlowMediaStack({ item }: { item: FlowItem }) {
  const videoId = getYouTubeVideoId(item);
  const dedicatedImages = getDedicatedImages(item);

  const linkPreviews = (() => {
    const metadata = item.metadata ?? {};

    const raw = Array.isArray(metadata.link_previews)
      ? metadata.link_previews
      : metadata.link_preview
        ? [metadata.link_preview]
        : [];

    const previews = raw
      .filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) &&
          typeof value === 'object' &&
          !Array.isArray(value),
      )
      .map((preview) => {
        const url = getMetadataString(preview, 'url');

        if (!url) return null;

        let hostname: string;

        try {
          hostname = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          return null;
        }

        return {
          url,
          site:
            getMetadataString(preview, 'site_name') || hostname,
          title:
            getMetadataString(preview, 'title') || hostname,
          description:
            getMetadataString(preview, 'description'),
          image:
            getMetadataString(preview, 'image'),
        };
      })
      .filter(
        (preview): preview is NonNullable<typeof preview> =>
          preview !== null,
      );

    if (previews.length === 0) {
      const legacy = getLinkPreviewData(item);

      if (legacy) previews.push(legacy);
    }

    const seen = new Set<string>();

    return previews.filter((preview) => {
      if (seen.has(preview.url)) return false;
      seen.add(preview.url);
      return true;
    });
  })();

  const photoCaption =
    getMetadataString(item.metadata, 'alt') ||
    (item.type === 'photo' ? item.title : null);

  return (
    <div className="space-y-7">
      {videoId && (
        <div className="overflow-hidden bg-black">
          <div className="aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title={item.title || 'YouTube video'}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {dedicatedImages.length > 0 && (
        <div
          className={
            dedicatedImages.length === 1
              ? 'space-y-2'
              : 'grid grid-cols-2 gap-2 sm:gap-3'
          }
        >
          {dedicatedImages.map((imageUrl, index) => (
            <figure
              key={`${imageUrl}-${index}`}
              className="min-w-0"
            >
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden bg-stone-100/70"
              >
                <img
                  src={imageUrl}
                  alt={photoCaption || `Image ${index + 1}`}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className={
                    dedicatedImages.length === 1
                      ? 'mx-auto max-h-[78vh] w-full object-contain'
                      : 'aspect-square h-full w-full object-cover'
                  }
                />
              </a>

              {photoCaption && index === 0 && (
                <figcaption className="mt-2 text-xs text-stone-500">
                  {photoCaption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {linkPreviews.length > 0 && (
        <div className="divide-y divide-stone-200 border-y border-stone-200">
          {linkPreviews.map((preview) => (
            <a
              key={preview.url}
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-w-0 items-center gap-3 py-4 sm:gap-5"
            >
              {preview.image && (
                <img
                  src={preview.image}
                  alt=""
                  loading="lazy"
                  className="h-14 w-16 shrink-0 object-cover sm:h-16 sm:w-24"
                />
              )}

              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-stone-400">
                  {preview.site}
                </span>

                <span className="mt-1 block break-words font-serif text-lg font-light leading-snug text-stone-900 transition-colors group-hover:text-stone-500 sm:text-xl">
                  {preview.title}
                </span>

                {preview.description && (
                  <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-stone-500">
                    {preview.description}
                  </span>
                )}
              </span>

              <span
                aria-hidden="true"
                className="shrink-0 text-sm text-stone-400"
              >
                ↗
              </span>
            </a>
          ))}
        </div>
      )}

      {item.body_md && (
        <MarkdownBody body={item.body_md} />
      )}

      {!videoId &&
        dedicatedImages.length === 0 &&
        linkPreviews.length === 0 &&
        !item.body_md && (
          <p className="text-sm text-stone-400">
            No content.
          </p>
        )}
    </div>
  );
}

function AIContextBlock({ context }: { context: AIContext | null }) {
  if (
    !context ||
    context.status !== 'ready' ||
    !context.content
  ) {
    return null;
  }

  return (
    <section className="mt-10 border-t border-stone-200 pt-6 sm:mt-12 sm:pt-7">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
            Context Architecture
          </span>
        </div>

        {context.model && (
          <div className="font-mono text-[9px] uppercase tracking-wider text-stone-400">
            {context.provider ? `${context.provider} · ` : ''}
            {context.model}
          </div>
        )}
      </div>

      <div className="font-serif text-base font-light leading-[1.8] text-stone-600 sm:text-lg">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="mb-4 whitespace-pre-wrap last:mb-0">
                {children}
              </p>
            ),
            hr: () => <hr className="my-5 border-stone-200" />,
            strong: ({ children }) => (
              <strong className="font-mono text-[11px] font-normal uppercase tracking-widest text-stone-500">
                {children}
              </strong>
            ),
          }}
        >
          {context.content}
        </ReactMarkdown>
      </div>
    </section>
  );
}

export default async function FlowItemPage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('items')
    .select(
      'id,title,slug,lang,type,status,visibility,body_md,source_url,ai_allowed,metadata,published_at',
    )
    .eq('slug', decodedSlug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (error) {
    console.error('[flow/item] Supabase error:', error);
    notFound();
  }

  const item = data as FlowItem | null;

  if (!item) notFound();

  const {
    data: contextData,
    error: contextError,
  } = await supabase
    .from('flow_ai_context')
    .select('id,item_id,content,model,provider,status,generated_at')
    .eq('item_id', item.id)
    .maybeSingle();

  if (contextError) {
    console.warn(
      '[flow/item] AI context unavailable:',
      contextError,
    );
  }

  let context = (contextData as AIContext | null) ?? null;

  const shouldGenerateContext =
    item.ai_allowed !== false &&
    item.type !== 'photo' &&
    item.status === 'published' &&
    item.visibility === 'public' &&
    !contextError &&
    !contextData;

  if (shouldGenerateContext) {
    try {
      const generated = await generateFlowContext({
        id: item.id,
        type: item.type,
        title: item.title,
        body_md: item.body_md,
        source_url: item.source_url,
        metadata: item.metadata,
        lang: item.lang || 'ru',
      });

      if (generated?.content) {
        const now = new Date().toISOString();

        const { data: savedContext, error: saveError } =
          await supabase
            .from('flow_ai_context')
            .upsert(
              {
                item_id: item.id,
                content: generated.content,
                model: generated.model,
                provider: generated.provider || 'deepseek',
                status: 'ready',
                generated_at: now,
                updated_at: now,
              },
              { onConflict: 'item_id' },
            )
            .select(
              'id,item_id,content,model,provider,status,generated_at',
            )
            .maybeSingle();

        if (saveError) {
          console.warn(
            '[flow/item] Could not save AI context:',
            saveError,
          );
        }

        context = savedContext
          ? (savedContext as AIContext)
          : {
              id: 'generated',
              item_id: item.id,
              content: generated.content,
              model: generated.model,
              provider: generated.provider || 'deepseek',
              status: 'ready',
              generated_at: now,
            };
      }
    } catch (genError) {
      console.warn(
        '[flow/item] On-demand DeepSeek context generation failed:',
        genError,
      );
    }
  }

  const siteUrl = 'https://www.merkurov.love';
  const itemUrl =
    `${siteUrl}/flow/${encodeURIComponent(decodedSlug)}`;
  const itemTitle = item.title?.trim() || 'Flow';
  const itemDescription = getDescription(item);
  const itemImage =
    getMetadataImage(item) || `${itemUrl}/opengraph-image`;

  const flowArticleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: itemTitle,
    description: itemDescription,
    image: [itemImage],
    datePublished: item.published_at || new Date().toISOString(),
    url: itemUrl,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': itemUrl,
    },
    author: {
      '@type': 'Person',
      name: 'Anton Merkurov',
      url: siteUrl,
    },
    publisher: {
      '@type': 'Person',
      name: 'Anton Merkurov',
      url: siteUrl,
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Flow',
        item: `${siteUrl}/flow`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: itemTitle,
        item: itemUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(flowArticleSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema),
        }}
      />

      <main className="min-h-screen bg-white px-5 pb-24 pt-28 text-stone-900 sm:px-8 sm:pt-36">
        <article className="mx-auto max-w-3xl">
          <Link
            href="/flow"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 transition hover:text-stone-950"
          >
            ← Flow
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
            <span>{item.type}</span>

            {item.published_at && (
              <>
                <span>·</span>
                <span>{formatDate(item.published_at)}</span>
              </>
            )}
          </div>

          <div className="mt-7">
            <FlowMediaStack item={item} />
          </div>

          {item.type !== 'photo' && (
            <AIContextBlock context={context} />
          )}
        </article>
      </main>
    </>
  );
}
