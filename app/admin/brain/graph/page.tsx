import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import BrainGraphClient from './BrainGraphClient';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Brain knowledge graph',
});

export default async function BrainGraphPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Brain knowledge graph
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Entities, relationships and thematic summaries extracted from the existing Brain
          documents. Vector retrieval is unchanged; the graph is an additive layer. Every
          relationship keeps its document and chunk provenance. Inferred relationships are marked
          as hypotheses, not verified facts.
        </p>
      </header>

      <BrainGraphClient />
    </div>
  );
}
