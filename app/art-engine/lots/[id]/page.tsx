import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Vault records now open inside the unified Art Engine workspace. Keep the old
 * deep link working.
 */
export default async function LegacyVaultRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/art-engine?lot=${encodeURIComponent(id)}`);
}
