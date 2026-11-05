import React from 'react';
import type { Metadata } from 'next';
import AdvisingPageView, { advisingMetadata } from '@/app/advising/AdvisingPageView';

export const metadata: Metadata = advisingMetadata('ar');

export default function Page() {
  return <AdvisingPageView lang="ar" />;
}
