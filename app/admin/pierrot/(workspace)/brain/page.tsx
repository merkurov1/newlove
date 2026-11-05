import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/serverAuth';
import { loadRecentBrainSources } from '@/lib/pierrot/workspace/data';
import BrainWorkspace from '@/components/pierrot/workspace/BrainWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Brain Injection',
};

export default async function BrainPage() {
  await requireAdmin();
  const recent = await loadRecentBrainSources(8);

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <p className="pw-kicker">Brain Injection · только владелец</p>
        <h1 className="pw-page-title">Что добавить в мозг?</h1>
        <p className="pw-page-lede">
          Ссылка, текст, PDF или TXT. Сначала проверка и классификация, затем сохранение в
          существующий Brain. Оригинал остаётся в приватном хранилище.
        </p>

        <BrainWorkspace recent={recent} />
      </div>
    </div>
  );
}
