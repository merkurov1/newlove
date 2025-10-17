import React from 'react';
import AuctionSlider from '@/components/AuctionSlider';
import { getServerSupabaseClient } from '@/lib/serverAuth';

type Article = {
  id: string;
  title: string;
  slug: string;
  preview_image_url?: string | null;
  description?: string | null;
  published_at?: string | null;
};

export default async function Home() {
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  try {
    // 1) Find 'auction' tag id
    const { data: tagRow, error: tagErr } = await supabase
      .from('Tag')
      .select('id')
      .eq('slug', 'auction')
      .limit(1)
      .maybeSingle();

    if (tagErr) {
      if (process.env.NODE_ENV !== 'production') console.error('Error fetching tag row', tagErr);
    }

    if (!tagRow || !tagRow.id) {
      return (
        <main className="max-w-5xl mx-auto px-4 py-6">
          {/* No auction tag found */}
        </main>
      );
    }

    const tagId: string = tagRow.id;

    // 2) Read junction rows A where B = tagId
    const { data: relRows, error: relErr } = await supabase
      .from('_ArticleToTag')
      .select('A')
      .eq('B', tagId)
      .limit(1000);

    if (relErr) {
      if (process.env.NODE_ENV !== 'production') console.error('Error fetching junction rows', relErr);
    }

    const articleIds: string[] = Array.isArray(relRows)
      ? relRows.map((r: any) => r && (r.A ?? r.a)).filter(Boolean)
      : [];

    if (!articleIds || articleIds.length === 0) {
      return (
        <main className="max-w-5xl mx-auto px-4 py-6">
          {/* No auction articles */}
        </main>
      );
    }

    // 3) Fetch articles by ids, newest first, limit 5
    const { data: articlesRaw, error: artsErr } = await supabase
      .from('articles')
      .select('id,title,slug,preview_image_url,description,published_at')
      .in('id', articleIds)
      .order('published_at', { ascending: false })
      .limit(5);

    if (artsErr) {
      if (process.env.NODE_ENV !== 'production') console.error('Error fetching articles', artsErr);
    }

    const articles: Article[] = Array.isArray(articlesRaw) ? articlesRaw : [];

    return (
      <main className="max-w-5xl mx-auto px-4 py-6">
        {articles.length > 0 ? (
          <section aria-label="Аукционные статьи" className="mb-8">
            <AuctionSlider articles={articles} />
          </section>
        ) : (
          <></>
        )}
      </main>
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('Unexpected error in Home server component', e);
    return (
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Error state */}
      </main>
    );
  }
}
