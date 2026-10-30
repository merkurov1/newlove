import type { Metadata } from 'next';
import { Suspense } from 'react';
import ServiceRequestClient from './ServiceRequestClient';

export const metadata: Metadata = {
  title: 'Advising request — Anton Merkurov',
  description: 'Continue a qualified advising or art-market service request.',
  robots: { index: false, follow: false },
};

export default function ServiceRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-6">
          <p className="text-sm text-zinc-500">Loading request…</p>
        </div>
      }
    >
      <ServiceRequestClient />
    </Suspense>
  );
}
