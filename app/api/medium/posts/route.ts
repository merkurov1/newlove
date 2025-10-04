import { NextRequest, NextResponse } from 'next/server';
import Parser from 'rss-parser';

interface MediumItem {
  title: string;
  link: string;
  pubDate: string;
  author: string;
  contentSnippet?: string;
  content?: string;
  categories?: string[];
  guid: string;
  isoDate: string;
}

interface MediumPost {
  title: string;
  link: string;
  publishedAt: string;
  author: string;
  excerpt: string;
  categories: string[];
  id: string;
  readTime: string;
}

// Кеш для постов (кешируем на 1 час)
let cachedPosts: MediumPost[] | null = null;
let cacheExpiry = 0;

// Функция для извлечения читабельного превью из HTML контента
function extractExcerpt(content: string, maxLength: number = 300): string {
  if (!content) return '';
  
  // Удаляем HTML теги
  const textOnly = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  // Обрезаем до нужной длины
  if (textOnly.length <= maxLength) return textOnly;
  
  // Ищем последний пробел перед лимитом
  const truncated = textOnly.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return lastSpace > 0 
    ? truncated.substring(0, lastSpace) + '...'
    : truncated + '...';
}

// Функция для оценки времени чтения
function estimateReadTime(content: string): string {
  const wordsPerMinute = 200;
  const words = content.replace(/<[^>]*>/g, '').split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return `${minutes} мин чтения`;
}

async function fetchMediumPosts(): Promise<MediumPost[]> {
  // Проверяем кеш
  if (cachedPosts && Date.now() < cacheExpiry) {
    return cachedPosts;
  }

  const parser = new Parser({
    customFields: {
      item: ['category', 'content:encoded']
    }
  });

  try {
    const feed = await parser.parseURL('https://medium.com/feed/@merkurov');
    
    const posts: MediumPost[] = feed.items.map((item: any) => {
      const content = item['content:encoded'] || item.content || '';
      
      return {
        title: item.title || 'Без названия',
        link: item.link || '',
        publishedAt: item.isoDate || item.pubDate || '',
        author: item.creator || item.author || 'Anton Merkurov',
        excerpt: extractExcerpt(content),
        categories: item.categories || [],
        id: item.guid || item.link || '',
        readTime: estimateReadTime(content)
      };
    });

    // Кешируем на 1 час
    cachedPosts = posts;
    cacheExpiry = Date.now() + 60 * 60 * 1000;
    
    return posts;
  } catch (error) {
    console.error('Error fetching Medium posts:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const posts = await fetchMediumPosts();
    
    // Ограничиваем количество постов
    const limitedPosts = posts.slice(0, Math.min(limit, 20));

    return NextResponse.json({
      posts: limitedPosts,
      total: posts.length,
      source: '@merkurov on Medium'
    });

  } catch (error) {
    console.error('Medium API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Medium posts',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}