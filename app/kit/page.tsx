'use client';


import React from 'react';
import AuthGuard from '@/components/AuthGuard';

export default function KitPage() {
  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto p-6">
        {/* Заголовок */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Genesis Kit</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Комплексная методология для преодоления творческих и технических ограничений через структурированный подход к решению проблем.
          </p>
        </div>

        {/* Основная концепция */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">🧬 Концепция Genesis Kit</h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 mb-4">
              Genesis Kit — это не просто набор инструментов, а <strong>философия системного подхода</strong> к преодолению барьеров между идеей и реализацией.
            </p>
            <p className="text-gray-700">
              Методология основана на принципе <em>"итеративного прорыва"</em> — когда каждая неудача становится данными для следующего успешного подхода.
            </p>
          </div>
        </div>

        {/* Основные компоненты */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">🧠 Deep Context LLM</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Формализация личного профиля в многостраничный prompt</li>
              <li>• Получение стратегических решений на основе персональных данных</li>
              <li>• Психологическая поддержка и диагностика через AI</li>
              <li>• Преодоление ограничений бесплатных моделей</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">🌐³ Токенизированная Автономия</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• NFT как инструмент творческой независимости</li>
              <li>• AI-программирование для преодоления технических барьеров</li>
              <li>• Документирование "Трёх Неводов" — принципа настойчивости</li>
              <li>• Смарт-контракты как новая форма арт-объектов</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">🎨 Творческая Диверсификация</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Многоканальный продакт-плейсмент арт-объектов</li>
              <li>• Возвращение к физическим материалам с цифровой интеграцией</li>
              <li>• "Ангелочек и Сердечко" как товарная экосистема</li>
              <li>• Баланс между традиционным и цифровым искусством</li>
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">⚡ Системная Интеграция</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• Объединение всех платформ в единую экосистему</li>
              <li>• Автоматизация рутинных процессов через API</li>
              <li>• Создание персональной цифровой инфраструктуры</li>
              <li>• Безопасность и надёжность всех интеграций</li>
            </ul>
          </div>
        </div>

        {/* Методология */}
        <div className="bg-gray-50 rounded-xl p-8 mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">📋 Методология Genesis Kit</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left p-4 font-semibold text-gray-900">Этап</th>
                  <th className="text-left p-4 font-semibold text-gray-900">Описание</th>
                  <th className="text-left p-4 font-semibold text-gray-900">Инструменты</th>
                  <th className="text-left p-4 font-semibold text-gray-900">Результат</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-gray-100">
                  <td className="p-4 font-medium text-blue-600">1. Анализ</td>
                  <td className="p-4 text-gray-700">Выявление препятствий и ограничений</td>
                  <td className="p-4 text-gray-600">Deep Context LLM, самоанализ</td>
                  <td className="p-4 text-gray-600">Карта проблем</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="p-4 font-medium text-green-600">2. Стратегия</td>
                  <td className="p-4 text-gray-700">Разработка подхода к решению</td>
                  <td className="p-4 text-gray-600">AI-консультации, итеративное планирование</td>
                  <td className="p-4 text-gray-600">План действий</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="p-4 font-medium text-purple-600">3. Реализация</td>
                  <td className="p-4 text-gray-700">Применение "Трёх Неводов"</td>
                  <td className="p-4 text-gray-600">AI-программирование, настойчивость</td>
                  <td className="p-4 text-gray-600">Рабочий прототип</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="p-4 font-medium text-orange-600">4. Интеграция</td>
                  <td className="p-4 text-gray-700">Включение в общую экосистему</td>
                  <td className="p-4 text-gray-600">API, автоматизация, мониторинг</td>
                  <td className="p-4 text-gray-600">Стабильная система</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium text-red-600">5. Масштабирование</td>
                  <td className="p-4 text-gray-700">Развитие и диверсификация</td>
                  <td className="p-4 text-gray-600">Многоканальность, токенизация</td>
                  <td className="p-4 text-gray-600">Автономная система</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Принципы */}
        <div className="bg-white rounded-xl border border-gray-200 p-8 mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">⚖️ Основные принципы</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🔄 Принцип "Трёх Неводов"</h3>
              <p className="text-gray-700 text-sm mb-4">
                Любая задача решается минимум с третьей попытки. Первые два "невода" — это сбор данных об ошибках, 
                третий — успешная реализация на основе накопленного опыта.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🎯 Итеративный прорыв</h3>
              <p className="text-gray-700 text-sm mb-4">
                Каждая неудача становится ценными данными для следующего подхода. 
                Нет провалов — есть этапы сбора информации.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">🌐 Системная интеграция</h3>
              <p className="text-gray-700 text-sm mb-4">
                Все компоненты должны работать как единая экосистема, дополняя и усиливая друг друга.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">💎 Токенизированная ценность</h3>
              <p className="text-gray-700 text-sm mb-4">
                Каждый творческий результат может быть токенизирован и интегрирован в Web3-экономику.
              </p>
            </div>
          </div>
        </div>

        {/* Текущие результаты */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">🏆 Достигнутые результаты</h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">🧠 AI-Стратегирование</h3>
              <p className="text-sm text-gray-600">
                Успешная формализация личного профиля в LLM-контекст для получения персонализированных решений
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">🌐 NFT-Минтинг</h3>
              <p className="text-sm text-gray-600">
                Первый успешный минтинг NFT-сувенира с преодолением технических барьеров через AI-программирование
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">🎨 Арт-Коммерция</h3>
              <p className="text-sm text-gray-600">
                Многоканальный продакт-плейсмент "Ангелочка и Сердечка" на физических и цифровых носителях
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}