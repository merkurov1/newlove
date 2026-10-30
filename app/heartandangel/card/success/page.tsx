import type { Metadata } from 'next';
import { Suspense } from 'react';
import SuccessClient from './SuccessClient';

export const metadata: Metadata = {
  title: 'Postcard order status — Heart & Angel',
  description: 'Check the confirmed status of a Heart & Angel postcard order.',
  robots: { index: false, follow: false },
};

export default function PostcardSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-6 py-20">
          <p className="text-sm text-[#5B544C]" role="status">
            Checking your order…
          </p>
        </div>
      }
    >
      <SuccessClient />
    </Suspense>
  );
}
