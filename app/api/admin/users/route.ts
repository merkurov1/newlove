import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Получаем пользователей с информацией о подписке
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        image: true,
        bio: true,
        website: true,
        subscription: {
          select: {
            id: true,
            email: true,
            createdAt: true,
          }
        },
        _count: {
          select: {
            articles: true,
            projects: true,
            messages: true,
          }
        }
      },
    });

    // Также получаем подписчиков без аккаунтов
    const orphanSubscribers = await prisma.subscriber.findMany({
      where: { userId: null },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ 
      users, 
      orphanSubscribers 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}