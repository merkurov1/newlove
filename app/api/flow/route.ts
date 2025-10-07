// app/api/flow/route.ts
import { NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import Parser from 'rss-parser';
import { fetchLinkPreview } from '@/lib/linkPreview';

import type { LinkPreview } from '@/lib/linkPreview';
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
  linkPreview?: LinkPreview | null;
}

// Функция для получения данных Bluesky
async function getBlueskyData() {
  try {
    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({
      identifier: process.env.BLUESKY_IDENTIFIER!,
      password: process.env.BLUESKY_PASSWORD!
    });

    const response = await agent.getAuthorFeed({
      actor: process.env.BLUESKY_IDENTIFIER!,
      limit: 10
    });

    if (!response.success) {
      throw new Error('Failed to fetch Bluesky posts');
    }

    // Фильтруем реплаи
    const posts = response.data.feed
      .filter(item => !item.reply)
      .map(item => {
        const images: string[] = [];
        
        if (item.post.embed) {
          if (item.post.embed.$type === 'app.bsky.embed.images#view') {
            const embed = item.post.embed as any;
            images.push(...embed.images.map((img: any) => img.fullsize || img.thumb));
          } else if (item.post.embed.$type === 'app.bsky.embed.recordWithMedia#view') {
            const embed = item.post.embed as any;
            if (embed.media?.$type === 'app.bsky.embed.images#view') {
              images.push(...embed.media.images.map((img: any) => img.fullsize || img.thumb));
            }
          }
        }

        return {
          uri: item.post.uri,
          cid: item.post.cid,
          author: item.post.author,
          record: item.post.record,
          replyCount: item.post.replyCount || 0,
          repostCount: item.post.repostCount || 0,
          likeCount: item.post.likeCount || 0,
          images,
          embed: item.post.embed
        };
      });

    return { posts };
  } catch (error) {
    console.error('Bluesky error:', error);
    return { posts: [] };
  }
}

