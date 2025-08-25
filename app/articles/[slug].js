// pages/articles/[slug].js
import { useRouter } from 'next/router';

export default function Article({ article }) {
  const router = useRouter();
  const { slug } = router.query;

  // Если данные статьи не найдены
  if (!article) {
    return <div>Статья не найдена</div>;
  }

  return (
    <div>
      <h1>{article.title}</h1>
      <p>{article.content}</p>
    </div>
  );
}

// Статическая генерация страниц (SSG)
export async function getStaticPaths() {
  // Здесь нужно указать все возможные slug'и
  const paths = [
    { params: { slug: 'welcome' } }, // Пример для /articles/welcome
    // Добавьте другие slug'и, если они есть
  ];

  return {
    paths,
    fallback: false, // Если slug не найден, показывать 404
  };
}

export async function getStaticProps({ params }) {
  // Получение данных для конкретного slug
  const { slug } = params;

  // Пример: подтягивание данных из CMS или базы данных
  const article = await fetchArticleBySlug(slug); // Замените на ваш API-запрос

  if (!article) {
    return { notFound: true }; // Вернуть 404, если статья не найдена
  }

  return {
    props: {
      article,
    },
  };
}

// Пример функции для получения данных (замените на реальную логику)
async function fetchArticleBySlug(slug) {
  // Здесь вы подтягиваете данные из CMS или статического файла
  const articles = {
    welcome: {
      title: 'Добро пожаловать',
      content: 'Это пример статьи для slug "welcome".',
    },
  };
  return articles[slug] || null;
}