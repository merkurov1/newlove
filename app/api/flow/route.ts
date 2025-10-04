// app/api/flow/route.ts
import { NextResponse } from 'next/server';

interface FlowItem {
  id: string;
  type: 'bluesky' | 'medium' | 'youtube';
  platform: string;
  platformIcon: string;
  platformColor: string;
  title: string;
  content: string;
  url: string;
  author: string;
  authorHandle?: string;
  authorAvatar?: string;
  publishedAt: string;
  timestamp: number;
  images?: string[];
  thumbnail?: string;
  duration?: string;
  readingTime?: string;
  categories?: string[];
  stats?: {
    likes?: number;
    reposts?: number;
    replies?: number;
    views?: number;
    comments?: number;
  };
}

export async function GET() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    // Параллельно получаем данные из всех источников
    const [blueskyRes, mediumRes, youtubeRes] = await Promise.all([
      fetch(`${baseUrl}/api/bluesky/posts`).catch(() => null),
      fetch(`${baseUrl}/api/medium/posts`).catch(() => null),
      fetch(`${baseUrl}/api/youtube/shorts`).catch(() => null)
    ]);

    // Парсим ответы
    const blueskyData = blueskyRes?.ok ? await blueskyRes.json() : { posts: [] };
    const mediumData = mediumRes?.ok ? await mediumRes.json() : { articles: [] };
    const youtubeData = youtubeRes?.ok ? await youtubeRes.json() : { videos: [] };

    // Унифицируем данные в общий формат
    const flowItems: FlowItem[] = [];

    // Добавляем Bluesky посты
    blueskyData.posts?.forEach((post: any) => {
      flowItems.push({
        id: `bluesky-${post.uri}`,
        type: 'bluesky',
        platform: 'Bluesky',
        platformIcon: '🦋',
        platformColor: 'bg-blue-500',
        title: post.text.length > 100 ? post.text.substring(0, 100) + '...' : post.text,
        content: post.text,
        url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
        author: post.author.displayName || post.author.handle,
        authorHandle: post.author.handle,
        authorAvatar: post.author.avatar,
        publishedAt: post.createdAt,
        timestamp: new Date(post.createdAt).getTime(),
        images: post.images || [],
        stats: {
          likes: post.likeCount || 0,
          reposts: post.repostCount || 0,
          replies: post.replyCount || 0
        }
      });
    });

    // Добавляем Medium статьи
    mediumData.articles?.forEach((article: any) => {
      flowItems.push({
        id: `medium-${article.link}`,
        type: 'medium',
        platform: 'Medium',
        platformIcon: '📝',
        platformColor: 'bg-green-600',
        title: article.title,
        content: article.excerpt,
        url: article.link,
        author: 'Merkurov',
        publishedAt: article.publishedAt,
        timestamp: new Date(article.publishedAt).getTime(),
        readingTime: article.readingTime,
        categories: article.categories || []
      });
    });

    // Добавляем YouTube Shorts
    youtubeData.videos?.forEach((video: any) => {
      flowItems.push({
        id: `youtube-${video.id}`,
        type: 'youtube',
        platform: 'YouTube Shorts',
        platformIcon: '🎬',
        platformColor: 'bg-red-600',
        title: video.title,
        content: video.description,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        author: 'Merkurov',
        publishedAt: video.publishedAt,
        timestamp: new Date(video.publishedAt).getTime(),
        thumbnail: video.thumbnail,
        duration: video.duration,
        stats: {
          views: video.viewCount || 0,
          likes: video.likeCount || 0,
          comments: video.commentCount || 0
        }
      });
    });

    // Сортируем по дате (новые сначала) и берем только 7 записей
    const sortedItems = flowItems
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 7);

    return NextResponse.json({
      items: sortedItems,
      total: sortedItems.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Flow API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flow data', items: [], total: 0 },
      { status: 500 }
    );
  }
}

export const revalidate = 300; // Кеш на 5 минут