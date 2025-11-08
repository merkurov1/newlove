// app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 text-center p-8">
      <div className="max-w-2xl">
        {/* Большая 404 */}
        <div className="mb-8">
          <h1 className="text-9xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
            404
          </h1>
          <div className="text-6xl mb-4">🔍</div>
        </div>

        {/* Заголовок и описание */}
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Страница не найдена</h2>
        <p className="text-lg text-gray-600 mb-8">
          Кажется, вы попали на несуществующую страницу. Возможно, она была удалена или вы ошиблись адресом.
        </p>

        {/* Кнопки навигации */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            На главную
          </Link>

          <Link 
            href="/articles" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-xl shadow hover:shadow-lg border border-gray-200 hover:border-gray-300 transition-all font-semibold"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            Все статьи
          </Link>
        </div>

        {/* Дополнительные ссылки */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-4">Возможно, вам будет интересно:</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/projects" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
              Проекты
            </Link>
            <span className="text-gray-300">•</span>
            <Link href="/letters" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
              Письма и открытки
            </Link>
            <span className="text-gray-300">•</span>
            <Link href="/tags" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
              Теги
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
