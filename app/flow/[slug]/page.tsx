
import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { generateFlowContext } from '@/lib/flow/ai';
import PierrotContextBlock from '@/components/flow/PierrotContextBlock';

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
  bluesky_uri?: string | null;
  telegram_message_id?: string | number | null;
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
      alternates: {
        canonical,
        types: {
          'application/rss+xml':
            'https://www.merkurov.love/flow/rss',
          'application/feed+json':
            'https://www.merkurov.love/flow/feed.json',
        },
      },
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

function getTelegramUrl(item: FlowItem): string | null {
  const msgId =
    item.telegram_message_id ||
    (item.metadata?.telegram_message_id as string | number | undefined);

  if (msgId) {
    return `https://t.me/unframed_am/${msgId}`;
  }
  return null;
}

function getBlueskyUrl(item: FlowItem): string | null {
  const uri =
    item.bluesky_uri ||
    (typeof item.metadata?.bluesky_uri === 'string'
      ? item.metadata.bluesky_uri
      : null);

  if (uri) {
    const rkey = uri.split('/').pop();
    if (rkey) {
      return `https://bsky.app/profile/merkurov.love/post/${encodeURIComponent(rkey)}`;
    }
  }
  return null;
}

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function getTitleAndBodyDisplay(item: FlowItem) {
  const rawTitle = (item.title || '').trim();
  const rawBody = (item.body_md || '').trim();

  if (!rawTitle) {
    return { title: null, body: rawBody || null };
  }

  if (!rawBody) {
    return { title: rawTitle, body: null };
  }

  const normTitle = normalizeForComparison(rawTitle);
  const normBody = normalizeForComparison(rawBody);

  // If title is redundant with body
  if (
    normTitle === normBody ||
    normBody.startsWith(normTitle) ||
    normTitle.startsWith(normBody)
  ) {
    return { title: null, body: rawBody };
  }

  const firstLine = rawBody.split(/\r?\n/)[0]?.trim() || '';
  const firstLineNorm = normalizeForComparison(firstLine);
  if (
    firstLineNorm &&
    (firstLineNorm === normTitle ||
      normTitle.startsWith(firstLineNorm) ||
      firstLineNorm.startsWith(normTitle))
  ) {
    return { title: null, body: rawBody };
  }

  return { title: rawTitle, body: rawBody };
}

type Archetype = 'video' | 'visual_story' | 'curated_links' | 'short_note' | 'article';

function detectArchetype(
  item: FlowItem,
  videoId: string | null,
  images: string[],
  linkCount: number,
): Archetype {
  if (videoId) return 'video';
  if (images.length >= 2 || item.type === 'photo') return 'visual_story';
  if (linkCount >= 2 || (item.type === 'link' && linkCount > 0)) return 'curated_links';

  const body = item.body_md || '';
  if (item.type === 'article' || body.length > 350 || body.includes('\n#') || body.includes('\n\n')) {
    return 'article';
  }

  return 'short_note';
}

function estimateReadingTime(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 170));
  return `${minutes} min read`;
}

function isDuplicateOfLink(
  text: string | null | undefined,
  preview: { title?: string | null; url?: string | null } | null | undefined,
): boolean {
  if (!text || !text.trim() || !preview) return false;
  const cleanT = text.trim();
  const cleanUrl = (preview.url || '').trim();

  // If text is literally the URL itself
  if (cleanT === cleanUrl) return true;

  const previewTitle = (preview.title || '').trim();
  if (!previewTitle) return false;

  const normT = normalizeForComparison(cleanT);
  const normP = normalizeForComparison(previewTitle);

  if (!normT || !normP) return false;

  // Exact match or one starts with the other
  if (normT === normP || normT.startsWith(normP) || normP.startsWith(normT)) {
    return true;
  }

  return false;
}

