// app/articles/[slug]/page.js
import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import Image from 'next/image';

export async function generateStaticParams() {
  const supabase = createClient();
  const { data: articles } = await supabase
    .from('articles')
    .select('slug')
    .eq('is_draft', false); // Генерируем статические страницы только для опубликованных статей

  return articles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }) {
  const supabase = createClient();
  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', params.slug)
    .eq('is_draft', false) // Валидация: показываем только опубликованную статью
    .single();

  if (!article) {
    // Если статья не найдена или не опубликована, показываем 404
    notFound();
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-center mb-6">{article.title}</h1>
      {article.image_url && (
        <div className="relative w-full h-96 mb-8 rounded-lg overflow-hidden shadow-lg">
          <Image 
            src={article.image_url} 
            alt={article.title} 
            layout="fill" 
            objectFit="cover"
            className="rounded-lg"
          />
        </div>
      )}
      <div className="prose lg:prose-lg mx-auto">
        <div dangerouslySetInnerHTML={{ __html: article.body }} />
      </div>
    </article>
  );
}