// Функция для получения данных Medium
async function getMediumData() {
  try {
    const parser = new Parser();
    const feed = await parser.parseURL('https://medium.com/@merkurov/feed');
    
    const articles = feed.items.slice(0, 10).map(item => {
      const content = item.content || item.contentSnippet || '';
      const textContent = content.replace(/<[^>]*>/g, '').substring(0, 300);
      
      const estimateReadTime = (text: string) => {
        const wordsPerMinute = 200;
        const words = text.split(' ').length;
        const minutes = Math.ceil(words / wordsPerMinute);
        return `${minutes} мин чтения`;
      };

      // Улучшенное извлечение изображения превью из content
      const extractImageFromContent = (htmlContent: string) => {
        // Сначала ищем <img> теги
        const imgMatch = htmlContent.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
        if (imgMatch) {
          return imgMatch[1];
        }
        
        // Ищем Medium CDN изображения в тексте
        const mediumCdnMatch = htmlContent.match(/https:\/\/(?:cdn-images-1\.medium\.com|miro\.medium\.com)\/[^\s"<>]+/i);
        if (mediumCdnMatch) {
          return mediumCdnMatch[0];
        }
        
        // Ищем любые другие изображения
        const anyImageMatch = htmlContent.match(/https?:\/\/[^\s"<>]+\.(?:jpg|jpeg|png|gif|webp)/i);
        if (anyImageMatch) {
          return anyImageMatch[0];
        }
        
        return null;
      };

      return {
        title: item.title || '',
        link: item.link || '',
        publishedAt: item.pubDate || new Date().toISOString(),
        author: item.creator || 'Anton Merkurov',
        excerpt: textContent + (content.length > 300 ? '...' : ''),
        categories: item.categories || [],
        id: item.guid || item.link,
        readingTime: estimateReadTime(textContent),
        thumbnail: item.enclosure?.url || 
                  extractImageFromContent(content) || 
                  extractImageFromContent(item.contentSnippet || '') ||
                  (item['media:thumbnail'] ? item['media:thumbnail'].$.url : null)
      };
    });

    return { articles };
  } catch (error) {
    console.error('Medium error:', error);
    return { articles: [] };
  }
}

// Функция для получения данных YouTube
async function getYouTubeData() {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!channelId || !apiKey) {
      throw new Error('YouTube API credentials not configured');
    }

    // Получаем список видео
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=20&key=${apiKey}`
    );

    if (!searchResponse.ok) {
      throw new Error('YouTube search failed');
    }

    const searchData = await searchResponse.json();
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');

    // Получаем детали видео
    const detailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${videoIds}&key=${apiKey}`
    );

    if (!detailsResponse.ok) {
      throw new Error('YouTube details failed');
    }

    const detailsData = await detailsResponse.json();

    // Фильтруем только Shorts (менее 60 секунд)
    const isShortVideo = (duration: string) => {
      const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return false;
      
      const minutes = parseInt(match[1] || '0');
      const seconds = parseInt(match[2] || '0');
      const totalSeconds = minutes * 60 + seconds;
      
      return totalSeconds <= 60;
    };

    const videos = detailsData.items
      .filter((video: any) => isShortVideo(video.contentDetails.duration))
      .slice(0, 10)
      .map((video: any) => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high?.url || video.snippet.thumbnails.medium?.url,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        viewCount: parseInt(video.statistics.viewCount || '0'),
        likeCount: parseInt(video.statistics.likeCount || '0'),
        commentCount: parseInt(video.statistics.commentCount || '0'),
        channelTitle: video.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${video.id}`
      }));

    return { videos };
  } catch (error) {
    console.error('YouTube error:', error);
    return { videos: [] };
  }
}

export async function GET() {
  try {
    // Параллельно получаем данные из всех источников
    const [blueskyData, mediumData, youtubeData] = await Promise.all([
      getBlueskyData(),
      getMediumData(), 
      getYouTubeData()
    ]);

    // Унифицируем данные в общий формат
    const flowItems: FlowItem[] = [];

    // Добавляем Bluesky посты
    if (blueskyData.posts) {
      for (const post of blueskyData.posts) {
        // Извлекаем ссылку из embed, если есть
        let embedUrl = '';
        if (post.embed) {
          const embed: any = post.embed;
          if (embed.$type === 'app.bsky.embed.external#view' && embed.external?.uri) {
            embedUrl = embed.external.uri;
          } else if (embed.$type === 'app.bsky.embed.record#view' && embed.record?.uri) {
            embedUrl = embed.record.uri;
          } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view' && embed.record?.uri) {
            embedUrl = embed.record.uri;
          }
        }

        // Формируем контент: если есть текст и ссылка — объединяем, если только ссылка — показываем ссылку
        const record: any = post.record;
        let content: string = typeof record.text === 'string' ? record.text : '';
        if (embedUrl) {
          if (content) {
            content += `\n${embedUrl}`;
          } else {
            content = embedUrl;
          }
        }

        // Получаем превью для ссылки (если есть)
        let linkPreview = null;
        if (embedUrl) {
          linkPreview = await fetchLinkPreview(embedUrl);
        }

        const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';

        flowItems.push({
          id: `bluesky-${post.uri}`,
          type: 'bluesky',
          platform: 'Bluesky',
          platformIcon: '🦋',
          platformColor: 'bg-blue-500',
          title: content.length > 100 ? content.substring(0, 100) + '...' : content,
          content,
          url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
          author: post.author.displayName || post.author.handle,
          authorHandle: post.author.handle,
          authorAvatar: post.author.avatar,
          publishedAt: createdAt,
          timestamp: createdAt ? new Date(createdAt).getTime() : 0,
          images: post.images || [],
          stats: {
            likes: post.likeCount || 0,
            reposts: post.repostCount || 0,
            replies: post.replyCount || 0
          },
          linkPreview
        });
      }
    }


    if (mediumData.articles) {
      for (const article of mediumData.articles) {
        let linkPreview = null;
        try {
          linkPreview = await fetchLinkPreview(article.link);
        } catch (e) {
          linkPreview = null;
        }
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
          categories: article.categories || [],
          thumbnail: article.thumbnail,
          linkPreview
        });
      }
    }

    if (youtubeData.videos) {
      for (const video of youtubeData.videos) {
        let linkPreview = null;
        try {
          linkPreview = await fetchLinkPreview(`https://www.youtube.com/watch?v=${video.id}`);
        } catch (e) {
          linkPreview = null;
        }
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
          },
          linkPreview
        });
      }
    }

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