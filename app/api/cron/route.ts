// app/api/cron/route.ts

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  // 1. Защита эндпоинта секретным ключом из .env
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Логика получения новостей с NewsAPI
  const newsApiKey = process.env.NEWS_API_KEY;
  // Используйте ваш собственный, более точный запрос
  const keywords = '"искусственный интеллект" OR "арт-рынок" OR "технологии в искусстве"';
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    keywords
  )}&language=ru&sortBy=publishedAt&pageSize=30&apiKey=${newsApiKey}`;

  try {
    const newsResponse = await fetch(url);
    if (!newsResponse.ok) {
      throw new Error(`NewsAPI request failed with status ${newsResponse.status}`);
    }
    const newsData = await newsResponse.json();

    if (newsData.status !== 'ok') {
      console.error('NewsAPI Error:', newsData);
      return NextResponse.json({ error: 'Failed to fetch news from NewsAPI' }, { status: 500 });
    }

    // 3. Сохранение новостей в Supabase через Prisma
    let articlesProcessed = 0;
    for (const article of newsData.articles) {
      // Пропускаем статьи без обязательных полей
      if (!article.url || !article.title || !article.publishedAt || !article.source.name) {
        continue;
      }

      // upsert: создаст новость, если ее нет (по полю url), или обновит, если есть.
      await prisma.newsArticle.upsert({
        where: { url: article.url },
        update: {
          title: article.title,
          description: article.description || '',
          imageUrl: article.urlToImage,
          publishedAt: new Date(article.publishedAt),
          sourceName: article.source.name,
        },
        create: {
          title: article.title,
          description: article.description || '',
          url: article.url,
  imageUrl: article.urlToImage,
          publishedAt: new Date(article.publishedAt),
          sourceName: article.source.name,
        },
      });
      articlesProcessed++;
    }

    return NextResponse.json({
      message: 'Cron job completed successfully.',
      articlesProcessed: articlesProcessed,
    });

  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
