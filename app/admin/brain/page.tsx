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
          Add a URL, PDF, TXT file or pasted text. Every source is validated, checked for
          duplicates, previewed, extracted, normalized, chunked, embedded and written to the same{' '}
          <code className="font-mono text-xs">knowledge_documents</code> /{' '}
          <code className="font-mono text-xs">knowledge_chunks</code> index with{' '}
          <code className="font-mono text-xs">baai/bge-m3</code>. Originals stay in the private{' '}
          <code className="font-mono text-xs">brain-sources</code> bucket; scanned PDFs are
          reported as requiring OCR instead of being indexed as successful text. Failed or partial
          sources can be retried without deleting the existing document.
        </p>
      </header>

      <BrainIngestionClient />
    </div>
  );
}
