import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import BrainRadarClient from './BrainRadarClient';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Brain editorial radar',
});

export default async function BrainRadarPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Editorial radar
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Recurring visitor questions, questions with weak or missing knowledge, and concrete
          content suggestions. These are proposals only. Nothing is published or edited without
          explicit owner approval.
        </p>
      </header>

      <BrainRadarClient />
    </div>
  );
}
