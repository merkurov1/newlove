// app/api/messages/route.ts
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  // Используем новый метод для получения сессии
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { content } = await req.json();

  if (!content) {
    return new NextResponse('Missing content', { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      content,
      userId: session.user.id,
    },
  });

  return NextResponse.json(message);
}
