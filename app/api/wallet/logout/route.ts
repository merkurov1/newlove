// /app/api/wallet/logout/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  // Для Supabase: просто удаляем токен сессии на клиенте
  // Можно добавить логику blacklist токенов, если нужно
  return NextResponse.json({ success: true });
}
