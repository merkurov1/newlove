'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react'; // <<< 1. Импортируем Suspense

// <<< 2. Создаем внутренний компонент, который будет выполнять всю "клиентскую" работу
function ErrorMessage() {
  const searchParams = useSearchParams();
  const error = searchParams ? searchParams.get('error') : null;

  const errorMessages: { [key: string]: string } = {
    Configuration: "Произошла ошибка на стороне сервера. Проверьте конфигурацию аутентификации.",
    AccessDenied: "Доступ запрещен. У вас нет прав для входа.",
    Verification: "Токен верификации недействителен или просрочен.",
    // Добавим специфичную ошибку от Google
    OAuthAccountNotLinked: "Эта учетная запись уже привязана к другому пользователю. Попробуйте войти, используя тот же метод, что и в первый раз.",
    Default: "Произошла ошибка при попытке входа. Попробуйте снова."
  };

  const message = error ? (errorMessages[error] || errorMessages.Default) : errorMessages.Default;

  return (
    <div className="bg-white p-10 rounded-lg shadow-lg max-w-md w-full">
      <h1 className="text-3xl font-bold text-red-600 mb-4">Ошибка аутентификации</h1>
      <p className="text-gray-700 mb-6">{message}</p>
      <Link href="/" className="px-6 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">
        Вернуться на главную
      </Link>
    </div>
  );
}

// <<< 3. Основной экспорт страницы теперь является "оберткой"
export default function AuthErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-gray-50">
      {/* Оборачиваем клиентский компонент в Suspense.
          Fallback - это то, что увидит пользователь, пока компонент загружается. */}
      <Suspense fallback={<p>Загрузка информации об ошибке...</p>}>
        <ErrorMessage />
      </Suspense>
    </div>
  );
}

