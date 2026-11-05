import React from 'react';
import type { Metadata } from 'next';
import HeritagePageView, { heritageMetadata } from '@/app/heritage/HeritagePageView';

export const metadata: Metadata = heritageMetadata('ru');

export default function Page() {
  return <HeritagePageView lang="ru" />;
}
