// /app/api/wallet/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/wallet/supabase-wallet';

export async function GET(req: NextRequest) {
  // Для MVP: проверяем токен сессии на клиенте (Supabase JS SDK)
  // Можно добавить серверную проверку, если потребуется
  return NextResponse.json({ ok: true });
}
