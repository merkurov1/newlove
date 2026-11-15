import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy public route. The former implementation read `lots` with the anon
 * client, which exposed drafts once the Vault became private. Keep the URL
 * working by redirecting to the public archive, which only serves published
 * records.
 */
export default async function LegacyLotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/lots/${encodeURIComponent(id)}`);
}
