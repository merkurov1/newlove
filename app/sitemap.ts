// app/sitemap.ts
import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

// Обновляем раз в час, чтобы не грузить базу
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.merkurov.love';
  const supabase = createClient();

  // 1. STATIC HUBS (Витрины)
  // Это страницы-списки. Они важны для навигации.
  const staticPages: MetadataRoute.Sitemap = [
    { 
        url: baseUrl, 
        lastModified: new Date(), 
        changeFrequency: 'weekly', 
        priority: 1.0 
    },
    { 
        url: `${baseUrl}/selection`, // Галерея картин
        lastModified: new Date(), 
        changeFrequency: 'daily', 
        priority: 0.9 
    },
    { 
        url: `${baseUrl}/journal`, // Список рассылок
        lastModified: new Date(), 
        changeFrequency: 'weekly', 
        priority: 0.8 
    },
    { 
        url: `${baseUrl}/projects`, // Список проектов
        lastModified: new Date(), 
        changeFrequency: 'monthly', 
        priority: 0.7 
    },
    { 
        url: `${baseUrl}/temple`, // The Temple
        lastModified: new Date(), 
        changeFrequency: 'monthly', 
        priority: 0.6 
    },
  ];

  // 2. ARTICLES (Картины/Лоты) -> КОРЕНЬ
  // Ссылка: merkurov.love/burning-heart
  let articlePages: MetadataRoute.Sitemap = [];
  try {
    const { data: articles } = await supabase
      .from('articles')
      .select('slug, updatedAt, publishedAt')
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .limit(1000);

    if (articles) {
      articlePages = articles.map((item) => ({
        url: `${baseUrl}/${item.slug}`, // ROOT URL
        lastModified: new Date(item.updatedAt || item.publishedAt),
        changeFrequency: 'weekly',
        priority: 0.8, 
      }));
    }
  } catch (error) {
    console.error('Sitemap Error (Articles):', error);
  }

  // 3. LETTERS (Рассылка) -> КОРЕНЬ
  // Ссылка: merkurov.love/letter-slug
  let letterPages: MetadataRoute.Sitemap = [];
  try {
    const { data: letters } = await supabase
      .from('letters')
      .select('slug, updatedAt, publishedAt')
      .eq('published', true)
      .limit(200);

    if (letters) {
      letterPages = letters.map((letter) => ({
        url: `${baseUrl}/${letter.slug}`, // ROOT URL
        lastModified: new Date(letter.updatedAt || letter.publishedAt),
        changeFrequency: 'monthly',
        priority: 0.7,
      }));
    }
  } catch (error) {
    console.error('Sitemap Error (Letters):', error);
  }

  // 4. PROJECTS (Проекты) -> КОРЕНЬ
  // Ссылка: merkurov.love/project-slug
  let projectPages: MetadataRoute.Sitemap = [];
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('slug, updatedAt, createdAt')
      .eq('published', true)
      .limit(100);

    if (projects) {
      projectPages = projects.map((project) => ({
        url: `${baseUrl}/${project.slug}`, // ROOT URL
        lastModified: new Date(project.updatedAt || project.createdAt),
        changeFrequency: 'monthly',
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error('Sitemap Error (Projects):', error);
  }

  // 5. TAGS -> /tags/slug (Теги оставляем в папке, чтобы не мусорить в корне)
  let tagPages: MetadataRoute.Sitemap = [];
  try {
    const { data: tags } = await supabase.from('Tag').select('slug, name').limit(200);

    if (tags) {
      tagPages = tags.map((tag) => ({
        url: `${baseUrl}/tags/${tag.slug || tag.name}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.5,
      }));
    }
  } catch (error) {
    console.error('Sitemap Error (Tags):', error);
  }

  return [
    ...staticPages, 
    ...articlePages, 
    ...letterPages, 
    ...projectPages, 
    ...tagPages
  ];
}