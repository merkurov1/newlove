export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getRoleEmoji, getRoleName } from '@/lib/roles';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    return NextResponse.json({
      status: session ? 'authenticated' : 'unauthenticated',
      timestamp: new Date().toISOString(),
      session: session ? {
        user: {
          id: session.user?.id,
          email: session.user?.email,
          name: session.user?.name,
          role: session.user?.role,
          roleEmoji: getRoleEmoji(session.user?.role),
          roleName: getRoleName(session.user?.role),
          username: session.user?.username,
        },
        hasSupabaseToken: !!session.supabaseAccessToken
      } : null,
      message: session ? '✅ Авторизация работает!' : '❌ Пользователь не авторизован'
    });

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      message: '🚨 Ошибка при проверке авторизации'
    }, { status: 500 });
  }
}