// app/articles/[slug]/page.tsx

import { fetchArticleBySlug } from '@/lib/api';
import { notFound } from 'next/navigation';

export default async function ArticlePage({
  params,
}: {
  params: {
    slug: string;
  };
}) {
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
