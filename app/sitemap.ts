// app/sitemap.ts

import { MetadataRoute } from 'next';
import prisma from '@/lib/prisma';

// !!! ВАЖНО: Замените это на URL вашего сайта
const baseUrl = 'https://your-domain.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Получаем динамические маршруты (статьи, проекты и т.д.)
  const articles = await prisma.article.findMany({
    where: { published: true },
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  const projects = await prisma.project.findMany({
    where: { published: true },
    select: {
      slug: true,
      updatedAt: true,
    },
  });

  const articleUrls = articles.map((article) => ({
    url: `${baseUrl}/${article.slug}`, // Используем корневой slug для статей
    lastModified: article.updatedAt,
  }));

  const projectUrls = projects.map((project) => ({
    url: `${baseUrl}/projects/${project.slug}`,
    lastModified: project.updatedAt,
  }));

  // 2. Добавляем статические маршруты
  const staticUrls = [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/articles`, lastModified: new Date() },
    { url: `${baseUrl}/projects`, lastModified: new Date() },
    // Добавьте сюда другие статичные страницы, если они есть
  ];

  // 3. Объединяем все маршруты
  return [...staticUrls, ...articleUrls, ...projectUrls];
}
