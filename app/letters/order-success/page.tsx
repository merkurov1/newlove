import { Suspense } from 'react';
import AuthGuard from '@/components/AuthGuard';
import OrderSuccessContent from '@/components/letters/OrderSuccessContent';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Order successfully placed | Anton Merkurov',
  description: 'Your postcard order has been received and will be processed soon',
});

export default function OrderSuccessPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-16">
          <Suspense
            fallback={
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading order information...</p>
              </div>
            }
          >
            <OrderSuccessContent />
          </Suspense>
        </div>
      </div>
    </AuthGuard>
  );
}
