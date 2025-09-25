// components/AuthGuard.tsx (бывший PasswordGuard.tsx)

"use client";

import { useSession, signIn } from "next-auth/react";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export default function AuthGuard({ children }: Props) {
  const { data: session, status } = useSession();

  // Пока идет проверка сессии, можно показать загрузчик
  if (status === "loading") {
    return <p>Проверка доступа...</p>;
  }

  // Если сессии нет, показываем предложение войти
  if (status === "unauthenticated") {
    return (
      <div>
        <h1>Доступ ограничен</h1>
        <p>Пожалуйста, войдите, чтобы просмотреть этот контент.</p>
        <button onClick={() => signIn("google")}>Войти через Google</button>
      </div>
    );
  }

  // Если пользователь авторизован, показываем контент
  if (status === "authenticated") {
    return <>{children}</>;
  }

  return null;
}
