// app/articles/[slug]/page.js
import { createClient } from '@/lib/supabase'; // Клиент для runtime
import { supabaseBuildClient } from '@/lib/supabase-build'; // Клиент для build-time
import { notFound } from 'next/navigation';
import Image from 'next/image';

// Эта функция генерирует статические страницы во время сборки
export async function generateStaticParams() {
  const { data: articles } = await supabaseBuildClient
    .from('articles')
    .select('slug')
    .eq('is_draft', false);

  if (!articles) {
    return [];
  }

  return articles.map((article) => ({ slug: article.slug }));
}

// Эта функция работает во время запроса и может использовать куки
export default async function ArticlePage({ params }) {
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
