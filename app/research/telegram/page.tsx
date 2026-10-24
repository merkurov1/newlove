import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

import { PUBLIC_TELEGRAM_CASES } from '@/lib/telegram-research/public-cases';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatCompleteness(value: string | null | undefined): string {
  if (!value) return 'неизвестно';
  if (value === 'complete') return 'полный';
  if (value === 'partial') return 'частичный';
  if (value === 'incomplete') return 'неполный';
  if (value === 'failed') return 'ошибка';
  return value;
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return 'не запущен';
  if (value === 'complete') return 'завершён';
  if (value === 'partial') return 'частично';
  if (value === 'failed') return 'ошибка';
  return value;
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
            Local forensic studies · private
          </p>
          <h1 className="mt-4 font-serif text-5xl font-light leading-[0.95] tracking-tight md:text-7xl">
            Telegram Research
          </h1>
          <p className="mt-6 max-w-2xl font-serif text-xl font-light leading-relaxed text-stone-700">
            Разборы личных диалогов как текстовых корпусов: без медиа, без публикации сырых
            сообщений, с явной методологией и границей между наблюдением и интерпретацией.
          </p>
          <p className="mt-4 max-w-2xl font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-stone-500">
            Доступ только для администратора-владельца. Обычный аккаунт получает 403.
          </p>
        </header>

        <div className="mt-14 border-t border-stone-300/80">
          {PUBLIC_TELEGRAM_CASES.map((item, index) => (
            <Link
              key={item.slug}
              href={`/research/telegram/${item.slug}`}
              className="group grid gap-6 border-b border-stone-300/80 py-8 transition-colors hover:bg-white/40 md:grid-cols-[1fr_auto] md:items-end"
            >
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500">
                  Case {String(index + 1).padStart(2, '0')} · {item.chat.type} ·{' '}
                  {item.chat.username}
                </p>
                <h2 className="mt-2 font-serif text-3xl font-light text-stone-900 transition-colors group-hover:text-[#A8402C] md:text-4xl">
                  {item.chat.title}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
                  {formatNumber(item.totals.messages)} сообщений · {formatDate(item.period.from)} —{' '}
                  {formatDate(item.period.to)}
                </p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.12em] text-stone-500">
                  <span>
                    экспорт:{' '}
                    <span className="text-[#A8402C]">
                      {formatCompleteness(item.completeness.status)}
                    </span>
                  </span>
                  <span>страниц: {formatNumber(item.export.pages)}</span>
                  <span>сессий: {formatNumber(item.sessions.count)}</span>
                  <span>прямых ответов: {formatNumber(item.responses.direct.count)}</span>
                  <span>оценочных: {formatNumber(item.responses.estimated.count)}</span>
                  <span>
                    LLM:{' '}
                    <span className="text-[#A8402C]">{formatStatus(item.deepseek?.status)}</span>
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A8402C]">
                открыть разбор →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-10 max-w-2xl font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-stone-500">
          Исходные сообщения, медиа и Telegram ID не публикуются. Страницы не индексируются и
          доступны только после серверной проверки роли ADMIN.
        </p>
      </div>
    </main>
  );
}
