import React from 'react';
import type { Metadata } from 'next';
import AdvisingPageView, { advisingMetadata } from './AdvisingPageView';

export const metadata: Metadata = advisingMetadata('en');

export default function Page() {
  return <AdvisingPageView lang="en" />;
}
