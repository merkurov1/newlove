import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/serverAuth';
import { telegramResearchAccessRedirect } from '@/lib/telegram-research/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

/**
 * Server-side gate for every /research/telegram route, including nested cases
 * and React Server Component requests. Unauthenticated visitors are sent to
 * the existing login page; authenticated non-admins are sent to /403.
 */
export default async function TelegramResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const redirectTo = telegramResearchAccessRedirect(user);

  if (redirectTo) {
    redirect(redirectTo);
  }

  return <>{children}</>;
}
