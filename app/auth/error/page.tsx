// app/auth/error/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: { [key: string]: string } = {
    Configuration: "Произошла ошибка на стороне сервера. Проверьте конфигурацию аутентификации.",
    AccessDenied: "Доступ запрещен. У вас нет прав для входа.",
    Verification: "Токен верификации недействителен или просрочен.",
    Default: "Произошла ошибка при попытке входа. Попробуйте снова."
  };

  const message = error ? (errorMessages[error] || errorMessages.Default) : errorMessages.Default;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <div className="bg-white p-10 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-red-600 mb-4">Ошибка аутентификации</h1>
        <p className="text-gray-700 mb-6">{message}</p>
        <Link href="/" className="px-6 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-600">
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
