import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Props = {
  params: {
    lang: string;
    slug: string;
  };
};

function renderBody(body: string) {
  const lines = body.split(/\r?\n/);

  return lines.map((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <div key={index} className="h-4" />;
    }

    if (trimmed.startsWith('### ')) {
      return (
        <h3
          key={index}
          className="mt-8 text-xl font-semibold"
        >
          {trimmed.slice(4)}
        </h3>
      );
    }

    if (trimmed.startsWith('## ')) {
      return (
        <h2
          key={index}
          className="mt-10 text-2xl font-semibold"
        >
          {trimmed.slice(3)}
        </h2>
      );
    }

    if (trimmed.startsWith('# ')) {
      return (
        <h2
          key={index}
          className="mt-10 text-3xl font-semibold"
        >
          {trimmed.slice(2)}
        </h2>
      );
    }

    if (trimmed.startsWith('> ')) {
      return (
        <blockquote
          key={index}
          className="my-6 border-l-2 border-black/20 pl-5 italic text-zinc-600"
        >
          {trimmed.slice(2)}
        </blockquote>
      );
    }

    return (
      <p
        key={index}
        className="mb-5 leading-8 text-zinc-800"
      >
        {trimmed}
      </p>
    );
  });
}

export default async function FlowItemPage({
  params,
}: Props) {
  const supabase = createClient({
    useServiceRole: true,
  });

  const { data: item, error } = await supabase
    .from('items')
    .select('*')
    .eq('lang', params.lang)
    .eq('slug', params.slug)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .maybeSingle();

  if (error || !item) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
        {item.lang} / {item.type}
      </div>

      <h1 className="text-4xl font-semibold tracking-tight">
        {item.title}
      </h1>

      {item.published_at && (
        <div className="mt-4 text-sm text-zinc-400">
          {new Date(item.published_at).toLocaleDateString(
            'ru-RU',
            {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }
          )}
        </div>
      )}

      <article className="mt-12 text-lg">
        {renderBody(item.body_md ?? '')}
      </article>
    </main>
  );
}