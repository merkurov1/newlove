import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PUBLIC_TELEGRAM_CASES, getPublicTelegramCase } from '@/lib/telegram-research/public-cases';
import TelegramCaseView from './CaseView';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Deliberately no `generateStaticParams`: a statically generated copy of a
 * private case would be served without the server-side layout guard.
 */
export function generateMetadata(): Metadata {
  return {
    title: 'Telegram Research',
    description: 'Приватное локальное исследование Telegram-диалогов.',
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

  const caseNumber = PUBLIC_TELEGRAM_CASES.findIndex((item) => item.slug === data.slug) + 1;

  return <TelegramCaseView data={data} caseNumber={caseNumber || 1} />;
}