function SmartGallery({
  images,
  caption,
}: {
  images: string[];
  caption: string | null;
}) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <figure className="my-6">
        <a
          href={images[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-2xl bg-stone-100"
        >
          <img
            src={images[0]}
            alt={caption || 'Attached image'}
            loading="eager"
            className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
          />
        </a>
        {caption && (
          <figcaption className="mt-2.5 text-center font-serif text-xs italic text-stone-500">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (images.length === 2) {
    return (
      <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {images.map((url, i) => (
          <figure key={`${url}-${i}`}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-2xl bg-stone-100"
            >
              <img
                src={url}
                alt={caption || `Image ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.01]"
              />
            </a>
          </figure>
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div className="my-6 space-y-3 sm:space-y-4">
        <figure>
          <a
            href={images[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-2xl bg-stone-100"
          >
            <img
              src={images[0]}
              alt={caption || 'Featured image'}
              loading="eager"
              className="aspect-[16/10] w-full object-cover transition duration-300 hover:scale-[1.01]"
            />
          </a>
        </figure>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {images.slice(1, 3).map((url, i) => (
            <figure key={`${url}-${i}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-2xl bg-stone-100"
              >
                <img
                  src={url}
                  alt={caption || `Image ${i + 2}`}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.01]"
                />
              </a>
            </figure>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {images.map((url, i) => (
        <figure key={`${url}-${i}`}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-2xl bg-stone-100"
          >
            <img
              src={url}
              alt={caption || `Image ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="aspect-square w-full object-cover transition duration-300 hover:scale-[1.01]"
            />
          </a>
        </figure>
      ))}
    </div>
  );
}

function SmartLinks({
  previews,
}: {
  previews: Array<{
    url: string;
    site: string;
    title: string;
    description: string | null;
    image: string | null;
  }>;
}) {
  if (previews.length === 0) return null;

  return (
    <div className="my-6 divide-y divide-stone-200/70 overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-50/40">
      {previews.map((preview) => (
        <a
          key={preview.url}
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-w-0 items-center justify-between gap-4 p-4 transition hover:bg-stone-100/50"
        >
          <div className="flex min-w-0 items-center gap-4">
            {preview.image ? (
              <img
                src={preview.image}
                alt=""
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-xl bg-stone-200 object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-200/50 font-mono text-sm text-stone-400">
                ↗
              </div>
            )}

            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-stone-400">
                {preview.site}
              </span>

              <span className="mt-0.5 block truncate font-serif text-[16px] font-medium leading-snug text-stone-900 transition group-hover:text-stone-600 sm:text-[17px]">
                {preview.title}
              </span>

              {preview.description && (
                <span className="mt-1 line-clamp-1 block text-xs leading-relaxed text-stone-500">
                  {preview.description}
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

function SmartFlowContent({
  item,
  archetype,
  display,
  videoId,
  dedicatedImages,
  linkPreviews,
  photoCaption,
}: {
  item: FlowItem;
  archetype: Archetype;
  display: { title: string | null; body: string | null };
  videoId: string | null;
  dedicatedImages: string[];
  linkPreviews: Array<{
    url: string;
    site: string;
    title: string;
    description: string | null;
    image: string | null;
  }>;
  photoCaption: string | null;
}) {
  const singlePreview = linkPreviews.length === 1 ? linkPreviews[0] : null;

  const showTitle =
    display.title &&
    (!singlePreview || !isDuplicateOfLink(display.title, singlePreview));

  const showBody =
    display.body &&
    (!singlePreview || !isDuplicateOfLink(display.body, singlePreview));

  if (archetype === 'short_note') {
    return (
      <div className="space-y-6">
        {showTitle && (
          <h1 className="font-serif text-2xl font-medium leading-snug text-stone-900 sm:text-3xl">
            {display.title}
          </h1>
        )}

        {showBody && (
          <div className="py-4 sm:py-6">
            <p className="whitespace-pre-line font-serif text-2xl font-light leading-[1.65] text-stone-900 sm:text-3xl">
              {display.body}
            </p>
          </div>
        )}

        {dedicatedImages.length > 0 && (
          <SmartGallery images={dedicatedImages} caption={photoCaption} />
        )}

        {linkPreviews.length > 0 && (
          <SmartLinks previews={linkPreviews} />
        )}
      </div>
    );
  }

  if (archetype === 'visual_story') {
    return (
      <div className="space-y-6">
        <SmartGallery images={dedicatedImages} caption={photoCaption} />

        {showTitle && (
          <h1 className="font-serif text-2xl font-light text-stone-900 sm:text-3xl">
            {display.title}
          </h1>
        )}

        {showBody && display.body && <MarkdownBody body={display.body} />}

        {linkPreviews.length > 0 && (
          <SmartLinks previews={linkPreviews} />
        )}
      </div>
    );
  }

  if (archetype === 'video') {
    return (
      <div className="space-y-6">
        {videoId && (
          <div className="overflow-hidden rounded-2xl bg-black">
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

        {showTitle && (
          <h1 className="font-serif text-2xl font-light text-stone-900 sm:text-3xl">
            {display.title}
          </h1>
        )}

        {showBody && display.body && <MarkdownBody body={display.body} />}

        {dedicatedImages.length > 0 && (
          <SmartGallery images={dedicatedImages} caption={photoCaption} />
        )}

        {linkPreviews.length > 0 && (
          <SmartLinks previews={linkPreviews} />
        )}
      </div>
    );
  }

  if (archetype === 'curated_links') {
    return (
      <div className="space-y-6">
        {showTitle && (
          <h1 className="font-serif text-2xl font-light text-stone-900 sm:text-3xl">
            {display.title}
          </h1>
        )}

        {showBody && display.body && (
          <div className="pb-2">
            <MarkdownBody body={display.body} />
          </div>
        )}

        <SmartLinks previews={linkPreviews} />

        {dedicatedImages.length > 0 && (
          <SmartGallery images={dedicatedImages} caption={photoCaption} />
        )}
      </div>
    );
  }

  // article (default)
  return (
    <div className="space-y-7">
      {showTitle && (
        <h1 className="font-serif text-3xl font-light leading-[1.25] text-stone-900 sm:text-4xl lg:text-5xl">
          {display.title}
        </h1>
      )}

      {dedicatedImages.length === 1 && (
        <SmartGallery images={dedicatedImages} caption={photoCaption} />
      )}

      {showBody && display.body && <MarkdownBody body={display.body} />}

      {dedicatedImages.length > 1 && (
        <SmartGallery images={dedicatedImages} caption={photoCaption} />
      )}

      {linkPreviews.length > 0 && (
        <SmartLinks previews={linkPreviews} />
      )}

      {!videoId &&
        dedicatedImages.length === 0 &&
        linkPreviews.length === 0 &&
        !showBody &&
        !showTitle && (
          <p className="text-sm text-stone-400">
            No content.
          </p>
        )}
    </div>
  );
}

function AIContextBlock({
  context,
  defaultLang = 'ru',
}: {
  context: AIContext | null;
  defaultLang?: string;
}) {
  return <PierrotContextBlock context={context} defaultLang={defaultLang} />;
}

export default async function FlowItemPage({ params }: PageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('items')
    .select(
      'id,title,slug,lang,type,status,visibility,body_md,source_url,ai_allowed,metadata,published_at,bluesky_uri,telegram_message_id',
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
                provider: generated.provider || 'pierrot',
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
              provider: generated.provider || 'pierrot',
              status: 'ready',
              generated_at: now,
            };
      }
    } catch (genError) {
      console.warn(
        '[flow/item] On-demand Pierrot context generation failed:',
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

  const videoId = getYouTubeVideoId(item);
  const dedicatedImages = getDedicatedImages(item);
  const photoCaption =
    getMetadataString(item.metadata, 'alt') ||
    (item.type === 'photo' ? item.title : null);

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
          site: getMetadataString(preview, 'site_name') || hostname,
          title: getMetadataString(preview, 'title') || hostname,
          description: getMetadataString(preview, 'description'),
          image: getMetadataString(preview, 'image'),
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

  const display = getTitleAndBodyDisplay(item);
  const archetype = detectArchetype(
    item,
    videoId,
    dedicatedImages,
    linkPreviews.length,
  );
  const readingTime =
    archetype === 'article' && item.body_md
      ? estimateReadingTime(item.body_md)
      : null;
  const tgUrl = getTelegramUrl(item);
  const bskyUrl = getBlueskyUrl(item);

  const archetypeLabels: Record<Archetype, string> = {
    short_note: 'Note',
    article: 'Article',
    visual_story: 'Visual Story',
    curated_links: 'Digest',
    video: 'Video',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(flowArticleSchema).replace(
            /</g,
            '\\u003c',
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(
            /</g,
            '\\u003c',
          ),
        }}
      />

      <main className="min-h-screen bg-white px-5 pb-24 pt-20 text-stone-900 sm:px-8 sm:pt-24">
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
                href="https://bsky.app/profile/merkurov.love"
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
              <Link
                href="/journal"
                className="transition hover:text-stone-900"
              >
                Journal ↗
              </Link>
            </div>
          </header>

          <div className="mb-6 flex flex-wrap items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
            <span>{archetypeLabels[archetype]}</span>

            {item.published_at && (
              <>
                <span>·</span>
                <span>{formatDate(item.published_at)}</span>
              </>
            )}

            {readingTime && (
              <>
                <span>·</span>
                <span>{readingTime}</span>
              </>
            )}
          </div>

          <SmartFlowContent
            item={item}
            archetype={archetype}
            display={display}
            videoId={videoId}
            dedicatedImages={dedicatedImages}
            linkPreviews={linkPreviews}
            photoCaption={photoCaption}
          />

          {item.type !== 'photo' && (
            <AIContextBlock
              context={context}
              defaultLang={item.lang || 'ru'}
            />
          )}
        </article>
      </main>
    </>
  );
}
