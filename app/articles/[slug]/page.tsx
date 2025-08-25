// app/articles/[slug]/page.tsx

import { fetchArticleBySlug } from '@/lib/api';
import { notFound } from 'next/navigation';

// Define the type for the component's props
// This tells TypeScript that the `params` object will have a `slug` property
type ArticlePageProps = {
  params: {
    slug: string;
  };
};

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
