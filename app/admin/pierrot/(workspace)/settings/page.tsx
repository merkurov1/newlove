import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import {
  loadIntegrationSnapshot,
  loadModelSnapshot,
} from '@/lib/pierrot/workspace/data';
import SettingsWorkspace from '@/components/pierrot/workspace/SettingsWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SETTINGS',
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default async function SettingsPage() {
  const user = await requireAdmin();
  const metadata = user.user?.user_metadata || {};
  const profile = user.profile && typeof user.profile === 'object' ? user.profile : {};

  const name =
    stringValue(metadata.full_name) ||
    stringValue(metadata.name) ||
    stringValue(metadata.display_name) ||
    stringValue(profile.full_name) ||
    stringValue(profile.name) ||
    stringValue(profile.username);
  const image =
    stringValue(metadata.avatar_url) ||
    stringValue(metadata.picture) ||
    stringValue(metadata.image) ||
    stringValue(profile.avatar_url) ||
    stringValue(profile.avatar);

  return (
    <div className="pw-page">
      <SettingsWorkspace
        user={{ name, email: user.email ?? null, image }}
        model={loadModelSnapshot()}
        integrations={loadIntegrationSnapshot()}
      />
    </div>
  );
}
