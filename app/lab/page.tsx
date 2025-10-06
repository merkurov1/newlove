// app/lab/page.tsx

import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

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
    description: 'Многоканальный продакт-плейсмент "Ангелочка и Сердечка" - футболки, кружки, печать на пенокартоне',
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
    id: 'feed',
    title: 'Flow',
    description: 'Единая хронологическая лента из всех подключенных сервисов (Bluesky, Medium, YouTube)',
    icon: '🌊',
    status: 'Готово',
    href: '/lab/feed'
  },
  {
    id: 'ai-context',
    title: 'Deep Context LLM',
    description: 'ИИ как Стратег и Психолог: формализация профиля, решение "что делать", психологическая помощь',
    icon: '🧠',
    status: 'В разработке',
    href: '/lab/ai-context'
  },
  {
    id: 'nft-web3',
    title: 'NFT & Web3',
    description: 'Токенизированная автономия: успешный минтинг NFT, AI-программирование, преодоление "Трех Неводов"',
    icon: '⛓️',
    status: 'Эксперимент',
    href: '/lab/nft'
  },
  {
    id: 'art-commerce',
    title: 'Digital Art Commerce',
    description: 'Многоканальный продакт-плейсмент: "Ангелочек и Сердечко", творческая диверсификация',
    icon: '🎨',
    status: 'Готово',
    href: '/lab/art'
  }
];

export default function LabPage() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="lab-page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        <AuthGuard>
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
            {/* Процесс разработки (Детализация новых процессов) */}
            <div className="mt-12 bg-gray-50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">📝 Процесс разработки (Детализация новых процессов)</h2>
              <p className="text-gray-600 mb-6">
                Этот раздел документации фокусируется на преодолении технических и личных ограничений:
              </p>
              <div className="space-y-8">
                {/* Deep Context LLM */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🧠 Deep Context LLM (ИИ как Стратег и Психолог)</h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ <strong>Формализация Профиля:</strong> Создание многостраничного промпта-контекста, загружаемого в Gemini/Claude/ChatGPT перед началом работы, для обеспечения глубокого понимания личных переживаний и интересов.</li>
                    <li>✅ <strong>Решение "Что делать":</strong> Получение конкретного, жизнеспособного плана действий на основе анализа большого массива персональных данных, включая рассылки.</li>
                    <li>✅ <strong>Психологическая помощь:</strong> Использование ChatGPT для получения точного диагноза и рекомендаций (например, при травмах или болезни), включая нужные фразы на иностранном языке для аптеки.</li>
                    <li><strong>Проблема контекста:</strong> Фиксация того, что бесплатные модели (DeepSeek, NotebookLM) пока плохо держат контекст и галлюцинируют, что требует перехода на платные и более мощные LLM, такие как Claude, для полноценной работы.</li>
                  </ul>
                </div>
                {/* NFT & Web3 */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🌐³ NFT & Web3 (Токенизированная Автономия)</h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ <strong>Успех в Minting:</strong> Успешный минтинг первого NFT-сувенира, вдохновленный внешними событиями (например, токеном Дональда Трампа), что подтвердило актуальность Web3-направления.</li>
                    <li>✅ <strong>AI-Программирование:</strong> Преодоление личных технических ограничений с помощью ИИ, который генерирует код смарт-контрактов и инструкции по имплементации.</li>
                    <li>✅ <strong>Преодоление "Трех Неводов":</strong> Документирование процесса многократных попыток (минимум три раза) копипаста кода из ChatGPT/Gemini в Remix IDE и исправление ошибок, пока контракт не был скомпилирован.</li>
                  </ul>
                </div>
                {/* Digital Art Commerce */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🎨 Digital Art Commerce</h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ <strong>Многоканальный Продакт-плейсмент:</strong> Создание ассортимента из <strong>«Ангелочка и Сердечка»</strong>, которые обрели товарно-продуктовые черты в виде футболок, кружек и печати на пенокартоне.</li>
                    <li>✅ <strong>Творческая Диверсификация:</strong> Возвращение к работе с физическими материалами (тушь, перо, акриловые маркеры Molotow), при этом процесс оцифровки и съемок является необходимым обвесом для продажи работ.</li>
                  </ul>
                </div>
                {/* Технические достижения */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">⚙️ Технические достижения</h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ <strong>Bluesky интеграция</strong> - посты без реплаев, изображения, AT Protocol</li>
                    <li>✅ <strong>Medium RSS</strong> - автоматический парсинг статей с превью</li>
                    <li>✅ <strong>YouTube Shorts</strong> - фильтрация коротких видео через API v3</li>
                    <li>✅ <strong>Flow лента</strong> - единая хронологическая лента из всех платформ</li>
                    <li>✅ <strong>Letters система</strong> - полная интеграция рассылки и физических открыток</li>
                    <li>🛡️ <strong>Безопасность</strong> - все API ключи и токены защищены</li>
                    <li>🎨 <strong>Дизайн-система</strong> - единый стиль всех интеграций</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </AuthGuard>
      </motion.div>
    </AnimatePresence>
  );
}