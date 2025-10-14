// app/lab/medium/page.tsx
import AuthGuard from '@/components/AuthGuard';
import MediumFeed from '@/components/MediumFeed';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Medium Integration | Lab',
  description: 'Интеграция с Medium для отображения статей @merkurov',
});

export default function MediumLabPage() {
  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link 
            href="/lab" 
            className="inline-flex items-center text-green-600 hover:text-green-800 transition-colors mb-4"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Вернуться в лабораторию
          </Link>
          
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            📝 Medium Integration
          </h1>
          <p className="text-gray-600 mt-2">
            Интеграция со статьями на Medium для автора @merkurov
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-green-100 rounded-full p-2 mr-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-900">✅ RSS интеграция активна!</h3>
              <p className="text-green-700">Статьи загружаются через Medium RSS фид с автоматическим кешированием.</p>
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">🚀 Реализованные возможности</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                RSS парсинг статей Medium
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Автоматическое извлечение превью
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Оценка времени чтения
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Категории и теги статей
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Кеширование на 1 час
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">🔧 Технические детали</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                RSS Parser для обработки фида
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                HTML to Text для превью
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Backend кеширование
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                React компонент с hooks
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                TypeScript типизация
              </li>
            </ul>
          </div>
        </div>

        {/* Medium Feed Demo */}
        <div className="bg-gray-50 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">📰 Статьи с Medium</h2>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-600">
                Статьи автора <strong>@merkurov</strong> с платформы Medium
              </p>
              <a 
                href="https://medium.com/@merkurov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 hover:text-green-800 transition-colors text-sm flex items-center"
              >
                Открыть профиль Medium
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            
            <MediumFeed limit={10} />
          </div>
        </div>

        {/* API Documentation */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📚 API Documentation</h2>
          <div className="prose prose-gray max-w-none">
            <h3>Medium RSS Integration</h3>
            <p>
              Интеграция использует официальный RSS фид Medium для получения статей.
              Все статьи парсятся на стороне сервера для лучшей производительности.
            </p>
            
            <h3>API Endpoint</h3>
            <div className="bg-gray-100 rounded p-3 font-mono text-sm">
              GET /api/medium/posts?limit=10
            </div>
            
            <h3>Возможности</h3>
            <ol>
              <li><strong>✅ RSS парсинг</strong> — автоматическое получение новых статей</li>
              <li><strong>✅ Извлечение превью</strong> — умное сокращение контента</li>
              <li><strong>✅ Время чтения</strong> — автоматический расчет по количеству слов</li>
              <li><strong>✅ Метаданные</strong> — категории, дата публикации, автор</li>
              <li><strong>✅ Кеширование</strong> — быстрая загрузка с минимизацией запросов</li>
            </ol>
            
            <h3>Планы развития</h3>
            <ul>
              <li>Интеграция с личным блогом</li>
              <li>Автоматический cross-posting</li>
              <li>Аналитика читательской активности</li>
              <li>Поиск по статьям</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}