import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import BrainIngestionClient from './BrainIngestionClient';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Brain ingestion',
});

export default async function BrainAdminPage() {
  await requireAdmin();

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Brain ingestion
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Paste article URLs, analyze them for duplicates, then process the queue. A durable
          Supabase queue fetches and extracts each article, stores full text and metadata, and
          indexes it with the existing <code className="font-mono text-xs">baai/bge-m3</code>{' '}
          embedding pipeline. Partial or paywalled pages are never indexed silently.
        </p>
      </header>

      <BrainIngestionClient />
    </div>
  );
}
