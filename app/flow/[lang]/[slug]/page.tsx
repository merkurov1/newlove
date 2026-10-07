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
  published_at: string | null;
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

function renderInline(text: string) {
  const parts = text.split(
    /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s]+)/g,
  );

  return parts.map((part, index) => {
    const markdownLink = part.match(
      /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/,
    );

    if (markdownLink) {
      return (
        <a
          key={index}
          href={markdownLink[2]}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {markdownLink[1]}
        </a>
      );
    }

    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {part}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

function renderBody(body: string | null) {
  if (!body) {
    return null;
  }

  const lines = body.replace(/\r\n/g, '\n').split('\n');

  return (
    <div className="space-y-5 text-[17px] leading-8 text-zinc-800">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={index} className="h-1" />;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3
              key={index}
              className="pt-4 text-xl font-semibold tracking-tight text-zinc-950"
            >
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h2
              key={index}
              className="pt-5 text-2xl font-semibold tracking-tight text-zinc-950"
            >
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h1
              key={index}
              className="pt-5 text-3xl font-semibold tracking-tight text-zinc-950"
            >
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        }

        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-zinc-300 pl-5 italic text-zinc-600"
            >
              {renderInline(trimmed.slice(2))}
            </blockquote>
          );
        }

        return (
          <p key={index}>
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

export default async function FlowItemPage({ params }: PageProps) {
  const { lang, slug } = await params;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('items')
    .select(
      [
        'id',
        'title',
        'slug',
        'lang',
        'type',
        'status',
        'visibility',
        'body_md',
        'published_at',
      ].join(','),
    )
    .eq('lang', lang)
    .eq('slug', slug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (error) {
    console.error('[flow/item] Supabase error:', error);
    notFound();
  }

  const item = data as FlowItem | null;

  if (!item) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article>
        <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          <span>{item.lang}</span>
          <span>·</span>
          <span>{item.type}</span>
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
          {item.title || 'Untitled'}
        </h1>

        {item.published_at && (
          <div className="mt-4 text-xs text-zinc-400">
            {new Date(item.published_at).toLocaleString('ru-RU')}
          </div>
        )}

        <div className="mt-12">
          {renderBody(item.body_md)}
        </div>
      </article>
    </main>
  );
}