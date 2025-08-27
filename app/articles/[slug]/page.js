// app/articles/[slug]/page.js
import { supabase } from '@/lib/supabase-server'; // Импортируем функцию-клиент
import { notFound } from 'next/navigation';

async function getArticleBySlug(slug) {
  const supabaseClient = supabase(); // Вызываем функцию, чтобы получить клиент

  const { data, error } = await supabaseClient
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error('Error fetching article:', error);
    return null;
  }
  return data;
}

export default async function ArticlePage({ params }) {
  const article = await getArticleBySlug(params.slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">{article.title}</h1>
      <p className="text-gray-500 text-sm mb-6">Опубликовано: {new Date(article.created_at).toLocaleDateString()}</p>
      <div className="prose lg:prose-xl">
        <p>{article.content}</p>
      </div>
    </div>
  );
}
