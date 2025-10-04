import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Проверка аутентификации - только для залогиненных пользователей
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Получаем только опубликованные письма
    const letters = await prisma.letter.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: 20, // Ограничиваем количество
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        createdAt: true,
        author: {
          select: { name: true }
        }
      }
    });

    return NextResponse.json({ letters });
  } catch (error) {
    console.error('Error fetching letters:', error);
    return NextResponse.json({ 
      error: 'Ошибка при загрузке писем' 
    }, { status: 500 });
  }
}