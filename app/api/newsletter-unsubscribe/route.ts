export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Нет токена для отписки.' }, { status: 400 });
  }
  try {
    const tokenRow = await prisma.subscriberToken.findUnique({ where: { token } });
    if (!tokenRow || tokenRow.type !== 'unsubscribe' || tokenRow.used) {
      return NextResponse.json({ error: 'Некорректный или устаревший токен.' }, { status: 404 });
    }
    // Помечаем токен использованным
    await prisma.subscriberToken.update({ where: { token }, data: { used: true } });
    // Удаляем подписчика (или можно реализовать soft-delete)
    await prisma.subscriber.delete({ where: { id: tokenRow.subscriberId } });
    return NextResponse.json({ message: 'Вы успешно отписались от рассылки.' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка при отписке.' }, { status: 500 });
  }
}
