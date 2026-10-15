import { NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';
import Parser from 'rss-parser';
import { fetchLinkPreview } from '@/lib/linkPreview';
import type { LinkPreview } from '@/lib/linkPreview';

export const dynamic = 'force-dynamic';

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
    const identifier = process.env.BLUESKY_IDENTIFIER;
    const password = process.env.BLUESKY_PASSWORD;

    if (!identifier || !password) {
      return { posts: [] };
    }

    const agent = new BskyAgent({ service: 'https://bsky.social' });
    await agent.login({ identifier, password });

    const response = await agent.getAuthorFeed({
      actor: identifier,
      limit: 10,
    });

    if (!response.success) {
      throw new Error('Failed to fetch Bluesky posts');
    }

    const posts = response.data.feed
      .filter((item) => !item.reply)
      .map((item) => {
        const images: string[] = [];

        if (item.post.embed) {
          const embed = item.post.embed as any;
          if (embed.$type === 'app.bsky.embed.images#view') {
            images.push(...(embed.images?.map((img: any) => img.fullsize || img.thumb) || []));
          } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
            if (embed.media?.$type === 'app.bsky.embed.images#view') {
              images.push(...(embed.media.images?.map((img: any) => img.fullsize || img.thumb) || []));
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
          embed: item.post.embed,
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

    const articles = feed.items.slice(0, 10).map((item) => {
      const content = item.content || item.contentSnippet || '';
      const textContent = content.replace(/<[^>]*>/g, '').substring(0, 300);

      const estimateReadTime = (text: string) => {
        const wordsPerMinute = 200;
        const words = text.split(' ').length;
        const minutes = Math.ceil(words / wordsPerMinute);
        return `${minutes} мин чтения`;
      };

      const extractImageFromContent = (htmlContent: string) => {
        const imgMatch = htmlContent.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
        if (imgMatch) return imgMatch[1];

        const mediumCdnMatch = htmlContent.match(
          /https:\/\/(?:cdn-images-1\.medium\.com|miro\.medium\.com)\/[^\s"<>]+/i,
        );
        if (mediumCdnMatch) return mediumCdnMatch[0];

        const anyImageMatch = htmlContent.match(
          /https?:\/\/[^\s"<>]+\.(?:jpg|jpeg|png|gif|webp)/i,
        );
        if (anyImageMatch) return anyImageMatch[0];

        return null;
      };

      return {
        title: item.title || '',
        link: item.link || '',
        publishedAt: item.pubDate || new Date().toISOString(),
        author: item.creator || 'Anton Merkurov',
        excerpt: textContent + (content.length > 300 ? '...' : ''),
        categories: item.categories || [],
        id: item.guid || item.link || '',
        readingTime: estimateReadTime(textContent),
        thumbnail:
          item.enclosure?.url ||
          extractImageFromContent(content) ||
          extractImageFromContent(item.contentSnippet || '') ||
          (item['media:thumbnail'] ? item['media:thumbnail'].$.url : null),
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
      return { videos: [] };
    }

    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=15&key=${apiKey}`,
    );

    if (!searchResponse.ok) throw new Error('YouTube search failed');

    const searchData = await searchResponse.json();
    const videoIds = (searchData.items || [])
      .map((item: any) => item.id?.videoId)
      .filter(Boolean)
      .join(',');

    if (!videoIds) return { videos: [] };

    const detailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${videoIds}&key=${apiKey}`,
    );

    if (!detailsResponse.ok) throw new Error('YouTube details failed');

    const detailsData = await detailsResponse.json();

    const isShortVideo = (duration: string) => {
      const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return false;
      const minutes = parseInt(match[1] || '0', 10);
      const seconds = parseInt(match[2] || '0', 10);
      return minutes * 60 + seconds <= 60;
    };

    const videos = (detailsData.items || [])
      .filter((video: any) => isShortVideo(video.contentDetails.duration))
      .slice(0, 10)
      .map((video: any) => ({
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail:
          video.snippet.thumbnails.maxres?.url ||
          video.snippet.thumbnails.high?.url ||
          video.snippet.thumbnails.medium?.url,
        publishedAt: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        viewCount: parseInt(video.statistics.viewCount || '0', 10),
        likeCount: parseInt(video.statistics.likeCount || '0', 10),
        commentCount: parseInt(video.statistics.commentCount || '0', 10),
        channelTitle: video.snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${video.id}`,
      }));

    return { videos };
  } catch (error) {
    console.error('YouTube error:', error);
    return { videos: [] };
  }
}

export async function GET() {
  try {
    const [blueskyData, mediumData, youtubeData] = await Promise.all([
      getBlueskyData(),
      getMediumData(),
      getYouTubeData(),
    ]);

    const rawFlowItems: { item: FlowItem; previewUrlToFetch?: string }[] = [];

    // 1. Собираем Bluesky
    if (blueskyData.posts) {
      for (const post of blueskyData.posts) {
        let embedUrl = '';
        if (post.embed) {
          const embed: any = post.embed;
          if (embed.$type === 'app.bsky.embed.external#view' && embed.external?.uri) {
            embedUrl = embed.external.uri;
          } else if (embed.$type === 'app.bsky.embed.record#view' && embed.record?.uri) {
            embedUrl = embed.record.uri;
          } else if (embed.$type === 'app.bsky.embed.recordWithMedia#view') {
            embedUrl = embed.record?.record?.uri || embed.media?.external?.uri || '';
          }
        }

        const record: any = post.record || {};
        let content: string = typeof record.text === 'string' ? record.text : '';
        if (embedUrl && !content.includes(embedUrl)) {
          content = content ? `${content}\n${embedUrl}` : embedUrl;
        }

        const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';

        rawFlowItems.push({
          item: {
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
              replies: post.replyCount || 0,
            },
          },
          previewUrlToFetch: embedUrl || undefined,
        });
      }
    }

    // 2. Собираем Medium
    if (mediumData.articles) {
      for (const article of mediumData.articles) {
        rawFlowItems.push({
          item: {
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
          },
          previewUrlToFetch: article.link,
        });
      }
    }

    // 3. Собираем YouTube Shorts (без дополнительного вызова fetchLinkPreview, так как thumbnail уже есть)
    if (youtubeData.videos) {
      for (const video of youtubeData.videos) {
        rawFlowItems.push({
          item: {
            id: `youtube-${video.id}`,
            type: 'youtube',
            platform: 'YouTube Shorts',
            platformIcon: '🎬',
            platformColor: 'bg-red-600',
            title: video.title,
            content: video.description,
            url: video.url,
            author: 'Merkurov',
            publishedAt: video.publishedAt,
            timestamp: new Date(video.publishedAt).getTime(),
            thumbnail: video.thumbnail,
            duration: video.duration,
            stats: {
              views: video.viewCount || 0,
              likes: video.likeCount || 0,
              comments: video.commentCount || 0,
            },
          },
        });
      }
    }

    // Сортируем по дате и берем свежие 7
    const sorted = rawFlowItems
      .sort((a, b) => b.item.timestamp - a.item.timestamp)
      .slice(0, 7);

    // ПАРАЛЛЕЛЬНАЯ загрузка OpenGraph превью только для выбранных 7 элементов
    const finalItems = await Promise.all(
      sorted.map(async ({ item, previewUrlToFetch }) => {
        if (!previewUrlToFetch) return item;
        try {
          const linkPreview = await fetchLinkPreview(previewUrlToFetch);
          return { ...item, linkPreview };
        } catch {
          return { ...item, linkPreview: null };
        }
      }),
    );

    return NextResponse.json({
      items: finalItems,
      total: finalItems.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Flow API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flow data', items: [], total: 0 },
      { status: 500 },
    );
  }
}
