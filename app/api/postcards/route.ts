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

    // Получаем доступные открытки, сначала рекомендуемые
    const postcards = await prisma.postcard.findMany({
      orderBy: [
        { featured: 'desc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        title: true,
        description: true,
        image: true,
        price: true,
        available: true,
        featured: true
      }
    });

    return NextResponse.json({ postcards });
  } catch (error) {
    console.error('Error fetching postcards:', error);
    return NextResponse.json({ 
      error: 'Ошибка при загрузке открыток' 
    }, { status: 500 });
  }
}