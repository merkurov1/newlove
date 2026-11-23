import type { Metadata } from 'next';
import PasskeyAuth from '@/components/PasskeyAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

// Internal authentication diagnostics. It must never be indexed: before this
// metadata existed the page inherited the site-wide title and an
// `index, follow` directive, so a debug URL could compete with public pages.
export const metadata: Metadata = sanitizeMetadata({
  title: 'Debug Auth | Anton Merkurov',
  description: 'Internal authentication diagnostics. Not a public page.',
  robots: { index: false, follow: false },
});

export default function DebugAuthPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">🔍 Debug Auth</h1>
      <PasskeyAuth />
    </div>
  );
}
