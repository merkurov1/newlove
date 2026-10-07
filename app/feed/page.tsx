import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function FeedPage() {
  const supabase = createClient({ useServiceRole: true });

  const { data: items, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('published_at', { ascending: false })
    .limit(30);

  if (error) throw error;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 text-4xl font-bold">Feed</h1>

      <div className="space-y-6">
        {items?.map((item) => (
          <article key={item.id} className="rounded-2xl border p-5">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
              {item.lang} / {item.type}
            </div>

            <Link href={`/${item.lang}/${item.slug}`} className="text-2xl font-semibold hover:underline">
              {item.title}
            </Link>

            <p className="mt-3 text-zinc-600 line-clamp-3">
              {item.body_md?.slice(0, 220)}
            </p>

            <div className="mt-4 text-sm text-zinc-500">
              {item.published_at ? new Date(item.published_at).toLocaleString('ru-RU') : ''}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
