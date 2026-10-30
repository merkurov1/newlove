import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import BrainResearchClient from './BrainResearchClient';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Brain research',
});

export default async function BrainResearchPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Brain research
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Ask across the manuscript, published columns, entities, relationships and thematic
          summaries. Answers are grounded in retrieved passages and show their sources. Inferred
          graph relationships are labelled as hypotheses, not verified facts.
        </p>
      </header>

      <BrainResearchClient />
    </div>
  );
}
