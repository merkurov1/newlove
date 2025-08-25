// app/articles/[slug]/page.tsx

import { fetchArticleBySlug } from '@/lib/api';
import { notFound } from 'next/navigation';

// Типизируем props компонента с учетом params,
// который содержит slug
interface ArticlePageProps {
  params: {
    slug: string;
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = params;

  const article = await fetchArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div>
      <h1>{article.title}</h1>
      <p>{article.content}</p>
    </div>
  );
}
