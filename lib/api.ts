// /lib/api.ts
// This is a placeholder. You will replace this with your actual data fetching logic.
// For example, this could be a call to a database or an external API.

export async function fetchArticleBySlug(slug: string) {
  const articles = [
    { slug: 'first-article', title: 'Название первой статьи', content: 'Содержимое первой статьи...' },
    { slug: 'second-article', title: 'Название второй статьи', content: 'Содержимое второй статьи...' },
    // Добавьте больше статей сюда
  ];

  const foundArticle = articles.find(article => article.slug === slug);
  return foundArticle || null;
}
