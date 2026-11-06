import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Skill Foundry moved out of the owner PWA into the normal admin shell.
 * Keep the old address as a redirect so existing Pierrot links continue to
 * work without rendering the workspace navigation.
 */
export default function LegacySkillsPage() {
  redirect('/admin/skills');
}
