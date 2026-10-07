import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{
    lang: string;
    slug: string;
  }>;
};

export default async function LegacyFlowItemPage({
  params,
}: PageProps) {
  const {
    slug,
  } = await params;

  redirect(
    `/flow/${encodeURIComponent(
      decodeURIComponent(slug),
    )}`,
  );
}