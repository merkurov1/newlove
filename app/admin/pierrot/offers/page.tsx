import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import OfferPolicyClient from './OfferPolicyClient';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Pierrot offer policy',
});

export default async function PierrotOffersPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Pierrot offer policy
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Configure recommendation enablement, priority, frequency, cooldowns and copy. Prices,
          stock, products and checkout stay in their existing sources; CTA destinations remain
          code-verified.
        </p>
      </header>

      <OfferPolicyClient />
    </div>
  );
}
