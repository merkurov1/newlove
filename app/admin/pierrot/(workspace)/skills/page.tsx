import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import SkillFoundryWorkspace from '@/components/pierrot/workspace/SkillFoundryWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SKILLS',
};

export default async function SkillsPage() {
  await requireAdmin();

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <p className="pw-kicker">SKILL FOUNDRY · только владелец</p>
        <h1 className="pw-page-title">Проверенные навыки</h1>
        <p className="pw-page-lede">
          Память хранит, что известно. Навык описывает, как Пьеро выполняет повторяемую процедуру.
          Черновик не становится активным без контрольного теста и утверждения.
        </p>

        <SkillFoundryWorkspace />
      </div>
    </div>
  );
}
