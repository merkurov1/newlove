import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import SkillFoundryWorkspace from '@/components/pierrot/workspace/SkillFoundryWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Skill Foundry',
});

export default async function SkillsAdminPage() {
  await requireAdmin();

  return (
    <div className="pw-root pw-skills-admin">
      <div className="pw-page">
        <div className="pw-page-inner">
          <p className="pw-kicker">SKILL FOUNDRY · только владелец</p>
          <h1 className="pw-page-title">Проверенные навыки</h1>
          <p className="pw-page-lede">
            Память хранит, что известно. Навык описывает, как Пьеро выполняет повторяемую
            процедуру. ANALYZE MY WORK ищет такие процедуры в реальной истории; черновик не
            становится активным без проверки и утверждения.
          </p>

          <SkillFoundryWorkspace />
        </div>
      </div>
    </div>
  );
}
