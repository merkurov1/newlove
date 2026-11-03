import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Vault records now open inside the unified Art Engine workspace. Keep the old
 * deep link working.
 */
export default function LegacyVaultRecordPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/art-engine?lot=${encodeURIComponent(params.id)}`);
}
