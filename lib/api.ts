// /lib/api.ts

// Этот массив данных служит для примера.
// В реальном проекте это будет запрос к БД или внешнему API.
const articles = [
  { slug: 'first-article', title: 'Название первой статьи', content: 'Содержимое первой статьи...' },
  { slug: 'second-article', title: 'Название второй статьи', content: 'Содержимое второй статьи...' },
];

export async function fetchAllArticleSlugs() {
  // Эта функция возвращает массив всех slug'ов.
  return articles.map(article => article.slug);
}

export async function fetchArticleBySlug(slug: string) {
  // Эта функция ищет одну статью по её slug.
  const foundArticle = articles.find(article => article.slug === slug);
  return foundArticle || null;
}
