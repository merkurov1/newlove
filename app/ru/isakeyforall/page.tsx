import React from 'react';
import type { Metadata } from 'next';
import IsakeyforallPageView, {
  isakeyforallMetadata,
} from '@/app/isakeyforall/IsakeyforallPageView';

export const metadata: Metadata = isakeyforallMetadata('ru');

export default function Page() {
  return <IsakeyforallPageView lang="ru" />;
}
