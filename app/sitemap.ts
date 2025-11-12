// app/sitemap.ts
import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Use canonical host with www to match deployed site and avoid non-www -> www temporary redirects
  const baseUrl = 'https://www.merkurov.love';
  const supabase = createClient();

  // Статические страницы
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    {
      url: `${baseUrl}/articles`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/projects`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/letters`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    { url: `${baseUrl}/tags`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
  ];

  // Динамические статьи
  let articlePages: MetadataRoute.Sitemap = [];
  try {
    const { data: articles } = await supabase
      .from('articles')
      .select('slug, updatedAt, publishedAt')
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .limit(500);

    if (articles) {
      articlePages = articles.map((article) => ({
        url: `${baseUrl}/${article.slug}`,
        lastModified: new Date(article.updatedAt || article.publishedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));
    }
  } catch (error) {
    console.error('Error fetching articles for sitemap:', error);
  }

  // Динамические проекты
  let projectPages: MetadataRoute.Sitemap = [];
  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('slug, updatedAt, createdAt')
      .eq('published', true)
      .limit(100);

    if (projects) {
      projectPages = projects.map((project) => ({
        url: `${baseUrl}/${project.slug}`,
        lastModified: new Date(project.updatedAt || project.createdAt),
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      }));
    }
  } catch (error) {
    console.error('Error fetching projects for sitemap:', error);
  }

  // Страницы тегов
  let tagPages: MetadataRoute.Sitemap = [];
  try {
    const { data: tags } = await supabase.from('Tag').select('slug, name').limit(200);

    if (tags) {
      tagPages = tags.map((tag) => ({
        url: `${baseUrl}/tags/${tag.slug || tag.name}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      }));
    }
  } catch (error) {
    console.error('Error fetching tags for sitemap:', error);
  }

  // Письма рассылки
  let letterPages: MetadataRoute.Sitemap = [];
  try {
    const { data: letters } = await supabase
      .from('letters')
      .select('slug, updatedAt, publishedAt')
      .eq('published', true)
      .limit(200);

    if (letters) {
      letterPages = letters.map((letter) => ({
        url: `${baseUrl}/letters/${letter.slug}`,
        lastModified: new Date(letter.updatedAt || letter.publishedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }));
    }
  } catch (error) {
    console.error('Error fetching letters for sitemap:', error);
  }

  return [...staticPages, ...articlePages, ...projectPages, ...tagPages, ...letterPages];
}

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour
