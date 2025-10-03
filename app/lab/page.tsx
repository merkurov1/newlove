// app/lab/page.tsx
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';

export const metadata = {
  title: 'Lab | Лаборатория экспериментов',
  description: 'Экспериментальный раздел для тестирования новых возможностей',
};

const experiments = [
  {
    id: 'bluesky',
    title: 'Bluesky Integration',
    description: 'Тестирование интеграции с социальной сетью Bluesky',
    icon: '🦋',
    status: 'В разработке',
    href: '/lab/bluesky'
  },
  {
    id: 'medium',
    title: 'Medium & YouTube',
    description: 'Интеграция с Medium и YouTube для импорта контента',
    icon: '📺',
    status: 'Планируется',
    href: '/lab/integrations'
  },
  {
    id: 'feed',
    title: 'Сводная лента',
    description: 'Единая лента из всех подключенных сервисов',
    icon: '📰',
    status: 'Концепция',
    href: '/lab/feed'
  }
];

export default function LabPage() {
  return (
    <AuthGuard>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🧪 Лаборатория</h1>
          <p className="text-gray-600 mt-2">
            Экспериментальный раздел для тестирования новых возможностей. 
            Здесь мы разрабатываем интеграции с внешними сервисами и тестируем новые идеи.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiments.map((experiment) => (
            <Link 
              key={experiment.id}
              href={experiment.href}
              className="block group"
            >
              <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 hover:border-blue-300">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl">{experiment.icon}</span>
                  <span className={`
                    px-3 py-1 rounded-full text-xs font-medium
                    ${experiment.status === 'В разработке' ? 'bg-blue-100 text-blue-800' : ''}
                    ${experiment.status === 'Планируется' ? 'bg-yellow-100 text-yellow-800' : ''}
                    ${experiment.status === 'Концепция' ? 'bg-gray-100 text-gray-800' : ''}
                  `}>
                    {experiment.status}
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {experiment.title}
                </h3>
                
                <p className="text-gray-600 text-sm leading-relaxed">
                  {experiment.description}
                </p>
                
                <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
                  Открыть эксперимент
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Development Notes */}
        <div className="mt-12 bg-gray-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📝 Процесс разработки</h2>
          <div className="prose prose-gray max-w-none">
            <p>
              В этом разделе документируется процесс работы над сайтом и новыми возможностями.
              Каждый эксперимент включает описание подходов, проблем и решений.
            </p>
            <ul className="mt-4 space-y-2">
              <li>🔄 <strong>Итеративная разработка</strong> - каждая интеграция тестируется отдельно</li>
              <li>📊 <strong>Метрики производительности</strong> - отслеживание влияния на скорость сайта</li>
              <li>🛡️ <strong>Безопасность</strong> - все API ключи и токены защищены</li>
              <li>🎨 <strong>Дизайн-система</strong> - все новые элементы следуют общему стилю</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}