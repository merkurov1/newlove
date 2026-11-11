import { notFound } from 'next/navigation';

import ResponsePreview from '@/components/pierrot/response/ResponsePreview';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Pierrot response rendering preview',
  robots: { index: false, follow: false },
};

export default function PierrotRenderingPreviewPage({
  searchParams,
}: {
  searchParams?: { case?: string | string[] };
}) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.PIERROT_RENDERING_PREVIEW !== 'true'
  ) {
    notFound();
  }

  const only =
    typeof searchParams?.case === 'string' ? searchParams.case : null;

  return <ResponsePreview only={only} />;
}
