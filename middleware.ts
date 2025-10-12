import { NextRequest, NextResponse } from 'next/server';

// Middleware для проверки magic_user cookie
export function middleware(request: NextRequest) {
  const magicUser = request.cookies.get('magic_user');
  // Если нет magic_user cookie, редирект на /magic/
  if (!magicUser) {
    return NextResponse.redirect(new URL('/magic/', request.url));
  }
  // Иначе пропускаем дальше
  return NextResponse.next();
}

// Применять middleware только к защищённым роутам (пример: /protected/*)
export const config = {
  matcher: ['/protected/:path*'],
};
