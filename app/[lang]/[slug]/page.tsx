import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Props = {
  params: { lang: string; slug: string };
};

export default async function ItemPublicPage({ params }: Props) {
  const supabase = createClient({ useServiceRole: true });

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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 text-xs uppercase tracking-[0.2em] text-zinc-500">
        {item.lang} / {item.type}
      </div>

      <h1 className="text-5xl font-bold leading-tight">{item.title}</h1>

      <div className="mt-6 text-sm text-zinc-500">
        {item.published_at ? new Date(item.published_at).toLocaleString('ru-RU') : ''}
      </div>

      <article className="prose prose-lg mt-10 max-w-none whitespace-pre-wrap">
        {item.body_md}
      </article>
    </main>
  );
}
