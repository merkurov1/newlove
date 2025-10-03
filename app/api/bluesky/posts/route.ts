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

    // Форматируем данные для фронтенда
    const posts = response.data.feed.map(item => ({
      uri: item.post.uri,
      cid: item.post.cid,
      author: {
        did: item.post.author.did,
        handle: item.post.author.handle,
        displayName: item.post.author.displayName || item.post.author.handle,
        avatar: item.post.author.avatar,
      },
      record: item.post.record,
      replyCount: item.post.replyCount || 0,
      repostCount: item.post.repostCount || 0,
      likeCount: item.post.likeCount || 0,
      indexedAt: item.post.indexedAt,
      createdAt: (item.post.record as any)?.createdAt,
      text: (item.post.record as any)?.text || '',
      embed: item.post.embed,
      // Дополнительные поля если есть
      reason: item.reason,
      reply: item.reply,
    }));

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