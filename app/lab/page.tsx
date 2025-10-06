
import Link from 'next/link';

export const metadata = {
  title: 'Lab | Лаборатория экспериментов',
  description: 'Экспериментальный раздел для тестирования новых возможностей',
};

const experiments = [
  {
    id: 'deep-context-llm',
    title: '🧠 Deep Context LLM',
    description: 'Создание многостраничного профиля-контекста для ChatGPT/Gemini/Claude для получения персонализированной стратегической помощи',
    icon: '🧠',
    status: '🔄 В работе',
    href: '/lab/deep-context-llm'
  },
  {
    id: 'nft-web3',
    title: '🌐³ NFT & Web3 Автономия',
    description: 'Токенизированная автономия через NFT-сувениры. Успешный минтинг первого NFT, преодоление технических ограничений через AI-программирование',
    icon: '🌐',
    status: '✅ Майнтинг завершен',
    href: '/lab/nft-web3'
  },
  {
    id: 'digital-art-commerce',
    title: '🎨 Digital Art Commerce',
    description: 'Многоканальный продакт-плейсмент "Ангелочек и Сердечко" - футболки, кружки, печать на пенокартоне',
    icon: '🎨',
    status: '✅ Продается',
    href: '/lab/digital-art-commerce'
  },
  {
    id: 'bluesky',
    title: 'Bluesky Integration',
    description: 'Интеграция с децентрализованной социальной сетью Bluesky для отображения постов',
    icon: '🦋',
    status: 'Готово',
    href: '/lab/bluesky'
  },
  {
    id: 'medium',
    title: 'Medium Articles',
    description: 'RSS интеграция для отображения статей с Medium платформы',
    icon: '📝',
    status: 'Готово',
    href: '/lab/medium'
  },
  {
    id: 'youtube',
    title: 'YouTube Shorts',
    description: 'YouTube Data API для отображения коротких видео с канала',
    icon: '🎬',
    status: 'Готово',
    href: '/lab/youtube'
  },
  {
    id: 'letters',
    title: 'Letters',
    description: 'Интеграция рассылки и физических открыток',
    icon: '✉️',
    status: 'Готово',
    href: '/lab/letters'
  }
];

export default function LabPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">🧪 Лаборатория</h1>
        <p className="text-gray-600 mt-2">
          Экспериментальный раздел с интеграциями внешних сервисов. 
          Здесь собраны работающие интеграции с Bluesky, Medium, YouTube и планы будущих проектов.
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
                  ${experiment.status === 'Готово' ? 'bg-green-100 text-green-800' : ''}
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
    </div>
  );
}
