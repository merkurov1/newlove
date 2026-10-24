import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

import { PUBLIC_TELEGRAM_CASES } from '@/lib/telegram-research/public-cases';

export const metadata: Metadata = {
  title: 'Telegram Research | Anton Merkurov',
  description:
    'Локальные исследования Telegram-диалогов: статистика, ритм речи, редакционные события и темы.',
  robots: {
    index: false,
    follow: false,
  },
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export default function TelegramResearchIndexPage() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#141210]">
      <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-36 md:pt-44">
        <nav className="mb-12 border-b border-stone-300/80 pb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">
          <Link href="/research" className="transition-colors hover:text-[#A8402C]">
            ← Research
          </Link>
        </nav>

        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#A8402C]">
            Local forensic studies
          </p>
          <h1 className="mt-4 font-serif text-5xl font-light leading-[0.95] tracking-tight md:text-7xl">
            Telegram Research
          </h1>
          <p className="mt-6 max-w-2xl font-serif text-xl font-light leading-relaxed text-stone-700">
            Разборы личных диалогов как текстовых корпусов: без медиа, без публикации сырых
            сообщений, с явной методологией и границей между наблюдением и интерпретацией.
          </p>
        </header>

        <div className="mt-14 border-t border-stone-300/80">
          {PUBLIC_TELEGRAM_CASES.map((item) => (
            <Link
              key={item.slug}
              href={`/research/telegram/${item.slug}`}
              className="group grid gap-6 border-b border-stone-300/80 py-8 transition-colors hover:bg-white/40 md:grid-cols-[1fr_auto] md:items-end"
            >
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">
                  Case 01 · {item.chat.type} · {item.chat.username}
                </p>
                <h2 className="mt-2 font-serif text-3xl font-light text-stone-900 transition-colors group-hover:text-[#A8402C] md:text-4xl">
                  {item.chat.title}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
                  {formatNumber(item.totals.messages)} сообщений ·{' '}
                  {formatNumber(item.sessions.count)} сессий ·{' '}
                  {formatNumber(item.responses.direct.count)} прямых ответов ·{' '}
                  {item.completeness.status}
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8402C]">
                открыть разбор →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-10 max-w-2xl font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-stone-500">
          Исходные сообщения, медиа и Telegram ID не публикуются. Страницы не индексируются.
        </p>
      </div>
    </main>
  );
}
