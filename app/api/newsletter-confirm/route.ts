import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Нет токена подтверждения.' }, { status: 400 });
  }
  try {
    const tokenRow = await prisma.subscriberToken.findUnique({ where: { token } });
    if (!tokenRow || tokenRow.type !== 'confirm' || tokenRow.used) {
      return NextResponse.json({ error: 'Некорректный или устаревший токен.' }, { status: 404 });
    }
    // Помечаем токен использованным
    await prisma.subscriberToken.update({ where: { token }, data: { used: true } });
    return NextResponse.json({ message: 'Подписка успешно подтверждена!' });
  } catch (error) {
    return NextResponse.json({ error: 'Ошибка подтверждения.' }, { status: 500 });
  }
}
