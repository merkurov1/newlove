export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Проверка аутентификации
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ isSubscribed: false });
    }

    // Проверяем есть ли подписка у пользователя
    const subscription = await prisma.subscriber.findUnique({
      where: { userId: session.user.id }
    });

    return NextResponse.json({ 
      isSubscribed: !!subscription 
    });

  } catch (error) {
    console.error('Error checking subscription status:', error);
    return NextResponse.json({ 
      isSubscribed: false 
    }, { status: 500 });
  }
}