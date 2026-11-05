import React from 'react';
import type { Metadata } from 'next';
import AdvisingPageView, { advisingMetadata } from '@/app/advising/AdvisingPageView';

export const metadata: Metadata = advisingMetadata('de');

export default function Page() {
  return <AdvisingPageView lang="de" />;
}
