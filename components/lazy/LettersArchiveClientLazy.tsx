'use client';

// Browser-only component. Server Components cannot pass `ssr: false` to
// next/dynamic in Next.js 16, so the dynamic import lives in this client
// boundary and the server page imports the wrapper normally.
import dynamic from 'next/dynamic';

export default dynamic(() => import('@/components/letters/LettersArchiveClient'), { ssr: false });
