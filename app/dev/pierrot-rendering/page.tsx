import { notFound } from 'next/navigation';

import ResponsePreview from '@/components/pierrot/response/ResponsePreview';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pierrot response rendering preview',
  robots: { index: false, follow: false },
};

export default async function PierrotRenderingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === 'production' && process.env.PIERROT_RENDERING_PREVIEW !== 'true') {
    notFound();
  }

  const params = await searchParams;
  const only = typeof params?.case === 'string' ? params.case : null;

  return <ResponsePreview only={only} />;
}
