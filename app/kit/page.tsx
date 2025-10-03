// app/kit/page.tsx
import AuthGuard from '@/components/AuthGuard';

export const metadata = {
  title: 'Kit | Инструменты и ресурсы',
  description: 'Эксклюзивные инструменты, шаблоны и ресурсы для разработчиков',
};

export default function KitPage() {
  return (
    <AuthGuard>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🛠️ Kit</h1>
          <p className="text-gray-600 mt-2">
            Эксклюзивные инструменты, шаблоны и ресурсы для разработчиков
          </p>
        </div>

        {/* Premium Banner */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl p-8 mb-8">
          <div className="max-w-3xl">
            <div className="flex items-center mb-4">
              <div className="bg-white/20 rounded-full p-2 mr-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold">Premium Access</h2>
            </div>
            
            <p className="text-lg opacity-90 mb-6">
              Получите доступ к эксклюзивным инструментам, шаблонам кода, 
              готовым компонентам и ресурсам для ускорения разработки.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-sm font-medium opacity-75">Компоненты</div>
                <div className="text-2xl font-bold">50+</div>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-sm font-medium opacity-75">Шаблоны</div>
                <div className="text-2xl font-bold">25+</div>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <div className="text-sm font-medium opacity-75">Инструменты</div>
                <div className="text-2xl font-bold">15+</div>
              </div>
            </div>
            
            <button className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
              Получить доступ
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Component Library */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 relative">
            <div className="absolute top-4 right-4">
              <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium">
                Premium
              </span>
            </div>
            
            <div className="mb-4">
              <div className="bg-blue-100 rounded-lg p-3 mb-3 w-fit">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Библиотека компонентов</h3>
              <p className="text-gray-600 text-sm mt-2">
                Готовые React компоненты с TypeScript, Tailwind CSS и полной документацией
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Auth компоненты</span>
                <span className="text-gray-400">12 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">UI элементы</span>
                <span className="text-gray-400">25 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Формы</span>
                <span className="text-gray-400">8 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Навигация</span>
                <span className="text-gray-400">5 шт.</span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button className="text-purple-600 text-sm font-medium hover:text-purple-800 transition-colors" disabled>
                Просмотреть компоненты →
              </button>
            </div>
          </div>

          {/* Code Templates */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 relative">
            <div className="absolute top-4 right-4">
              <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium">
                Premium
              </span>
            </div>
            
            <div className="mb-4">
              <div className="bg-green-100 rounded-lg p-3 mb-3 w-fit">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Шаблоны кода</h3>
              <p className="text-gray-600 text-sm mt-2">
                Готовые шаблоны для быстрого старта проектов и типичных задач
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Next.js стартеры</span>
                <span className="text-gray-400">5 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">API роуты</span>
                <span className="text-gray-400">10 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Database schemas</span>
                <span className="text-gray-400">6 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Middleware</span>
                <span className="text-gray-400">4 шт.</span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button className="text-purple-600 text-sm font-medium hover:text-purple-800 transition-colors" disabled>
                Скачать шаблоны →
              </button>
            </div>
          </div>

          {/* Development Tools */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 relative">
            <div className="absolute top-4 right-4">
              <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium">
                Premium
              </span>
            </div>
            
            <div className="mb-4">
              <div className="bg-orange-100 rounded-lg p-3 mb-3 w-fit">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Инструменты разработки</h3>
              <p className="text-gray-600 text-sm mt-2">
                CLI утилиты, VS Code расширения и автоматизация workflow
              </p>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">CLI инструменты</span>
                <span className="text-gray-400">7 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">VS Code snippets</span>
                <span className="text-gray-400">50+ шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">GitHub Actions</span>
                <span className="text-gray-400">5 шт.</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Docker configs</span>
                <span className="text-gray-400">3 шт.</span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button className="text-purple-600 text-sm font-medium hover:text-purple-800 transition-colors" disabled>
                Установить инструменты →
              </button>
            </div>
          </div>
        </div>

        {/* Access Plans */}
        <div className="bg-gray-50 rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Планы доступа</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Free Plan */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Free</h3>
                <div className="text-3xl font-bold text-gray-900 mb-4">$0</div>
                <p className="text-gray-600 text-sm mb-6">Базовый доступ к открытому контенту</p>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Все статьи и проекты
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Базовые примеры кода
                </li>
                <li className="flex items-center text-sm text-gray-400">
                  <svg className="w-4 h-4 text-gray-300 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Premium компоненты
                </li>
                <li className="flex items-center text-sm text-gray-400">
                  <svg className="w-4 h-4 text-gray-300 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Шаблоны проектов
                </li>
              </ul>
              
              <button className="w-full py-2 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Текущий план
              </button>
            </div>

            {/* Pro Plan */}
            <div className="bg-white rounded-xl p-6 border-2 border-purple-500 relative">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span className="bg-purple-500 text-white px-4 py-1 rounded-full text-xs font-medium">
                  Популярный
                </span>
              </div>
              
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Pro</h3>
                <div className="text-3xl font-bold text-gray-900 mb-1">$29</div>
                <div className="text-gray-500 text-sm mb-4">в месяц</div>
                <p className="text-gray-600 text-sm mb-6">Полный доступ ко всем ресурсам</p>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Все из Free плана
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Premium компоненты (50+)
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Шаблоны проектов (25+)
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Инструменты разработки
                </li>
              </ul>
              
              <button className="w-full py-2 px-4 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Выбрать Pro
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise</h3>
                <div className="text-3xl font-bold text-gray-900 mb-4">Custom</div>
                <p className="text-gray-600 text-sm mb-6">Индивидуальные решения для команд</p>
              </div>
              
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Все из Pro плана
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Индивидуальная разработка
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Приоритетная поддержка
                </li>
                <li className="flex items-center text-sm">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Белая этикетка
                </li>
              </ul>
              
              <button className="w-full py-2 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Связаться с нами
              </button>
            </div>
          </div>
        </div>

        {/* Coming Soon Features */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">🔮 Скоро в Kit</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ul className="space-y-2 text-blue-800">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Интерактивные playground для компонентов
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                AI помощник для генерации кода
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Система версионирования компонентов
              </li>
            </ul>
            <ul className="space-y-2 text-blue-800">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Marketplace для пользовательских компонентов
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Figma интеграция для дизайн-системы
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Автоматическая документация API
              </li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}