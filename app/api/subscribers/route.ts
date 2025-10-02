import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function GET() {
  // Проверка аутентификации - только администраторы
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const subscribers = await prisma.subscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        createdAt: true,
        userId: true,
      },
    });
    return NextResponse.json({ subscribers });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching subscribers:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
