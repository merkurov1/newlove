import React from 'react';
import type { Metadata } from 'next';
import KrassPageView, { krassMetadata } from './KrassPageView';

export const metadata: Metadata = krassMetadata('en');

export default function Page() {
  return <KrassPageView lang="en" />;
}
