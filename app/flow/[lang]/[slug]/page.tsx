import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type PageProps = {
  params: Promise<{
    lang: string;
    slug: string;
  }>;
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
  metadata: Record<string, unknown> | null;
  published_at: string | null;
};

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase server environment variables are missing.',
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function formatDate(
  value: string | null,
) {
  if (!value) {
    return '';
  }

  return new Date(
    value,
  ).toLocaleDateString(
    'en-GB',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  );
}

function LinkCard({
  item,
}: {
  item: FlowItem;
}) {
  const metadata =
    item.metadata ?? {};

  const image =
    typeof metadata.image ===
    'string'
      ? metadata.image
      : null;

  const description =
    typeof metadata.description ===
    'string'
      ? metadata.description
      : null;

  const siteName =
    typeof metadata.site_name ===
    'string'
      ? metadata.site_name
      : item.source_url
        ? (() => {
            try {
              return new URL(
                item.source_url!,
              ).hostname;
            } catch {
              return item.source_url;
            }
          })()
        : '';

  return (
    <div className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white/80 shadow-sm">
      {image && (
        <a
          href={
            item.source_url ?? '#'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="group block aspect-[16/9] overflow-hidden bg-stone-100"
        >
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.015]"
          />
        </a>
      )}

      <div className="p-7 sm:p-9">
        {siteName && (
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400">
            {siteName}
          </div>
        )}

        <div className="mt-4 font-serif text-3xl font-light leading-tight text-stone-900 sm:text-5xl">
          {item.title ||
            item.source_url}
        </div>

        {description && (
          <p className="mt-5 font-serif text-lg leading-8 text-stone-600">
            {description}
          </p>
        )}

        <a
          href={
            item.source_url ?? '#'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex rounded-full bg-stone-900 px-6 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white transition hover:bg-stone-700"
        >
          Open original ↗
        </a>
      </div>
    </div>
  );
}

function MarkdownBody({
  body,
}: {
  body: string;
}) {
  return (
    <div className="rounded-[2rem] border border-stone-200/80 bg-white/80 p-7 shadow-sm sm:p-10">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
        ]}
        components={{
          h1: ({
            children,
          }) => (
            <h2 className="mb-7 mt-10 font-serif text-3xl font-light leading-tight text-stone-900 first:mt-0 sm:text-4xl">
              {children}
            </h2>
          ),

          h2: ({
            children,
          }) => (
            <h2 className="mb-5 mt-10 font-serif text-2xl font-light leading-tight text-stone-900 sm:text-3xl">
              {children}
            </h2>
          ),

          h3: ({
            children,
          }) => (
            <h3 className="mb-4 mt-8 font-serif text-xl font-light leading-tight text-stone-900 sm:text-2xl">
              {children}
            </h3>
          ),

          p: ({
            children,
          }) => (
            <p className="mb-6 font-serif text-[19px] font-light leading-[1.85] text-stone-800 sm:text-[21px]">
              {children}
            </p>
          ),

          strong: ({
            children,
          }) => (
            <strong className="font-medium text-stone-950">
              {children}
            </strong>
          ),

          em: ({
            children,
          }) => (
            <em className="italic">
              {children}
            </em>
          ),

          blockquote: ({
            children,
          }) => (
            <blockquote className="my-9 border-l-2 border-stone-900 pl-6 font-serif text-xl font-light italic leading-relaxed text-stone-600 sm:text-2xl">
              {children}
            </blockquote>
          ),

          a: ({
            href,
            children,
          }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-stone-300 underline-offset-4 transition hover:decoration-stone-900"
            >
              {children}
            </a>
          ),

          img: ({
            src,
            alt,
          }) => (
            <img
              src={src}
              alt={alt ?? ''}
              className="my-9 max-h-[75vh] w-full rounded-[1.5rem] object-contain"
            />
          ),

          ul: ({
            children,
          }) => (
            <ul className="mb-7 list-disc space-y-2 pl-7 font-serif text-[19px] leading-8 text-stone-800 sm:text-[21px]">
              {children}
            </ul>
          ),

          ol: ({
            children,
          }) => (
            <ol className="mb-7 list-decimal space-y-2 pl-7 font-serif text-[19px] leading-8 text-stone-800 sm:text-[21px]">
              {children}
            </ol>
          ),

          hr: () => (
            <hr className="my-12 border-0 border-t border-stone-200" />
          ),

          code: ({
            children,
          }) => (
            <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em]">
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

export default async function FlowItemPage({
  params,
}: PageProps) {
  const {
    lang,
    slug,
  } = await params;

  const decodedSlug =
    decodeURIComponent(slug);

  const supabase =
    getSupabaseAdmin();

  const {
    data,
    error,
  } = await supabase
    .from('items')
    .select(
      'id,title,slug,lang,type,status,visibility,body_md,source_url,metadata,published_at',
    )
    .eq('lang', lang)
    .eq('slug', decodedSlug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (error) {
    console.error(
      '[flow/item] Supabase error:',
      error,
    );

    notFound();
  }

  const item =
    data as FlowItem | null;

  if (!item) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] px-5 pb-24 pt-28 text-stone-900 sm:px-8 sm:pt-36">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/flow"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 transition hover:text-stone-900"
        >
          ← Flow
        </Link>

        <div className="mt-10 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">
          <span>{item.lang}</span>

          <span>·</span>

          <span>{item.type}</span>

          {item.published_at && (
            <>
              <span>·</span>

              <span>
                {formatDate(
                  item.published_at,
                )}
              </span>
            </>
          )}
        </div>

        <div className="mt-8">
          {item.type === 'link' &&
          item.source_url ? (
            <LinkCard
              item={item}
            />
          ) : item.type ===
            'photo' ? (
            <div className="overflow-hidden rounded-[2rem] border border-stone-200/80 bg-white/80 p-3 shadow-sm">
              {typeof item
                .metadata
                ?.public_url ===
              'string' ? (
                <img
                  src={
                    item.metadata
                      .public_url
                  }
                  alt={
                    typeof item
                      .metadata
                      ?.alt ===
                    'string'
                      ? item.metadata
                          .alt
                      : ''
                  }
                  className="mx-auto max-h-[78vh] w-full rounded-[1.5rem] object-contain"
                />
              ) : (
                <MarkdownBody
                  body={
                    item.body_md ??
                    ''
                  }
                />
              )}
            </div>
          ) : (
            <MarkdownBody
              body={
                item.body_md ?? ''
              }
            />
          )}
        </div>
      </article>
    </main>
  );
}