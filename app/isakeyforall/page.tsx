import React from 'react';
import type { Metadata } from 'next';
import IsakeyforallPageView, { isakeyforallMetadata } from './IsakeyforallPageView';

export const metadata: Metadata = isakeyforallMetadata('en');

export default function IsAKeyForAllPage() {
  return <IsakeyforallPageView lang="en" />;
}
