// app/articles/[slug]/page.tsx

// 1. Импортируйте функции для работы с данными
import { fetchArticleBySlug, fetchAllArticleSlugs } from '@/lib/api'; // Предположим, у вас есть такая функция

// 2. Используйте generateStaticParams для генерации статических маршрутов
export async function generateStaticParams() {
  const slugs = await fetchAllArticleSlugs(); // Получаем все slug'и статей
  return slugs.map((slug) => ({
    slug: slug,
  }));
}

// 3. Компонент страницы теперь получает параметры напрямую через `props`
export default async function ArticlePage({ params }) {
  const { slug } = params;

  // 4. Получаем данные внутри компонента, используя async/await
  // Это делает компонент "Server Component"
  const article = await fetchArticleBySlug(slug);

  // 5. Обработка случая, когда статья не найдена
  if (!article) {
    // Верните NotFound
    return <div>Статья не найдена.</div>;
  }

  return (
    <div>
      <h1>{article.title}</h1>
      <p>{article.content}</p>
    </div>
  );
}
