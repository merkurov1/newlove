import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * The Vault now lives inside the Art Engine workspace. Keep the old route as
 * a compatibility redirect instead of serving a second, heavier admin UI.
 */
export default function LegacyVaultPage() {
  redirect('/art-engine?view=vault');
}
