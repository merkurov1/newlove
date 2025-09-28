import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT } from 'next-auth/jwt'; // <<< 1. Импортируем тип JWT

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession['user'];
    supabaseAccessToken?: string; // Добавляем токен в тип сессии
  }

  interface User {
    role: Role;
  }
}

// <<< 2. РАСШИРЯЕМ ТИП JWT >>>
// Теперь TypeScript будет знать, что наш токен содержит эти поля
declare module 'next-auth/jwt' {
  interface JWT {
    role: Role;
    supabaseAccessToken?: string;
  }
}

