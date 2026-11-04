import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/serverAuth';
import { loadRecentBrainSources } from '@/lib/pierrot/workspace/data';
import BrainWorkspace from '@/components/pierrot/workspace/BrainWorkspace';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BRAIN',
};

export default async function BrainPage() {
  await requireAdmin();
  const recent = await loadRecentBrainSources(5);

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <p className="pw-kicker">BRAIN · только владелец</p>
        <h1 className="pw-page-title">Что добавить в мозг?</h1>
        <p className="pw-page-lede">
          Ссылка, PDF, TXT или текст. Сначала preview, потом сохранение. Оригиналы остаются
          в приватном хранилище; обработка идёт существующей очередью Brain.
        </p>

        <BrainWorkspace recent={recent} />

        <p className="pw-kicker" style={{ marginTop: 32 }}>
          Очередь и полный журнал:{' '}
          <Link
            href="/admin/brain"
            style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            Brain Injection
          </Link>
        </p>
      </div>
    </div>
  );
}
