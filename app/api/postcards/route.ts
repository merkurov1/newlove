import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
// import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Проверка аутентификации - только для залогиненных пользователей
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Временно используем моковые данные до обновления базы
    const postcards = [
      {
        id: 'postcard_1',
        title: 'Авторская открытка "Закат"',
        description: 'Уникальная открытка с авторским рисунком заката над городом',
        image: '/images/postcard-placeholder.jpg',
        price: 2900, // £29.00 в пенсах
        available: true,
        featured: true
      },
      {
        id: 'postcard_2',
        title: 'Открытка "Минимализм"',
        description: 'Стильная минималистичная открытка в черно-белых тонах',
        image: '/images/postcard-placeholder.jpg',
        price: 2900, // £29.00 в пенсах
        available: true,
        featured: false
      }
    ];

    return NextResponse.json({ postcards });
  } catch (error) {
    console.error('Error fetching postcards:', error);
    return NextResponse.json({ 
      error: 'Ошибка при загрузке открыток' 
    }, { status: 500 });
  }
}