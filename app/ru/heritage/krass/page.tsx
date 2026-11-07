import React from 'react';
import type { Metadata } from 'next';
import KrassPageView, { krassMetadata } from '@/app/heritage/krass/KrassPageView';

export const metadata: Metadata = krassMetadata('ru');

export default function Page() {
  return <KrassPageView lang="ru" />;
}
