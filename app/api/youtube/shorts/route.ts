import { NextRequest, NextResponse } from 'next/server';

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  duration: string;
  viewCount?: string;
  likeCount?: string;
  channelTitle: string;
  url: string;
}

interface YouTubeApiResponse {
  videos: YouTubeVideo[];
  channelInfo: {
    id: string;
    title: string;
    thumbnail: string;
    subscriberCount?: string;
    videoCount?: string;
  };
  total: number;
}

// Кеш для видео (кешируем на 30 минут)
let cachedVideos: YouTubeApiResponse | null = null;
let cacheExpiry = 0;

// Функция для получения детализированной информации о видео
async function getVideoDetails(videoIds: string[], apiKey: string) {
  if (videoIds.length === 0) return [];
  
  const idsString = videoIds.join(',');
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${idsString}&key=${apiKey}`
  );
  
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

// Функция для фильтрации коротких видео (до 60 секунд)
function isShortVideo(duration: string): boolean {
  // Парсим ISO 8601 duration (PT1M30S = 1 минута 30 секунд)
  const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return false;
  
  const minutes = parseInt(match[1] || '0');
  const seconds = parseInt(match[2] || '0');
  const totalSeconds = minutes * 60 + seconds;
  
  return totalSeconds <= 60; // Считаем шортсом если <= 60 секунд
}

// Функция для получения информации о канале
async function getChannelInfo(channelId: string, apiKey: string) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`
  );
  
  if (!response.ok) {
    throw new Error(`YouTube Channel API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.items?.[0] || null;
}

async function fetchYouTubeShorts(): Promise<YouTubeApiResponse> {
  // Проверяем кеш
  if (cachedVideos && Date.now() < cacheExpiry) {
    return cachedVideos;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  if (!apiKey || !channelId) {
    throw new Error('YouTube API key or Channel ID not configured');
  }

  if (channelId === 'CHANNEL_ID_TO_BE_ADDED') {
    throw new Error('YouTube Channel ID needs to be configured');
  }

  try {
    // Получаем видео с канала
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=50&key=${apiKey}`
    );

    if (!searchResponse.ok) {
      throw new Error(`YouTube Search API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();
    const videoIds = searchData.items?.map((item: any) => item.id.videoId) || [];

    // Получаем детализированную информацию о видео
    const videoDetails = await getVideoDetails(videoIds, apiKey);
    
    // Получаем информацию о канале
    const channelInfo = await getChannelInfo(channelId, apiKey);

    // Фильтруем только шортсы и форматируем данные
    const videos: YouTubeVideo[] = searchData.items
      ?.map((item: any) => {
        const details = videoDetails.find((d: any) => d.id === item.id.videoId);
        const duration = details?.contentDetails?.duration || 'PT0S';
        
        // Проверяем что это шортс
        if (!isShortVideo(duration)) {
          return null;
        }

        return {
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails?.high?.url || 
                    item.snippet.thumbnails?.medium?.url || 
                    item.snippet.thumbnails?.default?.url,
          publishedAt: item.snippet.publishedAt,
          duration: duration,
          viewCount: details?.statistics?.viewCount,
          likeCount: details?.statistics?.likeCount,
          channelTitle: item.snippet.channelTitle,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        };
      })
      .filter(Boolean) || [];

    const result: YouTubeApiResponse = {
      videos,
      channelInfo: {
        id: channelId,
        title: channelInfo?.snippet?.title || 'Unknown Channel',
        thumbnail: channelInfo?.snippet?.thumbnails?.high?.url ||
                  channelInfo?.snippet?.thumbnails?.medium?.url ||
                  channelInfo?.snippet?.thumbnails?.default?.url || '',
        subscriberCount: channelInfo?.statistics?.subscriberCount,
        videoCount: channelInfo?.statistics?.videoCount
      },
      total: videos.length
    };

    // Кешируем на 30 минут
    cachedVideos = result;
    cacheExpiry = Date.now() + 30 * 60 * 1000;
    
    return result;
  } catch (error) {
    console.error('Error fetching YouTube Shorts:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');

    const data = await fetchYouTubeShorts();
    
    // Ограничиваем количество видео
    const limitedVideos = data.videos.slice(0, Math.min(limit, 20));

    return NextResponse.json({
      videos: limitedVideos,
      channelInfo: data.channelInfo,
      total: data.total,
      source: 'YouTube Shorts'
    });

  } catch (error) {
    console.error('YouTube Shorts API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch YouTube Shorts',
        message: error instanceof Error ? error.message : 'Unknown error',
        needsConfig: error instanceof Error && error.message.includes('Channel ID needs to be configured')
      },
      { status: 500 }
    );
  }
}