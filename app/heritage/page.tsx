import React from 'react';
import type { Metadata } from 'next';
import HeritagePageView, { heritageMetadata } from './HeritagePageView';

export const metadata: Metadata = heritageMetadata('en');

export default function Page() {
  return <HeritagePageView lang="en" />;
}
