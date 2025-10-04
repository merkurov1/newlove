import { NextRequest, NextResponse } from 'next/server';
import { BskyAgent } from '@atproto/api';

// Кеш для токена аутентификации
let cachedAgent: BskyAgent | null = null;
let cacheExpiry = 0;

async function getAgent() {
  // Проверяем кеш (токен действует ~1 час)
  if (cachedAgent && Date.now() < cacheExpiry) {
    return cachedAgent;
  }

  const agent = new BskyAgent({
    service: 'https://bsky.social'
  });

  try {
    const response = await agent.login({
      identifier: process.env.BLUESKY_IDENTIFIER!,
      password: process.env.BLUESKY_PASSWORD!
    });

    if (response.success) {
      cachedAgent = agent;
      // Кешируем на 50 минут
      cacheExpiry = Date.now() + 50 * 60 * 1000;
      return agent;
    } else {
      throw new Error('Authentication failed');
    }
  } catch (error) {
    console.error('Bluesky authentication error:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const cursor = searchParams.get('cursor') || undefined;

    const agent = await getAgent();

    // Получаем посты пользователя
    const response = await agent.getAuthorFeed({
      actor: process.env.BLUESKY_IDENTIFIER!,
      limit: Math.min(limit, 50), // Максимум 50 постов за раз
      cursor
    });

    if (!response.success) {
      throw new Error('Failed to fetch posts');
    }

    // Фильтруем реплаи и форматируем данные для фронтенда
    const posts = response.data.feed
      .filter(item => !item.reply) // Исключаем реплаи
      .map(item => {
        const record = item.post.record as any;
        const embed = item.post.embed;
        
        // Обрабатываем изображения из embed
        let images: Array<{url: string, alt?: string}> = [];
        if (embed) {
          const embedData = embed as any; // Приводим к any для работы с различными типами embed
          if (embedData.$type === 'app.bsky.embed.images#view' && embedData.images) {
            images = embedData.images.map((img: any) => ({
              url: img.fullsize || img.thumb,
              alt: img.alt || ''
            }));
          } else if (embedData.$type === 'app.bsky.embed.recordWithMedia#view' && embedData.media?.images) {
            images = embedData.media.images.map((img: any) => ({
              url: img.fullsize || img.thumb,
              alt: img.alt || ''
            }));
          }
        }
        
        return {
          uri: item.post.uri,
          cid: item.post.cid,
          author: {
            did: item.post.author.did,
            handle: item.post.author.handle,
            displayName: item.post.author.displayName || item.post.author.handle,
            avatar: item.post.author.avatar,
          },
          record: {
            text: record?.text || '',
            createdAt: record?.createdAt || item.post.indexedAt,
            langs: record?.langs
          },
          replyCount: item.post.replyCount || 0,
          repostCount: item.post.repostCount || 0,
          likeCount: item.post.likeCount || 0,
          images, // Добавляем изображения
          embed: embed // Сохраняем полный embed для отладки
        };
      });

    return NextResponse.json({
      posts,
      cursor: response.data.cursor,
      hasMore: !!response.data.cursor
    });

  } catch (error) {
    console.error('Bluesky API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch Bluesky posts',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Эндпоинт для создания поста
export async function POST(request: NextRequest) {
  try {
    const { text, images } = await request.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Post text is required' },
        { status: 400 }
      );
    }

    const agent = await getAgent();

    // Создаем пост
    const response = await agent.post({
      text: text.trim(),
      // Можно добавить поддержку изображений позже
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      uri: response.uri,
      cid: response.cid
    });

  } catch (error) {
    console.error('Bluesky post creation error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to create post',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}