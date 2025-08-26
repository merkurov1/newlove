// app/[...slug]/page.js
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import Header from '@/app/header'; 

export default async function Page({ params }) {
  const { slug } = params;
  const articleSlug = Array.isArray(slug) ? slug[0] : slug;

  const { data: article, error } = await supabase
    .from('articles')
    .select('title, content')
    .eq('slug', articleSlug)
    .contains('tags', ['page'])
    .single();

  if (error || !article) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="article-main">
        <article className="article-container">
          <h1 className="article-title">{article.title}</h1>
          <div className="article-content" dangerouslySetInnerHTML={{ __html: article.content }} />
        </article>
      </main>
    </>
  );
}

---

## **Функция `generateStaticParams`**

```javascript
export async function generateStaticParams() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug')
    .contains('tags', ['page']);

  // Проверяем, что нет ошибки И что articles является массивом
  if (error || !Array.isArray(articles)) { 
    console.error('Ошибка генерации статических параметров:', error);
    return []; 
  }

  return articles.map((article) => ({
    slug: [article.slug],
  }));
}
