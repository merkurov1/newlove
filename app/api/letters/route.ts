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

    // Временно используем моковые данные до настройки базы
    const mockLetters = [
      {
        id: '1',
        title: 'Добро пожаловать в мир авторских открыток',
        slug: 'dobro-pozhalovat-v-mir-avtorskih-otkrytok',
        publishedAt: '2024-10-01T10:00:00Z',
        createdAt: '2024-10-01T10:00:00Z',
        author: {
          name: 'Anton Merkurov'
        }
      },
      {
        id: '2',
        title: 'Процесс создания: от идеи до открытки',
        slug: 'process-sozdaniya-ot-idei-do-otkrytki',
        publishedAt: '2024-09-15T14:30:00Z',
        createdAt: '2024-09-15T14:30:00Z',
        author: {
          name: 'Anton Merkurov'
        }
      },
      {
        id: '3',
        title: 'Искусство персонализации: делаем открытки особенными',
        slug: 'iskusstvo-personalizatsii-delaem-otkrytki-osobennymi',
        publishedAt: '2024-09-01T12:00:00Z',
        createdAt: '2024-09-01T12:00:00Z',
        author: {
          name: 'Anton Merkurov'
        }
      }
    ];

    return NextResponse.json({ letters: mockLetters });
  } catch (error) {
    console.error('Error fetching letters:', error);
    return NextResponse.json({ 
      error: 'Ошибка при загрузке писем' 
    }, { status: 500 });
  }
}