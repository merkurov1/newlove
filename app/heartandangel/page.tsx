export const dynamic = 'force-dynamic';

import React from 'react';
import Image from 'next/image';

export const metadata = {
  title: '#HEARTANDANGEL',
  description: 'Heart & Angel — трансмедийный художественный проект о выборе, архетипах и цифровой идентичности.'
};

const images = [
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759212266765-IMG_0514.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759213959968-IMG_0517.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231831822-IMG_0518.png',
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/1759231854148-IMG_0519.jpeg',
];

export default function HeartAndAngelPage() {
  return (
    <div className="min-h-screen bg-white">
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold mb-6 break-words leading-tight">#HEARTANDANGEL</h1>
          <p className="text-lg text-gray-700 mb-6">Heart &amp; Angel — трансмедийная художественная практика, исследующая архетипические образы через призму постгендерной идентичности. Проект деконструирует традиционные представления о дуализме добра и зла, предлагая альтернативную модель взаимодействия символических фигур.</p>

          <div className="text-center mb-8">
            <a href="/heartandangel/NFT" className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xl px-6 py-3 rounded-full shadow-lg transition-colors">Необратимый выбор</a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 items-stretch">
            {images.slice(0,2).map((src, i) => (
              <div key={i} className="rounded-lg overflow-hidden shadow-md bg-gray-50 flex items-center justify-center">
                <Image src={src} alt={`Heart and Angel ${i}`} width={1600} height={1200} className="w-full h-96 sm:h-[28rem] md:h-[22rem] object-cover bg-white" />
              </div>
            ))}
          </div>

          <section className="prose lg:prose-lg mb-8">
            <h2>Концептуальная рамка</h2>
            <p>В основе работы лежит критическое переосмысление классических архетипов Ангела и Демона, освобождённых от гендерных маркеров и бинарных оппозиций. Третий элемент — Сердце в множественных репрезентациях — функционирует как медиатор, создающий пространство для диалога между полюсами.</p>
            <p>Небинарность персонажей не является декоративным решением, а представляет собой концептуальный жест, направленный на универсализацию человеческого опыта. Проект исследует, как архетипические образы могут функционировать вне патриархальной символической системы, предлагая инклюзивную мифологию для современного контекста.</p>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 items-stretch">
            {images.slice(2).map((src, i) => (
              <div key={i} className="rounded-lg overflow-hidden shadow-md bg-gray-50 flex items-center justify-center">
                <Image src={src} alt={`Heart and Angel ${i+2}`} width={1600} height={1200} className="w-full h-96 sm:h-[28rem] md:h-[22rem] object-cover bg-white" />
              </div>
            ))}
          </div>

          <section className="prose lg:prose-lg mb-8">
            <h2>Художественные медиа</h2>
            <ul>
              <li>Традиционная живопись: работы тушью, акварелью и акрилом</li>
              <li>Цифровые технологии: дополненная реальность, создающая интерактивный опыт</li>
              <li>Тиражная графика: принты для широкого распространения</li>
              <li>Видеоконтент: ролики на YouTube для охвата цифровой аудитории</li>
              <li>Другие мультимедийные форматы</li>
            </ul>
          </section>

          <section className="prose lg:prose-lg mb-10">
            <h2>Исследовательский фокус</h2>
            <p>Heart &amp; Angel функционирует как long-term research project, исследующий возможности искусства как инструмента социальной трансформации. Центральный вопрос работы: может ли contemporary art, оперируя архетипическими образами, создать новые модели эмпатии и взаимопонимания в эпоху культурной фрагментации?</p>
            <p>Проект не стремится к дидактическим выводам, но создаёт пространство для рефлексии о природе человеческих связей, исследуя любовь не как романтическую категорию, но как фундаментальный принцип этического отношения к миру.</p>
          </section>

          {/* CTA moved to top */}

        </div>
      </main>
    </div>
  );
}
