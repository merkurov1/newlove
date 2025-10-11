import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Открытки теперь публичные — авторизация не требуется

    // Получаем открытки из базы данных
    const postcards = await prisma.postcard.findMany({
      include: {
        _count: {
          select: { orders: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
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