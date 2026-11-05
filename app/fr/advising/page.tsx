import React from 'react';
import type { Metadata } from 'next';
import AdvisingPageView, { advisingMetadata } from '@/app/advising/AdvisingPageView';

export const metadata: Metadata = advisingMetadata('fr');

export default function Page() {
  return <AdvisingPageView lang="fr" />;
}
