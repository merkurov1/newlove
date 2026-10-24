import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PUBLIC_TELEGRAM_CASES, getPublicTelegramCase } from '@/lib/telegram-research/public-cases';
import TelegramCaseView from './CaseView';

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLIC_TELEGRAM_CASES.map((item) => ({ slug: item.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = getPublicTelegramCase(params.slug);

  if (!data) {
    return {
      title: 'Telegram Research',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Telegram Research: ${data.chat.title}`,
    description: `Аналитический разбор ${data.totals.messages} сообщений: ритм, ответы, сессии и извлечённые темы. Исходные сообщения не публикуются.`,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

export default function TelegramCasePage({ params }: { params: { slug: string } }) {
  const data = getPublicTelegramCase(params.slug);

  if (!data) {
    notFound();
  }

  return <TelegramCaseView data={data} />;
}
