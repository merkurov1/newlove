import { createClient } from '@/lib/supabase-server'; // Убедитесь, что путь к вашему клиенту верный
import { notFound } from 'next/navigation';

// Эта функция будет загружать статью из Supabase
async function getArticle(slug) {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('NewsArticle') // Убедитесь, что название таблицы верное
    .select('*')
    .eq('slug', slug)
    .maybeSingle(); // <<< ГЛАВНОЕ ИЗМЕНЕНИЕ: Используем .maybeSingle()
                   // Он возвращает null вместо ошибки, если ничего не найдено.

  // Если произошла другая ошибка, выведем ее в лог
  if (error) {
    console.error("Supabase error fetching article:", error);
  }

  return data;
}

// Это компонент вашей страницы
export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);

  // <<< ГЛАВНОЕ ИЗМЕНЕНИЕ: Проверяем, найдена ли статья
  // Если getArticle вернула null, показываем страницу 404
  if (!article) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <article className="prose lg:prose-xl mx-auto">
        <h1>{article.title}</h1>
        <p className="text-gray-500">
          Опубликовано: {new Date(article.publishedAt).toLocaleDateString('ru-RU')}
        </p>
        {/* Здесь вы можете использовать react-markdown для отображения article.description */}
        <div dangerouslySetInnerHTML={{ __html: article.description.replace(/\n/g, '<br />') }} />
      </article>
    </div>
  );
}
