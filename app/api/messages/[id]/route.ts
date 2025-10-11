export const dynamic = 'force-dynamic';
// app/api/messages/[id]/route.ts

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  // 1. Проверяем, авторизован ли пользователь
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const messageId = params.id;

  if (!messageId) {
    return new NextResponse('Missing message ID', { status: 400 });
  }

  try {
    // 2. Находим сообщение в базе, чтобы проверить владельца
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    // 3. Убеждаемся, что сообщение существует и принадлежит текущему пользователю
    if (!message) {
      return new NextResponse('Message not found', { status: 404 });
    }
    if (message.userId !== session.user.id) {
      // Пользователь пытается удалить чужое сообщение
      return new NextResponse('Forbidden', { status: 403 });
    }

    // 4. Если все проверки пройдены, удаляем сообщение
    await prisma.message.delete({
      where: { id: messageId },
    });

    return new NextResponse('Message deleted', { status: 200 });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting message:', error);
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
