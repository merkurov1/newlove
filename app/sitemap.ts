// app/sitemap.ts
import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://merkurov.love';
  
  // Статические страницы
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/articles`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/projects`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/talks`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }
  ];

  try {
    // Получаем статьи
    const articles = await prisma.article.findMany({
      where: { published: true },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' }
    });

    const articlePages = articles.map(article => ({
      url: `${baseUrl}/articles/${article.slug}`,
      lastModified: article.updatedAt || article.publishedAt || new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));

    // Получаем проекты
    const projects = await prisma.project.findMany({
      where: { published: true },
      select: {
        slug: true,
        updatedAt: true,
        createdAt: true,
      }
    });

    const projectPages = projects.map(project => ({
      url: `${baseUrl}/${project.slug}`,
      lastModified: project.updatedAt || project.createdAt || new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));

    // Получаем товары
    const products = await prisma.product.findMany({
      where: { active: true },
      select: {
        slug: true,
        updatedAt: true,
        createdAt: true,
      }
    });

    const productPages = products.map(product => ({
      url: `${baseUrl}/shop/${product.slug}`,
      lastModified: product.updatedAt || product.createdAt || new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    // Получаем теги со статьями
    const tags = await prisma.tag.findMany({
      where: {
        articles: {
          some: {
            published: true
          }
        }
      },
      select: {
        slug: true,
        updatedAt: true,
        createdAt: true,
      }
    });

    const tagPages = tags.map(tag => ({
      url: `${baseUrl}/tags/${tag.slug}`,
      lastModified: tag.updatedAt || tag.createdAt || new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));

    return [
      ...staticPages,
      ...articlePages,
      ...projectPages,
      ...productPages,
      ...tagPages
    ];

  } catch (error) {
    console.error('Error generating sitemap:', error);
    // Возвращаем только статические страницы если база недоступна
    return staticPages;
  }
}
