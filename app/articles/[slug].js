// app/articles/[slug]/page.js
import { createClient } from '@/lib/supabase'; // For runtime
import { supabaseBuildClient } from '@/lib/supabase-build'; // For build-time
import { notFound } from 'next/navigation';

export async function generateStaticParams() {
  const { data: articles } = await supabaseBuildClient
    .from('articles')
    .select('slug')
    .eq('is_draft', false);

  return articles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }) {
  // Use your regular server client here, because this function runs at request time
  const supabase = createClient(); 
  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_draft', false)
    .single();

  if (!article) {
    notFound();
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      {/* ... rest of your code ... */}
    </article>
  );
}
